import { useEffect, useState } from 'react';
import type {
  EquipmentDevice,
  EquipmentType,
  LiveHardwarePacket,
} from '../types';
import { apiRequest } from './api';
import {
  connectEsp32WebSerial,
  connectHardwareWebSocketBridge,
  connectRealBleDeviceStream,
  type ActiveHardwareHandle,
  type BlePairResult,
} from './bluetooth';

export interface LiveSensorsSnapshot {
  esp32: {
    streaming: boolean;
    rawLh: number;
    rawRh: number;
    rawLf: number;
    rawRf: number;
    lh: number;
    rh: number;
    lf: number;
    rf: number;
    totalKg: number;
    lastPacketAt?: string;
    source?: string;
  };
  myoblue: {
    streaming: boolean;
    rawCh1Mv: number;
    rawCh2Mv: number;
    ch1Mv: number;
    ch2Mv: number;
    lastPacketAt?: string;
    source?: string;
  };
  wahoo: {
    streaming: boolean;
    heartRateBpm: number;
    sensorContact?: boolean;
    lastPacketAt?: string;
    source?: string;
  };
  scale: {
    streaming: boolean;
    rawWeightKg: number | null;
    rawImpedanceOhm: number | null;
    stabilized: boolean;
    lastStatus?: string;
    lastPacketAt?: string;
    source?: string;
  };
  bp: {
    streaming: boolean;
    sys: number | null;
    dia: number | null;
    map: number | null;
    pulse: number | null;
    lastStatus?: string;
    lastPacketAt?: string;
    source?: string;
  };
}

const initialSnapshot = (): LiveSensorsSnapshot => ({
  esp32: { streaming: false, rawLh: 0, rawRh: 0, rawLf: 0, rawRf: 0, lh: 0, rh: 0, lf: 0, rf: 0, totalKg: 0 },
  myoblue: { streaming: false, rawCh1Mv: 0, rawCh2Mv: 0, ch1Mv: 0, ch2Mv: 0 },
  wahoo: { streaming: false, heartRateBpm: 0 },
  scale: { streaming: false, rawWeightKg: null, rawImpedanceOhm: null, stabilized: false },
  bp: { streaming: false, sys: null, dia: null, map: null, pulse: null },
});

let snapshot: LiveSensorsSnapshot = initialSnapshot();
const handles = new Map<EquipmentType, ActiveHardwareHandle>();
const deviceRegistry = new Map<EquipmentType, EquipmentDevice>();
const listeners = new Set<(s: LiveSensorsSnapshot) => void>();
let lastServerSyncAt: Record<string, number> = {};

function notifyListeners() {
  const copy: LiveSensorsSnapshot = {
    esp32: { ...snapshot.esp32 },
    myoblue: { ...snapshot.myoblue },
    wahoo: { ...snapshot.wahoo },
    scale: { ...snapshot.scale },
    bp: { ...snapshot.bp },
  };
  listeners.forEach((fn) => fn(copy));
}

export function syncHardwareDeviceRegistry(equipment: EquipmentDevice[]) {
  equipment.forEach((dev) => {
    deviceRegistry.set(dev.type, dev);
  });
}

function applyCalibratedEsp32(
  raw: { lh: number; rh: number; lf: number; rf: number },
  dev?: EquipmentDevice
) {
  const z = dev?.hardwareConfig?.esp32ZeroOffsets || { lh: 0, rh: 0, lf: 0, rf: 0 };
  const f = dev?.hardwareConfig?.esp32ScaleFactors || { lh: 1, rh: 1, lf: 1, rf: 1 };
  const lh = Number(Math.max(0, (raw.lh - (z.lh || 0)) * (f.lh || 1)).toFixed(1));
  const rh = Number(Math.max(0, (raw.rh - (z.rh || 0)) * (f.rh || 1)).toFixed(1));
  const lf = Number(Math.max(0, (raw.lf - (z.lf || 0)) * (f.lf || 1)).toFixed(1));
  const rf = Number(Math.max(0, (raw.rf - (z.rf || 0)) * (f.rf || 1)).toFixed(1));
  return { lh, rh, lf, rf, totalKg: Number((lh + rh + lf + rf).toFixed(1)) };
}

function applyCalibratedMyo(rawCh1: number, rawCh2: number, dev?: EquipmentDevice) {
  const gain = dev?.hardwareConfig?.emgGain ?? 1.0;
  const base = dev?.hardwareConfig?.emgBaselineMv ?? 0;
  return {
    ch1Mv: Number(Math.max(0, (rawCh1 - base) * gain).toFixed(2)),
    ch2Mv: Number(Math.max(0, (rawCh2 - base) * gain).toFixed(2)),
  };
}

export function ingestHardwarePacket(
  packet: LiveHardwarePacket,
  onDeviceUpdated?: (dev: EquipmentDevice) => void
) {
  const dev = deviceRegistry.get(packet.type);
  const nowStr = new Date().toISOString();
  let readingText = '';

  if (packet.type === 'esp32_limbs') {
    const raw = {
      lh: Number(packet.lh ?? 0),
      rh: Number(packet.rh ?? 0),
      lf: Number(packet.lf ?? 0),
      rf: Number(packet.rf ?? 0),
    };
    const cal = applyCalibratedEsp32(raw, dev);
    snapshot.esp32 = {
      streaming: true,
      rawLh: raw.lh,
      rawRh: raw.rh,
      rawLf: raw.lf,
      rawRf: raw.rf,
      ...cal,
      lastPacketAt: nowStr,
      source: packet.source,
    };
    readingText = `ЛР ${cal.lh} · ПР ${cal.rh} · ЛН ${cal.lf} · ПН ${cal.rf} кг`;
  } else if (packet.type === 'myoblue_emg') {
    const r1 = Number(packet.emgCh1Mv ?? 0);
    const r2 = Number(packet.emgCh2Mv ?? 0);
    const cal = applyCalibratedMyo(r1, r2, dev);
    snapshot.myoblue = {
      streaming: true,
      rawCh1Mv: r1,
      rawCh2Mv: r2,
      ...cal,
      lastPacketAt: nowStr,
      source: packet.source,
    };
    readingText = `CH1: ${cal.ch1Mv.toFixed(2)} мВ · CH2: ${cal.ch2Mv.toFixed(2)} мВ`;
  } else if (packet.type === 'wahoo_tickr') {
    const hr = Math.round(Number(packet.heartRateBpm ?? 0));
    snapshot.wahoo = {
      streaming: true,
      heartRateBpm: hr,
      sensorContact: packet.sensorContact,
      lastPacketAt: nowStr,
      source: packet.source,
    };
    readingText =
      hr > 0
        ? `${hr} уд/мин`
        : packet.sensorContact === false
        ? 'Наденьте на предплечье (нет контакта с кожей)'
        : 'Подключён — определение оптического пульса...';
  } else if (packet.type === 'xiaomi_scale') {
    const w = typeof packet.weightKg === 'number' ? packet.weightKg : null;
    const imp = typeof packet.impedanceOhm === 'number' ? packet.impedanceOhm : snapshot.scale.rawImpedanceOhm;
    if (w !== null) {
      readingText = `${w.toFixed(1)} кг${imp ? ` · BIA ${imp} Ω` : ''}${packet.stabilized ? ' (стаб.)' : ''}`;
    }
    snapshot.scale = {
      streaming: true,
      rawWeightKg: w,
      rawImpedanceOhm: imp ?? null,
      stabilized: Boolean(packet.stabilized),
      lastStatus: readingText || snapshot.scale.lastStatus,
      lastPacketAt: nowStr,
      source: packet.source,
    };
  } else if (packet.type === 'bp_b05') {
    const sys = typeof packet.sys === 'number' ? packet.sys : null;
    const dia = typeof packet.dia === 'number' ? packet.dia : null;
    const map = typeof packet.map === 'number' ? packet.map : null;
    const pulse = typeof packet.pulse === 'number' ? packet.pulse : null;
    if (sys && dia) {
      readingText = `${sys}/${dia} мм рт. ст.${pulse ? ` · ${pulse} уд/мин` : ''}`;
    }
    snapshot.bp = {
      streaming: true,
      sys,
      dia,
      map,
      pulse,
      lastStatus: readingText || snapshot.bp.lastStatus,
      lastPacketAt: nowStr,
      source: packet.source,
    };
  }

  notifyListeners();

  // Throttle DB status updates to max once every 4 seconds per sensor (or immediately for scale/bp)
  if (dev && readingText && onDeviceUpdated && packet.source !== 'http_bridge') {
    const lastTs = lastServerSyncAt[dev.id] || 0;
    const immediate = packet.type === 'xiaomi_scale' || packet.type === 'bp_b05';
    if (immediate || Date.now() - lastTs > 4000) {
      lastServerSyncAt[dev.id] = Date.now();
      apiRequest<EquipmentDevice>(`/api/equipment/${dev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          connected: true,
          streaming: true,
          lastReadingText: readingText,
          ...(packet.batteryPct !== undefined ? { batteryPct: packet.batteryPct } : {}),
        }),
      })
        .then((updated) => onDeviceUpdated(updated))
        .catch(() => undefined);
    }
  }
}

export async function connectRealHardwareDevice(params: {
  device: EquipmentDevice;
  transportOverride?: 'web_bluetooth' | 'web_serial' | 'websocket_bridge';
  bridgeUrlOverride?: string;
  acceptAllDevices?: boolean;
  onDeviceUpdated: (dev: EquipmentDevice) => void;
  onDisconnectedNotice?: (reason: string) => void;
}): Promise<BlePairResult> {
  const { device, onDeviceUpdated, onDisconnectedNotice } = params;
  const transport =
    params.transportOverride || device.hardwareConfig?.transport || 'web_bluetooth';

  // Close existing stream for this device type first
  await disconnectRealHardwareDevice({ device, onDeviceUpdated, silent: true });

  let latestProgressText = '';
  let lastProgressSyncAt = 0;

  const onProgress = (msg: string) => {
    latestProgressText = msg;
    if (device.type === 'bp_b05') {
      snapshot.bp = {
        ...snapshot.bp,
        streaming: true,
        lastStatus: msg,
        lastPacketAt: new Date().toISOString(),
        source: transport,
      };
      notifyListeners();
    } else if (device.type === 'xiaomi_scale') {
      snapshot.scale = {
        ...snapshot.scale,
        streaming: true,
        lastStatus: msg,
        lastPacketAt: new Date().toISOString(),
        source: transport,
      };
      notifyListeners();
    }
    const now = Date.now();
    if (now - lastProgressSyncAt > 900) {
      lastProgressSyncAt = now;
      apiRequest<EquipmentDevice>(`/api/equipment/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          connected: true,
          streaming: true,
          lastReadingText: msg,
          lastError: '',
        }),
      })
        .then((updated) => onDeviceUpdated(updated))
        .catch(() => undefined);
    }
  };

  const onDisconnect = (reason?: string) => {
    handles.delete(device.type);
    clearSnapshotChannel(device.type);
    notifyListeners();
    const errText = reason || 'BLE-соединение завершено устройством.';
    onDisconnectedNotice?.(`${device.name}: ${errText}`);
    apiRequest<EquipmentDevice>(`/api/equipment/${device.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        connected: false,
        streaming: false,
        connectionMode: 'disconnected',
        lastError: errText,
      }),
    })
      .then((updated) => onDeviceUpdated(updated))
      .catch(() => undefined);
  };

  let outcome: { result: BlePairResult; handle?: ActiveHardwareHandle };

  if (transport === 'web_serial') {
    outcome = await connectEsp32WebSerial({
      baudRate: device.hardwareConfig?.serialBaudRate || 115200,
      onPacket: (pkt) => ingestHardwarePacket(pkt, onDeviceUpdated),
      onDisconnect,
    });
  } else if (transport === 'websocket_bridge') {
    const url = params.bridgeUrlOverride || device.hardwareConfig?.bridgeUrl || '';
    outcome = await connectHardwareWebSocketBridge({
      type: device.type,
      url,
      onPacket: (pkt) => ingestHardwarePacket(pkt, onDeviceUpdated),
      onDisconnect,
    });
  } else {
    outcome = await connectRealBleDeviceStream({
      type: device.type,
      nameFilter: device.hardwareConfig?.deviceNameFilter,
      acceptAllDevices: params.acceptAllDevices,
      onPacket: (pkt) => ingestHardwarePacket(pkt, onDeviceUpdated),
      onProgress,
      onDisconnect,
    });
  }

  if (outcome.result.success && outcome.handle) {
    handles.set(device.type, outcome.handle);
    const svcSuffix =
      outcome.result.discoveredServices && outcome.result.discoveredServices.length > 0
        ? ` [${outcome.result.discoveredServices.join(', ')}]`
        : '';
    const initialReadingText =
      latestProgressText ||
      `Подключён (${outcome.result.deviceName || outcome.result.mode})${svcSuffix} — ожидание пакета...`;

    if (device.type === 'bp_b05') {
      snapshot.bp = {
        ...snapshot.bp,
        streaming: true,
        lastStatus: initialReadingText,
        source: outcome.result.mode,
      };
      notifyListeners();
    }

    const optimisticPatch: Partial<EquipmentDevice> = {
      connected: true,
      streaming: true,
      connectionMode: outcome.result.mode,
      signalQualityPct: 95,
      ...(outcome.result.batteryPct !== undefined
        ? { batteryPct: outcome.result.batteryPct }
        : {}),
      lastError: '',
      lastReadingText: initialReadingText,
      hardwareConfig: {
        ...device.hardwareConfig,
        transport,
        ...(params.bridgeUrlOverride ? { bridgeUrl: params.bridgeUrlOverride } : {}),
        lastDeviceName: outcome.result.deviceName,
      },
    };

    const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${device.id}`, {
      method: 'PATCH',
      body: JSON.stringify(optimisticPatch),
    }).catch(() => ({
      ...device,
      ...optimisticPatch,
      lastSyncAt: new Date().toISOString(),
    }));
    onDeviceUpdated(updated);
  } else {
    const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${device.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        connected: false,
        streaming: false,
        connectionMode: 'disconnected',
        lastError: outcome.result.message,
      }),
    }).catch(() => null);
    if (updated) onDeviceUpdated(updated);
  }

  return outcome.result;
}

function clearSnapshotChannel(type: EquipmentType) {
  if (type === 'esp32_limbs') snapshot.esp32 = initialSnapshot().esp32;
  else if (type === 'myoblue_emg') snapshot.myoblue = initialSnapshot().myoblue;
  else if (type === 'wahoo_tickr') snapshot.wahoo = initialSnapshot().wahoo;
  else if (type === 'xiaomi_scale') snapshot.scale = initialSnapshot().scale;
  else if (type === 'bp_b05') snapshot.bp = initialSnapshot().bp;
}

export async function disconnectRealHardwareDevice(params: {
  device: EquipmentDevice;
  onDeviceUpdated: (dev: EquipmentDevice) => void;
  silent?: boolean;
}): Promise<void> {
  const handle = handles.get(params.device.type);
  if (handle) {
    handles.delete(params.device.type);
    await handle.disconnect().catch(() => undefined);
  }
  clearSnapshotChannel(params.device.type);
  notifyListeners();

  if (!params.silent) {
    const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${params.device.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        connected: false,
        streaming: false,
        connectionMode: 'disconnected',
        lastReadingText: 'Отключено оператором',
        lastError: '',
      }),
    });
    params.onDeviceUpdated(updated);
  }
}

export async function tareEsp32Hardware(params: {
  device: EquipmentDevice;
  onDeviceUpdated: (dev: EquipmentDevice) => void;
}): Promise<string> {
  const handle = handles.get('esp32_limbs');
  if (handle?.sendCommand) {
    await handle.sendCommand('TARE\n').catch(() => undefined);
  }
  const zeroOffsets = {
    lh: snapshot.esp32.rawLh,
    rh: snapshot.esp32.rawRh,
    lf: snapshot.esp32.rawLf,
    rf: snapshot.esp32.rawRf,
  };
  const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${params.device.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      lastReadingText: '0.0 · 0.0 · 0.0 · 0.0 кг (Ноль откалиброван)',
      hardwareConfig: {
        ...params.device.hardwareConfig,
        transport: params.device.hardwareConfig?.transport || 'web_bluetooth',
        esp32ZeroOffsets: zeroOffsets,
      },
    }),
  });
  deviceRegistry.set('esp32_limbs', updated);
  params.onDeviceUpdated(updated);

  if (snapshot.esp32.streaming) {
    const cal = applyCalibratedEsp32(
      {
        lh: snapshot.esp32.rawLh,
        rh: snapshot.esp32.rawRh,
        lf: snapshot.esp32.rawLf,
        rf: snapshot.esp32.rawRf,
      },
      updated
    );
    snapshot.esp32 = { ...snapshot.esp32, ...cal };
    notifyListeners();
  }
  return `Тензодатчики конечностей обнулены по текущему сигналу (смещения: ЛР ${zeroOffsets.lh}, ПР ${zeroOffsets.rh}, ЛН ${zeroOffsets.lf}, ПН ${zeroOffsets.rf}).`;
}

export function getLiveSensorsSnapshot(): LiveSensorsSnapshot {
  return snapshot;
}

export function useHardwareTelemetry(): LiveSensorsSnapshot {
  const [state, setState] = useState<LiveSensorsSnapshot>(() => snapshot);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
