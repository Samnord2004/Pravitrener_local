import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BUILD_DIR = path.resolve(process.cwd(), 'desktop', 'build');
fs.mkdirSync(BUILD_DIR, { recursive: true });

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([lenBuf, combined, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function mix(c1, c2, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * k),
    Math.round(c1[1] + (c2[1] - c1[1]) * k),
    Math.round(c1[2] + (c2[2] - c1[2]) * k),
  ];
}

function blendPixel(buf, width, height, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = (y * width + x) * 4;
  const a = Math.max(0, Math.min(1, alpha));
  buf[idx] = Math.round(buf[idx] * (1 - a) + rgb[0] * a);
  buf[idx + 1] = Math.round(buf[idx + 1] * (1 - a) + rgb[1] * a);
  buf[idx + 2] = Math.round(buf[idx + 2] * (1 - a) + rgb[2] * a);
  buf[idx + 3] = Math.min(255, Math.max(buf[idx + 3], Math.round(a * 255)));
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(
    0,
    Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay || 1))
  );
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function renderAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cTop = hexToRgb('#0f172a');
  const cBot = hexToRgb('#064e3b');
  const cGold = hexToRgb('#f59e0b');
  const cEmerald = hexToRgb('#34d399');
  const cWhite = [255, 255, 255];

  const half = size / 2;
  const corner = size * 0.22;
  const scale = 0.84;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dBox = sdRoundedBox(
        x + 0.5 - half,
        y + 0.5 - half,
        half - size * 0.03,
        half - size * 0.03,
        corner
      );
      if (dBox > 0.9) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      const tGrad = (x * 0.3 + y * 0.7) / size;
      const bg = mix(cTop, cBot, tGrad);
      const edgeAlpha = dBox > -0.9 ? Math.max(0, Math.min(1, 0.9 - dBox)) : 1;

      rgba[idx] = bg[0];
      rgba[idx + 1] = bg[1];
      rgba[idx + 2] = bg[2];
      rgba[idx + 3] = Math.round(edgeAlpha * 255);

      const nx = (x + 0.5 - half) / (half * scale);
      const ny = (y + 0.5 - half) / (half * scale);

      // Subtle inner golden border ring
      const distCenter = Math.hypot(nx, ny);
      const outerRing = Math.abs(distCenter - 0.78);
      if (outerRing < 0.045) {
        const aa = Math.max(0, Math.min(1, (0.045 - outerRing) * 28));
        blendPixel(rgba, size, size, x, y, cGold, aa * 0.92);
      }

      // Pravilo diagonal tension cables
      const dDiag1 = sdSegment(nx, ny, -0.56, -0.56, 0.56, 0.56);
      const dDiag2 = sdSegment(nx, ny, 0.56, -0.56, -0.56, 0.56);
      const dDiag = Math.min(dDiag1, dDiag2);
      if (dDiag < 0.035) {
        const aa = Math.max(0, Math.min(1, (0.035 - dDiag) * 32));
        blendPixel(rgba, size, size, x, y, cEmerald, aa * 0.55);
      }

      // Stylized "П" (ПравИло) + central axis bar
      const dPortal = Math.min(
        sdSegment(nx, ny, -0.34, -0.34, 0.34, -0.34),
        sdSegment(nx, ny, -0.34, -0.34, -0.34, 0.38),
        sdSegment(nx, ny, 0.34, -0.34, 0.34, 0.38)
      );
      if (dPortal < 0.085) {
        const aa = Math.max(0, Math.min(1, (0.085 - dPortal) * 30));
        blendPixel(rgba, size, size, x, y, cWhite, aa);
      }

      // Central balance core dot
      const coreDist = Math.hypot(nx, ny - 0.04);
      if (coreDist < 0.13) {
        const aa = Math.max(0, Math.min(1, (0.13 - coreDist) * 28));
        blendPixel(rgba, size, size, x, y, cGold, aa);
      }
    }
  }

  return encodePng(size, size, rgba);
}

function encodeIco(entries) {
  // ICO header (6 bytes) + N directory entries (16 bytes each)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirBuffers = [];
  const dataBuffers = [];

  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size; // width (0 means 256)
    dir[1] = size >= 256 ? 0 : size; // height (0 means 256)
    dir[2] = 0; // color palette
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirBuffers.push(dir);
    dataBuffers.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirBuffers, ...dataBuffers]);
}

function renderDmgBackground(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const cTop = hexToRgb('#0b1120');
  const cBot = hexToRgb('#0f172a');
  const cCard = hexToRgb('#1e293b');
  const cBorder = hexToRgb('#334155');
  const cAccent = hexToRgb('#34d399');
  const cGold = hexToRgb('#f59e0b');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const bg = mix(cTop, cBot, y / height);
      rgba[idx] = bg[0];
      rgba[idx + 1] = bg[1];
      rgba[idx + 2] = bg[2];
      rgba[idx + 3] = 255;

      // Subtle card zones behind App icon (left: 145, 185) and Applications (right: 415, 185)
      const dLeft = sdRoundedBox(x - 145, y - 185, 72, 72, 18);
      const dRight = sdRoundedBox(x - 415, y - 185, 72, 72, 18);
      const dSlot = Math.min(dLeft, dRight);
      if (dSlot <= 1.5) {
        if (dSlot > -1.5) {
          blendPixel(rgba, width, height, x, y, cBorder, 0.85);
        } else {
          blendPixel(rgba, width, height, x, y, cCard, 0.52);
        }
      }

      // Centered installation arrow from x=240..320 at y=185
      const dShaft = sdSegment(x, y, 244, 185, 316, 185);
      const dHeadTop = sdSegment(x, y, 298, 169, 316, 185);
      const dHeadBot = sdSegment(x, y, 298, 201, 316, 185);
      const dArrow = Math.min(dShaft, dHeadTop, dHeadBot);
      if (dArrow < 4.5) {
        const aa = Math.max(0, Math.min(1, (4.5 - dArrow) * 0.65));
        blendPixel(rgba, width, height, x, y, cAccent, aa);
      }

      // Top accent divider line
      if (y >= 46 && y <= 48 && x >= 44 && x <= width - 44) {
        blendPixel(rgba, width, height, x, y, cGold, 0.45);
      }
    }
  }

  return encodePng(width, height, rgba);
}

const icon512 = renderAppIcon(512);
const icon256 = renderAppIcon(256);
const icon64 = renderAppIcon(64);
const icon48 = renderAppIcon(48);
const icon32 = renderAppIcon(32);

fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), icon512);
fs.writeFileSync(
  path.join(BUILD_DIR, 'icon.ico'),
  encodeIco([
    { size: 256, png: icon256 },
    { size: 64, png: icon64 },
    { size: 48, png: icon48 },
    { size: 32, png: icon32 },
  ])
);
fs.writeFileSync(path.join(BUILD_DIR, 'dmg-background.png'), renderDmgBackground(560, 380));

console.log('Generated desktop/build/icon.png (512x512), icon.ico (multi-size), dmg-background.png (560x380).');
