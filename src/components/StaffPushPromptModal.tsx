import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import type { UserAccount, UserRole } from '../types';
import {
  markStaffPushPromptDismissed,
  requestStaffPushPermission,
  type StaffPushPermissionState,
} from '../utils/staffNotifications';

interface StaffPushPromptModalProps {
  user: UserAccount;
  onPermissionUpdated: (perm: StaffPushPermissionState) => void;
  onClose: () => void;
}

const STAFF_ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Владелец сети',
  admin: 'Администратор студии',
  trainer: 'Тренер',
  client: 'Клиент',
};

export const StaffPushPromptModal: React.FC<StaffPushPromptModalProps> = ({
  user,
  onPermissionUpdated,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);
  const [deniedNotice, setDeniedNotice] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markStaffPushPromptDismissed(user.id);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, user.id]);

  const handleAllow = async () => {
    setBusy(true);
    setDeniedNotice(false);
    const result = await requestStaffPushPermission(user.id);
    onPermissionUpdated(result);
    setBusy(false);
    if (result === 'granted') {
      onClose();
    } else if (result === 'denied') {
      setDeniedNotice(true);
    }
  };

  const handleLater = () => {
    markStaffPushPromptDismissed(user.id);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleLater();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 sm:p-4 overflow-hidden"
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] flex flex-col rounded-xl st-surface border st-border shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b st-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg st-accent-soft flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4 st-accent-text" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold leading-tight">
                Push-уведомления о записях
              </h3>
              <p className="text-[11px] st-muted truncate">
                {user.name} · {STAFF_ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLater}
            aria-label="Закрыть"
            className="p-1.5 rounded-lg hover:opacity-80 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs leading-relaxed">
          <p>
            Разрешите браузерные Push-уведомления, чтобы мгновенно узнавать о новых
            бронированиях клиентов —{' '}
            <span className="font-semibold">
              даже когда вкладка браузера свернута
            </span>{' '}
            или открыто другое окно.
          </p>

          <ul className="space-y-2 st-surface-muted border st-border rounded-lg p-3.5">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Мгновенные системные оповещения при создании онлайн-записи или
                брони в вашу студию
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Работают в фоновом режиме при свёрнутом окне браузера или PWA
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Нажатие на уведомление сразу открывает вкладку расписания и
                записей
              </span>
            </li>
          </ul>

          {deniedNotice && (
            <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Браузер отклонил запрос. Вы можете разрешить уведомления вручную
                через значок настроек сайта в адресной строке или позже в меню
                «Настройки».
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t st-border st-surface">
          <button
            type="button"
            onClick={handleLater}
            className="px-3.5 py-2 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer"
          >
            {deniedNotice ? 'Закрыть' : 'Позже'}
          </button>
          {!deniedNotice && (
            <button
              type="button"
              disabled={busy}
              onClick={handleAllow}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{busy ? 'Запрос разрешения...' : 'Разрешить уведомления'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
