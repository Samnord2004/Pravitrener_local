import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { clampDifficulty, DIFFICULTY_LEVELS, getDifficultyMeta } from '../utils/serviceCategories';

interface DifficultyStarsProps {
  /** Exact or average difficulty on a 1..5 scale */
  value: number;
  size?: 'xs' | 'sm';
  showNumeric?: boolean;
  showLabel?: boolean;
  className?: string;
}

export const DifficultyStars: React.FC<DifficultyStarsProps> = ({
  value,
  size = 'xs',
  showNumeric = false,
  showLabel = false,
  className = '',
}) => {
  const safeValue = Math.max(0, Math.min(5, Number(value) || 0));
  const rounded = clampDifficulty(Math.round(safeValue || 1));
  const meta = getDifficultyMeta(rounded);
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const displayNumeric = Number.isInteger(safeValue) ? `${safeValue}/5` : `${safeValue.toFixed(1)}/5`;

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={`Сложность: ${displayNumeric} · ${meta.shortLabel}`}
      aria-label={`Сложность ${displayNumeric} — ${meta.shortLabel}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= Math.round(safeValue);
          return (
            <Star
              key={star}
              className={`${iconSize} ${
                active
                  ? meta.starColorClass
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            />
          );
        })}
      </span>
      {showNumeric && (
        <span className="font-mono text-[10px] font-semibold tabular-nums st-muted">
          {displayNumeric}
        </span>
      )}
      {showLabel && (
        <span
          className={`px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${meta.badgeClass}`}
        >
          {meta.shortLabel}
        </span>
      )}
    </span>
  );
};

interface DifficultyStarPickerProps {
  value: number;
  onChange: (next: number) => void;
  label?: string;
}

export const DifficultyStarPicker: React.FC<DifficultyStarPickerProps> = ({
  value,
  onChange,
  label = 'Сложность упражнения (1–5 звёзд)',
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = clampDifficulty(value);
  const activePreview = hovered ?? current;
  const meta = getDifficultyMeta(activePreview);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span
          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border st-border st-surface-muted">
        {DIFFICULTY_LEVELS.map((lvl) => {
          const filled = lvl.value <= activePreview;
          const selected = lvl.value === current;
          return (
            <button
              key={lvl.value}
              type="button"
              onMouseEnter={() => setHovered(lvl.value)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange(lvl.value)}
              title={lvl.label}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-all cursor-pointer ${
                selected
                  ? 'st-surface border-current shadow-sm font-semibold'
                  : 'border-transparent hover:st-surface'
              }`}
            >
              <Star
                className={`w-4 h-4 transition-colors ${
                  filled ? meta.starColorClass : 'text-slate-300 dark:text-slate-600'
                }`}
              />
              <span className="font-mono text-[11px] tabular-nums">{lvl.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
