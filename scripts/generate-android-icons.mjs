import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

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
    raw[y * (stride + 1)] = 0; // filter None
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

function blendPixel(buf, width, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= width) return;
  const idx = (y * width + x) * 4;
  if (idx < 0 || idx + 3 >= buf.length) return;
  const a = Math.max(0, Math.min(1, alpha));
  buf[idx] = Math.round(buf[idx] * (1 - a) + rgb[0] * a);
  buf[idx + 1] = Math.round(buf[idx + 1] * (1 - a) + rgb[1] * a);
  buf[idx + 2] = Math.round(buf[idx + 2] * (1 - a) + rgb[2] * a);
  buf[idx + 3] = 255;
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
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay || 1)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function renderIcon({ size, maskable, bgTop, bgBottom, accent, glyph }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cTop = hexToRgb(bgTop);
  const cBot = hexToRgb(bgBottom);
  const cAcc = hexToRgb(accent);
  const cWhite = [255, 255, 255];

  const half = size / 2;
  const scale = maskable ? 0.66 : 0.86;
  const corner = maskable ? size * 0.5 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tGrad = (x * 0.25 + y * 0.75) / size;
      const bg = mix(cTop, cBot, tGrad);
      const idx = (y * size + x) * 4;

      if (!maskable) {
        const dBox = sdRoundedBox(x + 0.5 - half, y + 0.5 - half, half - 1, half - 1, corner);
        if (dBox > 0.8) {
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 0;
          continue;
        }
        const edgeAlpha = dBox > -0.8 ? Math.max(0, Math.min(1, 0.8 - dBox)) : 1;
        rgba[idx] = bg[0];
        rgba[idx + 1] = bg[1];
        rgba[idx + 2] = bg[2];
        rgba[idx + 3] = Math.round(edgeAlpha * 255);
      } else {
        rgba[idx] = bg[0];
        rgba[idx + 1] = bg[1];
        rgba[idx + 2] = bg[2];
        rgba[idx + 3] = 255;
      }

      // Normalize coordinates to [-1, 1] inside safe zone
      const nx = (x + 0.5 - half) / (half * scale);
      const ny = (y + 0.5 - half) / (half * scale);

      // Subtle inner ring
      const distCenter = Math.hypot(nx, ny);
      const ringDist = Math.abs(distCenter - 0.76);
      if (ringDist < 0.055) {
        const aa = Math.max(0, Math.min(1, (0.055 - ringDist) * 24));
        blendPixel(rgba, size, x, y, cAcc, aa * 0.9);
      }

      // Top/bottom pravilo diagonal tension lines (subtle geometric frame)
      const diag1 = sdSegment(nx, ny, -0.58, -0.58, 0.58, 0.58);
      const diag2 = sdSegment(nx, ny, 0.58, -0.58, -0.58, 0.58);
      const minDiag = Math.min(diag1, diag2);
      if (minDiag < 0.045) {
        const aa = Math.max(0, Math.min(1, (0.045 - minDiag) * 26));
        blendPixel(rgba, size, x, y, cAcc, aa * 0.28);
      }

      // Role monogram (sharp geometric vector strokes)
      let dGlyph = 999;
      if (glyph === 'A') {
        // Admin: 'А' letter + crown bar
        dGlyph = Math.min(
          sdSegment(nx, ny, -0.34, 0.36, 0, -0.4),
          sdSegment(nx, ny, 0.34, 0.36, 0, -0.4),
          sdSegment(nx, ny, -0.2, 0.1, 0.2, 0.1)
        );
      } else if (glyph === 'T') {
        // Trainer: 'Т' letter + pulse bar
        dGlyph = Math.min(
          sdSegment(nx, ny, -0.36, -0.32, 0.36, -0.32),
          sdSegment(nx, ny, 0, -0.32, 0, 0.4)
        );
      } else {
        // Client: 'К' letter
        dGlyph = Math.min(
          sdSegment(nx, ny, -0.24, -0.38, -0.24, 0.38),
          sdSegment(nx, ny, -0.2, 0, 0.28, -0.38),
          sdSegment(nx, ny, -0.1, -0.08, 0.32, 0.38)
        );
      }

      const strokeW = 0.085;
      if (dGlyph < strokeW + 0.025) {
        const aa = Math.max(0, Math.min(1, (strokeW + 0.025 - dGlyph) * 32));
        blendPixel(rgba, size, x, y, cWhite, aa);
      }
    }
  }
  return encodePng(size, size, rgba);
}

const FLAVORS = [
  { key: 'admin', bgTop: '#0f172a', bgBottom: '#064e3b', accent: '#34d399', glyph: 'A' },
  { key: 'trainer', bgTop: '#0f172a', bgBottom: '#164e63', accent: '#22d3ee', glyph: 'T' },
  { key: 'client', bgTop: '#1e1b4b', bgBottom: '#78350f', accent: '#fbbf24', glyph: 'K' },
];

for (const fl of FLAVORS) {
  fs.writeFileSync(
    path.join(PUBLIC_DIR, `android-${fl.key}-192.png`),
    renderIcon({ size: 192, maskable: false, ...fl })
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, `android-${fl.key}-512.png`),
    renderIcon({ size: 512, maskable: false, ...fl })
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, `android-${fl.key}-maskable-512.png`),
    renderIcon({ size: 512, maskable: true, ...fl })
  );
}

console.log('Generated 9 Android role PNG icons in public/.');
