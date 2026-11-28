import React, { useEffect, useState } from 'react';
import {
  Bluetooth,
  Laptop,
  Loader2,
  RefreshCw,
  Smartphone,
  Usb,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type {
  EquipmentDevice,
  NativeBluetoothDeviceInfo,
  NativeBluetoothProtocol,
} from '../types';
import {
  listNativeBluetoothDevices,
  subscribeAndroidBluetoothScan,
} from '../utils/bluetooth';

interface NativeBluetoothModalProps {
  device: EquipmentDevice;
  titleOverride?: string;
  onClose: () => void;
  onSelectDevice: (selection: {
    deviceId: string;
    deviceName: string;
    address: string;
    port?: string;
    protocol: NativeBluetoothProtocol;
  }) => Promise<void> | void;
}

export const NativeBluetoothModal: React.FC<NativeBluetoothModalProps> = ({
  device,
  titleOverride,
  onClose,
  onSelectDevice,
}) => {
  const [loading, setLoading] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [backend, setBackend] = useState<'android_bridge' | 'desktop_ipc' | 'server_local'>(
    'server_local'
  );
  const [platform, setPlatform] = useState('browser');
  const [adapterSupported, setAdapterSupported] = useState(true);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [devices, setDevices] = useState<NativeBluetoothDeviceInfo[]>([]);
  const [protocol, setProtocol] = useState<NativeBluetoothProtocol>(
    device.hardwareConfig?.nativeProtocol || 'auto'
  );
  const [manualTarget, setManualTarget] = useState(
    device.hardwareConfig?.nativeAddress || ''
  );

  const loadDevices = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await listNativeBluetoothDevices();
      setBackend(res.backend);
      setPlatform(res.platform);
      setAdapterSupported(res.adapterSupported);
      setNote(res.note || '');
      const sorted = [...(res.devices || [])].sort((a, b) => {
        const aMatch = a.recommendedFor?.includes(device.type) ? 1 : 0;
        const bMatch = b.recommendedFor?.includes(device.type) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        if (Boolean(a.connected) !== Boolean(b.connected)) return a.connected ? -1 : 1;
        return a.name.localeCompare(b.name, 'ru');
      });
      setDevices(sorted);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    const unsubScan = subscribeAndroidBluetoothScan(
      device.type,
      (found) => {
        setDevices((prev) => {
          if (prev.some((d) => d.address === found.address)) return prev;
          return [...prev, found];
        });
      },
      (msg) => setErrorMsg(msg)
    );
    return () => {
      unsubScan();
    };
  }, [device.type]);

  const handlePick = async (item: NativeBluetoothDeviceInfo) => {
    setConnectingId(item.id);
    setErrorMsg('');
    try {
      await onSelectDevice({
        deviceId: item.id,
        deviceName: item.name,
        address: item.address,
        port: item.port,
        protocol: protocol === 'auto' && item.port && item.transport === 'spp' ? 'spp' : protocol,
      });
    } finally {
      setConnectingId(null);
    }
  };

  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualTarget.trim();
    if (!clean) return;
    setConnectingId('manual');
    setErrorMsg('');
    try {
      const isSerialPort = /^COM\d+$/i.test(clean) || clean.startsWith('/dev/');
      await onSelectDevice({
        deviceId: clean,
        deviceName: `${device.name} (${clean})`,
        address: clean,
        port: isSerialPort ? clean : undefined,
        protocol: isSerialPort ? 'spp' : protocol,
      });
    } finally {
      setConnectingId(null);
    }
  };

  const envIcon =
    backend === 'android_bridge' ? (
      <Smartphone className="w-4 h-4 text-emerald-600" />
    ) : (
      <Laptop className="w-4 h-4 st-accent-text" />
    );

  const envLabel =
    backend === 'android_bridge'
      ? 'Android: штатный Bluetooth смартфона'
      : backend === 'desktop_ipc'
      ? `Десктоп (${platform === 'win32' || platform === 'windows' ? 'Windows' : platform === 'darwin' || platform === 'macos' ? 'macOS' : platform}): системный Bluetooth ПК`
      : `Системный Bluetooth ОС (${platform})`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-xl rounded-2xl st-surface border st-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b st-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg st-surface-muted st-accent-text shrink-0">
              <Bluetooth className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm sm:text-base font-bold truncate">
                {titleOverride || `Штатный Bluetooth: ${device.name}`}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] st-muted">
                {envIcon}
                <span className="truncate">{envLabel}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <div className="p-3 rounded-xl st-surface-muted border st-border space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                Выберите датчик из списка системного Bluetooth или запустите поиск BLE рядом
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {backend === 'desktop_ipc' && (
                  <button
                    type="button"
                    disabled={connectingId !== null}
                    onClick={() =>
                      onSelectDevice({
                        deviceId: 'ble-scan',
                        deviceName: device.name,
                        address: '',
                        protocol: 'gatt',
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg st-accent-bg text-[11px] font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>Поиск BLE рядом</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={loading}
                  onClick={loadDevices}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border st-surface text-[11px] font-medium hover:opacity-85 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Обновить список</span>
                </button>
              </div>
            </div>
            {note && <p className="text-[11px] st-muted leading-relaxed">{note}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] st-muted">Режим обмена:</span>
              {(
                [
                  ['auto', 'Авто (BLE GATT + SPP)'],
                  ['gatt', 'BLE GATT (без браузера)'],
                  ['spp', 'Classic SPP / COM-порт'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setProtocol(val)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                    protocol === val
                      ? 'st-accent-bg border-transparent'
                      : 'st-border st-surface hover:opacity-85'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 st-muted">
              <Loader2 className="w-5 h-5 animate-spin st-accent-text" />
              <span>Сканирование системных Bluetooth-устройств...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed st-border text-center space-y-2">
              <div className="font-medium">
                {adapterSupported
                  ? 'Сопряжённые Bluetooth-устройства не найдены'
                  : 'Локальный Bluetooth-адаптер не обнаружен'}
              </div>
              <p className="text-[11px] st-muted max-w-md mx-auto leading-relaxed">
                Выполните сопряжение датчика в настройках Bluetooth вашего ПК (Windows / macOS) или смартфона Android и нажмите «Обновить список», либо укажите COM/Serial порт или MAC-адрес вручную ниже.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((item) => {
                const isRecommended = item.recommendedFor?.includes(device.type);
                const isBusy = connectingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isRecommended
                        ? 'border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-950/20'
                        : 'st-border st-surface-muted'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-xs truncate">{item.name}</span>
                        {isRecommended && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Подходит
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono uppercase">
                          {item.transport === 'spp' ? 'SPP / COM' : item.transport === 'gatt' ? 'BLE GATT' : 'BT + BLE'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono st-muted flex flex-wrap items-center gap-2">
                        <span>{item.address}</span>
                        {item.port && item.port !== item.address && (
                          <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                            <Usb className="w-3 h-3" />
                            {item.port}
                          </span>
                        )}
                        {item.connected && (
                          <span className="text-emerald-600 dark:text-emerald-400">● Активен в ОС</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={connectingId !== null}
                      onClick={() => handlePick(item)}
                      className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium shrink-0 cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bluetooth className="w-3.5 h-3.5" />
                      )}
                      <span>Подключить</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleManualConnect} className="pt-2 border-t st-border space-y-2">
            <label className="block text-[11px] font-medium st-muted">
              Ручное подключение по MAC-адресу Bluetooth или системному порту (COM5 / /dev/cu.ESP32)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Например COM5, /dev/cu.Pravilo-SPP или AA:BB:CC:DD:EE:FF"
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border st-border st-surface font-mono text-xs"
              />
              <button
                type="submit"
                disabled={!manualTarget.trim() || connectingId !== null}
                className="px-3.5 py-2 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-85 cursor-pointer disabled:opacity-50"
              >
                Подключить вручную
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
