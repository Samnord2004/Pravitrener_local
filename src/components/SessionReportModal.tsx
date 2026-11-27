import React from 'react';
import {
  X,
  FileDown,
  Activity,
  HeartPulse,
  Gauge,
  Star,
  UserCheck,
  Ruler,
  Scale,
} from 'lucide-react';
import type { PaymentStatus, Studio, TrainingSessionRecord } from '../types';
import { exportSessionReportPdf } from '../utils/pdfReport';

interface SessionReportModalProps {
  session: TrainingSessionRecord;
  studio?: Studio;
  onClose: () => void;
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачено',
  paid_card: 'Банковская карта',
  paid_cash: 'Наличные',
  paid_subscription: 'Списание с абонемента',
  paid_certificate: 'Подарочный сертификат',
};

export const SessionReportModal: React.FC<SessionReportModalProps> = ({
  session,
  studio,
  onClose,
}) => {
  const dateStr = (session.startedAt || session.endedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const mins = Math.floor(session.durationSec / 60);
  const secs = session.durationSec % 60;

  const heightDelta =
    session.heightBeforeCm && session.heightAfterCm
      ? Number((session.heightAfterCm - session.heightBeforeCm).toFixed(1))
      : undefined;
  const weightDelta =
    session.weightBeforeKg && session.weightAfterKg
      ? Number((session.weightAfterKg - session.weightBeforeKg).toFixed(1))
      : undefined;

  const resolvedStudioName = studio?.name || session.studioName || 'ЭТАЛОН ПРАВИЛО';

  const handleExport = () => {
    exportSessionReportPdf({
      studioName: resolvedStudioName,
      studioAddress: studio?.address || '',
      clientName: session.clientName,
      trainerName: session.trainerName,
      programTitle: session.programTitle,
      dateStr,
      durationSec: session.durationSec,
      minWinchKg: session.minWinchKg,
      peakWinchKg: session.peakWinchKg,
      avgSymmetryPct: session.avgSymmetryPct,
      minLimbLoads: session.minLimbLoads,
      maxLimbLoads: session.maxLimbLoads,
      emgStats: session.emgStats,
      minHrBpm: session.minHrBpm,
      avgHrBpm: session.avgHrBpm,
      maxHrBpm: session.maxHrBpm,
      bpBefore: session.bpBefore,
      bpAfter: session.bpAfter,
      heightBeforeCm: session.heightBeforeCm,
      heightAfterCm: session.heightAfterCm,
      weightBeforeKg: session.weightBeforeKg,
      weightAfterKg: session.weightAfterKg,
      postureBeforeSummary: session.postureBeforeSummary,
      postureAfterSummary: session.postureAfterSummary,
      completedExercises: session.completedExercises,
      telemetryHistory: session.telemetrySeries || [],
      notes: session.notes,
      paymentLabel: PAYMENT_LABELS[session.paymentMethod] || session.paymentMethod,
      amountPaidRub: session.amountPaidRub,
    });
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-3 sm:p-4 overflow-hidden"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl st-surface border st-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b st-border">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              <span>Отчёт о тренировке · {dateStr}</span>
              {session.isGuestStudioSession && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-sans normal-case font-semibold">
                  Занятие в другой студии / у другого тренера
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold truncate">
              {session.clientName} — {session.programTitle}
            </h3>
            <div className="text-xs st-muted mt-0.5">
              Студия: {resolvedStudioName} · Тренер: {session.trainerName} · Длительность: {mins} мин {secs} сек ·{' '}
              {PAYMENT_LABELS[session.paymentMethod] || session.paymentMethod} (
              {session.amountPaidRub.toLocaleString('ru-RU')} ₽)
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border st-border hover:opacity-80 cursor-pointer"
              aria-label="Закрыть отчёт"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Anthropometry, BP, Pulse, Posture Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Ruler className="w-3.5 h-3.5 text-cyan-600" />
                <span>Рост и вес</span>
              </div>
              <div className="font-mono tabular-nums">
                Рост:{' '}
                {session.heightBeforeCm || session.heightAfterCm
                  ? `${session.heightBeforeCm ? session.heightBeforeCm.toFixed(1) : '—'} → ${
                      session.heightAfterCm ? session.heightAfterCm.toFixed(1) : '—'
                    } см`
                  : 'Не фиксировался'}
                {heightDelta !== undefined && (
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    ({heightDelta >= 0 ? '+' : ''}
                    {heightDelta.toFixed(1)})
                  </span>
                )}
              </div>
              <div className="font-mono tabular-nums">
                Вес:{' '}
                {session.weightBeforeKg || session.weightAfterKg
                  ? `${session.weightBeforeKg ? session.weightBeforeKg.toFixed(1) : '—'} → ${
                      session.weightAfterKg ? session.weightAfterKg.toFixed(1) : '—'
                    } кг`
                  : 'Не фиксировался'}
                {weightDelta !== undefined && (
                  <span className="ml-1 text-cyan-600 font-semibold">
                    ({weightDelta >= 0 ? '+' : ''}
                    {weightDelta.toFixed(1)})
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Gauge className="w-3.5 h-3.5 text-cyan-600" />
                <span>Тонометр (АД)</span>
              </div>
              <div className="font-mono tabular-nums">
                До: <span className="font-semibold">{session.bpBefore || 'Не измерялось'}</span>
              </div>
              <div className="font-mono tabular-nums">
                После: <span className="font-semibold">{session.bpAfter || 'Не измерялось'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                <span>Пульсометр</span>
              </div>
              <div className="font-mono tabular-nums">
                Средний:{' '}
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {session.avgHrBpm > 0 ? `${session.avgHrBpm} уд/мин` : '—'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-[11px] st-muted">
                Мин / Макс: {session.minHrBpm ?? '—'} / {session.maxHrBpm ?? '—'} уд/мин
              </div>
            </div>

            <div className="p-3 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Осанка до и после</span>
              </div>
              <div>
                <span className="st-muted">До:</span>{' '}
                <span>{session.postureBeforeSummary || 'Не указана'}</span>
              </div>
              <div>
                <span className="st-muted">После:</span>{' '}
                <span>{session.postureAfterSummary || 'Не указана'}</span>
              </div>
            </div>
          </div>

          {/* Min/Max Tensometers & Myo Sensors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border st-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-cyan-600" />
                  Тензодатчики конечностей (мин / макс)
                </span>
                <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-400">
                  Общая: {session.minWinchKg !== undefined ? `${session.minWinchKg.toFixed(1)}–` : ''}
                  {session.peakWinchKg.toFixed(1)} кг · Симм. {session.avgSymmetryPct}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                <div className="p-2 rounded-lg st-surface-muted">
                  Лев. рука: {session.minLimbLoads?.lh !== undefined ? `${session.minLimbLoads.lh.toFixed(1)} / ` : ''}
                  <span className="font-bold">{session.maxLimbLoads.lh.toFixed(1)} кг</span>
                </div>
                <div className="p-2 rounded-lg st-surface-muted">
                  Прав. рука: {session.minLimbLoads?.rh !== undefined ? `${session.minLimbLoads.rh.toFixed(1)} / ` : ''}
                  <span className="font-bold">{session.maxLimbLoads.rh.toFixed(1)} кг</span>
                </div>
                <div className="p-2 rounded-lg st-surface-muted">
                  Лев. нога: {session.minLimbLoads?.lf !== undefined ? `${session.minLimbLoads.lf.toFixed(1)} / ` : ''}
                  <span className="font-bold">{session.maxLimbLoads.lf.toFixed(1)} кг</span>
                </div>
                <div className="p-2 rounded-lg st-surface-muted">
                  Прав. нога: {session.minLimbLoads?.rf !== undefined ? `${session.minLimbLoads.rf.toFixed(1)} / ` : ''}
                  <span className="font-bold">{session.maxLimbLoads.rf.toFixed(1)} кг</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border st-border space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                <span>Миодатчики (мин / ср / макс)</span>
              </div>
              {session.emgStats ? (
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                  <div className="p-2.5 rounded-lg st-surface-muted">
                    <div className="text-[10px] st-muted">Канал CH1 (мВ)</div>
                    <div className="mt-1 font-bold text-amber-600 dark:text-amber-400">
                      {session.emgStats.ch1MinMv.toFixed(2)} / {session.emgStats.ch1AvgMv.toFixed(2)} /{' '}
                      {session.emgStats.ch1MaxMv.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg st-surface-muted">
                    <div className="text-[10px] st-muted">Канал CH2 (мВ)</div>
                    <div className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">
                      {session.emgStats.ch2MinMv.toFixed(2)} / {session.emgStats.ch2AvgMv.toFixed(2)} /{' '}
                      {session.emgStats.ch2MaxMv.toFixed(2)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg st-surface-muted text-slate-500">
                  Показания по миодатчикам записаны в перечне упражнений ниже.
                </div>
              )}
            </div>
          </div>

          {/* Exercises & Feedback */}
          <div className="space-y-2">
            <div className="font-semibold text-sm">
              Выполненные упражнения, показатели датчиков и отзывы ({session.completedExercises.length})
            </div>
            {session.completedExercises.length === 0 ? (
              <div className="p-3 rounded-xl st-surface-muted border st-border st-muted">
                Отдельные упражнения не зафиксированы.
              </div>
            ) : (
              <div className="space-y-2">
                {session.completedExercises.map((ex, i) => (
                  <div key={`${ex.exerciseId}-${i}`} className="p-3 rounded-xl border st-border space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-sm">
                        {i + 1}. {ex.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span className="px-2 py-0.5 rounded st-surface-muted">
                          {Math.floor(ex.durationSec / 60)}:{String(ex.durationSec % 60).padStart(2, '0')}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300">
                          Тяга: {ex.minWinchKg !== undefined ? `${ex.minWinchKg.toFixed(1)}–` : ''}
                          {ex.maxWinchKg.toFixed(1)} кг
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                          ЭМГ: {ex.minEmgMv !== undefined ? `${ex.minEmgMv.toFixed(2)}–` : ''}
                          {ex.maxEmgMv !== undefined ? ex.maxEmgMv.toFixed(2) : ex.avgEmgMv.toFixed(2)} мВ
                        </span>
                        {typeof ex.clientRating === 'number' && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {ex.clientRating}/5
                          </span>
                        )}
                        {typeof ex.discomfortLevel === 'number' && (
                          <span className="px-2 py-0.5 rounded st-surface-muted">
                            Дискомфорт: {ex.discomfortLevel}/10
                          </span>
                        )}
                      </div>
                    </div>
                    {(ex.clientFeeling || ex.trainerNote) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                        {ex.clientFeeling && (
                          <div className="p-2 rounded-lg st-surface-muted">
                            <span className="font-semibold">Ощущения клиента:</span> {ex.clientFeeling}
                          </div>
                        )}
                        {ex.trainerNote && (
                          <div className="p-2 rounded-lg st-surface-muted">
                            <span className="font-semibold">Заметка тренера:</span> {ex.trainerNote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Notes */}
          <div className="p-3.5 rounded-xl st-surface-muted border st-border">
            <div className="font-semibold mb-1">Итоговые заметки тренера</div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {session.notes || 'Заметки не добавлены.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
