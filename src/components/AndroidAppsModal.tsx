import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Package,
  Smartphone,
  Terminal,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  ANDROID_APPS_CATALOG,
  getActiveAndroidAppFlavor,
  type AndroidAppFlavor,
} from '../utils/androidApps';

interface AndroidAppsModalProps {
  brandName?: string;
  showApkInstructions?: boolean;
  onClose: () => void;
}

export const AndroidAppsModal: React.FC<AndroidAppsModalProps> = ({
  brandName,
  showApkInstructions = true,
  onClose,
}) => {
  const activeFlavor = getActiveAndroidAppFlavor();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copiedFlavor, setCopiedFlavor] = useState<AndroidAppFlavor | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://studio.example.ru';
  const apkBuildCmd = `npm run android:prepare -- --url=${origin}`;

  const handleCopyUrl = (flavor: AndroidAppFlavor, startUrl: string) => {
    const full = `${origin}${startUrl}`;
    navigator.clipboard?.writeText(full);
    setCopiedFlavor(flavor);
    setTimeout(() => setCopiedFlavor(null), 1800);
  };

  const handleOpenFlavor = (startUrl: string) => {
    window.location.href = startUrl;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] rounded-2xl st-surface border st-border shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b st-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl st-accent-soft st-accent-text shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base sm:text-lg font-bold truncate">
                Android-приложения: Администратор, Тренер, Клиент
              </h3>
              <p className="text-xs st-muted truncate">
                {brandName || 'ЭТАЛОН ПРАВИЛО'} · 3 отдельных приложения со своей иконкой и правами
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-75 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeFlavor && isInstallable && !isInstalled && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-emerald-900 dark:text-emerald-200">
                Открыт режим{' '}
                <strong>
                  {ANDROID_APPS_CATALOG.find((a) => a.flavor === activeFlavor)?.title}
                </strong>
                . Нажмите для прямой установки на экран Android.
              </div>
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Установить на Android</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {ANDROID_APPS_CATALOG.map((app) => {
              const isCurrent = activeFlavor === app.flavor;
              const fullUrl = `${origin}${app.startUrl}`;
              return (
                <div
                  key={app.flavor}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? 'border-cyan-500 ring-1 ring-cyan-500/40 st-surface'
                      : 'st-border st-surface-muted'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={app.iconUrl}
                        alt={app.title}
                        className="w-12 h-12 rounded-xl border st-border shadow-sm shrink-0"
                      />
                      <div className="min-w-0">
                        <span
                          className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border mb-1 ${app.accentClass}`}
                        >
                          {app.roleLabel}
                        </span>
                        <h4 className="font-display text-sm font-bold leading-snug">
                          {app.title}
                        </h4>
                      </div>
                    </div>

                    <p className="text-xs st-muted leading-relaxed">{app.description}</p>

                    <ul className="space-y-1 text-[11px] st-muted">
                      {app.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-1.5">
                          <span className="text-cyan-600 dark:text-cyan-400 font-bold">•</span>
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2 border-t st-border">
                    <div className="text-[10px] font-mono st-muted truncate" title={fullUrl}>
                      ID: {app.packageId}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isCurrent && isInstallable && !isInstalled ? (
                        <button
                          type="button"
                          onClick={install}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Установить</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenFlavor(app.startUrl)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{isCurrent ? 'Активно' : 'Открыть'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(app.flavor, app.startUrl)}
                        title="Скопировать ссылку для Android"
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-85 cursor-pointer"
                      >
                        {copiedFlavor === app.flavor ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl st-surface-muted border st-border text-xs space-y-2">
            <div className="font-semibold">
              Установка на телефон или планшет Android (Chrome)
            </div>
            <p className="st-muted leading-relaxed">
              Откройте нужную ссылку на устройстве Android в браузере Chrome по HTTPS (или нажмите{' '}
              <strong>Открыть</strong> выше) и выберите в меню Chrome (⋮) пункт{' '}
              <strong>«Установить приложение»</strong> / <strong>«Добавить на главный экран»</strong>.
              Каждое из 3 приложений устанавливается независимо с собственной иконкой и своим режимом входа.
            </p>
          </div>

          {showApkInstructions && (
            <div className="p-3.5 rounded-xl st-surface-muted border st-border text-xs space-y-2.5">
              <div className="flex items-center gap-2 font-semibold">
                <Package className="w-4 h-4 st-accent-text" />
                <span>Сборка отдельных установочных APK / AAB пакетов для Android</span>
              </div>
              <p className="st-muted leading-relaxed">
                Для распространения в виде файлов <span className="font-mono">.apk</span> или публикации в Google Play и RuStore подготовлены конфигурации Capacitor и Trusted Web Activity для всех трёх приложений (
                <span className="font-mono">ru.etalonpravilo.admin</span>,{' '}
                <span className="font-mono">ru.etalonpravilo.trainer</span>,{' '}
                <span className="font-mono">ru.etalonpravilo.client</span>).
              </p>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg st-surface border st-border font-mono text-[11px] overflow-x-auto">
                <span className="inline-flex items-center gap-2 truncate">
                  <Terminal className="w-3.5 h-3.5 st-accent-text shrink-0" />
                  <span className="truncate">{apkBuildCmd}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(apkBuildCmd);
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border st-border shrink-0 cursor-pointer"
                >
                  {copiedCmd ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedCmd ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 flex justify-end px-5 py-3 border-t st-border st-surface">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
