import type {
  EquipmentType,
  LiveHardwarePacket,
  NativeBluetoothDeviceInfo,
  NativeBluetoothProtocol,
} from '../types';
import { apiRequest } from './api';
import { parseMiScale2Packet } from './miScale2';

export interface NativeBluetoothBridgeEvent {
  type: 'deviceFound' | 'connected' | 'disconnected' | 'error' | 'data';
  device?: NativeBluetoothDeviceInfo;
  address?: string;
  deviceName?: string;
  equipmentType?: EquipmentType;
  protocol?: 'gatt' | 'spp';
  services?: string[];
  serviceUuid?: string;
  charUuid?: string;
  base64?: string;
  line?: string;
  reason?: string;
  message?: string;
}

declare global {
  interface Window {
    EtalonNativeBluetooth?: {
      isAvailable: () => boolean;
      isEnabled?: () => boolean;
      ensurePermissions?: () => boolean;
      getPairedDevices: () => string;
      startScan?: (deviceTypeHint: string) => void;
      stopScan?: () => void;
      connect: (address: string, equipmentType: string, protocol: string) => void;
      disconnect: (address: string) => void;
      write?: (address: string, text: string) => boolean;
    };
    __onEtalonNativeBluetoothEvent?: (event: NativeBluetoothBridgeEvent) => void;
    praviloDesktop?: {
      isDesktopApp?: boolean;
      platform?: string;
      getAppInfo?: () => Promise<{
        version: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
      }>;
      checkGithubRelease?: (githubRepo: string) => Promise<{
        currentVersion: string;
        latestTag: string;
        latestVersion: string;
        updateAvailable: boolean;
        releasePageUrl: string;
        publishedAt: string;
        dmgUrl: string;
        dmgName: string;
        exeUrl: string;
        exeName: string;
        preferredAssetUrl: string;
        preferredAssetName: string;
      }>;
      downloadInstaller?: (payload: { url: string; fileName: string }) => Promise<{
        ok: boolean;
        savedPath: string;
        fileName: string;
      }>;
      openGithubUrl?: (url: string) => Promise<boolean>;
      bluetooth?: {
        listDevices: () => Promise<{
          platform: 'windows' | 'macos' | 'linux';
          adapterSupported: boolean;
          devices: NativeBluetoothDeviceInfo[];
        }>;
        connect: (params: {
          type: EquipmentType;
          deviceId: string;
          deviceName?: string;
          address?: string;
          port?: string;
          protocol?: NativeBluetoothProtocol;
          baudRate?: number;
        }) => Promise<{ success: boolean; deviceName: string; message: string }>;
        disconnect: (type: EquipmentType) => Promise<boolean>;
        write: (type: EquipmentType, command: string) => Promise<boolean>;
        onEvent: (cb: (ev: NativeBluetoothBridgeEvent) => void) => () => void;
      };
    };
  }
}

export interface HardwareCapabilities {
  webBluetooth: boolean;
  webSerial: boolean;
  nativeAndroidBluetooth: boolean;
  nativeDesktopBluetooth: boolean;
  nativeBluetoothAvailable: boolean;
  secureContext: boolean;
  inIframe: boolean;
}

export function getHardwareCapabilities(): HardwareCapabilities {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { bluetooth?: unknown; serial?: unknown }) : undefined;
  const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;
  const nativeAndroidBluetooth =
    typeof window !== 'undefined' && Boolean(window.EtalonNativeBluetooth?.isAvailable?.());
  const nativeDesktopBluetooth =
    typeof window !== 'undefined' && Boolean(window.praviloDesktop?.bluetooth);
  return {
    webBluetooth: Boolean(nav?.bluetooth && typeof (nav.bluetooth as { requestDevice?: unknown }).requestDevice === 'function'),
    webSerial: Boolean(nav?.serial && typeof (nav.serial as { requestPort?: unknown }).requestPort === 'function'),
    nativeAndroidBluetooth,
    nativeDesktopBluetooth,
    nativeBluetoothAvailable: nativeAndroidBluetooth || nativeDesktopBluetooth || typeof window !== 'undefined',
    secureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
    inIframe,
  };
}

export function formatHardwareError(err: unknown, contextLabel: string, type?: EquipmentType): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('cancel') || lower.includes('user cancelled')) {
    if (type === 'wahoo_tickr') {
      return `${contextLabel}: поиск пульсометра отменён. Если пульсометр не появился в списке: 1) нажмите кнопку включения на браслете (должен мигать индикатор), 2) закройте фитнес-приложения или часы на телефоне (занятый BLE-канал скрывает датчик), 3) нажмите «Все BLE».`;
    }
    if (type === 'bp_b05') {
      return `${contextLabel}: поиск тонометра отменён. Включите Bluetooth на манжете (удерживайте MEM или нажмите START до значка BLE). Если прибор не виден — нажмите «Все BLE».`;
    }
    return `${contextLabel}: выбор устройства отменён пользователем.`;
  }
  if (lower.includes('permissions policy') || lower.includes('disallowed')) {
    return `${contextLabel}: Web Bluetooth заблокирован политикой iframe. Откройте приложение напрямую в отдельной вкладке браузера (HTTPS) или используйте USB/Wi-Fi мост.`;
  }
  if (lower.includes('securityerror') || lower.includes('authentication') || lower.includes('insufficient')) {
    return `${contextLabel}: ошибка сопряжения/доступа BLE (${raw}). Подтвердите системный запрос сопряжения или удалите устройство из настроек Bluetooth ОС и подключите заново из приложения.`;
  }
  if (lower.includes('bluetooth adapter not available') || lower.includes('not found')) {
    if (type === 'wahoo_tickr') {
      return `${contextLabel}: пульсометр не найден или Bluetooth-адаптер выключен. Нажмите кнопку на пульсометре, отключите его от телефона или используйте кнопку «Все BLE».`;
    }
    if (type === 'bp_b05') {
      return `${contextLabel}: тонометр не найден или спит. Нажмите START / удерживайте MEM на манжете, закройте сторонние приложения тонометра на телефоне или нажмите «Все BLE».`;
    }
    return `${contextLabel}: устройство не найдено или Bluetooth-адаптер выключен.`;
  }
  if (lower.includes('no port selected')) {
    return `${contextLabel}: COM/USB-порт не выбран.`;
  }
  if (lower.includes('gatt server is disconnected') || lower.includes('connection failed') || lower.includes('networkerror')) {
    if (type === 'wahoo_tickr') {
      return `${contextLabel}: не удалось установить GATT-связь с пульсометром (${raw}). Наденьте пульсометр на предплечье, нажмите кнопку и повторите подключение.`;
    }
    if (type === 'bp_b05') {
      return `${contextLabel}: тонометр разорвал BLE-связь (${raw}). Нажмите START / MEM на манжете, чтобы разбудить Bluetooth, и повторите попытку.`;
    }
  }
  return `${contextLabel}: ${raw}`;
}

export interface BlePairResult {
  success: boolean;
  deviceName?: string;
  mode: 'web_bluetooth' | 'native_bluetooth' | 'web_serial' | 'websocket_bridge';
  batteryPct?: number;
  discoveredServices?: string[];
  message: string;
}

export interface ActiveHardwareHandle {
  disconnect: () => Promise<void>;
  sendCommand?: (cmd: string) => Promise<void>;
}

const WAHOO_SERVICE_PRIMARY = 'a026ee01-0a7d-4ab3-97fa-f1500f9feb8b';
const WAHOO_SERVICE_ALT = 'a026ee07-0a7d-4ab3-97fa-f1500f9feb8b';
const BP_ISSC_UART_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const BP_ISSC_UART_NOTIFY = '49535343-1e4d-4bd9-ba61-23c647249616';
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const TELINK_SPP_SERVICE = '00010203-0405-0607-0809-0a0b0c0d1910';
const TELINK_SPP_NOTIFY = '00010203-0405-0607-0809-0a0b0c0d1911';
const MI_SCALE_CUSTOM_CHAR = '00002a2f-0000-3512-2118-0009af100700';
const BP_CUSTOM_SERVICE = 'cdeacd80-5235-4c07-8846-93a37ee6b86d';
const BP_CUSTOM_NOTIFY = 'cdeacd81-5235-4c07-8846-93a37ee6b86d';
const ESP32_CUSTOM_WEIGHT_SERVICE = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const OKOK_SCALE_SERVICE = '80d78b1d-0a8d-afb6-157d-93fd60d99bf4';

const SERVICE_UUIDS: Record<EquipmentType, (number | string)[]> = {
  wahoo_tickr: [0x180d, 0x180f, 0x180a, WAHOO_SERVICE_PRIMARY, WAHOO_SERVICE_ALT],
  bp_b05: [
    0x1810,
    BP_CUSTOM_SERVICE,
    0x180f,
    0x180a,
    0xfff0,
    0xffe0,
    0xffb0,
    0xff00,
    0xff12,
    0xae00,
    0xae30,
    0x1910,
    0xfee7,
    0xfee9,
    0xfe40,
    0x18f0,
    NORDIC_UART_SERVICE,
    BP_ISSC_UART_SERVICE,
    TELINK_SPP_SERVICE,
  ],
  xiaomi_scale: [0x181b, 0x181d, 0x180f, 0x180a, 0x1805, MI_SCALE_CUSTOM_CHAR, OKOK_SCALE_SERVICE],
  myoblue_emg: [0xffe0, 0xfff0, NORDIC_UART_SERVICE, 0x180f],
  esp32_limbs: [ESP32_CUSTOM_WEIGHT_SERVICE, 0x181c, 0xffe0, NORDIC_UART_SERVICE, 0x180f],
};

interface GattCharacteristicLike {
  uuid?: string;
  properties?: { notify?: boolean; indicate?: boolean; read?: boolean; write?: boolean };
  startNotifications: () => Promise<unknown>;
  stopNotifications?: () => Promise<unknown>;
  readValue?: () => Promise<DataView>;
  writeValue?: (val: BufferSource) => Promise<void>;
  addEventListener: (ev: string, fn: (e: { target: { value?: DataView } }) => void) => void;
  removeEventListener: (ev: string, fn: (e: { target: { value?: DataView } }) => void) => void;
}

interface GattServiceLike {
  uuid?: string;
  getCharacteristic: (uuid: number | string) => Promise<GattCharacteristicLike>;
  getCharacteristics?: () => Promise<GattCharacteristicLike[]>;
}

interface GattServerLike {
  connected?: boolean;
  disconnect?: () => void;
  getPrimaryService: (uuid: number | string) => Promise<GattServiceLike>;
  getPrimaryServices?: () => Promise<GattServiceLike[]>;
}

interface BluetoothAdvertisingEventLike {
  device?: BluetoothDeviceLike;
  serviceData?: Map<string | number, DataView>;
}

interface BluetoothDeviceLike {
  id?: string;
  name?: string;
  gatt?: {
    connected?: boolean;
    connect: () => Promise<GattServerLike>;
    disconnect?: () => void;
  };
  watchAdvertisements?: () => Promise<void>;
  addEventListener?: (ev: string, fn: (e?: BluetoothAdvertisingEventLike) => void) => void;
  removeEventListener?: (ev: string, fn: (e?: BluetoothAdvertisingEventLike) => void) => void;
}

function getNavigatorBluetooth() {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: {
        filters?: { services?: (number | string)[]; namePrefix?: string }[];
        acceptAllDevices?: boolean;
        optionalServices?: (number | string)[];
      }) => Promise<BluetoothDeviceLike>;
    };
  };
  return nav.bluetooth;
}

function formatUuidShort(uuid?: string): string {
  if (!uuid) return 'unknown';
  const match = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  return match ? `0x${match[1]}` : uuid;
}

async function inspectDiscoveredServices(server: GattServerLike, retries = 3): Promise<string[]> {
  if (!server.getPrimaryServices) return [];
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const svcs = await server.getPrimaryServices();
      if (Array.isArray(svcs)) {
        if (svcs.length > 0 || attempt === retries) {
          return svcs.map((s) => formatUuidShort(s.uuid));
        }
      }
    } catch {
      if (attempt === retries) return [];
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return [];
}

async function startNotificationsWithRetry(ch: GattCharacteristicLike, attempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await ch.startNotifications();
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

async function connectGattWithRetry(device: BluetoothDeviceLike, maxAttempts = 3): Promise<GattServerLike> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (device.gatt?.connected && attempt > 1) {
        device.gatt.disconnect?.();
        await new Promise((r) => setTimeout(r, 500));
      }
      const server = await device.gatt!.connect();
      // Windows Chrome BLE stack needs settle time before primary GATT service enumeration
      await new Promise((r) => setTimeout(r, attempt === 1 ? 400 : 850));
      return server;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        try {
          device.gatt?.disconnect?.();
        } catch {
          // ignore disconnect cleanup error between retries
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr;
}

async function tryReadBatteryLevel(server: GattServerLike): Promise<number | undefined> {
  try {
    const batService = await server.getPrimaryService(0x180f);
    const batChar = await batService.getCharacteristic(0x2a19);
    if (batChar.readValue) {
      const dv = await batChar.readValue();
      if (dv.byteLength >= 1) {
        return dv.getUint8(0);
      }
    }
  } catch {
    // Battery Service is optional on many peripherals
  }
  return undefined;
}

export interface HeartRateDetails {
  bpm: number;
  sensorContactSupported: boolean;
  sensorContact?: boolean;
}

export function parseHeartRateDetails(dv: DataView): HeartRateDetails | null {
  if (dv.byteLength < 2) return null;
  const flags = dv.getUint8(0);
  const isUint16 = (flags & 0x01) !== 0;
  const sensorContactSupported = (flags & 0x04) !== 0;
  const sensorContact = sensorContactSupported ? (flags & 0x02) !== 0 : undefined;
  if (isUint16) {
    if (dv.byteLength < 3) return null;
    return {
      bpm: dv.getUint16(1, true),
      sensorContactSupported,
      sensorContact,
    };
  }
  return {
    bpm: dv.getUint8(1),
    sensorContactSupported,
    sensorContact,
  };
}

export function parseHeartRateMeasurement(dv: DataView): number | null {
  return parseHeartRateDetails(dv)?.bpm ?? null;
}

/**
 * Decodes an IEEE-11073 16-bit SFLOAT (4-bit signed exponent, 12-bit signed mantissa)
 * used in Bluetooth SIG Blood Pressure Measurement (0x2A35).
 */
export function parseSfloat16(raw: number): number {
  const mantissaRaw = raw & 0x0fff;
  const exponentRaw = (raw >> 12) & 0x0f;
  if (mantissaRaw === 0x07ff || mantissaRaw === 0x0800 || mantissaRaw === 0x07fe || mantissaRaw === 0x0802) {
    return NaN;
  }
  const mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
  const exponent = exponentRaw >= 0x08 ? exponentRaw - 0x10 : exponentRaw;
  return mantissa * Math.pow(10, exponent);
}

export function isValidBpReading(reading: { sys: number; dia: number; pulse?: number }): boolean {
  if (!Number.isFinite(reading.sys) || !Number.isFinite(reading.dia)) return false;
  if (reading.sys < 45 || reading.sys > 280) return false;
  if (reading.dia < 25 || reading.dia > 200) return false;
  if (reading.sys <= reading.dia) return false;
  if (reading.pulse !== undefined && (reading.pulse < 25 || reading.pulse > 240)) return false;
  return true;
}

/**
 * Parses Bluetooth SIG Blood Pressure Measurement characteristic (0x2A35).
 */
export function parseBloodPressurePacket(data: DataView): {
  sys: number;
  dia: number;
  map: number;
  pulse?: number;
} {
  const flags = data.getUint8(0);
  const isKpa = (flags & 0x01) !== 0;
  const hasTimestamp = (flags & 0x02) !== 0;
  const hasPulseRate = (flags & 0x04) !== 0;

  const toMmHg = (val: number) => (isKpa ? val * 7.50062 : val);
  const sys = Math.round(toMmHg(parseSfloat16(data.getUint16(1, true))));
  const dia = Math.round(toMmHg(parseSfloat16(data.getUint16(3, true))));
  const map = Math.round(toMmHg(parseSfloat16(data.getUint16(5, true))));

  let offset = 7;
  if (hasTimestamp) offset += 7;

  let pulse: number | undefined;
  if (hasPulseRate && data.byteLength >= offset + 2) {
    const parsedPulse = Math.round(parseSfloat16(data.getUint16(offset, true)));
    if (Number.isFinite(parsedPulse) && parsedPulse > 0) {
      pulse = parsedPulse;
    }
  }

  return { sys, dia, map, pulse };
}

/**
 * Parses common OEM / Chinese BLE blood pressure cuff packets (FFF0 / FFE0 / UART).
 */
export function parseOemBloodPressurePacket(data: DataView): {
  sys: number;
  dia: number;
  map: number;
  pulse?: number;
} | null {
  try {
    const text = new TextDecoder()
      .decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      .trim();
    if (text.startsWith('{')) {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const sys = Math.round(Number(obj.sys ?? obj.systolic ?? obj.sbp));
      const dia = Math.round(Number(obj.dia ?? obj.diastolic ?? obj.dbp));
      const pulseRaw = obj.pulse ?? obj.hr ?? obj.bpm ?? obj.heartRate;
      const pulse = pulseRaw !== undefined ? Math.round(Number(pulseRaw)) : undefined;
      if (isValidBpReading({ sys, dia, pulse })) {
        const map = Number.isFinite(Number(obj.map))
          ? Math.round(Number(obj.map))
          : Math.round(dia + (sys - dia) / 3);
        return { sys, dia, map, pulse };
      }
    }
    const namedMatch = text.match(
      /SYS[:=\s]+(\d{2,3}).*?DIA[:=\s]+(\d{2,3})(?:.*?(?:PUL|PULSE|HR)[:=\s]+(\d{2,3}))?/i
    );
    if (namedMatch) {
      const sys = Number(namedMatch[1]);
      const dia = Number(namedMatch[2]);
      const pulse = namedMatch[3] ? Number(namedMatch[3]) : undefined;
      if (isValidBpReading({ sys, dia, pulse })) {
        return { sys, dia, map: Math.round(dia + (sys - dia) / 3), pulse };
      }
    }
    const nums = text.split(/[,;/\s]+/).map(Number);
    if (nums.length >= 2 && nums.length <= 4 && nums.every((v) => Number.isFinite(v))) {
      const sys = Math.round(nums[0]);
      const dia = Math.round(nums[1]);
      const pulse = nums[2] !== undefined ? Math.round(nums[2]) : undefined;
      if (isValidBpReading({ sys, dia, pulse })) {
        return { sys, dia, map: Math.round(dia + (sys - dia) / 3), pulse };
      }
    }
  } catch {
    // try known binary OEM framing below
  }

  // Custom tonometer binary packet on cdeacd80/cdeacd81: [0x81 (129), systolic, diastolic, pulse]
  if (data.byteLength >= 4 && data.getUint8(0) === 0x81) {
    const sys = data.getUint8(1);
    const dia = data.getUint8(2);
    const pulse = data.getUint8(3) || undefined;
    if (isValidBpReading({ sys, dia, pulse })) {
      return { sys, dia, map: Math.round(dia + (sys - dia) / 3), pulse };
    }
  }

  // Common Contec / B05 final result frame: [0xFD, 0xFD, 0xFC, sys, dia, pulse]
  if (
    data.byteLength >= 6 &&
    data.getUint8(0) === 0xfd &&
    data.getUint8(1) === 0xfd &&
    data.getUint8(2) === 0xfc
  ) {
    const sys = data.getUint8(3);
    const dia = data.getUint8(4);
    const pulse = data.getUint8(5) || undefined;
    if (isValidBpReading({ sys, dia, pulse })) {
      return { sys, dia, map: Math.round(dia + (sys - dia) / 3), pulse };
    }
  }

  return null;
}

function formatDataViewHex(dv: DataView): string {
  const bytes: string[] = [];
  for (let i = 0; i < dv.byteLength; i += 1) {
    bytes.push(dv.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
  }
  return bytes.join(' ');
}

export function parseIntermediateCuffPressure(dv: DataView): number | null {
  if (dv.byteLength < 3) return null;
  const flags = dv.getUint8(0);
  const isKpa = (flags & 0x01) !== 0;
  const raw = dv.getUint16(1, true);
  const decoded = parseSfloat16(raw);
  if (!Number.isFinite(decoded)) return null;
  const mmHg = Math.round(isKpa ? decoded * 7.50062 : decoded);
  return mmHg >= 10 && mmHg <= 350 ? mmHg : null;
}

function buildBpDeviceFilters(nameFilter?: string): { services?: (number | string)[]; namePrefix?: string }[] {
  if (nameFilter?.trim()) {
    return buildNamePrefixFilters(nameFilter);
  }
  return [
    { services: [0x1810] },
    { services: [BP_CUSTOM_SERVICE] },
    // Yonker YK-IBPA1 / YK-BPA1 / Metiko MT-YK-BPA1 advertised names
    { namePrefix: 'BleModule' },
    { namePrefix: 'YK-' },
    { namePrefix: 'Yonker' },
    { namePrefix: 'YONKER' },
    { namePrefix: 'MT-YK' },
    { namePrefix: 'IBP' },
    // B05 / general BLE blood pressure cuffs
    { namePrefix: 'B05' },
    { namePrefix: 'BPM' },
    { namePrefix: 'BP' },
    { namePrefix: 'Yuwell' },
    { namePrefix: 'YUWELL' },
    { namePrefix: 'OMRON' },
    { namePrefix: 'Omron' },
    { namePrefix: 'BLESmart' },
    { namePrefix: 'Contec' },
    { namePrefix: 'Sinocare' },
    { namePrefix: 'Medisana' },
    { namePrefix: 'Bluetooth BP' },
    { services: [0xfff0] },
    { services: [0xffe0] },
  ];
}

async function subscribeBloodPressureCharacteristics(
  server: GattServerLike,
  onReading: (reading: { sys: number; dia: number; map: number; pulse?: number }) => void,
  onRawPacket?: (hex: string, svcLabel: string) => void,
  onProgress?: (msg: string) => void,
  discoveredServices?: string[]
): Promise<() => void> {
  const cleanups: (() => void)[] = [];
  const subscribedChannels: string[] = [];

  // 1. Standard Bluetooth SIG Blood Pressure Service (0x1810 -> 0x2A35 + optional 0x2A36)
  try {
    const svc = await server.getPrimaryService(0x1810);
    // Reading 0x2A49 (Blood Pressure Feature) triggers Windows OS pairing prompt immediately if required
    try {
      const featureChar = await svc.getCharacteristic(0x2a49);
      await featureChar.readValue?.();
    } catch {
      // 0x2A49 is optional
    }

    const bpChar = await svc.getCharacteristic(0x2a35);
    const onNotify = (ev: { target: { value?: DataView } }) => {
      const dv = ev.target?.value;
      if (!dv || dv.byteLength < 7) return;
      const parsed = parseBloodPressurePacket(dv);
      if (isValidBpReading(parsed)) {
        onReading(parsed);
      } else {
        onRawPacket?.(formatDataViewHex(dv), '0x1810/0x2A35');
      }
    };
    bpChar.addEventListener('characteristicvaluechanged', onNotify);
    await startNotificationsWithRetry(bpChar, 3);
    subscribedChannels.push('0x1810/0x2A35');
    cleanups.push(() => {
      bpChar.removeEventListener('characteristicvaluechanged', onNotify);
      bpChar.stopNotifications?.().catch(() => undefined);
    });

    // Optional 0x2A36 Intermediate Cuff Pressure live progress
    try {
      const icpChar = await svc.getCharacteristic(0x2a36);
      const onIcpNotify = (ev: { target: { value?: DataView } }) => {
        const dv = ev.target?.value;
        if (!dv) return;
        const mmHg = parseIntermediateCuffPressure(dv);
        if (mmHg !== null) {
          onProgress?.(`Манжета: ${mmHg} мм рт. ст.`);
        }
      };
      icpChar.addEventListener('characteristicvaluechanged', onIcpNotify);
      await startNotificationsWithRetry(icpChar, 2);
      subscribedChannels.push('0x1810/0x2A36');
      cleanups.push(() => {
        icpChar.removeEventListener('characteristicvaluechanged', onIcpNotify);
        icpChar.stopNotifications?.().catch(() => undefined);
      });
    } catch {
      // 0x2A36 intermediate pressure is optional
    }
  } catch {
    // 0x1810 missing or locked; continue to OEM/UART services below
  }

  // 2. Concurrent OEM/UART Blood Pressure services (subscribe even when 0x1810 exists,
  // because dual-profile devices like BleModuleB/YK-IBPA1 may transmit on FFF0/AE00/FFE0)
  const oemCandidates: [string | number, (string | number)[], string][] = [
    [BP_CUSTOM_SERVICE, [BP_CUSTOM_NOTIFY], 'CDEACD80'],
    [0xfff0, [0xfff1, 0xfff4, 0xfff3, 0xfff2], '0xFFF0'],
    [0xffe0, [0xffe1, 0xffe4], '0xFFE0'],
    [0xffb0, [0xffb2, 0xffb1], '0xFFB0'],
    [0xff00, [0xff01, 0xff02], '0xFF00'],
    [0xff12, [0xff01, 0xff02], '0xFF12'],
    [0xae00, [0xae02, 0xae01], '0xAE00'],
    [0xae30, [0xae02, 0xae04, 0xae10], '0xAE30'],
    [0x1910, [0x2b10, 0x2b11], '0x1910'],
    [0xfee7, [0xfec8, 0xfec7], '0xFEE7'],
    [0xfee9, [0xd44bc439], '0xFEE9'],
    [0xfe40, [0xfe42, 0xfe41], '0xFE40'],
    [0x18f0, [0x2af0, 0x2af1], '0x18F0'],
    [NORDIC_UART_SERVICE, [NORDIC_UART_NOTIFY], 'NordicUART'],
    [BP_ISSC_UART_SERVICE, [BP_ISSC_UART_NOTIFY], 'ISSC-UART'],
    [TELINK_SPP_SERVICE, [TELINK_SPP_NOTIFY], 'TelinkSPP'],
  ];

  for (const [svcUuid, charUuids, svcLabel] of oemCandidates) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      const boundChars: GattCharacteristicLike[] = [];

      // Discover all notify/indicate characteristics if supported by browser/OS stack
      if (svc.getCharacteristics) {
        try {
          const allChars = await svc.getCharacteristics();
          for (const ch of allChars) {
            if (!ch.properties || ch.properties.notify || ch.properties.indicate) {
              boundChars.push(ch);
            }
          }
        } catch {
          // fallback to known characteristic UUIDs below
        }
      }

      if (boundChars.length === 0) {
        for (const charUuid of charUuids) {
          try {
            const ch = await svc.getCharacteristic(charUuid);
            boundChars.push(ch);
          } catch {
            // try next characteristic inside service
          }
        }
      }

      for (const ch of boundChars) {
        try {
          const onNotify = (ev: { target: { value?: DataView } }) => {
            const dv = ev.target?.value;
            if (!dv) return;
            const parsed =
              dv.byteLength >= 7 && (dv.getUint8(0) & 0xf8) === 0
                ? (() => {
                    const sig = parseBloodPressurePacket(dv);
                    return isValidBpReading(sig) ? sig : parseOemBloodPressurePacket(dv);
                  })()
                : parseOemBloodPressurePacket(dv);
            if (parsed) {
              onReading(parsed);
            } else {
              onRawPacket?.(formatDataViewHex(dv), `${svcLabel}/${ch.uuid || '?'}`);
            }
          };
          ch.addEventListener('characteristicvaluechanged', onNotify);
          await startNotificationsWithRetry(ch, 2);
          subscribedChannels.push(`${svcLabel}/${formatUuidShort(ch.uuid)}`);
          cleanups.push(() => {
            ch.removeEventListener('characteristicvaluechanged', onNotify);
            ch.stopNotifications?.().catch(() => undefined);
          });
        } catch {
          // ignore non-notifiable characteristic
        }
      }
    } catch {
      // try next service
    }
  }

  if (cleanups.length > 0) {
    onProgress?.(`Подписка BLE активна (${subscribedChannels.join(', ')})`);
    return () => cleanups.forEach((fn) => fn());
  }

  if (discoveredServices && discoveredServices.length === 0) {
    throw new Error(
      'Устройство подключено на уровне ОС, но вернуло 0 доступных GATT-сервисов. Отключите прибор в приложении телефона (YonkerCare), удалите его из настроек Bluetooth Windows и подключите заново кнопкой «Подключить BLE».'
    );
  }

  const foundText =
    discoveredServices && discoveredServices.length > 0
      ? ` Найденные сервисы: [${discoveredServices.join(', ')}].`
      : '';

  throw new Error(
    `На выбранном BLE-устройстве не найден профиль тонометра (0x1810 / FFF0 / FFE0 / AE00).${foundText} Убедитесь, что выбран именно тонометр и он активен (кнопка START / MEM).`
  );
}

export function parseEsp32TextOrJsonLine(line: string): {
  lh: number;
  rh: number;
  lf: number;
  rf: number;
  batteryPct?: number;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('{')) {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const lh = Number(obj.lh ?? obj.d0 ?? obj.leftHand ?? obj.leftHandKg ?? 0);
      const rh = Number(obj.rh ?? obj.d1 ?? obj.rightHand ?? obj.rightHandKg ?? 0);
      const lf = Number(obj.lf ?? obj.d2 ?? obj.leftFoot ?? obj.leftFootKg ?? 0);
      const rf = Number(obj.rf ?? obj.d3 ?? obj.rightFoot ?? obj.rightFootKg ?? 0);
      if ([lh, rh, lf, rf].every((v) => Number.isFinite(v))) {
        const battRaw = obj.batteryPct ?? obj.hub_batt;
        return {
          lh,
          rh,
          lf,
          rf,
          batteryPct: typeof battRaw === 'number' ? battRaw : undefined,
        };
      }
    }
  } catch {
    // try CSV below
  }
  const parts = trimmed.split(/[,;\s]+/).map(Number);
  if (parts.length >= 4 && parts.slice(0, 4).every((v) => Number.isFinite(v))) {
    return { lh: parts[0], rh: parts[1], lf: parts[2], rf: parts[3] };
  }
  return null;
}

export function parseMyoBluePacket(dv: DataView): { ch1Mv: number; ch2Mv: number } | null {
  try {
    const text = new TextDecoder().decode(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength)).trim();
    if (text.startsWith('{')) {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const ch1 = Number(obj.ch1 ?? obj.emgCh1Mv ?? obj.c1);
      const ch2 = Number(obj.ch2 ?? obj.emgCh2Mv ?? obj.c2 ?? ch1);
      if (Number.isFinite(ch1)) {
        return { ch1Mv: Number(Math.abs(ch1).toFixed(3)), ch2Mv: Number(Math.abs(ch2).toFixed(3)) };
      }
    }
    const nums = text.split(/[,;\s]+/).map(Number);
    if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
      return { ch1Mv: Number(Math.abs(nums[0]).toFixed(3)), ch2Mv: Number(Math.abs(nums[1]).toFixed(3)) };
    }
  } catch {
    // fall through to binary parsing
  }
  if (dv.byteLength >= 4) {
    const ch1Raw = dv.getInt16(0, true);
    const ch2Raw = dv.getInt16(2, true);
    return {
      ch1Mv: Number((Math.abs(ch1Raw) / 1000).toFixed(3)),
      ch2Mv: Number((Math.abs(ch2Raw) / 1000).toFixed(3)),
    };
  }
  if (dv.byteLength >= 2) {
    const ch1Raw = dv.getUint16(0, true);
    return {
      ch1Mv: Number((ch1Raw / 1000).toFixed(3)),
      ch2Mv: 0,
    };
  }
  return null;
}

async function resolveUartNotifyAndWriteChars(server: GattServerLike): Promise<{
  notifyChar: GattCharacteristicLike;
  writeChar?: GattCharacteristicLike;
}> {
  // Check custom ESP32 4-channel hub service first if present (discovers notify characteristic dynamically)
  try {
    const customSvc = await server.getPrimaryService(ESP32_CUSTOM_WEIGHT_SERVICE);
    if (customSvc.getCharacteristics) {
      const chars = await customSvc.getCharacteristics();
      const notifyChar = chars.find((c) => !c.properties || c.properties.notify || c.properties.indicate);
      const writeChar = chars.find((c) => c.properties?.write);
      if (notifyChar) {
        return { notifyChar, writeChar };
      }
    }
  } catch {
    // continue to standard UART candidates
  }

  const candidates: [string | number, string | number, (string | number)?][] = [
    ['6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400003-b5a3-f393-e0a9-e50e24dcca9e', '6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
    [0xffe0, 0xffe1, 0xffe1],
    [0xfff0, 0xfff1, 0xfff2],
    [0x181c, 0x2a9f, undefined],
  ];
  for (const [svcUuid, notifyUuid, writeUuid] of candidates) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      const notifyChar = await svc.getCharacteristic(notifyUuid);
      let writeChar: GattCharacteristicLike | undefined;
      if (writeUuid) {
        try {
          writeChar = await svc.getCharacteristic(writeUuid);
        } catch {
          writeChar = undefined;
        }
      }
      return { notifyChar, writeChar };
    } catch {
      // try next GATT profile
    }
  }
  throw new Error('На устройстве не найден совместимый GATT-сервис датчиков (4fafc201 / Nordic UART / FFE0 / FFF0).');
}

function buildNamePrefixFilters(rawFilter: string): { namePrefix: string }[] {
  const clean = rawFilter.trim();
  const variants = Array.from(
    new Set([
      clean,
      clean.toUpperCase(),
      clean.charAt(0).toUpperCase() + clean.slice(1),
    ])
  );
  return variants.map((namePrefix) => ({ namePrefix }));
}

export async function connectRealBleDeviceStream(params: {
  type: EquipmentType;
  nameFilter?: string;
  acceptAllDevices?: boolean;
  onPacket: (packet: LiveHardwarePacket) => void;
  onProgress?: (msg: string) => void;
  onDisconnect: (reason?: string) => void;
}): Promise<{ result: BlePairResult; handle?: ActiveHardwareHandle }> {
  const bt = getNavigatorBluetooth();
  if (!bt) {
    const caps = getHardwareCapabilities();
    return {
      result: {
        success: false,
        mode: 'web_bluetooth',
        message: caps.inIframe
          ? 'Web Bluetooth недоступен внутри iframe. Откройте приложение в отдельной вкладке по HTTPS или подключите датчик по USB Serial / Wi-Fi.'
          : 'Браузер не поддерживает Web Bluetooth API (используйте Chrome / Edge / Android Chrome по HTTPS).',
      },
    };
  }

  try {
    const optionalServices = SERVICE_UUIDS[params.type];
    let device: BluetoothDeviceLike;
    if (params.acceptAllDevices) {
      device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    } else if (params.nameFilter?.trim()) {
      device = await bt.requestDevice({
        filters: buildNamePrefixFilters(params.nameFilter),
        optionalServices,
      });
    } else if (params.type === 'wahoo_tickr') {
      // Wahoo TICKR FIT may advertise 0x180D, name "TICKR FIT xxxx", "Wahoo ...", or Wahoo proprietary UUID
      device = await bt.requestDevice({
        filters: [
          { services: [0x180d] },
          { namePrefix: 'TICKR' },
          { namePrefix: 'Wahoo' },
          { namePrefix: 'WAHOO' },
          { services: [WAHOO_SERVICE_PRIMARY] },
        ],
        optionalServices,
      });
    } else if (params.type === 'xiaomi_scale') {
      device = await bt.requestDevice({
        filters: [
          { services: [0x181b] },
          { services: [0x181d] },
          { services: [OKOK_SCALE_SERVICE] },
          { namePrefix: 'MIBFS' },
          { namePrefix: 'MIBCS' },
          { namePrefix: 'MI_SCALE' },
          { namePrefix: 'MI' },
          { namePrefix: 'Mi' },
          { namePrefix: 'XMTZC' },
          { namePrefix: 'OKOK' },
          { namePrefix: 'Scale' },
        ],
        optionalServices,
      });
    } else if (params.type === 'bp_b05') {
      device = await bt.requestDevice({
        filters: buildBpDeviceFilters(params.nameFilter),
        optionalServices,
      });
    } else {
      device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    }

    if (!device.gatt) {
      return {
        result: {
          success: false,
          mode: 'web_bluetooth',
          message: 'Выбранное BLE-устройство не предоставляет GATT-сервер.',
        },
      };
    }

    const server = await connectGattWithRetry(device, 3);
    const discoveredServices = await inspectDiscoveredServices(server);
    const batteryPct = await tryReadBatteryLevel(server);
    const deviceName = device.name || 'BLE-устройство';

    const cleanups: (() => void)[] = [];
    let writeChar: GattCharacteristicLike | undefined;
    let manualDisconnect = false;
    let setupComplete = false;

    const onGattDisconnected = () => {
      if (!manualDisconnect && setupComplete) {
        params.onDisconnect('BLE-соединение разорвано устройством.');
      }
    };
    device.addEventListener?.('gattserverdisconnected', onGattDisconnected);
    cleanups.push(() => {
      device.removeEventListener?.('gattserverdisconnected', onGattDisconnected);
    });

    if (params.type === 'wahoo_tickr') {
      let svc: GattServiceLike;
      try {
        svc = await server.getPrimaryService(0x180d);
      } catch {
        const svcHint = discoveredServices.length > 0 ? ` Сервисы: [${discoveredServices.join(', ')}].` : '';
        throw new Error(
          `На выбранном BLE-устройстве не найден профиль пульса Heart Rate (0x180D).${svcHint} Выберите именно пульсометр и активируйте его кнопкой.`
        );
      }
      const hrChar = await svc.getCharacteristic(0x2a37);
      const onNotify = (ev: { target: { value?: DataView } }) => {
        const dv = ev.target?.value;
        if (!dv) return;
        const details = parseHeartRateDetails(dv);
        if (!details) return;
        if (details.bpm > 20 && details.bpm < 250) {
          params.onPacket({
            type: 'wahoo_tickr',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName,
            batteryPct,
            heartRateBpm: details.bpm,
            sensorContact: details.sensorContact,
          });
        } else if (details.bpm === 0) {
          params.onPacket({
            type: 'wahoo_tickr',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName,
            batteryPct,
            heartRateBpm: 0,
            sensorContact: details.sensorContact,
          });
        }
      };
      hrChar.addEventListener('characteristicvaluechanged', onNotify);
      await startNotificationsWithRetry(hrChar, 3);
      cleanups.push(() => {
        hrChar.removeEventListener('characteristicvaluechanged', onNotify);
        hrChar.stopNotifications?.().catch(() => undefined);
      });
    } else if (params.type === 'xiaomi_scale') {
      let boundCount = 0;

      const emitMiScaleData = (dv: DataView, channelLabel: string) => {
        const parsed = parseMiScale2Packet(dv);
        if (parsed) {
          params.onPacket({
            type: 'xiaomi_scale',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName,
            batteryPct,
            weightKg: parsed.weightKg,
            impedanceOhm: parsed.impedanceOhm,
            stabilized: parsed.stabilized,
          });
        } else {
          params.onProgress?.(`Сырой пакет весов (${channelLabel}): ${formatDataViewHex(dv)}`);
        }
      };

      // 1. 0x181B Body Composition Service (0x2A9C + Xiaomi custom 2a2f + any notify char)
      try {
        const svc = await server.getPrimaryService(0x181b);
        const charsToBind: GattCharacteristicLike[] = [];
        const seenCharIds = new Set<string>();

        if (svc.getCharacteristics) {
          try {
            const allChars = await svc.getCharacteristics();
            for (const ch of allChars) {
              if (!ch.properties || ch.properties.notify || ch.properties.indicate) {
                charsToBind.push(ch);
                if (ch.uuid) seenCharIds.add(ch.uuid.toLowerCase());
              }
            }
          } catch {
            // fallback to explicit UUIDs
          }
        }

        for (const uuid of [0x2a9c, MI_SCALE_CUSTOM_CHAR] as (number | string)[]) {
          try {
            const ch = await svc.getCharacteristic(uuid);
            const id = ch.uuid?.toLowerCase();
            if (!id || !seenCharIds.has(id)) {
              charsToBind.push(ch);
              if (id) seenCharIds.add(id);
            }
          } catch {
            // characteristic optional
          }
        }

        for (const char of charsToBind) {
          try {
            const onNotify = (ev: { target: { value?: DataView } }) => {
              const dv = ev.target?.value;
              if (dv) emitMiScaleData(dv, `0x181B/${formatUuidShort(char.uuid)}`);
            };
            char.addEventListener('characteristicvaluechanged', onNotify);
            await startNotificationsWithRetry(char, 3);
            cleanups.push(() => {
              char.removeEventListener('characteristicvaluechanged', onNotify);
              char.stopNotifications?.().catch(() => undefined);
            });
            boundCount += 1;
          } catch {
            // ignore non-subscribable char
          }
        }
      } catch {
        // 0x181B GATT missing; try 0x181D & advertisements below
      }

      // 2. Standard 0x181D Weight Scale Service -> 0x2A9D
      try {
        const svc = await server.getPrimaryService(0x181d);
        const char = await svc.getCharacteristic(0x2a9d);
        const onNotify = (ev: { target: { value?: DataView } }) => {
          const dv = ev.target?.value;
          if (!dv || dv.byteLength < 3) return;
          if (dv.byteLength >= 13) {
            const miParsed = parseMiScale2Packet(dv);
            if (miParsed) {
              emitMiScaleData(dv, '0x181D/0x2A9D');
              return;
            }
          }
          const flags = dv.getUint8(0);
          const rawW = dv.getUint16(1, true);
          const isImperial = (flags & 0x01) !== 0;
          const weightKg = Number((isImperial ? rawW * 0.01 * 0.453592 : rawW * 0.005).toFixed(2));
          if (weightKg >= 2) {
            params.onPacket({
              type: 'xiaomi_scale',
              source: 'web_bluetooth',
              timestamp: new Date().toISOString(),
              deviceName,
              batteryPct,
              weightKg,
              stabilized: true,
            });
          }
        };
        char.addEventListener('characteristicvaluechanged', onNotify);
        await startNotificationsWithRetry(char, 3);
        cleanups.push(() => {
          char.removeEventListener('characteristicvaluechanged', onNotify);
          char.stopNotifications?.().catch(() => undefined);
        });
        boundCount += 1;
      } catch {
        // 0x181D optional
      }

      // 2b. OKOK custom Scale Service (80d78b1d-0a8d-afb6-157d-93fd60d99bf4)
      try {
        const okokSvc = await server.getPrimaryService(OKOK_SCALE_SERVICE);
        const chars = okokSvc.getCharacteristics ? await okokSvc.getCharacteristics() : [];
        const emitOkokData = (dv: DataView) => {
          if (dv.byteLength >= 10) {
            const miParsed = parseMiScale2Packet(dv);
            if (miParsed) {
              emitMiScaleData(dv, 'OKOK');
              return;
            }
          }
          if (dv.byteLength >= 3) {
            const flags = dv.getUint8(0);
            const isImperial = (flags & 0x01) !== 0;
            const rawW = dv.getUint16(1, true);
            const kg = isImperial ? (rawW / 100) * 0.453592 : rawW / 100;
            const weightKg = Number(kg.toFixed(2));
            if (weightKg >= 2 && weightKg <= 350) {
              params.onPacket({
                type: 'xiaomi_scale',
                source: 'web_bluetooth',
                timestamp: new Date().toISOString(),
                deviceName,
                batteryPct,
                weightKg,
                stabilized: true,
              });
              return;
            }
          }
          params.onProgress?.(`Сырой пакет OKOK: ${formatDataViewHex(dv)}`);
        };

        let okokBound = false;
        for (const ch of chars) {
          if (!ch.properties || ch.properties.notify || ch.properties.indicate) {
            try {
              const onNotify = (ev: { target: { value?: DataView } }) => {
                const dv = ev.target?.value;
                if (dv) emitOkokData(dv);
              };
              ch.addEventListener('characteristicvaluechanged', onNotify);
              await startNotificationsWithRetry(ch, 3);
              cleanups.push(() => {
                ch.removeEventListener('characteristicvaluechanged', onNotify);
                ch.stopNotifications?.().catch(() => undefined);
              });
              boundCount += 1;
              okokBound = true;
            } catch {
              // try next characteristic
            }
          }
        }

        if (!okokBound) {
          for (const ch of chars) {
            if (ch.properties?.read && ch.readValue) {
              try {
                const dv = await ch.readValue();
                if (dv) emitOkokData(dv);
                boundCount += 1;
                break;
              } catch {
                // ignore unreadable characteristic
              }
            }
          }
        }
      } catch {
        // OKOK service optional
      }

      // 3. Passive BLE 0x181B advertisement listener (Chrome watchAdvertisements)
      if (typeof device.watchAdvertisements === 'function') {
        try {
          const onAdv = (ev?: BluetoothAdvertisingEventLike) => {
            const sd = ev?.serviceData;
            if (!sd) return;
            for (const [key, dv] of sd.entries()) {
              const keyStr = String(key).toLowerCase();
              if (keyStr.includes('181b') || key === 0x181b) {
                emitMiScaleData(dv, 'ADV-0x181B');
              }
            }
          };
          device.addEventListener?.('advertisementreceived', onAdv);
          await device.watchAdvertisements();
          cleanups.push(() => {
            device.removeEventListener?.('advertisementreceived', onAdv);
          });
          boundCount += 1;
        } catch {
          // watchAdvertisements may be disabled by user/browser flags; GATT still works
        }
      }

      if (boundCount === 0) {
        throw new Error(
          'На весах не найдены активные BLE-сервисы (0x181B / 0x181D / OKOK). Встаньте на весы для пробуждения экрана и закройте приложение Zepp Life / Mi Fit на телефоне.'
        );
      }
    } else if (params.type === 'bp_b05') {
      const unbindBp = await subscribeBloodPressureCharacteristics(
        server,
        (parsed) => {
          params.onPacket({
            type: 'bp_b05',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName,
            batteryPct,
            sys: parsed.sys,
            dia: parsed.dia,
            map: Number.isFinite(parsed.map)
              ? parsed.map
              : Math.round(parsed.dia + (parsed.sys - parsed.dia) / 3),
            pulse: parsed.pulse,
          });
        },
        (hex, svcLabel) => {
          params.onProgress?.(`Сырой пакет (${svcLabel}): ${hex}`);
        },
        params.onProgress,
        discoveredServices
      );
      cleanups.push(unbindBp);
    } else if (params.type === 'myoblue_emg') {
      const resolved = await resolveUartNotifyAndWriteChars(server);
      writeChar = resolved.writeChar;
      const onNotify = (ev: { target: { value?: DataView } }) => {
        const dv = ev.target?.value;
        if (!dv) return;
        const parsed = parseMyoBluePacket(dv);
        if (parsed) {
          params.onPacket({
            type: 'myoblue_emg',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName,
            batteryPct,
            emgCh1Mv: parsed.ch1Mv,
            emgCh2Mv: parsed.ch2Mv,
          });
        }
      };
      resolved.notifyChar.addEventListener('characteristicvaluechanged', onNotify);
      await startNotificationsWithRetry(resolved.notifyChar, 3);
      cleanups.push(() => {
        resolved.notifyChar.removeEventListener('characteristicvaluechanged', onNotify);
        resolved.notifyChar.stopNotifications?.().catch(() => undefined);
      });
    } else if (params.type === 'esp32_limbs') {
      const resolved = await resolveUartNotifyAndWriteChars(server);
      writeChar = resolved.writeChar;
      let textBuf = '';
      const onNotify = (ev: { target: { value?: DataView } }) => {
        const dv = ev.target?.value;
        if (!dv) return;
        if (dv.byteLength === 16) {
          // 4 x Float32 little-endian fast binary mode
          const lh = Number(dv.getFloat32(0, true).toFixed(1));
          const rh = Number(dv.getFloat32(4, true).toFixed(1));
          const lf = Number(dv.getFloat32(8, true).toFixed(1));
          const rf = Number(dv.getFloat32(12, true).toFixed(1));
          if ([lh, rh, lf, rf].every((v) => Number.isFinite(v) && v >= -100 && v <= 3000)) {
            params.onPacket({
              type: 'esp32_limbs',
              source: 'web_bluetooth',
              timestamp: new Date().toISOString(),
              deviceName,
              batteryPct,
              lh,
              rh,
              lf,
              rf,
            });
            return;
          }
        }
        textBuf += new TextDecoder().decode(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
        const lines = textBuf.split(/\r?\n/);
        textBuf = lines.pop() || '';
        for (const line of lines) {
          const parsed = parseEsp32TextOrJsonLine(line);
          if (parsed) {
            params.onPacket({
              type: 'esp32_limbs',
              source: 'web_bluetooth',
              timestamp: new Date().toISOString(),
              deviceName,
              batteryPct: parsed.batteryPct ?? batteryPct,
              lh: parsed.lh,
              rh: parsed.rh,
              lf: parsed.lf,
              rf: parsed.rf,
            });
          }
        }
      };
      resolved.notifyChar.addEventListener('characteristicvaluechanged', onNotify);
      await startNotificationsWithRetry(resolved.notifyChar, 3);
      cleanups.push(() => {
        resolved.notifyChar.removeEventListener('characteristicvaluechanged', onNotify);
        resolved.notifyChar.stopNotifications?.().catch(() => undefined);
      });
    }

    setupComplete = true;
    const svcSuffix = discoveredServices.length > 0 ? ` [${discoveredServices.join(', ')}]` : '';

    return {
      result: {
        success: true,
        deviceName,
        mode: 'web_bluetooth',
        batteryPct,
        discoveredServices,
        message: `Подключено по Web Bluetooth: ${deviceName}${batteryPct !== undefined ? ` (заряд ${batteryPct}%)` : ''}${svcSuffix}. Ожидание данных с датчика...`,
      },
      handle: {
        disconnect: async () => {
          manualDisconnect = true;
          cleanups.forEach((fn) => fn());
          if (device.gatt?.connected) {
            device.gatt.disconnect?.();
          }
        },
        sendCommand: writeChar?.writeValue
          ? async (cmd: string) => {
              const bytes = new TextEncoder().encode(cmd);
              await writeChar!.writeValue!(bytes);
            }
          : undefined,
      },
    };
  } catch (err) {
    return {
      result: {
        success: false,
        mode: 'web_bluetooth',
        message: formatHardwareError(err, 'BLE', params.type),
      },
    };
  }
}

export async function connectEsp32WebSerial(params: {
  baudRate?: number;
  onPacket: (packet: LiveHardwarePacket) => void;
  onDisconnect: (reason?: string) => void;
}): Promise<{ result: BlePairResult; handle?: ActiveHardwareHandle }> {
  const nav = navigator as Navigator & {
    serial?: {
      requestPort: () => Promise<{
        open: (opts: { baudRate: number }) => Promise<void>;
        close: () => Promise<void>;
        readable: ReadableStream<Uint8Array> | null;
        writable: WritableStream<Uint8Array> | null;
        getInfo?: () => { usbVendorId?: number; usbProductId?: number };
      }>;
    };
  };

  if (!nav.serial || typeof nav.serial.requestPort !== 'function') {
    return {
      result: {
        success: false,
        mode: 'web_serial',
        message: 'Web Serial API недоступен в этом браузере. Используйте Chrome/Edge по HTTPS или Wi-Fi WebSocket мост.',
      },
    };
  }

  try {
    const port = await nav.serial.requestPort();
    const baudRate = params.baudRate || 115200;
    await port.open({ baudRate });
    const info = port.getInfo?.();
    const label = info?.usbVendorId
      ? `USB Тензодатчики (${info.usbVendorId.toString(16)}:${(info.usbProductId || 0).toString(16)})`
      : `USB Serial (${baudRate} baud)`;

    let active = true;
    const reader = port.readable?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    (async () => {
      try {
        while (active && reader) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const parsed = parseEsp32TextOrJsonLine(line);
            if (parsed) {
              params.onPacket({
                type: 'esp32_limbs',
                source: 'web_serial',
                timestamp: new Date().toISOString(),
                deviceName: label,
                batteryPct: parsed.batteryPct,
                lh: parsed.lh,
                rh: parsed.rh,
                lf: parsed.lf,
                rf: parsed.rf,
              });
            }
          }
        }
      } catch (err) {
        if (active) {
          params.onDisconnect(formatHardwareError(err, 'USB Serial'));
        }
      }
    })();

    return {
      result: {
        success: true,
        deviceName: label,
        mode: 'web_serial',
        message: `Подключён ${label}. Поток 4×HX711 активен.`,
      },
      handle: {
        disconnect: async () => {
          active = false;
          try {
            await reader?.cancel();
            reader?.releaseLock();
          } catch {
            // ignore reader cleanup
          }
          try {
            await port.close();
          } catch {
            // ignore port close
          }
        },
        sendCommand: port.writable
          ? async (cmd: string) => {
              const writer = port.writable!.getWriter();
              try {
                await writer.write(new TextEncoder().encode(cmd));
              } finally {
                writer.releaseLock();
              }
            }
          : undefined,
      },
    };
  } catch (err) {
    return {
      result: {
        success: false,
        mode: 'web_serial',
        message: formatHardwareError(err, 'USB Serial'),
      },
    };
  }
}

export async function connectHardwareWebSocketBridge(params: {
  type: EquipmentType;
  url: string;
  onPacket: (packet: LiveHardwarePacket) => void;
  onDisconnect: (reason?: string) => void;
}): Promise<{ result: BlePairResult; handle?: ActiveHardwareHandle }> {
  const cleanUrl = params.url.trim();
  if (!cleanUrl || (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://'))) {
    return {
      result: {
        success: false,
        mode: 'websocket_bridge',
        message: 'Укажите корректный адрес WebSocket шлюза (например ws://192.168.1.50:81).',
      },
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(cleanUrl);
    } catch (err) {
      resolve({
        result: {
          success: false,
          mode: 'websocket_bridge',
          message: formatHardwareError(err, 'WebSocket датчик'),
        },
      });
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({
          result: {
            success: false,
            mode: 'websocket_bridge',
            message: `Таймаут подключения к ${cleanUrl} (5 сек). Проверьте питание и Wi-Fi датчика.`,
          },
        });
      }
    }, 5000);

    ws.onopen = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        result: {
          success: true,
          deviceName: cleanUrl,
          mode: 'websocket_bridge',
          message: `Подключено к Wi-Fi WebSocket потоку ${cleanUrl}.`,
        },
        handle: {
          disconnect: async () => {
            ws.close();
          },
          sendCommand: async (cmd: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(cmd);
            }
          },
        },
      });
    };

    ws.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : '';
      if (!raw) return;
      if (params.type === 'esp32_limbs') {
        const parsed = parseEsp32TextOrJsonLine(raw);
        if (parsed) {
          params.onPacket({
            type: 'esp32_limbs',
            source: 'websocket_bridge',
            timestamp: new Date().toISOString(),
            deviceName: cleanUrl,
            batteryPct: parsed.batteryPct,
            lh: parsed.lh,
            rh: parsed.rh,
            lf: parsed.lf,
            rf: parsed.rf,
          });
        }
        return;
      }
      try {
        const obj = JSON.parse(raw) as Partial<LiveHardwarePacket>;
        params.onPacket({
          ...obj,
          type: params.type,
          source: 'websocket_bridge',
          timestamp: new Date().toISOString(),
          deviceName: cleanUrl,
        });
      } catch {
        // ignore invalid json packet
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          result: {
            success: false,
            mode: 'websocket_bridge',
            message: `Не удалось подключиться к ${cleanUrl}. Убедитесь, что датчик в сети и поддерживает WS/WSS.`,
          },
        });
      }
    };

    ws.onclose = () => {
      if (settled) {
        params.onDisconnect(`Соединение с ${cleanUrl} закрыто.`);
      }
    };
  });
}

export interface BleBpMeasurementResult {
  success: boolean;
  cancelled?: boolean;
  mode: 'web_bluetooth' | 'native_bluetooth';
  deviceName: string;
  sys: number;
  dia: number;
  map: number;
  pulse: number;
  batteryPct?: number;
  discoveredServices?: string[];
  measuredAt: string;
  message: string;
}

function base64ToDataView(base64: string): DataView | null {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new DataView(bytes.buffer);
  } catch {
    return null;
  }
}

export function decodeNativeBluetoothPayload(params: {
  type: EquipmentType;
  deviceName: string;
  base64?: string;
  line?: string;
  charUuid?: string;
  serviceUuid?: string;
  textBufRef: { current: string };
  onPacket: (packet: LiveHardwarePacket) => void;
  onProgress?: (msg: string) => void;
}) {
  const { type, deviceName, base64, line, charUuid, serviceUuid, textBufRef, onPacket, onProgress } =
    params;
  const ts = new Date().toISOString();
  const dv = base64 ? base64ToDataView(base64) : null;

  if (type === 'wahoo_tickr' && dv) {
    const details = parseHeartRateDetails(dv);
    if (details && details.bpm >= 0 && details.bpm < 250) {
      onPacket({
        type: 'wahoo_tickr',
        source: 'native_bluetooth',
        timestamp: ts,
        deviceName,
        heartRateBpm: details.bpm,
        sensorContact: details.sensorContact,
      });
      return;
    }
  }

  if (type === 'xiaomi_scale' && dv) {
    const parsed = parseMiScale2Packet(dv);
    if (parsed) {
      onPacket({
        type: 'xiaomi_scale',
        source: 'native_bluetooth',
        timestamp: ts,
        deviceName,
        weightKg: parsed.weightKg,
        impedanceOhm: parsed.impedanceOhm,
        stabilized: parsed.stabilized,
      });
    } else {
      onProgress?.(`Сырой пакет весов (${serviceUuid || charUuid || 'BLE'}): ${formatDataViewHex(dv)}`);
    }
    return;
  }

  if (type === 'bp_b05') {
    if (dv) {
      if (charUuid?.toLowerCase().includes('2a36')) {
        const mmHg = parseIntermediateCuffPressure(dv);
        if (mmHg !== null) {
          onProgress?.(`Манжета: ${mmHg} мм рт. ст.`);
          return;
        }
      }
      if (dv.byteLength >= 7 && (charUuid?.toLowerCase().includes('2a35') || (dv.getUint8(0) & 0xf8) === 0)) {
        const parsed = parseBloodPressurePacket(dv);
        if (isValidBpReading(parsed)) {
          onPacket({
            type: 'bp_b05',
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            sys: parsed.sys,
            dia: parsed.dia,
            map: Number.isFinite(parsed.map)
              ? parsed.map
              : Math.round(parsed.dia + (parsed.sys - parsed.dia) / 3),
            pulse: parsed.pulse,
          });
          return;
        }
      }
      const oem = parseOemBloodPressurePacket(dv);
      if (oem) {
        onPacket({
          type: 'bp_b05',
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          sys: oem.sys,
          dia: oem.dia,
          map: oem.map,
          pulse: oem.pulse,
        });
        return;
      }
    }
    if (line) {
      const encoded = new TextEncoder().encode(line);
      const lineDv = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
      const oemLine = parseOemBloodPressurePacket(lineDv);
      if (oemLine) {
        onPacket({
          type: 'bp_b05',
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          sys: oemLine.sys,
          dia: oemLine.dia,
          map: oemLine.map,
          pulse: oemLine.pulse,
        });
      }
    }
    return;
  }

  if (type === 'myoblue_emg') {
    if (dv) {
      const parsed = parseMyoBluePacket(dv);
      if (parsed) {
        onPacket({
          type: 'myoblue_emg',
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          emgCh1Mv: parsed.ch1Mv,
          emgCh2Mv: parsed.ch2Mv,
        });
        return;
      }
    }
    if (line) {
      const encoded = new TextEncoder().encode(line);
      const parsed = parseMyoBluePacket(new DataView(encoded.buffer));
      if (parsed) {
        onPacket({
          type: 'myoblue_emg',
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          emgCh1Mv: parsed.ch1Mv,
          emgCh2Mv: parsed.ch2Mv,
        });
      }
    }
    return;
  }

  if (type === 'esp32_limbs') {
    if (dv && dv.byteLength === 16) {
      const lh = Number(dv.getFloat32(0, true).toFixed(1));
      const rh = Number(dv.getFloat32(4, true).toFixed(1));
      const lf = Number(dv.getFloat32(8, true).toFixed(1));
      const rf = Number(dv.getFloat32(12, true).toFixed(1));
      if ([lh, rh, lf, rf].every((v) => Number.isFinite(v) && v >= -100 && v <= 3000)) {
        onPacket({
          type: 'esp32_limbs',
          source: 'native_bluetooth',
          timestamp: ts,
          deviceName,
          lh,
          rh,
          lf,
          rf,
        });
        return;
      }
    }
    const chunk =
      line !== undefined
        ? `${line}\n`
        : dv
        ? new TextDecoder().decode(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength))
        : '';
    if (chunk) {
      textBufRef.current += chunk;
      const lines = textBufRef.current.split(/\r?\n/);
      textBufRef.current = lines.pop() || '';
      for (const l of lines) {
        const parsed = parseEsp32TextOrJsonLine(l);
        if (parsed) {
          onPacket({
            type: 'esp32_limbs',
            source: 'native_bluetooth',
            timestamp: ts,
            deviceName,
            batteryPct: parsed.batteryPct,
            lh: parsed.lh,
            rh: parsed.rh,
            lf: parsed.lf,
            rf: parsed.rf,
          });
        }
      }
    }
  }
}

const nativeAndroidListeners = new Set<(ev: NativeBluetoothBridgeEvent) => void>();

if (typeof window !== 'undefined') {
  window.__onEtalonNativeBluetoothEvent = (ev: NativeBluetoothBridgeEvent) => {
    nativeAndroidListeners.forEach((fn) => fn(ev));
  };
}

export async function listNativeBluetoothDevices(): Promise<{
  backend: 'android_bridge' | 'desktop_ipc' | 'server_local';
  platform: string;
  adapterSupported: boolean;
  devices: NativeBluetoothDeviceInfo[];
  note?: string;
}> {
  if (typeof window !== 'undefined' && window.EtalonNativeBluetooth?.isAvailable?.()) {
    window.EtalonNativeBluetooth.ensurePermissions?.();
    let devices: NativeBluetoothDeviceInfo[] = [];
    try {
      const raw = window.EtalonNativeBluetooth.getPairedDevices();
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) devices = parsed;
    } catch {
      devices = [];
    }
    return {
      backend: 'android_bridge',
      platform: 'android',
      adapterSupported: window.EtalonNativeBluetooth.isEnabled?.() ?? true,
      devices,
      note: 'Штатный Bluetooth Android (сопряжённые устройства и поиск BLE / SPP).',
    };
  }

  if (typeof window !== 'undefined' && window.praviloDesktop?.bluetooth) {
    const res = await window.praviloDesktop.bluetooth.listDevices();
    return {
      backend: 'desktop_ipc',
      platform: res.platform,
      adapterSupported: res.adapterSupported,
      devices: res.devices || [],
      note: `Системный Bluetooth десктопа (${res.platform}).`,
    };
  }

  try {
    const res = await apiRequest<{
      platform: string;
      adapterSupported: boolean;
      devices: NativeBluetoothDeviceInfo[];
      note?: string;
    }>('/api/hardware/native-bluetooth/devices');
    return {
      backend: 'server_local',
      platform: res.platform,
      adapterSupported: res.adapterSupported,
      devices: res.devices || [],
      note: res.note,
    };
  } catch {
    return {
      backend: 'server_local',
      platform: 'browser',
      adapterSupported: false,
      devices: [],
      note: 'Для подключения по штатному Bluetooth откройте десктопное приложение (Windows/macOS), Android-приложение или локальный сервер студии.',
    };
  }
}

export function subscribeAndroidBluetoothScan(
  typeHint: EquipmentType,
  onDeviceFound: (dev: NativeBluetoothDeviceInfo) => void,
  onError?: (msg: string) => void
): () => void {
  if (typeof window === 'undefined' || !window.EtalonNativeBluetooth?.isAvailable?.()) {
    return () => undefined;
  }
  const listener = (ev: NativeBluetoothBridgeEvent) => {
    if (ev.type === 'deviceFound' && ev.device) {
      onDeviceFound(ev.device);
    } else if (ev.type === 'error' && ev.message) {
      onError?.(ev.message);
    }
  };
  nativeAndroidListeners.add(listener);
  window.EtalonNativeBluetooth.startScan?.(typeHint);
  return () => {
    nativeAndroidListeners.delete(listener);
    window.EtalonNativeBluetooth?.stopScan?.();
  };
}

export async function connectNativeBluetoothStream(params: {
  type: EquipmentType;
  deviceId: string;
  deviceName?: string;
  address?: string;
  port?: string;
  protocol?: NativeBluetoothProtocol;
  baudRate?: number;
  onPacket: (packet: LiveHardwarePacket) => void;
  onProgress?: (msg: string) => void;
  onDisconnect: (reason?: string) => void;
}): Promise<{ result: BlePairResult; handle?: ActiveHardwareHandle }> {
  const targetAddress = params.address || params.port || params.deviceId;
  const displayName = params.deviceName || targetAddress || 'Штатный Bluetooth';
  const protocol = params.protocol || 'auto';
  const textBufRef = { current: '' };

  // 1. Android Native Bluetooth Bridge (WebView / Capacitor APK)
  if (typeof window !== 'undefined' && window.EtalonNativeBluetooth?.isAvailable?.()) {
    const bridge = window.EtalonNativeBluetooth;
    if (!targetAddress) {
      return {
        result: {
          success: false,
          mode: 'native_bluetooth',
          message: 'Выберите Bluetooth-устройство в списке штатного Bluetooth Android.',
        },
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      let manualDisconnect = false;

      const listener = (ev: NativeBluetoothBridgeEvent) => {
        if (ev.address && ev.address !== targetAddress && ev.equipmentType !== params.type) {
          return;
        }
        if (ev.type === 'connected' && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            result: {
              success: true,
              deviceName: ev.deviceName || displayName,
              mode: 'native_bluetooth',
              discoveredServices: ev.services,
              message: `Подключено через штатный Bluetooth Android (${ev.protocol === 'spp' ? 'Classic SPP' : 'BLE GATT'}): ${ev.deviceName || displayName}.`,
            },
            handle: {
              disconnect: async () => {
                manualDisconnect = true;
                nativeAndroidListeners.delete(listener);
                bridge.disconnect(targetAddress);
              },
              sendCommand: bridge.write
                ? async (cmd: string) => {
                    bridge.write?.(targetAddress, cmd);
                  }
                : undefined,
            },
          });
        } else if (ev.type === 'data') {
          decodeNativeBluetoothPayload({
            type: params.type,
            deviceName: ev.deviceName || displayName,
            base64: ev.base64,
            line: ev.line,
            charUuid: ev.charUuid,
            serviceUuid: ev.serviceUuid,
            textBufRef,
            onPacket: params.onPacket,
            onProgress: params.onProgress,
          });
        } else if (ev.type === 'error') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            nativeAndroidListeners.delete(listener);
            resolve({
              result: {
                success: false,
                mode: 'native_bluetooth',
                message: ev.message || 'Ошибка подключения через штатный Bluetooth Android.',
              },
            });
          } else {
            params.onProgress?.(ev.message || 'Ошибка Android Bluetooth');
          }
        } else if (ev.type === 'disconnected') {
          nativeAndroidListeners.delete(listener);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              result: {
                success: false,
                mode: 'native_bluetooth',
                message: ev.reason || 'Устройство отклонило соединение.',
              },
            });
          } else if (!manualDisconnect) {
            params.onDisconnect(ev.reason || 'Штатное Bluetooth-соединение Android завершено.');
          }
        }
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          nativeAndroidListeners.delete(listener);
          bridge.disconnect(targetAddress);
          resolve({
            result: {
              success: false,
              mode: 'native_bluetooth',
              message: `Таймаут подключения по штатному Bluetooth к ${displayName}.`,
            },
          });
        }
      }, 12000);

      nativeAndroidListeners.add(listener);
      bridge.connect(targetAddress, params.type, protocol);
    });
  }

  // 2. Desktop Electron IPC Native Bluetooth (Windows / macOS)
  if (typeof window !== 'undefined' && window.praviloDesktop?.bluetooth) {
    const deskBt = window.praviloDesktop.bluetooth;
    let manualDisconnect = false;
    const unsub = deskBt.onEvent((ev) => {
      if (ev.equipmentType && ev.equipmentType !== params.type) return;
      if (ev.type === 'data') {
        decodeNativeBluetoothPayload({
          type: params.type,
          deviceName: ev.deviceName || displayName,
          base64: ev.base64,
          line: ev.line,
          charUuid: ev.charUuid,
          serviceUuid: ev.serviceUuid,
          textBufRef,
          onPacket: params.onPacket,
          onProgress: params.onProgress,
        });
      } else if (ev.type === 'disconnected' && !manualDisconnect) {
        unsub();
        params.onDisconnect(ev.reason || 'Штатное Bluetooth-соединение ПК завершено.');
      }
    });

    const conn = await deskBt.connect({
      type: params.type,
      deviceId: params.deviceId,
      deviceName: displayName,
      address: params.address,
      port: params.port,
      protocol,
      baudRate: params.baudRate,
    });
    if (!conn.success) {
      unsub();
      return {
        result: {
          success: false,
          mode: 'native_bluetooth',
          message: conn.message,
        },
      };
    }

    return {
      result: {
        success: true,
        deviceName: conn.deviceName || displayName,
        mode: 'native_bluetooth',
        message: conn.message,
      },
      handle: {
        disconnect: async () => {
          manualDisconnect = true;
          unsub();
          await deskBt.disconnect(params.type);
        },
        sendCommand: async (cmd: string) => {
          await deskBt.write(params.type, cmd);
        },
      },
    };
  }

  // 3. Host OS Native Bluetooth API (/api/hardware/native-bluetooth/* -> WebSocket hardware:telemetry)
  if (!targetAddress) {
    return {
      result: {
        success: false,
        mode: 'native_bluetooth',
        message: 'Выберите сопряжённое устройство или COM/Serial Bluetooth-порт из списка.',
      },
    };
  }

  try {
    const res = await apiRequest<{
      success: boolean;
      deviceName: string;
      protocol: 'gatt' | 'spp';
      message: string;
    }>('/api/hardware/native-bluetooth/connect', {
      method: 'POST',
      body: JSON.stringify({
        type: params.type,
        deviceId: params.deviceId || targetAddress,
        deviceName: displayName,
        address: params.address,
        port: params.port,
        protocol,
        baudRate: params.baudRate,
      }),
    });
    return {
      result: {
        success: res.success,
        deviceName: res.deviceName || displayName,
        mode: 'native_bluetooth',
        message: res.message,
      },
      handle: {
        disconnect: async () => {
          await apiRequest('/api/hardware/native-bluetooth/disconnect', {
            method: 'POST',
            body: JSON.stringify({ type: params.type }),
          }).catch(() => undefined);
        },
        sendCommand: async (cmd: string) => {
          await apiRequest('/api/hardware/native-bluetooth/write', {
            method: 'POST',
            body: JSON.stringify({ type: params.type, command: cmd }),
          }).catch(() => undefined);
        },
      },
    };
  } catch (err) {
    return {
      result: {
        success: false,
        mode: 'native_bluetooth',
        message: err instanceof Error ? err.message : 'Ошибка подключения через штатный Bluetooth ОС.',
      },
    };
  }
}

export async function measureBloodPressureNative(opts: {
  deviceId: string;
  deviceName?: string;
  address?: string;
  port?: string;
  protocol?: NativeBluetoothProtocol;
  onProgress?: (msg: string) => void;
}): Promise<BleBpMeasurementResult> {
  const nowTime = new Date().toTimeString().slice(0, 5);
  let activeHandle: ActiveHardwareHandle | undefined;

  try {
    const reading = await new Promise<{ sys: number; dia: number; map: number; pulse?: number; deviceName: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              'Таймаут ожидания замера с тонометра (60 сек). Запустите измерение (START / MEM) на манжете.'
            )
          );
        }, 60000);

        connectNativeBluetoothStream({
          type: 'bp_b05',
          deviceId: opts.deviceId,
          deviceName: opts.deviceName,
          address: opts.address,
          port: opts.port,
          protocol: opts.protocol,
          onPacket: (pkt) => {
            if (pkt.type === 'bp_b05' && pkt.sys && pkt.dia) {
              clearTimeout(timeout);
              resolve({
                sys: pkt.sys,
                dia: pkt.dia,
                map: pkt.map || Math.round(pkt.dia + (pkt.sys - pkt.dia) / 3),
                pulse: pkt.pulse,
                deviceName: pkt.deviceName || opts.deviceName || 'Тонометр (Штатный BT)',
              });
            }
          },
          onProgress: opts.onProgress,
          onDisconnect: (reason) => {
            clearTimeout(timeout);
            reject(new Error(reason || 'Штатный Bluetooth отключён во время замера.'));
          },
        })
          .then(({ result, handle }) => {
            activeHandle = handle;
            if (!result.success) {
              clearTimeout(timeout);
              reject(new Error(result.message));
            } else {
              opts.onProgress?.(`Подключён ${result.deviceName} — запустите замер START / MEM`);
            }
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      }
    );

    return {
      success: true,
      mode: 'native_bluetooth',
      deviceName: reading.deviceName,
      sys: reading.sys,
      dia: reading.dia,
      map: reading.map,
      pulse: reading.pulse || 0,
      measuredAt: nowTime,
      message: `Считано по штатному Bluetooth (${reading.deviceName}): ${reading.sys}/${reading.dia} мм рт. ст.${
        reading.pulse ? `, пульс ${reading.pulse} уд/мин` : ''
      }.`,
    };
  } catch (err) {
    return {
      success: false,
      mode: 'native_bluetooth',
      deviceName: opts.deviceName || 'Тонометр (Штатный BT)',
      sys: 0,
      dia: 0,
      map: 0,
      pulse: 0,
      measuredAt: nowTime,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await activeHandle?.disconnect().catch(() => undefined);
  }
}

export async function measureBloodPressureBle(opts?: {
  nameFilter?: string;
  acceptAllDevices?: boolean;
  onConnected?: (info: { deviceName: string; batteryPct?: number; services: string[] }) => void;
  onProgress?: (msg: string) => void;
}): Promise<BleBpMeasurementResult> {
  const nowTime = new Date().toTimeString().slice(0, 5);
  const bt = getNavigatorBluetooth();
  if (!bt) {
    const caps = getHardwareCapabilities();
    return {
      success: false,
      mode: 'web_bluetooth',
      deviceName: 'Тонометр BLE',
      sys: 0,
      dia: 0,
      map: 0,
      pulse: 0,
      measuredAt: nowTime,
      message: caps.inIframe
        ? 'Web Bluetooth заблокирован внутри iframe. Откройте приложение в отдельной вкладке или подключите тонометр через «Штатный Bluetooth».'
        : 'Web Bluetooth API недоступен в текущем браузере. Используйте кнопку «Штатный Bluetooth».',
    };
  }

  let selectedDevice: BluetoothDeviceLike | undefined;
  let unbindBp: (() => void) | undefined;

  try {
    const optionalServices = SERVICE_UUIDS.bp_b05;
    selectedDevice = await bt.requestDevice(
      opts?.acceptAllDevices
        ? { acceptAllDevices: true, optionalServices }
        : { filters: buildBpDeviceFilters(opts?.nameFilter), optionalServices }
    );
    if (!selectedDevice?.gatt) {
      return {
        success: false,
        mode: 'web_bluetooth',
        deviceName: selectedDevice?.name || 'Тонометр BLE',
        sys: 0,
        dia: 0,
        map: 0,
        pulse: 0,
        measuredAt: nowTime,
        message: 'Выбранный тонометр не предоставляет GATT-сервер.',
      };
    }

    const server = await connectGattWithRetry(selectedDevice, 3);
    const discoveredServices = await inspectDiscoveredServices(server);
    const batteryPct = await tryReadBatteryLevel(server);
    const deviceName = selectedDevice.name || 'Тонометр BLE';
    let lastRawDebug = '';

    const reading = await new Promise<{ sys: number; dia: number; map: number; pulse?: number }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          selectedDevice?.removeEventListener?.('gattserverdisconnected', onGattDrop);
          reject(
            new Error(
              lastRawDebug
                ? `Тонометр подключён (${deviceName}), получены пакеты [${lastRawDebug}], но формат не совпал с 0x1810. Сообщите эти байты для точного парсинга.`
                : 'Таймаут ожидания замера манжеты (60 сек). Запустите измерение на тонометре (START) или нажмите MEM для передачи результата.'
            )
          );
        }, 60000);

        const onGattDrop = () => {
          clearTimeout(timeout);
          reject(
            new Error(
              lastRawDebug
                ? `Тонометр (${deviceName}) завершил связь до финального пакета. Полученные байты: [${lastRawDebug}].`
                : 'GATT server is disconnected during measurement'
            )
          );
        };
        selectedDevice?.addEventListener?.('gattserverdisconnected', onGattDrop);

        subscribeBloodPressureCharacteristics(
          server,
          (parsed) => {
            clearTimeout(timeout);
            selectedDevice?.removeEventListener?.('gattserverdisconnected', onGattDrop);
            resolve(parsed);
          },
          (hex, svc) => {
            lastRawDebug = `${svc}: ${hex}`;
            opts?.onProgress?.(`Сырой пакет (${svc}): ${hex}`);
          },
          opts?.onProgress,
          discoveredServices
        )
          .then((unbind) => {
            unbindBp = () => {
              selectedDevice?.removeEventListener?.('gattserverdisconnected', onGattDrop);
              unbind();
            };
            opts?.onConnected?.({ deviceName, batteryPct, services: discoveredServices });
          })
          .catch((err) => {
            clearTimeout(timeout);
            selectedDevice?.removeEventListener?.('gattserverdisconnected', onGattDrop);
            reject(err);
          });
      }
    );

    const pulse = reading.pulse || 0;
    const map = Number.isFinite(reading.map)
      ? reading.map
      : Math.round(reading.dia + (reading.sys - reading.dia) / 3);

    return {
      success: true,
      mode: 'web_bluetooth',
      deviceName,
      sys: reading.sys,
      dia: reading.dia,
      map,
      pulse,
      batteryPct,
      discoveredServices,
      measuredAt: nowTime,
      message: `Считано с тонометра ${deviceName}: ${reading.sys}/${reading.dia} мм рт. ст.${pulse ? `, пульс ${pulse} уд/мин` : ''}.`,
    };
  } catch (err) {
    const msg = formatHardwareError(err, 'Тонометр', 'bp_b05');
    return {
      success: false,
      cancelled: msg.includes('отменён'),
      mode: 'web_bluetooth',
      deviceName: 'Тонометр BLE',
      sys: 0,
      dia: 0,
      map: 0,
      pulse: 0,
      measuredAt: nowTime,
      message: msg,
    };
  } finally {
    try {
      unbindBp?.();
    } catch {
      // ignore cleanup
    }
    try {
      if (selectedDevice?.gatt?.connected) {
        selectedDevice.gatt.disconnect?.();
      }
    } catch {
      // ignore gatt disconnect cleanup
    }
  }
}
