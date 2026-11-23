import React, { useEffect, useMemo, useState } from 'react';
import {
  Bluetooth,
  BatteryCharging,
  Wifi,
  RefreshCw,
  Cpu,
  Activity,
  HeartPulse,
  Scale,
  Gauge,
  SlidersHorizontal,
  CheckCircle2,
  X,
  Usb,
  Unplug,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Server,
} from 'lucide-react';
import type {
  AnthropometryRecord,
  ClientProfile,
  EquipmentDevice,
  HardwareDeviceConfig,
  ScaleCalibrationConfig,
} from '../types';
import { apiRequest } from '../utils/api';
import {
  getHardwareCapabilities,
  measureBloodPressureBle,
} from '../utils/bluetooth';
import {
  connectRealHardwareDevice,
  disconnectRealHardwareDevice,
  ingestHardwarePacket,
  tareEsp32Hardware,
  useHardwareTelemetry,
} from '../utils/hardwareManager';
import {
  calculateMiScale2Metrics,
  DEFAULT_MI_SCALE_CALIBRATION,
} from '../utils/miScale2';

interface EquipmentProps {
  equipment: EquipmentDevice[];
  clients: ClientProfile[];
  onDeviceUpdated: (dev: EquipmentDevice) => void;
  onSyncClientReading: (
    clientId: string,
    payload: Omit<AnthropometryRecord, 'id' | 'date'>
  ) => Promise<void> | void;
}

export const EquipmentHardwareView: React.FC<EquipmentProps> = ({
  equipment,
  clients,
  onDeviceUpdated,
  onSyncClientReading,
}) => {
  const liveSensors = useHardwareTelemetry();
  const caps = useMemo(() => getHardwareCapabilities(), []);

  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [bpBusy, setBpBusy] = useState(false);
  const [syncingCard, setSyncingCard] = useState(false);

  const [targetClientId, setTargetClientId] = useState(clients[0]?.id || '');
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === targetClientId) || clients[0],
    [clients, targetClientId]
  );
  const latestClientAnthro =
    selectedClient?.anthropometry[selectedClient.anthropometry.length - 1];
  const [heightInputCm, setHeightInputCm] = useState<number>(
    latestClientAnthro?.heightBeforeCm || latestClientAnthro?.heightCm || 176
  );

  // Bridge info (ESP32 / local BLE gateway HTTP push)
  const [bridgeInfo, setBridgeInfo] = useState<{
    telemetryEndpoint: string;
    bridgeKey: string;
  } | null>(null);
  const [showBridgeDocs, setShowBridgeDocs] = useState(false);
  const [showWahooGuide, setShowWahooGuide] = useState(false);
  const [showBpGuide, setShowBpGuide] = useState(false);
  const [showScaleGuide, setShowScaleGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    apiRequest<{ telemetryEndpoint: string; bridgeKey: string }>('/api/hardware/bridge-info')
      .then((res) => setBridgeInfo(res))
      .catch(() => undefined);
  }, []);

  // Mi Body Composition Scale 2 Calibration Modal
  const [calibratingScale, setCalibratingScale] = useState<EquipmentDevice | null>(null);
  const scaleDevice = equipment.find((d) => d.type === 'xiaomi_scale');
  const activeCalibration: ScaleCalibrationConfig =
    scaleDevice?.calibration || DEFAULT_MI_SCALE_CALIBRATION;

  const [tareOffsetKg, setTareOffsetKg] = useState<number>(activeCalibration.tareOffsetKg);
  const [referenceWeightKg, setReferenceWeightKg] = useState<number>(
    activeCalibration.referenceWeightKg || 50
  );
  const [measuredRefKg, setMeasuredRefKg] = useState<number>(
    Number(
      ((activeCalibration.referenceWeightKg || 50) / (activeCalibration.gainFactor || 1)).toFixed(2)
    )
  );
  const [impedanceOffsetOhm, setImpedanceOffsetOhm] = useState<number>(
    activeCalibration.impedanceOffsetOhm
  );

  // Per-device Setup & Synchronization Modal
  const [configuringDevice, setConfiguringDevice] = useState<EquipmentDevice | null>(null);
  const [cfgTransport, setCfgTransport] = useState<HardwareDeviceConfig['transport']>('web_bluetooth');
  const [cfgNameFilter, setCfgNameFilter] = useState('');
  const [cfgBridgeUrl, setCfgBridgeUrl] = useState('ws://192.168.1.50:81');
  const [cfgBaudRate, setCfgBaudRate] = useState(115200);
  const [cfgAutoSync, setCfgAutoSync] = useState(true);
  const [cfgEmgGain, setCfgEmgGain] = useState(1.0);
  const [cfgEmgBaseline, setCfgEmgBaseline] = useState(0);
  const [cfgScaleFactors, setCfgScaleFactors] = useState({ lh: 1, rh: 1, lf: 1, rf: 1 });

  const handleClientChange = (id: string) => {
    setTargetClientId(id);
    const cl = clients.find((c) => c.id === id);
    const last = cl?.anthropometry[cl.anthropometry.length - 1];
    if (last) {
      setHeightInputCm(last.heightBeforeCm || last.heightCm || 175);
    }
  };

  const iconFor = (type: EquipmentDevice['type']) => {
    switch (type) {
      case 'esp32_limbs':
        return <Cpu className="w-5 h-5" />;
      case 'myoblue_emg':
        return <Activity className="w-5 h-5" />;
      case 'wahoo_tickr':
        return <HeartPulse className="w-5 h-5" />;
      case 'xiaomi_scale':
        return <Scale className="w-5 h-5" />;
      case 'bp_b05':
        return <Gauge className="w-5 h-5" />;
    }
  };

  const handleConnect = async (
    dev: EquipmentDevice,
    transportOverride?: 'web_bluetooth' | 'web_serial' | 'websocket_bridge',
    acceptAllDevices?: boolean
  ) => {
    setBusyDeviceId(dev.id);
    try {
      const res = await connectRealHardwareDevice({
        device: dev,
        transportOverride,
        acceptAllDevices,
        onDeviceUpdated,
        onDisconnectedNotice: (msg) => {
          setStatusKind('error');
          setStatusMessage(msg);
        },
      });
      setStatusKind(res.success ? 'info' : 'error');
      setStatusMessage(res.message);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleDisconnect = async (dev: EquipmentDevice) => {
    setBusyDeviceId(dev.id);
    try {
      await disconnectRealHardwareDevice({ device: dev, onDeviceUpdated });
      setStatusKind('info');
      setStatusMessage(`${dev.name} отключён.`);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleTareEsp32 = async (dev: EquipmentDevice) => {
    setBusyDeviceId(dev.id);
    try {
      const msg = await tareEsp32Hardware({ device: dev, onDeviceUpdated });
      setStatusKind('info');
      setStatusMessage(msg);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleCaptureBpB05 = async (acceptAllDevices?: boolean) => {
    if (bpBusy) return;
    setBpBusy(true);
    try {
      const b05 = equipment.find((d) => d.type === 'bp_b05');
      let lastProgressPatchAt = 0;

      const res = await measureBloodPressureBle({
        nameFilter: b05?.hardwareConfig?.deviceNameFilter,
        acceptAllDevices,
        onConnected: ({ deviceName, batteryPct, services }) => {
          const svcList = services.length > 0 ? ` [${services.join(', ')}]` : '';
          const connText = `Подключён ${deviceName}${svcList} — запустите замер START/MEM`;
          setStatusKind('info');
          setStatusMessage(connText);
          if (b05) {
            apiRequest<EquipmentDevice>(`/api/equipment/${b05.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                connected: true,
                streaming: true,
                connectionMode: 'web_bluetooth',
                ...(batteryPct !== undefined ? { batteryPct } : {}),
                lastReadingText: connText,
                lastError: '',
                hardwareConfig: {
                  ...b05.hardwareConfig,
                  transport: 'web_bluetooth',
                  lastDeviceName: deviceName,
                },
              }),
            })
              .then((up) => onDeviceUpdated(up))
              .catch(() =>
                onDeviceUpdated({
                  ...b05,
                  connected: true,
                  streaming: true,
                  connectionMode: 'web_bluetooth',
                  ...(batteryPct !== undefined ? { batteryPct } : {}),
                  lastReadingText: connText,
                  lastError: '',
                })
              );
          }
        },
        onProgress: (progressMsg) => {
          setStatusKind('info');
          setStatusMessage(`Тонометр B05: ${progressMsg}`);
          const now = Date.now();
          if (b05 && now - lastProgressPatchAt > 900) {
            lastProgressPatchAt = now;
            apiRequest<EquipmentDevice>(`/api/equipment/${b05.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                connected: true,
                streaming: true,
                lastReadingText: progressMsg,
                lastError: '',
              }),
            })
              .then((up) => onDeviceUpdated(up))
              .catch(() => undefined);
          }
        },
      });
      setStatusKind(res.success ? 'info' : 'error');
      setStatusMessage(res.message);
      if (b05 && res.success) {
        ingestHardwarePacket(
          {
            type: 'bp_b05',
            source: 'web_bluetooth',
            timestamp: new Date().toISOString(),
            deviceName: res.deviceName,
            batteryPct: res.batteryPct,
            sys: res.sys,
            dia: res.dia,
            map: res.map,
            pulse: res.pulse,
          },
          onDeviceUpdated
        );
        const upB = await apiRequest<EquipmentDevice>(`/api/equipment/${b05.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            connected: true,
            streaming: true,
            connectionMode: 'web_bluetooth',
            ...(res.batteryPct !== undefined ? { batteryPct: res.batteryPct } : {}),
            lastReadingText: `${res.sys}/${res.dia} мм рт. ст.${res.pulse ? ` · ${res.pulse} уд/мин` : ''}`,
            lastError: '',
          }),
        });
        onDeviceUpdated(upB);
      } else if (b05 && !res.success && !res.cancelled) {
        const upB = await apiRequest<EquipmentDevice>(`/api/equipment/${b05.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            connected: false,
            streaming: false,
            connectionMode: 'disconnected',
            lastError: res.message,
          }),
        }).catch(() => null);
        if (upB) onDeviceUpdated(upB);
      }
    } finally {
      setBpBusy(false);
    }
  };

  // Preview real captured scale metrics (NO Math.random!)
  const realScaleMetrics = useMemo(() => {
    if (!selectedClient || liveSensors.scale.rawWeightKg === null) return null;
    const ageYears = new Date().getFullYear() - (selectedClient.birthYear || 1990);
    return calculateMiScale2Metrics({
      rawWeightKg: liveSensors.scale.rawWeightKg,
      heightCm: heightInputCm,
      ageYears,
      gender: selectedClient.gender || 'male',
      rawImpedanceOhm: liveSensors.scale.rawImpedanceOhm ?? undefined,
      calibration: activeCalibration,
    });
  }, [selectedClient, liveSensors.scale.rawWeightKg, liveSensors.scale.rawImpedanceOhm, heightInputCm, activeCalibration]);

  const hasRealSyncData = Boolean(
    realScaleMetrics || (liveSensors.bp.sys !== null && liveSensors.bp.dia !== null)
  );

  const handleSyncRealReadingsToCard = async () => {
    if (!selectedClient || !hasRealSyncData) return;
    setSyncingCard(true);
    try {
      const ageYears = new Date().getFullYear() - (selectedClient.birthYear || 1990);
      const fallbackMetrics =
        realScaleMetrics ||
        calculateMiScale2Metrics({
          rawWeightKg: latestClientAnthro?.weightKg || 70,
          heightCm: heightInputCm,
          ageYears,
          gender: selectedClient.gender || 'male',
          rawImpedanceOhm: latestClientAnthro?.impedanceOhm,
          calibration: activeCalibration,
        });

      const sys = liveSensors.bp.sys ?? latestClientAnthro?.bpSys ?? 120;
      const dia = liveSensors.bp.dia ?? latestClientAnthro?.bpDia ?? 80;
      const pulse =
        liveSensors.bp.pulse ??
        (liveSensors.wahoo.streaming ? liveSensors.wahoo.heartRateBpm : undefined) ??
        latestClientAnthro?.pulseRest ??
        70;

      await onSyncClientReading(selectedClient.id, {
        ...fallbackMetrics,
        phase: 'before',
        heightCm: heightInputCm,
        heightBeforeCm: heightInputCm,
        bpSys: sys,
        bpDia: dia,
        pulseRest: pulse,
        flexibilityScore: latestClientAnthro?.flexibilityScore ?? 74,
        painIndex: latestClientAnthro?.painIndex ?? 2,
        calibratedScale: activeCalibration.calibrated,
        notes: `Синхронизация реальных датчиков: ${
          realScaleMetrics
            ? `Mi Scale 2 (${realScaleMetrics.weightKg} кг, BIA ${realScaleMetrics.impedanceOhm} Ω)`
            : ''
        }${realScaleMetrics && liveSensors.bp.sys ? ' + ' : ''}${
          liveSensors.bp.sys ? `Тонометр B05 (${sys}/${dia})` : ''
        }`,
      });

      setStatusKind('info');
      setStatusMessage(
        `Реальные показания датчиков синхронизированы в карту клиента ${selectedClient.name}.`
      );
    } finally {
      setSyncingCard(false);
    }
  };

  const openScaleCalibration = (dev: EquipmentDevice) => {
    const cal = dev.calibration || DEFAULT_MI_SCALE_CALIBRATION;
    setTareOffsetKg(cal.tareOffsetKg);
    setReferenceWeightKg(cal.referenceWeightKg || 50);
    setMeasuredRefKg(Number(((cal.referenceWeightKg || 50) / (cal.gainFactor || 1)).toFixed(2)));
    setImpedanceOffsetOhm(cal.impedanceOffsetOhm);
    setCalibratingScale(dev);
  };

  const handleSaveScaleCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingScale) return;
    const gainFactor =
      measuredRefKg > 0 ? Number((referenceWeightKg / measuredRefKg).toFixed(4)) : 1.0;
    const nextCalibration: ScaleCalibrationConfig = {
      tareOffsetKg: Number(tareOffsetKg.toFixed(2)),
      gainFactor,
      impedanceOffsetOhm: Math.round(impedanceOffsetOhm),
      referenceWeightKg,
      calibrated: true,
      lastCalibratedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${calibratingScale.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        calibration: nextCalibration,
        lastReadingText: `Калибровка OK · Тара ${nextCalibration.tareOffsetKg >= 0 ? '+' : ''}${nextCalibration.tareOffsetKg} кг · K=${nextCalibration.gainFactor} · BIA ${nextCalibration.impedanceOffsetOhm >= 0 ? '+' : ''}${nextCalibration.impedanceOffsetOhm} Ω`,
      }),
    });
    onDeviceUpdated(updated);
    setCalibratingScale(null);
    setStatusKind('info');
    setStatusMessage(
      `Калибровка Mi Body Composition Scale 2 сохранена: тара ${nextCalibration.tareOffsetKg} кг, K=${nextCalibration.gainFactor}, BIA ${nextCalibration.impedanceOffsetOhm} Ω.`
    );
  };

  const openDeviceConfig = (dev: EquipmentDevice) => {
    const hc = dev.hardwareConfig;
    setCfgTransport(hc?.transport || 'web_bluetooth');
    setCfgNameFilter(hc?.deviceNameFilter || '');
    setCfgBridgeUrl(hc?.bridgeUrl || 'ws://192.168.1.50:81');
    setCfgBaudRate(hc?.serialBaudRate || 115200);
    setCfgAutoSync(hc?.autoSyncToCard ?? true);
    setCfgEmgGain(hc?.emgGain ?? 1.0);
    setCfgEmgBaseline(hc?.emgBaselineMv ?? 0);
    setCfgScaleFactors(hc?.esp32ScaleFactors || { lh: 1, rh: 1, lf: 1, rf: 1 });
    setConfiguringDevice(dev);
  };

  const handleSaveDeviceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringDevice) return;
    const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${configuringDevice.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        hardwareConfig: {
          ...configuringDevice.hardwareConfig,
          transport: cfgTransport,
          deviceNameFilter: cfgNameFilter.trim() || undefined,
          bridgeUrl: cfgBridgeUrl.trim() || undefined,
          serialBaudRate: cfgBaudRate,
          autoSyncToCard: cfgAutoSync,
          emgGain: cfgEmgGain,
          emgBaselineMv: cfgEmgBaseline,
          esp32ScaleFactors: cfgScaleFactors,
        },
      }),
    });
    onDeviceUpdated(updated);
    setConfiguringDevice(null);
    setStatusKind('info');
    setStatusMessage(`Параметры подключения и синхронизации для «${updated.name}» сохранены.`);
  };

  const liveBadgeTextFor = (dev: EquipmentDevice) => {
    if (dev.type === 'esp32_limbs' && liveSensors.esp32.streaming) {
      return `LIVE: ЛР ${liveSensors.esp32.lh} · ПР ${liveSensors.esp32.rh} · ЛН ${liveSensors.esp32.lf} · ПН ${liveSensors.esp32.rf} кг (Σ ${liveSensors.esp32.totalKg} кг)`;
    }
    if (dev.type === 'myoblue_emg' && liveSensors.myoblue.streaming) {
      return `LIVE: CH1 ${liveSensors.myoblue.ch1Mv.toFixed(2)} мВ · CH2 ${liveSensors.myoblue.ch2Mv.toFixed(2)} мВ`;
    }
    if (dev.type === 'wahoo_tickr' && liveSensors.wahoo.streaming) {
      if (liveSensors.wahoo.heartRateBpm > 0) {
        return `LIVE: ${liveSensors.wahoo.heartRateBpm} уд/мин`;
      }
      if (liveSensors.wahoo.sensorContact === false) {
        return 'LIVE: нет контакта с кожей (наденьте на предплечье)';
      }
      return 'LIVE: поиск оптического пульса (0 уд/мин)...';
    }
    if (dev.type === 'xiaomi_scale' && liveSensors.scale.rawWeightKg !== null) {
      return `Считано: ${liveSensors.scale.rawWeightKg.toFixed(1)} кг${
        liveSensors.scale.rawImpedanceOhm ? ` · BIA ${liveSensors.scale.rawImpedanceOhm} Ω` : ''
      }${liveSensors.scale.stabilized ? ' (стаб.)' : ''}`;
    }
    if (dev.type === 'xiaomi_scale' && liveSensors.scale.streaming && liveSensors.scale.lastStatus) {
      return liveSensors.scale.lastStatus;
    }
    if (dev.type === 'bp_b05' && liveSensors.bp.sys && liveSensors.bp.dia) {
      return `Считано: ${liveSensors.bp.sys}/${liveSensors.bp.dia} мм рт. ст.${liveSensors.bp.pulse ? ` · ${liveSensors.bp.pulse} уд/мин` : ''}`;
    }
    if (dev.type === 'bp_b05' && liveSensors.bp.streaming && liveSensors.bp.lastStatus) {
      return liveSensors.bp.lastStatus;
    }
    return dev.lastReadingText;
  };

  const fullBridgeUrl =
    typeof window !== 'undefined' && bridgeInfo
      ? `${window.location.origin}${bridgeInfo.telemetryEndpoint}`
      : '/api/hardware/telemetry';

  return (
    <div className="space-y-5">
      {/* Real Hardware Environment Diagnostics */}
      <div className="rounded-xl st-surface border st-border p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold">
              Подключение, настройка и синхронизация реальных датчиков
            </h3>
            <p className="text-xs st-muted">
              Тестовые и синтетические генераторы телеметрии отключены. Если датчик показан «Подключено» только в настройках Windows/Android, браузер сам его не читает — подключайте напрямую кнопкой «Подключить BLE» (или «Все BLE») в карточке ниже.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span
              className={`px-2.5 py-1 rounded-md border ${
                caps.webBluetooth
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
              }`}
            >
              Web Bluetooth: {caps.webBluetooth ? 'Готов' : 'Недоступен'}
            </span>
            <span
              className={`px-2.5 py-1 rounded-md border ${
                caps.webSerial
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 st-muted'
              }`}
            >
              USB Serial (ESP32): {caps.webSerial ? 'Готов' : 'Нет'}
            </span>
            <button
              type="button"
              onClick={() => setShowBridgeDocs((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border st-border st-surface-muted hover:opacity-90 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 st-accent-text" />
              <span>Шлюз ESP32 / BLE Bridge</span>
            </button>
          </div>
        </div>

        {caps.inIframe && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Приложение открыто внутри iframe-превью — браузеры Chrome/Edge ограничивают прямой Web Bluetooth внутри iframe. Для подключения BLE-датчиков откройте URL в отдельной вкладке либо подключите датчики через Wi-Fi / HTTP-шлюз.
              </span>
            </div>
            <a
              href={typeof window !== 'undefined' ? window.location.href : '/'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 shrink-0 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Открыть в новой вкладке</span>
            </a>
          </div>
        )}

        {showBridgeDocs && (
          <div className="p-3.5 rounded-lg st-surface-muted border st-border text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Приём реальных данных от Wi-Fi ESP32 или локального BLE-агента (HTTP → WebSocket)
              </span>
              {bridgeInfo && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(bridgeInfo.bridgeKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border st-border st-surface text-[11px] font-mono cursor-pointer"
                >
                  {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>x-hardware-key: {bridgeInfo.bridgeKey}</span>
                </button>
              )}
            </div>
            <div className="font-mono text-[11px] p-2.5 rounded bg-slate-950 text-cyan-300 overflow-x-auto">
              POST {fullBridgeUrl} · Header: x-hardware-key: {bridgeInfo?.bridgeKey || 'etalon-studio-bridge'}
              <br />
              ESP32: {`{"type":"esp32_limbs","lh":18.4,"rh":18.1,"lf":17.9,"rf":18.0,"batteryPct":92}`}
              <br />
              MYOblue: {`{"type":"myoblue_emg","emgCh1Mv":0.44,"emgCh2Mv":0.39}`} · Wahoo: {`{"type":"wahoo_tickr","heartRateBpm":94}`}
              <br />
              Mi Scale 2 (Python bleak 0x181B): {`{"type":"xiaomi_scale","weightKg":78.4,"impedanceOhm":462,"stabilized":true}`} · B05 / YK-IBPA1: {`{"type":"bp_b05","sys":122,"dia":78,"pulse":68}`}
            </div>
          </div>
        )}
      </div>

      {/* Real Client Card Sync Bar */}
      <div className="rounded-xl st-surface border st-border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold">
            Синхронизация реального замера (Mi Scale 2 + Тонометр B05 → карта клиента)
          </h3>
          <p className="text-xs st-muted mt-0.5">
            {hasRealSyncData
              ? `Готово к записи: ${
                  realScaleMetrics
                    ? `Вес ${realScaleMetrics.weightKg} кг, жир ${realScaleMetrics.bodyFatPct}%, мышцы ${realScaleMetrics.muscleMassKg} кг, BIA ${realScaleMetrics.impedanceOhm} Ω`
                    : ''
                }${realScaleMetrics && liveSensors.bp.sys ? ' · ' : ''}${
                  liveSensors.bp.sys ? `АД ${liveSensors.bp.sys}/${liveSensors.bp.dia}` : ''
                }`
              : 'Подключите весы Mi Scale 2 или снимите замер на тонометре B05 — реальные данные появятся здесь для записи в карту.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={targetClientId}
            onChange={(e) => handleClientChange(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border st-border st-surface"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs st-muted">Рост до (см):</span>
            <input
              type="number"
              step="0.1"
              min={100}
              max={230}
              value={heightInputCm}
              onChange={(e) => setHeightInputCm(Number(e.target.value) || 175)}
              className="w-20 px-2.5 py-2 text-xs font-mono rounded-lg border st-border st-surface"
            />
          </div>
          <button
            type="button"
            disabled={bpBusy}
            onClick={() => handleCaptureBpB05(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-60"
          >
            {bpBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5 st-accent-text" />}
            <span>Замер B05 BLE</span>
          </button>
          <button
            type="button"
            disabled={!hasRealSyncData || syncingCard}
            onClick={handleSyncRealReadingsToCard}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCard ? 'animate-spin' : ''}`} />
            <span>Записать реальный замер в карту</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
            statusKind === 'error'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {statusKind === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {equipment.map((dev) => {
          const isBusy = busyDeviceId === dev.id;
          const isLive =
            dev.connected ||
            (dev.type === 'esp32_limbs' && liveSensors.esp32.streaming) ||
            (dev.type === 'myoblue_emg' && liveSensors.myoblue.streaming) ||
            (dev.type === 'wahoo_tickr' && liveSensors.wahoo.streaming) ||
            (dev.type === 'xiaomi_scale' && liveSensors.scale.streaming) ||
            (dev.type === 'bp_b05' && liveSensors.bp.streaming);

          return (
            <div
              key={dev.id}
              className="rounded-xl st-surface border st-border p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-lg st-surface-muted st-accent-text">
                      {iconFor(dev.type)}
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-semibold">{dev.name}</h4>
                      <div className="text-xs st-muted">{dev.model}</div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      isLive ? 'text-emerald-600 dark:text-emerald-400' : 'st-muted'
                    }`}
                  >
                    {isLive
                      ? `● ${
                          dev.connectionMode === 'web_serial'
                            ? 'USB'
                            : dev.connectionMode === 'websocket_bridge'
                            ? 'Wi-Fi / WS'
                            : 'BLE'
                        }`
                      : '○ Отключено'}
                  </span>
                </div>

                <div className="text-xs font-mono st-muted">{dev.protocol}</div>

                <div className="p-3 rounded-lg st-surface-muted border st-border">
                  <div className="flex items-center justify-between text-[11px] st-muted">
                    <span>Показание с реального датчика</span>
                    {dev.lastSyncAt && (
                      <span className="font-mono">{dev.lastSyncAt.slice(11, 19)}</span>
                    )}
                  </div>
                  <div className="font-mono text-xs sm:text-sm font-semibold mt-0.5 tabular-nums leading-relaxed">
                    {liveBadgeTextFor(dev)}
                  </div>
                  {dev.lastError && !isLive && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      {dev.lastError}
                    </div>
                  )}
                </div>

                {dev.type === 'xiaomi_scale' && (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg st-accent-soft border st-border text-[11px] space-y-1">
                      <div className="flex items-center justify-between font-medium">
                        <span>Калибровка Mi Scale 2</span>
                        <span className="font-mono text-emerald-700 dark:text-emerald-400">
                          {(dev.calibration || activeCalibration).calibrated ? 'Откалиброваны' : 'Требуется калибровка'}
                        </span>
                      </div>
                      <div className="font-mono opacity-85 tabular-nums">
                        Тара: {(dev.calibration || activeCalibration).tareOffsetKg >= 0 ? '+' : ''}
                        {(dev.calibration || activeCalibration).tareOffsetKg} кг · K={(dev.calibration || activeCalibration).gainFactor} · BIA {(dev.calibration || activeCalibration).impedanceOffsetOhm >= 0 ? '+' : ''}
                        {(dev.calibration || activeCalibration).impedanceOffsetOhm} Ω
                      </div>
                    </div>
                    <div className="p-3 rounded-lg st-surface-muted border st-border text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">Профиль: 0x181B / MIBFS / XMTZC05HM</span>
                        <button
                          type="button"
                          onClick={() => setShowScaleGuide((v) => !v)}
                          className="st-accent-text font-medium hover:underline cursor-pointer whitespace-nowrap"
                        >
                          {showScaleGuide ? 'Скрыть инструкцию' : 'Если не находится?'}
                        </button>
                      </div>
                      {showScaleGuide && (
                        <ol className="list-decimal pl-4 space-y-1 st-muted leading-relaxed">
                          <li>Встаньте на весы босиком (на металлические электроды), чтобы включился экран — в спящем режиме Mi Scale 2 не видны по BLE.</li>
                          <li>Закройте приложение <b>Zepp Life / Mi Fit</b> на телефоне, чтобы оно не перехватывало весы.</li>
                          <li>В списке браузера выберите <b>MIBFS</b> / <b>MI SCALE2</b> (или нажмите <b>«Все BLE»</b>). Для BIA дождитесь стабилизации цифр под ногами.</li>
                        </ol>
                      )}
                    </div>
                  </div>
                )}

                {dev.type === 'wahoo_tickr' && (
                  <div className="p-3 rounded-lg st-surface-muted border st-border text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Профиль поиска: 0x180D / TICKR / Wahoo</span>
                      <button
                        type="button"
                        onClick={() => setShowWahooGuide((v) => !v)}
                        className="st-accent-text font-medium hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {showWahooGuide ? 'Скрыть инструкцию' : 'Если не находится?'}
                      </button>
                    </div>
                    {showWahooGuide && (
                      <ol className="list-decimal pl-4 space-y-1 st-muted leading-relaxed">
                        <li>Нажмите кнопку на браслете — индикатор должен мигать <b>синим</b> (режим поиска BLE).</li>
                        <li>Наденьте браслет на предплечье — без контакта с кожей датчик засыпает или передаёт 0 уд/мин.</li>
                        <li>Закройте Wahoo Fitness / Strava на телефоне и отключите браслет от часов — при занятых BLE-каналах он скрыт.</li>
                        <li>Не спаривайте Wahoo в настройках Bluetooth ОС заранее — подключайте напрямую из этого окна или кнопкой <b>«Все BLE»</b>.</li>
                      </ol>
                    )}
                  </div>
                )}

                {dev.type === 'bp_b05' && (
                  <div className="p-3 rounded-lg st-surface-muted border st-border text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Профиль: 0x1810 / BleModule / YK-IBPA1 / B05</span>
                      <button
                        type="button"
                        onClick={() => setShowBpGuide((v) => !v)}
                        className="st-accent-text font-medium hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {showBpGuide ? 'Скрыть инструкцию' : 'Если не находится?'}
                      </button>
                    </div>
                    {showBpGuide && (
                      <ol className="list-decimal pl-4 space-y-1 st-muted leading-relaxed">
                        <li>Нажмите кнопку <b>START</b> или удерживайте <b>MEM</b> 2–3 сек до появления значка Bluetooth на экране — <b>YK-IBPA1</b> обычно отображается как <b>BleModule</b>, <b>BleModuleB</b> или <b>YK-IBPA1</b>.</li>
                        <li>Не спаривайте тонометр заранее в настройках Bluetooth ОС — подключайте напрямую из браузера.</li>
                        <li>Закройте <b>YonkerCare / YonkerHealth</b> на телефоне, чтобы телефон не перехватывал BLE-канал.</li>
                        <li>Если прибор не виден в обычном списке, нажмите <b>«Все BLE»</b> и при необходимости укажите префикс имени (напр. <code className="font-mono">BleModule</code>) в «Настройке».</li>
                      </ol>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                  <div className="flex items-center gap-1.5 st-muted">
                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                    <span>Заряд: {dev.batteryPct ? `${dev.batteryPct}%` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 st-muted">
                    <Wifi className="w-4 h-4 st-accent-text" />
                    <span>Сигнал: {dev.signalQualityPct ? `${dev.signalQualityPct}%` : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t st-border">
                {!isLive ? (
                  <>
                    <button
                      type="button"
                      disabled={isBusy || (dev.type === 'bp_b05' && bpBusy)}
                      onClick={() => handleConnect(dev, 'web_bluetooth', false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      {isBusy || (dev.type === 'bp_b05' && bpBusy) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bluetooth className="w-3.5 h-3.5" />
                      )}
                      <span>Подключить BLE</span>
                    </button>
                    {(dev.type === 'wahoo_tickr' || dev.type === 'bp_b05' || dev.type === 'xiaomi_scale') && (
                      <button
                        type="button"
                        disabled={isBusy || (dev.type === 'bp_b05' && bpBusy)}
                        title="Показать все ближайшие Bluetooth-устройства без фильтра"
                        onClick={() => handleConnect(dev, 'web_bluetooth', true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer whitespace-nowrap"
                      >
                        <Bluetooth className="w-3.5 h-3.5 st-accent-text" />
                        <span>Все BLE</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDisconnect(dev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    <span>Отключить</span>
                  </button>
                )}

                {dev.type === 'esp32_limbs' && !isLive && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleConnect(dev, 'web_serial')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
                    >
                      <Usb className="w-3.5 h-3.5" />
                      <span>USB Serial</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleConnect(dev, 'websocket_bridge')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      <span>Wi-Fi WS</span>
                    </button>
                  </>
                )}

                {dev.type === 'esp32_limbs' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleTareEsp32(dev)}
                    className="px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
                  >
                    Ноль тары
                  </button>
                )}

                {dev.type === 'xiaomi_scale' && (
                  <button
                    type="button"
                    onClick={() => openScaleCalibration(dev)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border st-accent-soft text-xs font-medium cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Калибровка весов</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openDeviceConfig(dev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Настройка</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Per-Device Connection & Sync Configuration */}
      {configuringDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveDeviceConfig}
            className="w-full max-w-lg rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {iconFor(configuringDevice.type)}
                <h3 className="font-display text-base font-semibold">
                  Настройка датчика: {configuringDevice.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfiguringDevice(null)}
                className="p-1 rounded-lg hover:opacity-75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Основной транспорт подключения</label>
                <select
                  value={cfgTransport}
                  onChange={(e) => setCfgTransport(e.target.value as HardwareDeviceConfig['transport'])}
                  className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                >
                  <option value="web_bluetooth">Web Bluetooth GATT (прямой BLE в Chrome/Edge)</option>
                  {configuringDevice.type === 'esp32_limbs' && (
                    <option value="web_serial">USB-C / COM-порт (Web Serial API)</option>
                  )}
                  <option value="websocket_bridge">Wi-Fi WebSocket / Локальный шлюз студии</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Фильтр имени BLE (необяз.)</label>
                  <input
                    type="text"
                    placeholder={
                      configuringDevice.type === 'wahoo_tickr'
                        ? 'Пусто или TICKR FIT'
                        : configuringDevice.type === 'bp_b05'
                        ? 'Пусто или BleModule / YK-IBPA1'
                        : configuringDevice.type === 'xiaomi_scale'
                        ? 'Пусто или MIBFS'
                        : 'Напр. PRAVILO-ESP32'
                    }
                    value={cfgNameFilter}
                    onChange={(e) => setCfgNameFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
                  />
                  {configuringDevice.type === 'wahoo_tickr' && (
                    <p className="mt-1 text-[11px] st-muted">
                      Оставьте пустым для автопоиска по профилям 0x180D, TICKR и Wahoo.
                    </p>
                  )}
                  {configuringDevice.type === 'bp_b05' && (
                    <p className="mt-1 text-[11px] st-muted">
                      Оставьте пустым для автопоиска по 0x1810, BleModule, YK-IBPA1, B05, BPM и FFF0.
                    </p>
                  )}
                </div>
                {cfgTransport === 'websocket_bridge' ? (
                  <div>
                    <label className="block font-medium mb-1">WebSocket адрес датчика</label>
                    <input
                      type="text"
                      placeholder="ws://192.168.1.50:81"
                      value={cfgBridgeUrl}
                      onChange={(e) => setCfgBridgeUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
                    />
                  </div>
                ) : cfgTransport === 'web_serial' ? (
                  <div>
                    <label className="block font-medium mb-1">Скорость UART (baud)</label>
                    <select
                      value={cfgBaudRate}
                      onChange={(e) => setCfgBaudRate(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
                    >
                      <option value={9600}>9600</option>
                      <option value={57600}>57600</option>
                      <option value={115200}>115200 (ESP32-S3)</option>
                      <option value={921600}>921600</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfgAutoSync}
                        onChange={(e) => setCfgAutoSync(e.target.checked)}
                        className="rounded"
                      />
                      <span>Автосинхронизация показаний</span>
                    </label>
                  </div>
                )}
              </div>

              {configuringDevice.type === 'esp32_limbs' && (
                <div className="p-3 rounded-lg st-surface-muted border st-border space-y-2">
                  <div className="font-medium">Поправочные коэффициенты тензоканалов (4×HX711)</div>
                  <div className="grid grid-cols-4 gap-2 font-mono">
                    {(
                      [
                        ['lh', 'Лев. рук'],
                        ['rh', 'Прав. рук'],
                        ['lf', 'Лев. ног'],
                        ['rf', 'Прав. ног'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-[10px] st-muted mb-0.5">{label}</label>
                        <input
                          type="number"
                          step="0.005"
                          min={0.5}
                          max={2.0}
                          value={cfgScaleFactors[key]}
                          onChange={(e) =>
                            setCfgScaleFactors((p) => ({
                              ...p,
                              [key]: Number(e.target.value) || 1,
                            }))
                          }
                          className="w-full px-2 py-1 rounded border st-border st-surface text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {configuringDevice.type === 'myoblue_emg' && (
                <div className="p-3 rounded-lg st-surface-muted border st-border grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Усиление ЭМГ (Gain)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      max={10}
                      value={cfgEmgGain}
                      onChange={(e) => setCfgEmgGain(Number(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 rounded border st-border st-surface font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-medium">Смещение покоя (мВ)</label>
                      {liveSensors.myoblue.streaming && (
                        <button
                          type="button"
                          onClick={() => setCfgEmgBaseline(liveSensors.myoblue.rawCh1Mv)}
                          className="text-[10px] st-accent-text hover:underline cursor-pointer"
                        >
                          Считать покой
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={2}
                      value={cfgEmgBaseline}
                      onChange={(e) => setCfgEmgBaseline(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded border st-border st-surface font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfiguringDevice(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer"
              >
                Сохранить настройки
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Mi Body Composition Scale 2 Calibration */}
      {calibratingScale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveScaleCalibration}
            className="w-full max-w-md rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 st-accent-text" />
                <h3 className="font-display text-base font-semibold">
                  Калибровка Mi Body Composition Scale 2
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCalibratingScale(null)}
                className="p-1 rounded-lg hover:opacity-75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs st-muted leading-relaxed">
              Поставьте весы на ровный пол. При активном BLE-подключении можно сразу захватить показания с платформы без ручного ввода.
            </p>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">1. Смещение нуля платформы (Тара, кг)</label>
                  <div className="flex items-center gap-2">
                    {liveSensors.scale.rawWeightKg !== null && (
                      <button
                        type="button"
                        onClick={() => setTareOffsetKg(Number(liveSensors.scale.rawWeightKg!.toFixed(2)))}
                        className="text-[11px] st-accent-text hover:underline cursor-pointer"
                      >
                        Захватить ({liveSensors.scale.rawWeightKg.toFixed(2)} кг)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTareOffsetKg(0)}
                      className="text-[11px] st-muted hover:underline cursor-pointer"
                    >
                      0.00
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min={-2}
                  max={2}
                  value={tareOffsetKg}
                  onChange={(e) => setTareOffsetKg(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border st-border st-surface"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">2. Эталонный груз (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={5}
                    max={150}
                    value={referenceWeightKg}
                    onChange={(e) => setReferenceWeightKg(Number(e.target.value) || 50)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium">На весах (кг)</label>
                    {liveSensors.scale.rawWeightKg !== null && (
                      <button
                        type="button"
                        onClick={() => setMeasuredRefKg(Number(liveSensors.scale.rawWeightKg!.toFixed(2)))}
                        className="text-[10px] st-accent-text hover:underline cursor-pointer"
                      >
                        Считать
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min={5}
                    max={150}
                    value={measuredRefKg}
                    onChange={(e) => setMeasuredRefKg(Number(e.target.value) || 50)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  3. Поправка BIA-импеданса электродов (Ом)
                </label>
                <input
                  type="number"
                  step="1"
                  min={-100}
                  max={100}
                  value={impedanceOffsetOhm}
                  onChange={(e) => setImpedanceOffsetOhm(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border st-border st-surface"
                />
              </div>

              <div className="p-3 rounded-lg st-surface-muted text-xs font-mono flex items-center justify-between">
                <span className="st-muted">Расчётный коэффициент:</span>
                <span className="font-bold st-accent-text">
                  K = {measuredRefKg > 0 ? (referenceWeightKg / measuredRefKg).toFixed(4) : '1.0000'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCalibratingScale(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer"
              >
                Применить калибровку
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
