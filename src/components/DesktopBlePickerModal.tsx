import React, { useEffect, useMemo, useState } from 'react';
import { Bluetooth, CheckCircle2, Loader2, Search, X } from 'lucide-react';

interface DesktopBleDevice {
  deviceId: string;
  deviceName?: string;
}

const KNOWN_SENSOR_RE =
  /tickr|wahoo|polar|garmin|coospo|magene|heart|hrm|mibfs|mibcs|miscale|mi scale|mi_scale|xmtzc|xiaomi|okok|scale|esp32|pravilo|myo|emg|b05|bpm|blemodule|yk-|yonker|ibp|yuwell|omron|beurer|contec|sinocare|medisana|blesmart|blood/i;

export const DesktopBlePickerModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DesktopBleDevice[]>([]);
  const [query, setQuery] = useState('');
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    const deskBt = typeof window !== 'undefined' ? window.praviloDesktop?.bluetooth : undefined;
    if (!deskBt?.onWebBleDevices) return;

    const unsub = deskBt.onWebBleDevices((payload) => {
      if (Array.isArray(payload)) {
        setDevices(payload);
        setOpen(true);
        setPickingId(null);
      } else if (payload && typeof payload === 'object') {
        setDevices(Array.isArray(payload.devices) ? payload.devices : []);
        setOpen(Boolean(payload.scanning));
        if (!payload.scanning) {
          setPickingId(null);
          setQuery('');
        }
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const sortedFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const unique = new Map<string, DesktopBleDevice>();
    for (const d of devices) {
      if (!d?.deviceId) continue;
      const existing = unique.get(d.deviceId);
      if (!existing || (!existing.deviceName && d.deviceName)) {
        unique.set(d.deviceId, d);
      }
    }
    return [...unique.values()]
      .filter((d) => {
        if (!q) return true;
        return (
          (d.deviceName || '').toLowerCase().includes(q) ||
          d.deviceId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aKnown = KNOWN_SENSOR_RE.test(a.deviceName || '') ? 1 : 0;
        const bKnown = KNOWN_SENSOR_RE.test(b.deviceName || '') ? 1 : 0;
        if (aKnown !== bKnown) return bKnown - aKnown;
        const aNamed = a.deviceName ? 1 : 0;
        const bNamed = b.deviceName ? 1 : 0;
        if (aNamed !== bNamed) return bNamed - aNamed;
        return (a.deviceName || a.deviceId).localeCompare(b.deviceName || b.deviceId, 'ru');
      });
  }, [devices, query]);

  if (!open) return null;

  const handlePick = async (deviceId: string) => {
    setPickingId(deviceId || '__cancel__');
    try {
      await window.praviloDesktop?.bluetooth?.pickWebBleDevice?.(deviceId);
    } finally {
      setOpen(false);
      setPickingId(null);
      setQuery('');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl st-surface border st-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b st-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg st-surface-muted st-accent-text shrink-0">
              <Bluetooth className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm sm:text-base font-bold truncate">
                Поиск Bluetooth Low Energy (BLE)
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] st-muted">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Сканирование ближайших датчиков по Bluetooth...</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePick('')}
            aria-label="Отменить сканирование BLE"
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 st-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Фильтр по названию или ID (например TICKR, MIBFS, B05, ESP32)..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border st-border st-surface text-xs"
            />
          </div>

          {sortedFiltered.length === 0 ? (
            <div className="py-8 text-center space-y-2 st-muted">
              <Loader2 className="w-5 h-5 animate-spin mx-auto st-accent-text" />
              <div className="font-medium text-slate-700 dark:text-slate-200">
                Ожидание отклика BLE-устройств...
              </div>
              <p className="text-[11px] max-w-sm mx-auto leading-relaxed">
                Убедитесь, что датчик включён, не занят телефоном и Bluetooth включён в настройках компьютера (для весов Xiaomi встаньте на платформу на 2 секунды).
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sortedFiltered.map((d) => {
                const isKnown = KNOWN_SENSOR_RE.test(d.deviceName || '');
                const busy = pickingId === d.deviceId;
                return (
                  <div
                    key={d.deviceId}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isKnown
                        ? 'border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-950/20'
                        : 'st-border st-surface-muted'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate">
                          {d.deviceName || 'BLE-устройство (без имени)'}
                        </span>
                        {isKnown && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Датчик
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono st-muted truncate">{d.deviceId}</div>
                    </div>
                    <button
                      type="button"
                      disabled={pickingId !== null}
                      onClick={() => handlePick(d.deviceId)}
                      className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium shrink-0 cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                      {busy ? (
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
        </div>

        <div className="px-5 py-3 border-t st-border flex items-center justify-between gap-3 text-[11px] st-muted">
          <span>Найдено устройств: {sortedFiltered.length}</span>
          <button
            type="button"
            onClick={() => handlePick('')}
            className="px-3 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};
