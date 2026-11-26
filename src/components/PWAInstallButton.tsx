import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getAndroidAppDefinition } from '../utils/androidApps';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, activeFlavor, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const activeDef = getAndroidAppDefinition(activeFlavor);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>
          {compact
            ? 'Установить'
            : activeDef
            ? `Установить: ${activeDef.shortTitle}`
            : 'Установить приложение'}
        </span>
      </button>
    );
  }

  if (isAndroid) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowAndroidGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
          <span>{compact ? 'Android' : 'На экран Android'}</span>
        </button>

        {showAndroidGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
              <h3 className="font-display text-lg font-semibold">
                {activeDef ? `${activeDef.title} для Android` : 'Установка на Android'}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Откройте меню браузера Chrome (значок <strong>⋮</strong> в правом верхнем углу).
                <br />
                2. Нажмите <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowAndroidGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 dark:bg-cyan-600 py-2.5 text-sm font-medium text-white cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>На экран iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
              <h3 className="font-display text-lg font-semibold">Установка на iPhone / iPad</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Нажмите кнопку <strong>Поделиться</strong> на нижней панели Safari.
                <br />
                2. Выберите пункт <strong>На экран «Домой»</strong> для работы офлайн и получения уведомлений.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 dark:bg-cyan-600 py-2.5 text-sm font-medium text-white cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Офлайн-режим — отображаются сохранённые данные</span>
    </div>
  );
};
