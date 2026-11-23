import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Sparkles } from 'lucide-react';
import type { MiScale2Metrics } from '../types';
import {
  evaluateMiScale2Metrics,
  type MiScaleMetricEvaluation,
  type ScaleZoneTone,
} from '../utils/miScale2Guide';

interface MiScale2BreakdownProps {
  metrics: MiScale2Metrics;
  gender: 'male' | 'female';
  ageYears: number;
  heightCm: number;
  compact?: boolean;
}

const TONE_BADGE_CLASS: Record<ScaleZoneTone, string> = {
  low: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
  normal:
    'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  good: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800',
  elevated:
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  high: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
};

const TONE_VALUE_CLASS: Record<ScaleZoneTone, string> = {
  low: 'text-sky-700 dark:text-sky-400',
  normal: 'text-emerald-700 dark:text-emerald-400',
  good: 'text-teal-700 dark:text-teal-400',
  elevated: 'text-amber-700 dark:text-amber-400',
  high: 'text-rose-700 dark:text-rose-400',
};

const TONE_BAR_CLASS: Record<ScaleZoneTone, string> = {
  low: 'bg-sky-400 dark:bg-sky-500',
  normal: 'bg-emerald-500 dark:bg-emerald-500',
  good: 'bg-teal-500 dark:bg-teal-400',
  elevated: 'bg-amber-400 dark:bg-amber-500',
  high: 'bg-rose-500 dark:bg-rose-500',
};

const TONE_MARKER_RING: Record<ScaleZoneTone, string> = {
  low: 'border-sky-600 bg-white dark:bg-slate-950',
  normal: 'border-emerald-600 bg-white dark:bg-slate-950',
  good: 'border-teal-600 bg-white dark:bg-slate-950',
  elevated: 'border-amber-600 bg-white dark:bg-slate-950',
  high: 'border-rose-600 bg-white dark:bg-slate-950',
};

const MetricScaleCard: React.FC<{
  item: MiScaleMetricEvaluation;
  expanded: boolean;
  onToggle: () => void;
}> = ({ item, expanded, onToggle }) => {
  const totalSpan = Math.max(0.001, item.scaleMax - item.scaleMin);

  return (
    <div
      className={`rounded-xl border transition-colors p-3.5 space-y-2.5 ${
        expanded
          ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-sm'
          : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Header: Metric title + Value + Dynamic Color Status Badge */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between gap-2 cursor-pointer"
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
            {item.title}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">{item.normRangeText}</div>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <div
            className={`font-mono text-base font-bold tabular-nums leading-none ${
              TONE_VALUE_CLASS[item.statusTone]
            }`}
          >
            {item.valueText}
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border leading-tight ${
                TONE_BADGE_CLASS[item.statusTone]
              }`}
            >
              {item.statusLabel}
            </span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {/* Color-Changing Multi-Zone Segmented Scale Bar with Needle Marker */}
      <div className="pt-1 pb-0.5 space-y-1">
        <div className="relative h-3 flex items-center">
          <div className="w-full h-2 rounded-full overflow-hidden flex gap-0.5 bg-slate-200 dark:bg-slate-800">
            {item.zones.map((z, idx) => {
              const clampedLow = Math.max(item.scaleMin, z.min);
              const clampedHigh = Math.min(item.scaleMax, z.max);
              const widthPct = Math.max(8, ((clampedHigh - clampedLow) / totalSpan) * 100);
              const isCurrent = z.label === item.statusLabel && z.tone === item.statusTone;
              return (
                <div
                  key={`${z.label}-${idx}`}
                  style={{ width: `${widthPct}%` }}
                  title={`${z.label}: ${z.min} – ${z.max}`}
                  className={`h-full transition-opacity ${TONE_BAR_CLASS[z.tone]} ${
                    isCurrent ? 'opacity-100' : 'opacity-45'
                  }`}
                />
              );
            })}
          </div>
          {/* Active Indicator Pin */}
          <div
            style={{ left: `${item.markerPct}%` }}
            className={`absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full border-[2.5px] shadow-sm transition-all ${
              TONE_MARKER_RING[item.statusTone]
            }`}
            title={`${item.valueText} — ${item.statusLabel}`}
          />
        </div>

        {/* Zone Labels Strip */}
        <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
          {item.zones.map((z, idx) => {
            const isCurrent = z.label === item.statusLabel && z.tone === item.statusTone;
            return (
              <span
                key={`${z.label}-lbl-${idx}`}
                className={`truncate ${
                  isCurrent ? `font-semibold ${TONE_VALUE_CLASS[z.tone]}` : 'opacity-75'
                }`}
              >
                {z.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Inline Explanation + Personal Decoding */}
      {expanded ? (
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 space-y-1.5 text-xs">
          <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Что это значит: </span>
            {item.meaning}
          </div>
          <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
            <span className="font-semibold">Расшифровка: </span>
            {item.advice}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug line-clamp-2">
          {item.advice}
        </p>
      )}
    </div>
  );
};

export const MiScale2Breakdown: React.FC<MiScale2BreakdownProps> = ({
  metrics,
  gender,
  ageYears,
  heightCm,
  compact = false,
}) => {
  const { items, extras } = useMemo(
    () => evaluateMiScale2Metrics(metrics, { gender, ageYears, heightCm }),
    [metrics, gender, ageYears, heightCm]
  );

  const [expandAll, setExpandAll] = useState(!compact);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const toggleItem = (key: string) => {
    setOpenKeys((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? expandAll),
    }));
  };

  const handleToggleAll = () => {
    const next = !expandAll;
    setExpandAll(next);
    const map: Record<string, boolean> = {};
    items.forEach((it) => {
      map[it.key] = next;
    });
    setOpenKeys(map);
  };

  const scoreItem = items.find((i) => i.key === 'bodyScore');
  const bmiItem = items.find((i) => i.key === 'bmi');

  return (
    <div className="space-y-4">
      {/* Header & Somatotype + Summary Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Показатели и расшифровка Mi Body Composition Scale 2
          </span>
          {scoreItem && (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                TONE_BADGE_CLASS[scoreItem.statusTone]
              }`}
            >
              Оценка: {metrics.bodyScore}/100 ({scoreItem.statusLabel})
            </span>
          )}
          {bmiItem && (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                TONE_BADGE_CLASS[bmiItem.statusTone]
              }`}
            >
              ИМТ {metrics.bmi} · {bmiItem.statusLabel}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleToggleAll}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-cyan-600" />
          <span>{expandAll ? 'Свернуть полные описания' : 'Развернуть все расшифровки'}</span>
        </button>
      </div>

      {/* Extra Clinical Insights: Somatotype, Impedance, Balance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {extras.map((ex) => (
          <div
            key={ex.key}
            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-600 shrink-0" />
                {ex.title}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  TONE_BADGE_CLASS[ex.statusTone]
                }`}
              >
                {ex.statusLabel}
              </span>
            </div>
            <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
              {ex.valueText}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              <span className="font-medium text-slate-700 dark:text-slate-300">{ex.meaning}</span>{' '}
              {ex.advice}
            </p>
          </div>
        ))}
      </div>

      {/* All 12 Core Mi Scale 2 Color-Scale Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((item) => {
          const isExpanded = openKeys[item.key] ?? expandAll;
          return (
            <MetricScaleCard
              key={item.key}
              item={item}
              expanded={isExpanded}
              onToggle={() => toggleItem(item.key)}
            />
          );
        })}
      </div>
    </div>
  );
};
