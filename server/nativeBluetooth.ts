import { execFile, spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type {
  EquipmentType,
  LiveHardwarePacket,
  NativeBluetoothDeviceInfo,
  NativeBluetoothProtocol,
} from '../src/types.ts';

const execFileAsync = promisify(execFile);

const ALLOWED_BAUDS = new Set([9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]);
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const HEX12_REGEX = /^[0-9A-Fa-f]{12}$/;
const WIN_COM_REGEX = /^COM\d{1,3}$/i;
const POSIX_SERIAL_REGEX = /^\/dev\/(cu|rfcomm|tty)[A-Za-z0-9._-]+$/;
const SAFE_COMMAND_REGEX = /^[\x20-\x7E\r\n]{1,64}$/;

export interface NativeBtStreamCallbacks {
  onPacket: (packet: LiveHardwarePacket) => void;
  onStatus?: (message: string) => void;
  onDisconnect?: (reason?: string) => void;
}

interface ActiveNativeConnection {
  type: EquipmentType;
  deviceId: string;
  deviceName: string;
  protocol: 'gatt' | 'spp';
  address: string;
  port?: string;
  disconnect: () => Promise<void>;
  write?: (cmd: string) => Promise<void>;
}

const activeConnections = new Map<EquipmentType, ActiveNativeConnection>();

export function detectRecommendedTypes(name: string): EquipmentType[] {
  const lower = name.toLowerCase();
  const out: EquipmentType[] = [];
  if (
    /esp32|pravilo|править|правило|hx711|tenzo|тензо|hub|hc-05|hc-06|spp|uart/.test(lower)
  ) {
    out.push('esp32_limbs');
  }
  if (/myo|emg|мио|muscle/.test(lower)) {
    out.push('myoblue_emg');
  }
  if (/tickr|wahoo|heart|hr|hrm|polar|garmin|coospo|magene|puls|пульс/.test(lower)) {
    out.push('wahoo_tickr');
  }
  if (/mibfs|mibcs|miscale|mi scale|mi_scale|xmtzc|xiaomi|okok|scale|вес/.test(lower)) {
    out.push('xiaomi_scale');
  }
  if (
    /b05|bpm|bp|omron|yuwell|yonker|contec|sinocare|medisana|beurer|blemodule|ibp|тонометр|blood/.test(
      lower
    )
  ) {
    out.push('bp_b05');
  }
  return out;
}

export function extractMacFromText(text: string): string {
  const colonMatch = text.match(/([0-9A-Fa-f]{2}(?::|-)){5}[0-9A-Fa-f]{2}/);
  if (colonMatch) return colonMatch[0].replace(/-/g, ':').toUpperCase();
  const hex12Match = text.match(/(?:DEV_|_)([0-9A-Fa-f]{12})(?:[_&\\]|$)/i);
  if (hex12Match) {
    const h = hex12Match[1].toUpperCase();
    return `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}:${h.slice(8, 10)}:${h.slice(10, 12)}`;
  }
  return '';
}

export function sanitizeBaudRate(baud?: number): number {
  const n = Number(baud || 115200);
  return ALLOWED_BAUDS.has(n) ? n : 115200;
}

export function normalizeSafeSerialPort(rawPort?: string): string | null {
  if (!rawPort) return null;
  const trimmed = rawPort.trim();
  if (process.platform === 'win32') {
    return WIN_COM_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
  }
  const resolved = path.resolve(trimmed);
  if (!resolved.startsWith('/dev/') || !POSIX_SERIAL_REGEX.test(resolved)) {
    return null;
  }
  return resolved;
}

export function normalizeSafeBtAddress(rawAddr?: string): string | null {
  if (!rawAddr) return null;
  const trimmed = rawAddr.trim();
  if (MAC_REGEX.test(trimmed)) {
    return trimmed.replace(/-/g, ':').toUpperCase();
  }
  if (HEX12_REGEX.test(trimmed)) {
    const h = trimmed.toUpperCase();
    return `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}:${h.slice(8, 10)}:${h.slice(10, 12)}`;
  }
  if (/^BluetoothLE#BluetoothLE[0-9A-Fa-f:-]{12,48}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

// ---------- Shared Telemetry Parsers (text / JSON / BLE GATT base64) ----------

function parseSfloat16(raw: number): number {
  const mantissaRaw = raw & 0x0fff;
  const exponentRaw = (raw >> 12) & 0x0f;
  if (
    mantissaRaw === 0x07ff ||
    mantissaRaw === 0x0800 ||
    mantissaRaw === 0x07fe ||
    mantissaRaw === 0x0802
  ) {
    return NaN;
  }
  const mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
  const exponent = exponentRaw >= 0x08 ? exponentRaw - 0x10 : exponentRaw;
  return mantissa * Math.pow(10, exponent);
}

function isValidBpReading(reading: { sys: number; dia: number; pulse?: number }): boolean {
  if (!Number.isFinite(reading.sys) || !Number.isFinite(reading.dia)) return false;
  if (reading.sys < 45 || reading.sys > 280) return false;
  if (reading.dia < 25 || reading.dia > 200) return false;
  if (reading.sys <= reading.dia) return false;
  if (reading.pulse !== undefined && (reading.pulse < 25 || reading.pulse > 240)) return false;
  return true;
}

export function decodeNativeBytesOrLineToPacket(params: {
  type: EquipmentType;
  deviceName: string;
  buffer?: Buffer;
  line?: string;
  charUuid?: string;
}): { packet?: LiveHardwarePacket; status?: string } {
  const { type, deviceName, buffer, line, charUuid } = params;
  const ts = new Date().toISOString();
  const text = (line !== undefined ? line : buffer ? buffer.toString('utf-8') : '').trim();

  if (type === 'esp32_limbs') {
    if (buffer && buffer.byteLength === 16) {
      const lh = Number(buffer.readFloatLE(0).toFixed(1));
      const rh = Number(buffer.readFloatLE(4).toFixed(1));
      const lf = Number(buffer.readFloatLE(8).toFixed(1));
      const rf = Number(buffer.readFloatLE(12).toFixed(1));
      if ([lh, rh, lf, rf].every((v) => Number.isFinite(v) && v >= -100 && v <= 3000)) {
        return {
          packet: { type, source: 'native_bluetooth', timestamp: ts, deviceName, lh, rh, lf, rf },
        };
      }
    }
    if (text) {
      try {
        if (text.startsWith('{')) {
          const obj = JSON.parse(text) as Record<string, unknown>;
          const lh = Number(obj.lh ?? obj.d0 ?? obj.leftHand ?? obj.leftHandKg ?? 0);
          const rh = Number(obj.rh ?? obj.d1 ?? obj.rightHand ?? obj.rightHandKg ?? 0);
          const lf = Number(obj.lf ?? obj.d2 ?? obj.leftFoot ?? obj.leftFootKg ?? 0);
          const rf = Number(obj.rf ?? obj.d3 ?? obj.rightFoot ?? obj.rightFootKg ?? 0);
          if ([lh, rh, lf, rf].every((v) => Number.isFinite(v))) {
            const batteryPct =
              typeof (obj.batteryPct ?? obj.hub_batt) === 'number'
                ? Number(obj.batteryPct ?? obj.hub_batt)
                : undefined;
            return {
              packet: {
                type,
                source: 'native_bluetooth',
                timestamp: ts,
                deviceName,
                batteryPct,
                lh,
                rh,
                lf,
                rf,
              },
            };
          }
        }
      } catch {
        // try CSV
      }
      const parts = text.split(/[,;\s]+/).map(Number);
      if (parts.length >= 4 && parts.slice(0, 4).every((v) => Number.isFinite(v))) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            lh: parts[0],
            rh: parts[1],
            lf: parts[2],
            rf: parts[3],
          },
        };
      }
    }
    return {};
  }

  if (type === 'myoblue_emg') {
    if (text) {
      try {
        if (text.startsWith('{')) {
          const obj = JSON.parse(text) as Record<string, unknown>;
          const c1 = Number(obj.ch1 ?? obj.emgCh1Mv ?? obj.c1);
          const c2 = Number(obj.ch2 ?? obj.emgCh2Mv ?? obj.c2 ?? c1);
          if (Number.isFinite(c1)) {
            return {
              packet: {
                type,
                source: 'native_bluetooth',
                timestamp: ts,
                deviceName,
                emgCh1Mv: Number(Math.abs(c1).toFixed(3)),
                emgCh2Mv: Number(Math.abs(c2).toFixed(3)),
              },
            };
          }
        }
      } catch {
        // try CSV / binary
      }
      const nums = text.split(/[,;\s]+/).map(Number);
      if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            emgCh1Mv: Number(Math.abs(nums[0]).toFixed(3)),
            emgCh2Mv: Number(Math.abs(nums[1]).toFixed(3)),
          },
        };
      }
    }
    if (buffer && buffer.byteLength >= 4) {
      const ch1Raw = buffer.readInt16LE(0);
      const ch2Raw = buffer.readInt16LE(2);
      return {
        packet: {
          type,
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          emgCh1Mv: Number((Math.abs(ch1Raw) / 1000).toFixed(3)),
          emgCh2Mv: Number((Math.abs(ch2Raw) / 1000).toFixed(3)),
        },
      };
    }
    return {};
  }

  if (type === 'wahoo_tickr') {
    if (buffer && buffer.byteLength >= 2) {
      const flags = buffer.readUInt8(0);
      const isUint16 = (flags & 0x01) !== 0;
      const sensorContactSupported = (flags & 0x04) !== 0;
      const sensorContact = sensorContactSupported ? (flags & 0x02) !== 0 : undefined;
      const bpm = isUint16 && buffer.byteLength >= 3 ? buffer.readUInt16LE(1) : buffer.readUInt8(1);
      if (bpm >= 0 && bpm < 250) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            heartRateBpm: bpm,
            sensorContact,
          },
        };
      }
    }
    if (text) {
      const hrNum = Number(text.replace(/[^\d.]/g, ''));
      if (Number.isFinite(hrNum) && hrNum > 20 && hrNum < 250) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            heartRateBpm: Math.round(hrNum),
          },
        };
      }
    }
    return {};
  }

  if (type === 'xiaomi_scale' && buffer) {
    // 0x2A9C Mi Body Composition Scale 2 (13 bytes)
    if (buffer.byteLength >= 13) {
      const ctrlByte0 = buffer.readUInt8(0);
      const ctrlByte1 = buffer.readUInt8(1);
      const isLbs = (ctrlByte0 & 0x01) !== 0;
      const isCatty = (ctrlByte0 & 0x40) !== 0;
      const isStabilized = (ctrlByte1 & 0x20) !== 0;
      const isImpedanceReady = (ctrlByte1 & 0x02) !== 0;
      const impedanceRaw = buffer.readUInt16LE(9);
      const weightRaw = buffer.readUInt16LE(11);
      let weightKg = weightRaw / 200;
      if (isLbs) weightKg = (weightRaw / 100) * 0.45359237;
      else if (isCatty) weightKg = (weightRaw / 100) * 0.5;
      if (weightKg >= 5 && weightKg <= 300) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            weightKg: Number(weightKg.toFixed(2)),
            impedanceOhm:
              isImpedanceReady && impedanceRaw > 50 && impedanceRaw < 3000
                ? impedanceRaw
                : undefined,
            stabilized: isStabilized,
          },
        };
      }
    }
    // 0x2A9D Weight Measurement
    if (buffer.byteLength >= 3) {
      const flags = buffer.readUInt8(0);
      const isImperial = (flags & 0x01) !== 0;
      const rawWeight = buffer.readUInt16LE(1);
      const weightKg = isImperial ? rawWeight * 0.01 * 0.45359237 : rawWeight * 0.005;
      if (weightKg >= 5 && weightKg <= 300) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            weightKg: Number(weightKg.toFixed(2)),
            stabilized: true,
          },
        };
      }
    }
    return {};
  }

  if (type === 'bp_b05') {
    if (buffer && buffer.byteLength >= 7 && charUuid?.toLowerCase().includes('2a35')) {
      const flags = buffer.readUInt8(0);
      const isKpa = (flags & 0x01) !== 0;
      const hasTimestamp = (flags & 0x02) !== 0;
      const hasPulseRate = (flags & 0x04) !== 0;
      const toMmHg = (v: number) => (isKpa ? v * 7.50062 : v);
      const sys = Math.round(toMmHg(parseSfloat16(buffer.readUInt16LE(1))));
      const dia = Math.round(toMmHg(parseSfloat16(buffer.readUInt16LE(3))));
      const map = Math.round(toMmHg(parseSfloat16(buffer.readUInt16LE(5))));
      let offset = 7 + (hasTimestamp ? 7 : 0);
      let pulse: number | undefined;
      if (hasPulseRate && buffer.byteLength >= offset + 2) {
        const p = Math.round(parseSfloat16(buffer.readUInt16LE(offset)));
        if (Number.isFinite(p) && p > 0) pulse = p;
      }
      if (isValidBpReading({ sys, dia, pulse })) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            sys,
            dia,
            map: Number.isFinite(map) ? map : Math.round(dia + (sys - dia) / 3),
            pulse,
          },
        };
      }
    }
    if (buffer && buffer.byteLength >= 3 && charUuid?.toLowerCase().includes('2a36')) {
      const flags = buffer.readUInt8(0);
      const isKpa = (flags & 0x01) !== 0;
      const raw = parseSfloat16(buffer.readUInt16LE(1));
      if (Number.isFinite(raw)) {
        const mmHg = Math.round(isKpa ? raw * 7.50062 : raw);
        if (mmHg >= 10 && mmHg <= 350) {
          return { status: `Манжета: ${mmHg} мм рт. ст.` };
        }
      }
    }
    if (buffer && buffer.byteLength >= 4 && buffer.readUInt8(0) === 0x81) {
      const sys = buffer.readUInt8(1);
      const dia = buffer.readUInt8(2);
      const pulse = buffer.readUInt8(3) || undefined;
      if (isValidBpReading({ sys, dia, pulse })) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            sys,
            dia,
            map: Math.round(dia + (sys - dia) / 3),
            pulse,
          },
        };
      }
    }
    if (
      buffer &&
      buffer.byteLength >= 6 &&
      buffer.readUInt8(0) === 0xfd &&
      buffer.readUInt8(1) === 0xfd &&
      buffer.readUInt8(2) === 0xfc
    ) {
      const sys = buffer.readUInt8(3);
      const dia = buffer.readUInt8(4);
      const pulse = buffer.readUInt8(5) || undefined;
      if (isValidBpReading({ sys, dia, pulse })) {
        return {
          packet: {
            type,
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            sys,
            dia,
            map: Math.round(dia + (sys - dia) / 3),
            pulse,
          },
        };
      }
    }
    if (text) {
      try {
        if (text.startsWith('{')) {
          const obj = JSON.parse(text) as Record<string, unknown>;
          const sys = Math.round(Number(obj.sys ?? obj.systolic ?? obj.sbp));
          const dia = Math.round(Number(obj.dia ?? obj.diastolic ?? obj.dbp));
          const pRaw = obj.pulse ?? obj.hr ?? obj.bpm;
          const pulse = pRaw !== undefined ? Math.round(Number(pRaw)) : undefined;
          if (isValidBpReading({ sys, dia, pulse })) {
            return {
              packet: {
                type,
                source: 'native_bluetooth',
                timestamp: ts,
                deviceName,
                sys,
                dia,
                map: Math.round(dia + (sys - dia) / 3),
                pulse,
              },
            };
          }
        }
      } catch {
        // fallback text regex
      }
      const m = text.match(/(\d{2,3})\s*[,;/\s]+\s*(\d{2,3})(?:\s*[,;/\s]+\s*(\d{2,3}))?/);
      if (m) {
        const sys = Number(m[1]);
        const dia = Number(m[2]);
        const pulse = m[3] ? Number(m[3]) : undefined;
        if (isValidBpReading({ sys, dia, pulse })) {
          return {
            packet: {
              type,
              source: 'native_bluetooth',
              timestamp: ts,
              deviceName,
              sys,
              dia,
              map: Math.round(dia + (sys - dia) / 3),
              pulse,
            },
          };
        }
      }
    }
  }

  return {};
}

// ---------- OS Bluetooth Discovery (Windows / macOS / Linux) ----------

const PS_ENUM_WINDOWS = `
$ErrorActionPreference = 'SilentlyContinue'
$bt = @()
Get-PnpDevice -Class Bluetooth | ForEach-Object {
  $bt += [PSCustomObject]@{
    kind = 'bluetooth'
    name = [string]$_.FriendlyName
    instanceId = [string]$_.InstanceId
    status = [string]$_.Status
    present = [bool]$_.Present
  }
}
$ports = @()
Get-CimInstance Win32_SerialPort | ForEach-Object {
  $ports += [PSCustomObject]@{
    kind = 'serial'
    name = [string]$_.Name
    deviceId = [string]$_.DeviceID
    pnpId = [string]$_.PNPDeviceID
    description = [string]$_.Description
  }
}
Get-PnpDevice -Class Ports | Where-Object { $_.FriendlyName -match 'COM\\d+' } | ForEach-Object {
  $ports += [PSCustomObject]@{
    kind = 'pnp_port'
    name = [string]$_.FriendlyName
    instanceId = [string]$_.InstanceId
    status = [string]$_.Status
  }
}
@{ bluetooth = $bt; ports = $ports } | ConvertTo-Json -Depth 4 -Compress
`.trim();

export async function listNativeBluetoothDevices(): Promise<{
  platform: 'windows' | 'macos' | 'linux';
  adapterSupported: boolean;
  devices: NativeBluetoothDeviceInfo[];
  note: string;
}> {
  const devices: NativeBluetoothDeviceInfo[] = [];
  const seenKeys = new Set<string>();

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', PS_ENUM_WINDOWS],
        { timeout: 6500, windowsHide: true }
      );
      const parsed = JSON.parse(stdout || '{}') as {
        bluetooth?: { name?: string; instanceId?: string; status?: string; present?: boolean }[];
        ports?: { name?: string; deviceId?: string; pnpId?: string; instanceId?: string; status?: string }[];
      };
      const ports = Array.isArray(parsed.ports) ? parsed.ports : [];
      const macToCom = new Map<string, string>();
      for (const p of ports) {
        const comMatch = String(p.deviceId || p.name || '').match(/COM\d+/i);
        if (!comMatch) continue;
        const com = comMatch[0].toUpperCase();
        const mac = extractMacFromText(String(p.pnpId || p.instanceId || ''));
        if (mac) macToCom.set(mac, com);
        const isBt = /BTHENUM|BLUETOOTH/i.test(String(p.pnpId || p.instanceId || p.name || ''));
        if (isBt && !seenKeys.has(`com:${com}`)) {
          seenKeys.add(`com:${com}`);
          const label = String(p.name || com).trim();
          devices.push({
            id: com,
            name: label,
            address: mac || com,
            transport: 'spp',
            paired: true,
            connected: p.status === 'OK',
            port: com,
            platform: 'windows',
            sourceBackend: 'server_local',
            recommendedFor: detectRecommendedTypes(label),
          });
        }
      }

      const btList = Array.isArray(parsed.bluetooth) ? parsed.bluetooth : [];
      for (const b of btList) {
        const iid = String(b.instanceId || '');
        const name = String(b.name || '').trim();
        if (!name || /Microsoft Bluetooth|Radio|Enum|Transport|Service|A2DP|Avrcp|Hands-Free|RFCOMM Protocol/i.test(name)) {
          continue;
        }
        const mac = extractMacFromText(iid);
        const isLe = /BTHLE/i.test(iid);
        const com = mac ? macToCom.get(mac) : undefined;
        const key = mac ? `${mac}:${isLe ? 'le' : 'bt'}` : name;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        devices.push({
          id: com || mac || iid,
          name,
          address: mac || iid,
          transport: isLe ? 'gatt' : com ? 'spp' : 'dual',
          paired: true,
          connected: b.status === 'OK' && Boolean(b.present),
          port: com,
          platform: 'windows',
          sourceBackend: 'server_local',
          recommendedFor: detectRecommendedTypes(name),
        });
      }
      return {
        platform: 'windows',
        adapterSupported: true,
        devices,
        note: 'Список сопряжённых Bluetooth-устройств и COM/SPP портов Windows.',
      };
    } catch {
      return {
        platform: 'windows',
        adapterSupported: false,
        devices: [],
        note: 'Не удалось прочитать системные устройства Bluetooth Windows.',
      };
    }
  }

  if (process.platform === 'darwin') {
    try {
      const devFiles = fs.readdirSync('/dev');
      for (const f of devFiles) {
        if (!f.startsWith('cu.')) continue;
        if (/Bluetooth-Incoming-Port|debug-console|wlan-debug|MALS|SOC/i.test(f)) continue;
        const full = `/dev/${f}`;
        seenKeys.add(full);
        const cleanName = f.replace(/^cu\./, '').replace(/-ESP32SPP|-SPPDev/gi, '');
        devices.push({
          id: full,
          name: `${cleanName} (Serial / SPP)`,
          address: full,
          transport: 'spp',
          paired: true,
          connected: true,
          port: full,
          platform: 'macos',
          sourceBackend: 'server_local',
          recommendedFor: detectRecommendedTypes(cleanName),
        });
      }
    } catch {
      // ignore /dev read issue
    }

    try {
      const { stdout } = await execFileAsync(
        'system_profiler',
        ['SPBluetoothDataType', '-json'],
        { timeout: 6000 }
      );
      const data = JSON.parse(stdout || '{}') as {
        SPBluetoothDataType?: {
          device_connected?: Record<string, Record<string, unknown>>[];
          device_not_connected?: Record<string, Record<string, unknown>>[];
        }[];
      };
      const root = data.SPBluetoothDataType?.[0];
      const groups: [Record<string, Record<string, unknown>>[] | undefined, boolean][] = [
        [root?.device_connected, true],
        [root?.device_not_connected, false],
      ];
      for (const [arr, isConn] of groups) {
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) {
          for (const [devName, info] of Object.entries(entry)) {
            const addr = String(info?.device_address || '').toUpperCase();
            if (!addr || seenKeys.has(addr)) continue;
            seenKeys.add(addr);
            const cuMatch = devices.find((d) =>
              d.name.toLowerCase().includes(devName.toLowerCase().slice(0, 8))
            );
            devices.push({
              id: cuMatch?.port || addr,
              name: devName,
              address: addr,
              transport: cuMatch ? 'dual' : 'gatt',
              paired: true,
              connected: isConn,
              port: cuMatch?.port,
              platform: 'macos',
              sourceBackend: 'server_local',
              recommendedFor: detectRecommendedTypes(devName),
            });
          }
        }
      }
    } catch {
      // system_profiler optional if headless
    }

    return {
      platform: 'macos',
      adapterSupported: true,
      devices,
      note: 'Сопряжённые Bluetooth-устройства и порты /dev/cu.* macOS.',
    };
  }

  // Linux
  try {
    const devFiles = fs.readdirSync('/dev');
    for (const f of devFiles) {
      if (!/^(rfcomm\d+|ttyUSB\d+|ttyACM\d+)$/.test(f)) continue;
      const full = `/dev/${f}`;
      seenKeys.add(full);
      devices.push({
        id: full,
        name: `Bluetooth / Serial (${f})`,
        address: full,
        transport: 'spp',
        paired: true,
        connected: true,
        port: full,
        platform: 'linux',
        sourceBackend: 'server_local',
        recommendedFor: ['esp32_limbs', 'myoblue_emg'],
      });
    }
  } catch {
    // ignore
  }

  let btctlAvailable = false;
  try {
    const { stdout } = await execFileAsync('bluetoothctl', ['devices'], { timeout: 3500 });
    btctlAvailable = true;
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.+)$/);
      if (!m) continue;
      const address = m[1].toUpperCase();
      const name = m[2].trim();
      if (seenKeys.has(address)) continue;
      seenKeys.add(address);
      devices.push({
        id: address,
        name,
        address,
        transport: 'dual',
        paired: true,
        platform: 'linux',
        sourceBackend: 'server_local',
        recommendedFor: detectRecommendedTypes(name),
      });
    }
  } catch {
    // headless container or bluez not running
  }

  return {
    platform: 'linux',
    adapterSupported: btctlAvailable || devices.length > 0,
    devices,
    note: btctlAvailable
      ? 'Устройства BlueZ (bluetoothctl) и порты /dev/rfcomm*.'
      : 'На этом Linux-хосте адаптер Bluetooth не обнаружен — на ПК/смартфоне используйте локальный мост, Desktop-приложение или Android-приложение.',
  };
}

// ---------- Native Connections: Serial SPP & Windows WinRT BLE ----------

const WIN_SERIAL_PS = `
$portName = $env:ETALON_COM_PORT
$baud = [int]$env:ETALON_BAUD
$sp = New-Object System.IO.Ports.SerialPort $portName, $baud, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$sp.ReadTimeout = 500
$sp.NewLine = "\`n"
$sp.Open()
[Console]::Out.WriteLine("READY|" + $portName)
[Console]::Out.Flush()
try {
  while ($sp.IsOpen) {
    if ([Console]::In.Peek() -ge 0) {
      $cmd = [Console]::In.ReadLine()
      if ($cmd -eq '__QUIT__') { break }
      if ($cmd) { $sp.WriteLine($cmd) }
    }
    try {
      $line = $sp.ReadLine()
      if ($line) {
        [Console]::Out.WriteLine("LINE|" + $line)
        [Console]::Out.Flush()
      }
    } catch [System.TimeoutException] {
      # continue loop
    }
  }
} finally {
  if ($sp.IsOpen) { $sp.Close() }
}
`.trim();

const WIN_WINRT_BLE_PS = `
$ErrorActionPreference = 'Stop'
[Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristic, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

function Await-AsyncOp($op, $resultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait() | Out-Null
  return $task.Result
}

$macHex = ($env:ETALON_BT_MAC -replace '[:\\-]', '')
$addr = [Convert]::ToUInt64($macHex, 16)
$dev = Await-AsyncOp ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)) ([Windows.Devices.Bluetooth.BluetoothLEDevice])
if ($null -eq $dev) { throw "BLE device not reachable via Windows Bluetooth" }

$svcResult = Await-AsyncOp ($dev.GetGattServicesAsync()) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
$subscribed = @()
foreach ($svc in $svcResult.Services) {
  $chRes = Await-AsyncOp ($svc.GetCharacteristicsAsync()) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
  foreach ($ch in $chRes.Characteristics) {
    $props = [int]$ch.CharacteristicProperties
    if (($props -band 16) -ne 0 -or ($props -band 32) -ne 0) {
      $cccd = if (($props -band 16) -ne 0) {
        [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Notify
      } else {
        [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Indicate
      }
      $null = Register-ObjectEvent -InputObject $ch -EventName 'ValueChanged' -Action {
        $argsVal = $EventArgs.CharacteristicValue
        $bytes = New-Object byte[] $argsVal.Length
        $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($argsVal)
        $reader.ReadBytes($bytes)
        $b64 = [Convert]::ToBase64String($bytes)
        $cu = $Event.Sender.Uuid.ToString()
        [Console]::Out.WriteLine("DATA|" + $cu + "|" + $b64)
        [Console]::Out.Flush()
      }
      $null = Await-AsyncOp ($ch.WriteClientCharacteristicConfigurationDescriptorAsync($cccd)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus])
      $subscribed += $ch.Uuid.ToString()
    }
  }
}
[Console]::Out.WriteLine("READY|" + ($subscribed -join ','))
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq '__QUIT__') { break }
}
$dev.Dispose()
`.trim();

export async function connectNativeBluetoothDevice(params: {
  type: EquipmentType;
  deviceId: string;
  deviceName?: string;
  address?: string;
  port?: string;
  protocol?: NativeBluetoothProtocol;
  baudRate?: number;
  callbacks: NativeBtStreamCallbacks;
}): Promise<{
  success: boolean;
  deviceName: string;
  protocol: 'gatt' | 'spp';
  message: string;
}> {
  await disconnectNativeBluetoothDevice(params.type);

  const safeBaud = sanitizeBaudRate(params.baudRate);
  const safePort = normalizeSafeSerialPort(params.port || (params.address?.startsWith('/dev/') || WIN_COM_REGEX.test(params.address || '') ? params.address : undefined));
  const safeMac = normalizeSafeBtAddress(params.address || (!safePort ? params.deviceId : undefined));
  const deviceName = (params.deviceName || safePort || safeMac || 'Штатный Bluetooth').slice(0, 90);
  const requestedProto = params.protocol || 'auto';

  // 1. OS Serial / Bluetooth SPP (COM* or /dev/cu.* or /dev/rfcomm*)
  if (safePort && (requestedProto === 'spp' || requestedProto === 'auto')) {
    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        let settled = false;
        let child: ChildProcess | null = null;
        try {
          child = spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', WIN_SERIAL_PS],
            {
              windowsHide: true,
              env: {
                ...process.env,
                ETALON_COM_PORT: safePort,
                ETALON_BAUD: String(safeBaud),
              },
            }
          );
        } catch (err) {
          resolve({
            success: false,
            deviceName,
            protocol: 'spp',
            message: `Не удалось открыть порт ${safePort}: ${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }

        let buf = '';
        let closedManually = false;
        const conn: ActiveNativeConnection = {
          type: params.type,
          deviceId: params.deviceId,
          deviceName,
          protocol: 'spp',
          address: safeMac || safePort,
          port: safePort,
          disconnect: async () => {
            closedManually = true;
            try {
              child?.stdin?.write('__QUIT__\n');
              child?.kill();
            } catch {
              // ignore
            }
          },
          write: async (cmd: string) => {
            if (SAFE_COMMAND_REGEX.test(cmd) && child?.stdin?.writable) {
              child.stdin.write(`${cmd.replace(/[\r\n]+$/, '')}\n`);
            }
          },
        };

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            conn.disconnect().catch(() => undefined);
            resolve({
              success: false,
              deviceName,
              protocol: 'spp',
              message: `Таймаут открытия штатного Bluetooth COM-порта ${safePort}.`,
            });
          }
        }, 7000);

        child.stdout?.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf-8');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const rawLine of lines) {
            if (rawLine.startsWith('READY|') && !settled) {
              settled = true;
              clearTimeout(timer);
              activeConnections.set(params.type, conn);
              resolve({
                success: true,
                deviceName,
                protocol: 'spp',
                message: `Подключено через штатный Bluetooth SPP (${safePort}): ${deviceName}.`,
              });
            } else if (rawLine.startsWith('LINE|')) {
              const payloadLine = rawLine.slice(5);
              const decoded = decodeNativeBytesOrLineToPacket({
                type: params.type,
                deviceName,
                line: payloadLine,
              });
              if (decoded.packet) params.callbacks.onPacket(decoded.packet);
              if (decoded.status) params.callbacks.onStatus?.(decoded.status);
            }
          }
        });

        child.on('exit', () => {
          activeConnections.delete(params.type);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              success: false,
              deviceName,
              protocol: 'spp',
              message: `Не удалось подключиться к Bluetooth COM-порту ${safePort}. Убедитесь, что устройство включено и сопряжено в Windows.`,
            });
          } else if (!closedManually) {
            params.callbacks.onDisconnect?.(`Bluetooth SPP порт ${safePort} закрыт.`);
          }
        });
      });
    }

    // macOS / Linux POSIX serial port (/dev/cu.* / /dev/rfcomm*)
    if (!fs.existsSync(safePort)) {
      return {
        success: false,
        deviceName,
        protocol: 'spp',
        message: `Bluetooth-порт ${safePort} недоступен или датчик выключен.`,
      };
    }

    try {
      const sttyFlag = process.platform === 'darwin' ? '-f' : '-F';
      await execFileAsync('stty', [sttyFlag, safePort, String(safeBaud), 'raw', '-echo'], {
        timeout: 3000,
      }).catch(() => undefined);

      const stream = fs.createReadStream(safePort);
      let closedManually = false;
      let textBuf = '';

      const conn: ActiveNativeConnection = {
        type: params.type,
        deviceId: params.deviceId,
        deviceName,
        protocol: 'spp',
        address: safePort,
        port: safePort,
        disconnect: async () => {
          closedManually = true;
          stream.destroy();
        },
        write: async (cmd: string) => {
          if (!SAFE_COMMAND_REGEX.test(cmd)) return;
          await fs.promises.writeFile(safePort, cmd);
        },
      };

      activeConnections.set(params.type, conn);

      stream.on('data', (chunk: string | Buffer) => {
        textBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        const lines = textBuf.split(/\r?\n/);
        textBuf = lines.pop() || '';
        for (const line of lines) {
          const decoded = decodeNativeBytesOrLineToPacket({
            type: params.type,
            deviceName,
            line,
          });
          if (decoded.packet) params.callbacks.onPacket(decoded.packet);
          if (decoded.status) params.callbacks.onStatus?.(decoded.status);
        }
      });

      stream.on('error', (err) => {
        activeConnections.delete(params.type);
        if (!closedManually) {
          params.callbacks.onDisconnect?.(
            `Ошибка чтения Bluetooth-порта ${safePort}: ${err.message}`
          );
        }
      });

      stream.on('close', () => {
        activeConnections.delete(params.type);
        if (!closedManually) {
          params.callbacks.onDisconnect?.(`Bluetooth SPP порт ${safePort} отключён.`);
        }
      });

      return {
        success: true,
        deviceName,
        protocol: 'spp',
        message: `Подключено через штатный Bluetooth SPP (${safePort}): ${deviceName}.`,
      };
    } catch (err) {
      return {
        success: false,
        deviceName,
        protocol: 'spp',
        message: `Ошибка открытия порта ${safePort}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 2. Windows 10/11 Native WinRT BLE GATT
  if (process.platform === 'win32' && safeMac && MAC_REGEX.test(safeMac)) {
    return new Promise((resolve) => {
      let settled = false;
      let child: ChildProcess | null = null;
      try {
        child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', WIN_WINRT_BLE_PS],
          {
            windowsHide: true,
            env: {
              ...process.env,
              ETALON_BT_MAC: safeMac,
            },
          }
        );
      } catch (err) {
        resolve({
          success: false,
          deviceName,
          protocol: 'gatt',
          message: `Ошибка запуска системного Bluetooth Windows: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      let outBuf = '';
      let closedManually = false;
      const conn: ActiveNativeConnection = {
        type: params.type,
        deviceId: params.deviceId,
        deviceName,
        protocol: 'gatt',
        address: safeMac,
        disconnect: async () => {
          closedManually = true;
          try {
            child?.stdin?.write('__QUIT__\n');
            child?.kill();
          } catch {
            // ignore
          }
        },
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.disconnect().catch(() => undefined);
          resolve({
            success: false,
            deviceName,
            protocol: 'gatt',
            message: `Таймаут подключения по штатному Bluetooth Windows к ${deviceName} (${safeMac}). Убедитесь, что датчик включён.`,
          });
        }
      }, 11000);

      child.stdout?.on('data', (chunk: Buffer) => {
        outBuf += chunk.toString('utf-8');
        const lines = outBuf.split(/\r?\n/);
        outBuf = lines.pop() || '';
        for (const rawLine of lines) {
          if (rawLine.startsWith('READY|') && !settled) {
            settled = true;
            clearTimeout(timer);
            activeConnections.set(params.type, conn);
            const svcs = rawLine.slice(6);
            resolve({
              success: true,
              deviceName,
              protocol: 'gatt',
              message: `Подключено через штатный Bluetooth Windows (${deviceName})${svcs ? ` [${svcs.split(',').length} кан.]` : ''}.`,
            });
          } else if (rawLine.startsWith('DATA|')) {
            const parts = rawLine.split('|');
            if (parts.length >= 3) {
              const charUuid = parts[1];
              const b64 = parts[2];
              const buf = Buffer.from(b64, 'base64');
              const decoded = decodeNativeBytesOrLineToPacket({
                type: params.type,
                deviceName,
                buffer: buf,
                charUuid,
              });
              if (decoded.packet) params.callbacks.onPacket(decoded.packet);
              if (decoded.status) params.callbacks.onStatus?.(decoded.status);
            }
          }
        }
      });

      child.on('exit', () => {
        activeConnections.delete(params.type);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            success: false,
            deviceName,
            protocol: 'gatt',
            message: `Устройство ${deviceName} (${safeMac}) не отвечает по системному Bluetooth Windows. Разбудите датчик или используйте кнопку «Подключить BLE».`,
          });
        } else if (!closedManually) {
          params.callbacks.onDisconnect?.(`Штатное Bluetooth-соединение с ${deviceName} разорвано.`);
        }
      });
    });
  }

  return {
    success: false,
    deviceName,
    protocol: 'gatt',
    message:
      process.platform === 'linux'
        ? 'Для подключения через штатный Bluetooth используйте Android-приложение или десктопный клиент (Windows / macOS) на вашем ПК.'
        : 'Укажите Bluetooth COM/Serial порт или сопряжённое устройство в настройках Bluetooth ОС.',
  };
}

export async function disconnectNativeBluetoothDevice(type: EquipmentType): Promise<boolean> {
  const existing = activeConnections.get(type);
  if (!existing) return false;
  activeConnections.delete(type);
  await existing.disconnect().catch(() => undefined);
  return true;
}

export async function writeNativeBluetoothCommand(
  type: EquipmentType,
  command: string
): Promise<boolean> {
  const existing = activeConnections.get(type);
  if (!existing?.write || !SAFE_COMMAND_REGEX.test(command)) return false;
  await existing.write(command);
  return true;
}

export function getActiveNativeBluetoothSummary() {
  return Array.from(activeConnections.values()).map((c) => ({
    type: c.type,
    deviceId: c.deviceId,
    deviceName: c.deviceName,
    protocol: c.protocol,
    address: c.address,
    port: c.port,
  }));
}
