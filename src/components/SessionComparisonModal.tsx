import React, { useMemo, useState } from 'react';
import { X, GitCompare, Activity, Scale } from 'lucide-react';
import type { TelemetryPoint, TrainingSessionRecord } from '../types';

interface SessionComparisonModalProps {
  clientName: string;
  sessions: TrainingSessionRecord[];
  initialSessionAId?: string;
  initialSessionBId?: string;
  onClose: () => void;
}

type WinchChannelMode = 'total' | 'hands' | 'legs';
type EmgChannelMode = 'ch1' | 'ch2' | 'avg';

function buildFallbackSeries(session: TrainingSessionRecord): TelemetryPoint[] {
  if (session.telemetrySeries && session.telemetrySeries.length >= 2) {
    return session.telemetrySeries;
  }
  if (session.completedExercises.length > 0) {
    return session.completedExercises.map((ex, idx) => ({
      t: idx * 60,
      leftHandKg: ex.maxLimbLoads?.lh ?? Number((session.maxLimbLoads.lh * 0.85).toFixed(1)),
      rightHandKg: ex.maxLimbLoads?.rh ?? Number((session.maxLimbLoads.rh * 0.85).toFixed(1)),
      leftFootKg: ex.maxLimbLoads?.lf ?? Number((session.maxLimbLoads.lf * 0.85).toFixed(1)),
      rightFootKg: ex.maxLimbLoads?.rf ?? Number((session.maxLimbLoads.rf * 0.85).toFixed(1)),
      totalWinchKg: ex.maxWinchKg,
      heartRateBpm: session.avgHrBpm || 0,
      emgCh1Mv: ex.maxEmgMv ?? ex.avgEmgMv,
      emgCh2Mv: ex.maxEmgCh2Mv ?? ex.avgEmgCh2Mv ?? ex.avgEmgMv,
    }));
  }
  const minW = session.minWinchKg ?? Number((session.peakWinchKg * 0.35).toFixed(1));
  const peakW = session.peakWinchKg;
  const avgEmg1 = session.emgStats?.ch1AvgMv ?? 0.35;
  const maxEmg1 = session.emgStats?.ch1MaxMv ?? 0.55;
  const avgEmg2 = session.emgStats?.ch2AvgMv ?? 0.32;
  const maxEmg2 = session.emgStats?.ch2MaxMv ?? 0.5;
  return [
    {
      t: 0,
      leftHandKg: session.minLimbLoads?.lh ?? 0,
      rightHandKg: session.minLimbLoads?.rh ?? 0,
      leftFootKg: session.minLimbLoads?.lf ?? 0,
      rightFootKg: session.minLimbLoads?.rf ?? 0,
      totalWinchKg: minW,
      heartRateBpm: session.minHrBpm ?? session.avgHrBpm,
      emgCh1Mv: session.emgStats?.ch1MinMv ?? avgEmg1 * 0.7,
      emgCh2Mv: session.emgStats?.ch2MinMv ?? avgEmg2 * 0.7,
    },
    {
      t: Math.round(session.durationSec * 0.5),
      leftHandKg: session.maxLimbLoads.lh,
      rightHandKg: session.maxLimbLoads.rh,
      leftFootKg: session.maxLimbLoads.lf,
      rightFootKg: session.maxLimbLoads.rf,
      totalWinchKg: peakW,
      heartRateBpm: session.maxHrBpm ?? session.avgHrBpm,
      emgCh1Mv: maxEmg1,
      emgCh2Mv: maxEmg2,
    },
    {
      t: session.durationSec,
      leftHandKg: session.minLimbLoads?.lh ?? session.maxLimbLoads.lh * 0.5,
      rightHandKg: session.minLimbLoads?.rh ?? session.maxLimbLoads.rh * 0.5,
      leftFootKg: session.minLimbLoads?.lf ?? session.maxLimbLoads.lf * 0.5,
      rightFootKg: session.minLimbLoads?.rf ?? session.maxLimbLoads.rf * 0.5,
      totalWinchKg: minW,
      heartRateBpm: session.avgHrBpm,
      emgCh1Mv: avgEmg1,
      emgCh2Mv: avgEmg2,
    },
  ];
}

function sampleAtPct(
  series: TelemetryPoint[],
  pct: number,
  getter: (p: TelemetryPoint) => number
): number {
  if (series.length === 0) return 0;
  if (series.length === 1) return getter(series[0]);
  const fIdx = Math.max(0, Math.min(1, pct)) * (series.length - 1);
  const lo = Math.floor(fIdx);
  const hi = Math.min(series.length - 1, Math.ceil(fIdx));
  const frac = fIdx - lo;
  return getter(series[lo]) * (1 - frac) + getter(series[hi]) * frac;
}

function buildCurvePath(
  series: TelemetryPoint[],
  getter: (p: TelemetryPoint) => number,
  maxVal: number,
  width: number,
  height: number
): string {
  if (series.length === 0) return '';
  const padY = 14;
  const usableH = height - padY * 2;
  return series
    .map((p, i) => {
      const x = series.length === 1 ? width / 2 : (i / (series.length - 1)) * width;
      const ratio = Math.max(0, Math.min(1, getter(p) / Math.max(0.01, maxVal)));
      const y = height - padY - ratio * usableH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function formatSessionLabel(s: TrainingSessionRecord): string {
  const dateStr = (s.startedAt || s.endedAt || '').slice(0, 10) || '—';
  return `${dateStr} · ${s.programTitle} (${s.peakWinchKg.toFixed(0)} кг)`;
}

function avgRating(s: TrainingSessionRecord): number | null {
  const rated = s.completedExercises
    .map((e) => e.clientRating)
    .filter((v): v is number => typeof v === 'number');
  if (rated.length === 0) return null;
  return Number((rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1));
}

export const SessionComparisonModal: React.FC<SessionComparisonModalProps> = ({
  clientName,
  sessions,
  initialSessionAId,
  initialSessionBId,
  onClose,
}) => {
  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        (a.startedAt || a.endedAt || '').localeCompare(b.startedAt || b.endedAt || '')
      ),
    [sessions]
  );

  const defaultA =
    initialSessionAId ||
    (sorted.length >= 2 ? sorted[sorted.length - 2].id : sorted[0]?.id || '');
  const defaultB =
    initialSessionBId ||
    (sorted.length >= 1 ? sorted[sorted.length - 1].id : '');

  const [sessionAId, setSessionAId] = useState(defaultA);
  const [sessionBId, setSessionBId] = useState(defaultB);
  const [winchMode, setWinchMode] = useState<WinchChannelMode>('total');
  const [emgMode, setEmgMode] = useState<EmgChannelMode>('ch1');
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const sessionA = sorted.find((s) => s.id === sessionAId) || sorted[0];
  const sessionB = sorted.find((s) => s.id === sessionBId) || sorted[sorted.length - 1];

  const seriesA = useMemo(() => (sessionA ? buildFallbackSeries(sessionA) : []), [sessionA]);
  const seriesB = useMemo(() => (sessionB ? buildFallbackSeries(sessionB) : []), [sessionB]);

  const winchGetter = useMemo(() => {
    if (winchMode === 'hands') {
      return (p: TelemetryPoint) => Number(((p.leftHandKg + p.rightHandKg) / 2).toFixed(1));
    }
    if (winchMode === 'legs') {
      return (p: TelemetryPoint) => Number(((p.leftFootKg + p.rightFootKg) / 2).toFixed(1));
    }
    return (p: TelemetryPoint) => p.totalWinchKg;
  }, [winchMode]);

  const emgGetter = useMemo(() => {
    if (emgMode === 'ch2') return (p: TelemetryPoint) => p.emgCh2Mv;
    if (emgMode === 'avg') return (p: TelemetryPoint) => (p.emgCh1Mv + p.emgCh2Mv) / 2;
    return (p: TelemetryPoint) => p.emgCh1Mv;
  }, [emgMode]);

  const maxWinchY = useMemo(() => {
    const vals = [...seriesA.map(winchGetter), ...seriesB.map(winchGetter)];
    return Math.max(40, ...vals) * 1.1;
  }, [seriesA, seriesB, winchGetter]);

  const maxEmgY = useMemo(() => {
    const vals = [...seriesA.map(emgGetter), ...seriesB.map(emgGetter)];
    return Math.max(0.5, ...vals) * 1.15;
  }, [seriesA, seriesB, emgGetter]);

  const W = 680;
  const H = 190;

  const winchPathA = buildCurvePath(seriesA, winchGetter, maxWinchY, W, H);
  const winchPathB = buildCurvePath(seriesB, winchGetter, maxWinchY, W, H);
  const emgPathA = buildCurvePath(seriesA, emgGetter, maxEmgY, W, H);
  const emgPathB = buildCurvePath(seriesB, emgGetter, maxEmgY, W, H);

  const hoverStats =
    hoverPct !== null && sessionA && sessionB
      ? {
          pct: Math.round(hoverPct * 100),
          winchA: sampleAtPct(seriesA, hoverPct, winchGetter),
          winchB: sampleAtPct(seriesB, hoverPct, winchGetter),
          emgA: sampleAtPct(seriesA, hoverPct, emgGetter),
          emgB: sampleAtPct(seriesB, hoverPct, emgGetter),
        }
      : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    setHoverPct(pct);
  };

  if (!sessionA || !sessionB) {
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-4">
        <div className="max-w-md w-full rounded-2xl st-surface border st-border p-6 space-y-3">
          <div className="font-semibold">Недостаточно тренировок для сравнения</div>
          <p className="text-xs st-muted">
            Для сравнения динамики показателей у клиента должно быть проведено минимум 2 сессии.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  const sameSessionWarning = sessionA.id === sessionB.id;
  const ratingA = avgRating(sessionA);
  const ratingB = avgRating(sessionB);

  const formatDiff = (a: number | undefined, b: number | undefined, unit: string, digits = 1) => {
    if (a === undefined || b === undefined) return '—';
    const d = b - a;
    return `${d >= 0 ? '+' : ''}${d.toFixed(digits)} ${unit}`;
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-hidden"
    >
      <div className="w-full max-w-5xl max-h-[92dvh] flex flex-col rounded-2xl st-surface border st-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b st-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
              <GitCompare className="w-4 h-4" />
              <span>Сравнение двух тренировочных сессий (наложенные кривые)</span>
            </div>
            <h3 className="font-display text-lg font-bold truncate mt-0.5">{clientName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border st-border hover:opacity-80 cursor-pointer shrink-0"
            aria-label="Закрыть сравнение"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Session Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border-2 border-cyan-500/60 bg-cyan-50/40 dark:bg-cyan-950/20 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-cyan-700 dark:text-cyan-300">
                <span className="w-3 h-1.5 rounded-full bg-cyan-500 inline-block" />
                <span>Сессия A (базовая)</span>
              </div>
              <select
                value={sessionA.id}
                onChange={(e) => setSessionAId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
              >
                {sorted.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSessionLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl border-2 border-pink-500/60 bg-pink-50/40 dark:bg-pink-950/20 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-pink-700 dark:text-pink-300">
                <span className="w-3 h-1.5 rounded-full bg-pink-500 inline-block" />
                <span>Сессия B (сравниваемая)</span>
              </div>
              <select
                value={sessionB.id}
                onChange={(e) => setSessionBId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
              >
                {sorted.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSessionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sameSessionWarning && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200">
              Выбрана одна и та же тренировка — выберите две разные сессии, чтобы увидеть динамику и расхождение кривых.
            </div>
          )}

          {/* Chart 1: Overlaid Tensometers */}
          <div className="p-4 rounded-xl border st-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-cyan-600" />
                <span className="font-display font-semibold text-sm">
                  Тензодатчики конечностей: наложенная динамика нагрузки (кг)
                </span>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg st-surface-muted border st-border">
                {(
                  [
                    ['total', 'Общая тяга'],
                    ['hands', 'Руки (ср.)'],
                    ['legs', 'Ноги (ср.)'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWinchMode(m)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      winchMode === m ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative rounded-xl bg-slate-950 p-3 border border-slate-800">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-44 overflow-visible cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverPct(null)}
              >
                {[0.25, 0.5, 0.75].map((r) => (
                  <line
                    key={r}
                    x1={0}
                    y1={H * r}
                    x2={W}
                    y2={H * r}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                ))}
                <path
                  d={winchPathA}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={winchPathB}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {hoverPct !== null && (
                  <line
                    x1={hoverPct * W}
                    y1={0}
                    x2={hoverPct * W}
                    y2={H}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    strokeWidth="1.2"
                  />
                )}
              </svg>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-cyan-400">
                    <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
                    Сессия A ({(sessionA.startedAt || '').slice(0, 10)})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-pink-400">
                    <span className="w-3 h-0.5 bg-pink-400 inline-block" />
                    Сессия B ({(sessionB.startedAt || '').slice(0, 10)})
                  </span>
                </div>
                {hoverStats ? (
                  <span className="font-mono text-slate-200 tabular-nums">
                    Прогресс {hoverStats.pct}%: A={hoverStats.winchA.toFixed(1)} кг · B=
                    {hoverStats.winchB.toFixed(1)} кг (Δ{' '}
                    {hoverStats.winchB - hoverStats.winchA >= 0 ? '+' : ''}
                    {(hoverStats.winchB - hoverStats.winchA).toFixed(1)} кг)
                  </span>
                ) : (
                  <span>Шкала: 0 → 100% длительности сессии · Наведите курсор для сравнения</span>
                )}
              </div>
            </div>
          </div>

          {/* Chart 2: Overlaid Myo-Sensors (EMG) */}
          <div className="p-4 rounded-xl border st-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" />
                <span className="font-display font-semibold text-sm">
                  Миодатчики: наложенная динамика ЭМГ-активности (мВ)
                </span>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg st-surface-muted border st-border">
                {(
                  [
                    ['ch1', 'Канал CH1'],
                    ['ch2', 'Канал CH2'],
                    ['avg', 'Среднее CH1/CH2'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEmgMode(m)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      emgMode === m ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative rounded-xl bg-slate-950 p-3 border border-slate-800">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-44 overflow-visible cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverPct(null)}
              >
                {[0.25, 0.5, 0.75].map((r) => (
                  <line
                    key={r}
                    x1={0}
                    y1={H * r}
                    x2={W}
                    y2={H * r}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                ))}
                <path
                  d={emgPathA}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={emgPathB}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {hoverPct !== null && (
                  <line
                    x1={hoverPct * W}
                    y1={0}
                    x2={hoverPct * W}
                    y2={H}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    strokeWidth="1.2"
                  />
                )}
              </svg>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-cyan-400">
                    <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
                    Сессия A ({(sessionA.startedAt || '').slice(0, 10)})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-pink-400">
                    <span className="w-3 h-0.5 bg-pink-400 inline-block" />
                    Сессия B ({(sessionB.startedAt || '').slice(0, 10)})
                  </span>
                </div>
                {hoverStats ? (
                  <span className="font-mono text-slate-200 tabular-nums">
                    Прогресс {hoverStats.pct}%: A={hoverStats.emgA.toFixed(2)} мВ · B=
                    {hoverStats.emgB.toFixed(2)} мВ (Δ{' '}
                    {hoverStats.emgB - hoverStats.emgA >= 0 ? '+' : ''}
                    {(hoverStats.emgB - hoverStats.emgA).toFixed(2)} мВ)
                  </span>
                ) : (
                  <span>Наведите курсор на график для пошагового сравнения ЭМГ</span>
                )}
              </div>
            </div>
          </div>

          {/* Side-by-Side Metrics Comparison Table */}
          <div className="rounded-xl border st-border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="st-surface-muted border-b st-border text-[11px] uppercase tracking-wider">
                  <th className="px-3.5 py-2.5 font-semibold">Показатель</th>
                  <th className="px-3.5 py-2.5 font-semibold text-cyan-700 dark:text-cyan-400">
                    Сессия A ({(sessionA.startedAt || '').slice(0, 10)})
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-pink-700 dark:text-pink-400">
                    Сессия B ({(sessionB.startedAt || '').slice(0, 10)})
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold">Динамика (B − A)</th>
                </tr>
              </thead>
              <tbody className="divide-y st-border font-mono text-xs tabular-nums">
                <tr>
                  <td className="px-3.5 py-2 font-sans">Макс. тяга (тензодатчики)</td>
                  <td className="px-3.5 py-2">{sessionA.peakWinchKg.toFixed(1)} кг</td>
                  <td className="px-3.5 py-2">{sessionB.peakWinchKg.toFixed(1)} кг</td>
                  <td className="px-3.5 py-2 font-semibold">
                    {formatDiff(sessionA.peakWinchKg, sessionB.peakWinchKg, 'кг')}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Симметрия нагрузки</td>
                  <td className="px-3.5 py-2">{sessionA.avgSymmetryPct}%</td>
                  <td className="px-3.5 py-2">{sessionB.avgSymmetryPct}%</td>
                  <td className="px-3.5 py-2 font-semibold">
                    {formatDiff(sessionA.avgSymmetryPct, sessionB.avgSymmetryPct, '%', 0)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Руки макс. (Л / П)</td>
                  <td className="px-3.5 py-2">
                    {sessionA.maxLimbLoads.lh.toFixed(1)} / {sessionA.maxLimbLoads.rh.toFixed(1)} кг
                  </td>
                  <td className="px-3.5 py-2">
                    {sessionB.maxLimbLoads.lh.toFixed(1)} / {sessionB.maxLimbLoads.rh.toFixed(1)} кг
                  </td>
                  <td className="px-3.5 py-2">
                    {formatDiff(sessionA.maxLimbLoads.lh, sessionB.maxLimbLoads.lh, 'кг')} /{' '}
                    {formatDiff(sessionA.maxLimbLoads.rh, sessionB.maxLimbLoads.rh, 'кг')}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Ноги макс. (Л / П)</td>
                  <td className="px-3.5 py-2">
                    {sessionA.maxLimbLoads.lf.toFixed(1)} / {sessionA.maxLimbLoads.rf.toFixed(1)} кг
                  </td>
                  <td className="px-3.5 py-2">
                    {sessionB.maxLimbLoads.lf.toFixed(1)} / {sessionB.maxLimbLoads.rf.toFixed(1)} кг
                  </td>
                  <td className="px-3.5 py-2">
                    {formatDiff(sessionA.maxLimbLoads.lf, sessionB.maxLimbLoads.lf, 'кг')} /{' '}
                    {formatDiff(sessionA.maxLimbLoads.rf, sessionB.maxLimbLoads.rf, 'кг')}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Миодатчики CH1 (ср. / макс.)</td>
                  <td className="px-3.5 py-2">
                    {sessionA.emgStats
                      ? `${sessionA.emgStats.ch1AvgMv.toFixed(2)} / ${sessionA.emgStats.ch1MaxMv.toFixed(2)} мВ`
                      : '—'}
                  </td>
                  <td className="px-3.5 py-2">
                    {sessionB.emgStats
                      ? `${sessionB.emgStats.ch1AvgMv.toFixed(2)} / ${sessionB.emgStats.ch1MaxMv.toFixed(2)} мВ`
                      : '—'}
                  </td>
                  <td className="px-3.5 py-2 font-semibold">
                    {formatDiff(
                      sessionA.emgStats?.ch1AvgMv,
                      sessionB.emgStats?.ch1AvgMv,
                      'мВ',
                      2
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Миодатчики CH2 (ср. / макс.)</td>
                  <td className="px-3.5 py-2">
                    {sessionA.emgStats
                      ? `${sessionA.emgStats.ch2AvgMv.toFixed(2)} / ${sessionA.emgStats.ch2MaxMv.toFixed(2)} мВ`
                      : '—'}
                  </td>
                  <td className="px-3.5 py-2">
                    {sessionB.emgStats
                      ? `${sessionB.emgStats.ch2AvgMv.toFixed(2)} / ${sessionB.emgStats.ch2MaxMv.toFixed(2)} мВ`
                      : '—'}
                  </td>
                  <td className="px-3.5 py-2 font-semibold">
                    {formatDiff(
                      sessionA.emgStats?.ch2AvgMv,
                      sessionB.emgStats?.ch2AvgMv,
                      'мВ',
                      2
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Пульсометр (средний ЧСС)</td>
                  <td className="px-3.5 py-2">
                    {sessionA.avgHrBpm > 0 ? `${sessionA.avgHrBpm} уд/мин` : '—'}
                  </td>
                  <td className="px-3.5 py-2">
                    {sessionB.avgHrBpm > 0 ? `${sessionB.avgHrBpm} уд/мин` : '—'}
                  </td>
                  <td className="px-3.5 py-2 font-semibold">
                    {sessionA.avgHrBpm > 0 && sessionB.avgHrBpm > 0
                      ? formatDiff(sessionA.avgHrBpm, sessionB.avgHrBpm, 'уд/мин', 0)
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="px-3.5 py-2 font-sans">Средняя оценка упражнений</td>
                  <td className="px-3.5 py-2">{ratingA !== null ? `${ratingA} / 5 ★` : '—'}</td>
                  <td className="px-3.5 py-2">{ratingB !== null ? `${ratingB} / 5 ★` : '—'}</td>
                  <td className="px-3.5 py-2 font-semibold">
                    {ratingA !== null && ratingB !== null
                      ? formatDiff(ratingA, ratingB, '★', 1)
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
