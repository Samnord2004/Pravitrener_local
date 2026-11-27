import React, { useState } from 'react';
import { Star, MessageSquareText, Activity, CheckCircle2, X } from 'lucide-react';
import type { CompletedExerciseLog } from '../types';

export interface PendingExerciseStats {
  exerciseId: string;
  title: string;
  durationSec: number;
  minWinchKg: number;
  maxWinchKg: number;
  minLimbLoads: { lh: number; rh: number; lf: number; rf: number };
  maxLimbLoads: { lh: number; rh: number; lf: number; rf: number };
  minEmgMv: number;
  avgEmgMv: number;
  maxEmgMv: number;
  minEmgCh2Mv: number;
  avgEmgCh2Mv: number;
  maxEmgCh2Mv: number;
}

interface ExerciseFeedbackModalProps {
  stats: PendingExerciseStats;
  clientName: string;
  onSave: (completedLog: CompletedExerciseLog) => void;
  onCancel?: () => void;
}

const FEELING_CHIPS = [
  'Комфортная декомпрессия',
  'Лёгкость в спине',
  'Расслабление плеч и шеи',
  'Тянущее ощущение по линии',
  'Напряжение в пояснице',
  'Лёгкое головокружение',
];

export const ExerciseFeedbackModal: React.FC<ExerciseFeedbackModalProps> = ({
  stats,
  clientName,
  onSave,
  onCancel,
}) => {
  const [clientRating, setClientRating] = useState<number>(5);
  const [discomfortLevel, setDiscomfortLevel] = useState<number>(1);
  const [clientFeeling, setClientFeeling] = useState<string>('');
  const [trainerNote, setTrainerNote] = useState<string>('');

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const toggleChip = (chip: string) => {
    setClientFeeling((prev) => {
      const parts = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.includes(chip)) {
        return parts.filter((p) => p !== chip).join(', ');
      }
      return [...parts, chip].join(', ');
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      exerciseId: stats.exerciseId,
      title: stats.title,
      durationSec: stats.durationSec,
      minWinchKg: Number(stats.minWinchKg.toFixed(1)),
      maxWinchKg: Number(stats.maxWinchKg.toFixed(1)),
      minLimbLoads: stats.minLimbLoads,
      maxLimbLoads: stats.maxLimbLoads,
      minEmgMv: Number(stats.minEmgMv.toFixed(2)),
      avgEmgMv: Number(stats.avgEmgMv.toFixed(2)),
      maxEmgMv: Number(stats.maxEmgMv.toFixed(2)),
      minEmgCh2Mv: Number(stats.minEmgCh2Mv.toFixed(2)),
      avgEmgCh2Mv: Number(stats.avgEmgCh2Mv.toFixed(2)),
      maxEmgCh2Mv: Number(stats.maxEmgCh2Mv.toFixed(2)),
      clientRating,
      discomfortLevel,
      clientFeeling: clientFeeling.trim() || undefined,
      trainerNote: trainerNote.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              Завершение упражнения · {clientName}
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold truncate mt-0.5">
              {stats.title}
            </h3>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Закрыть окно оценки"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:opacity-80 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 max-h-[75dvh] overflow-y-auto">
          {/* Recorded Sensor Min/Max Snapshot */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] text-slate-500">Длительность</div>
              <div className="font-mono font-bold text-sm mt-0.5 tabular-nums">
                {formatDuration(stats.durationSec)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] text-slate-500">Тяга (мин / макс)</div>
              <div className="font-mono font-bold text-sm mt-0.5 tabular-nums text-cyan-700 dark:text-cyan-400">
                {stats.minWinchKg.toFixed(1)} / {stats.maxWinchKg.toFixed(1)} кг
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] text-slate-500">Миодатчики (мин / макс)</div>
              <div className="font-mono font-bold text-sm mt-0.5 tabular-nums text-amber-600 dark:text-amber-400">
                {stats.minEmgMv.toFixed(2)} / {stats.maxEmgMv.toFixed(2)} мВ
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-mono text-slate-600 dark:text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-1.5 tabular-nums">
            <span>Л. рука: {stats.minLimbLoads.lh.toFixed(1)}–{stats.maxLimbLoads.lh.toFixed(1)} кг</span>
            <span>П. рука: {stats.minLimbLoads.rh.toFixed(1)}–{stats.maxLimbLoads.rh.toFixed(1)} кг</span>
            <span>Л. нога: {stats.minLimbLoads.lf.toFixed(1)}–{stats.maxLimbLoads.lf.toFixed(1)} кг</span>
            <span>П. нога: {stats.minLimbLoads.rf.toFixed(1)}–{stats.maxLimbLoads.rf.toFixed(1)} кг</span>
          </div>

          {/* Client Rating (1-5 Stars) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Оценка упражнения клиентом (1–5)
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= clientRating;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setClientRating(star)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${active ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span>{star}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discomfort Level (0-10) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Степень дискомфорта клиента (0 — нет, 10 — выражен)
              </label>
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                  discomfortLevel >= 7
                    ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                    : discomfortLevel >= 4
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {discomfortLevel} / 10
              </span>
            </div>
            <div className="grid grid-cols-11 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDiscomfortLevel(lvl)}
                  className={`py-1.5 rounded-lg border font-mono text-xs font-semibold cursor-pointer transition-colors ${
                    discomfortLevel === lvl
                      ? lvl >= 7
                        ? 'bg-red-600 border-red-600 text-white'
                        : lvl >= 4
                        ? 'bg-amber-500 border-amber-500 text-slate-950'
                        : 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Feelings & Quick Chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Ощущения клиента во время и сразу после упражнения
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {FEELING_CHIPS.map((chip) => {
                const selected = clientFeeling.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleChip(chip)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                      selected
                        ? 'border-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={clientFeeling}
              onChange={(e) => setClientFeeling(e.target.value)}
              placeholder="Опишите со слов клиента: где тянуло, стало ли легче..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          {/* Trainer Note */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              <MessageSquareText className="w-3.5 h-3.5 text-cyan-600" />
              <span>Заметка тренера по отзыву клиента</span>
            </label>
            <textarea
              rows={2}
              value={trainerNote}
              onChange={(e) => setTrainerNote(e.target.value)}
              placeholder="Рекомендации на следующий подход/сессию, корректировка углов, реакция мышц..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <span>Мин/макс датчиков зафиксированы для отчёта</span>
          </span>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-cyan-600 text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Сохранить оценку упражнения</span>
          </button>
        </div>
      </form>
    </div>
  );
};
