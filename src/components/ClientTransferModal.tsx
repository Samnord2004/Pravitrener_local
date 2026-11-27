import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Building2, CheckCircle2, ShieldAlert, UserCheck, X } from 'lucide-react';
import type {
  Booking,
  ClientHandoverMode,
  ClientHandoverRecord,
  ClientProfile,
  Studio,
  UserAccount,
} from '../types';
import { apiRequest } from '../utils/api';

export interface ClientTransferResult {
  client: ClientProfile;
  updatedBookings: Booking[];
  handoverRecord: ClientHandoverRecord;
}

interface ClientTransferModalProps {
  client: ClientProfile;
  studios: Studio[];
  users: UserAccount[];
  currentUser?: UserAccount;
  initialMode?: ClientHandoverMode;
  onClose: () => void;
  onTransferred: (res: ClientTransferResult) => void;
}

export const ClientTransferModal: React.FC<ClientTransferModalProps> = ({
  client,
  studios,
  users,
  currentUser,
  initialMode = 'permanent',
  onClose,
  onTransferred,
}) => {
  const activeTrainers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === 'trainer' &&
          u.active !== false &&
          u.employmentStatus !== 'fired' &&
          u.ownerApproved !== false
      ),
    [users]
  );

  const initialStudioId = useMemo(() => {
    const otherStudio = studios.find((s) => s.id !== client.studioId);
    if (initialMode === 'guest_visit' && otherStudio) return otherStudio.id;
    return client.studioId || studios[0]?.id || '';
  }, [studios, client.studioId, initialMode]);

  const pickTrainerForStudio = (studioId: string, excludeTrainerId?: string) => {
    const inStudio = activeTrainers.filter(
      (t) => t.studioId === studioId && t.id !== excludeTrainerId
    );
    if (inStudio.length > 0) return inStudio[0].id;
    const anyOther = activeTrainers.find((t) => t.id !== excludeTrainerId);
    return anyOther?.id || activeTrainers[0]?.id || '';
  };

  const [mode, setMode] = useState<ClientHandoverMode>(initialMode);
  const [toStudioId, setToStudioId] = useState<string>(initialStudioId);
  const [toTrainerId, setToTrainerId] = useState<string>(() =>
    pickTrainerForStudio(initialStudioId, client.assignedTrainerId)
  );
  const [changeClientStudio, setChangeClientStudio] = useState<boolean>(true);
  const [transferUpcomingBookings, setTransferUpcomingBookings] = useState<boolean>(true);
  const [revokePreviousAccess, setRevokePreviousAccess] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const currentStudio = studios.find((s) => s.id === client.studioId);
  const currentTrainer =
    activeTrainers.find((t) => t.id === client.assignedTrainerId) ||
    users.find((u) => u.id === client.assignedTrainerId);

  const sortedTrainers = useMemo(() => {
    return [...activeTrainers].sort((a, b) => {
      const aMatch = a.studioId === toStudioId ? 0 : 1;
      const bMatch = b.studioId === toStudioId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [activeTrainers, toStudioId]);

  const handleStudioChange = (nextStudioId: string) => {
    setToStudioId(nextStudioId);
    const currentPicked = activeTrainers.find((t) => t.id === toTrainerId);
    if (!currentPicked || currentPicked.studioId !== nextStudioId) {
      const nextT = pickTrainerForStudio(nextStudioId, client.assignedTrainerId);
      if (nextT) setToTrainerId(nextT);
    }
  };

  const handleModeChange = (nextMode: ClientHandoverMode) => {
    setMode(nextMode);
    if (nextMode === 'guest_visit') {
      const otherStudio = studios.find((s) => s.id !== client.studioId);
      if (otherStudio && toStudioId === client.studioId) {
        handleStudioChange(otherStudio.id);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toTrainerId) {
      setError('Выберите тренера для передачи.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await apiRequest<ClientTransferResult>(`/api/clients/${client.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          mode,
          toTrainerId,
          toStudioId,
          changeClientStudio: mode === 'permanent' ? changeClientStudio : false,
          transferUpcomingBookings: mode === 'permanent' ? transferUpcomingBookings : false,
          revokePreviousAccess: mode === 'permanent' ? revokePreviousAccess : false,
          note: note.trim(),
        }),
      });
      onTransferred(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить передачу клиента');
    } finally {
      setSaving(false);
    }
  };

  const targetStudioObj = studios.find((s) => s.id === toStudioId);
  const targetTrainerObj = activeTrainers.find((t) => t.id === toTrainerId);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-3 sm:p-4 overflow-y-auto"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl st-surface border st-border shadow-2xl overflow-hidden my-4"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b st-border">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 st-accent-text shrink-0" />
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold truncate">
                Передача клиента / занятие в другой студии
              </h3>
              <div className="text-xs st-muted truncate">{client.name}</div>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current assignment summary */}
          <div className="p-3 rounded-xl st-surface-muted border st-border text-xs space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="st-muted">Текущая студия:</span>
              <span className="font-semibold">{currentStudio?.name || 'Не указана'}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="st-muted">Ведущий тренер:</span>
              <span className="font-semibold">
                {currentTrainer?.name || client.assignedTrainerName || 'Не закреплён'}
              </span>
            </div>
          </div>

          {/* Transfer mode switch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('permanent')}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                mode === 'permanent'
                  ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/35'
                  : 'st-border st-surface-muted hover:opacity-90'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <UserCheck className="w-3.5 h-3.5 st-accent-text shrink-0" />
                <span>Передать новому тренеру</span>
              </div>
              <p className="text-[11px] st-muted mt-1 leading-snug">
                Закрепить нового ведущего тренера (и при необходимости перевести в другую студию).
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('guest_visit')}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                mode === 'guest_visit'
                  ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/35'
                  : 'st-border st-surface-muted hover:opacity-90'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Building2 className="w-3.5 h-3.5 st-accent-text shrink-0" />
                <span>Занятие в другой студии</span>
              </div>
              <p className="text-[11px] st-muted mt-1 leading-snug">
                Открыть карту и историю тренеру другой студии на гостевое/разовое занятие без смены основного тренера.
              </p>
            </button>
          </div>

          {/* Target Studio & Trainer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Целевая студия</label>
              <select
                value={toStudioId}
                onChange={(e) => handleStudioChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
              >
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Новый тренер</label>
              <select
                value={toTrainerId}
                onChange={(e) => setToTrainerId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
              >
                {sortedTrainers.map((t) => {
                  const st = studios.find((s) => s.id === t.studioId);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {st ? `(${st.name})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {targetTrainerObj && targetStudioObj && targetTrainerObj.studioId !== targetStudioObj.id && (
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Основная студия тренера {targetTrainerObj.name} отличается от «{targetStudioObj.name}».
                Тренер всё равно получит доступ к проведению занятия в выбранной студии.
              </span>
            </div>
          )}

          {/* Options for permanent handover */}
          {mode === 'permanent' && (
            <div className="space-y-2 p-3 rounded-xl st-surface-muted border st-border text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={changeClientStudio}
                  onChange={(e) => setChangeClientStudio(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Перевести основную студию клиента на «{targetStudioObj?.name || 'выбранную'}»</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferUpcomingBookings}
                  onChange={(e) => setTransferUpcomingBookings(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Перенести будущие активные записи клиента новому тренеру</span>
              </label>

              {currentUser?.role !== 'trainer' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={revokePreviousAccess}
                    onChange={(e) => setRevokePreviousAccess(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Закрыть прежнему тренеру доступ к карточке клиента</span>
                </label>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={revokePreviousAccess}
                    onChange={(e) => setRevokePreviousAccess(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Снять клиента с моего списка после передачи</span>
                </label>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">
              Комментарий для нового тренера (противопоказания, акценты, параметры тяги)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: переходит в филиал на Парке Победы, комфортная тяга до 85 кг, акцент на поясницу..."
              className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t st-border">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || activeTrainers.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg st-accent-bg cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? 'Выполняется...'
                  : mode === 'permanent'
                  ? 'Передать клиента'
                  : 'Открыть доступ для занятия'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
