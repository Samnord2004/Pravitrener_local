import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingBadgeProps {
  average: number;
  count: number;
  compact?: boolean;
  emptyLabel?: string;
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  average,
  count,
  compact = false,
  emptyLabel = 'Нет оценок',
}) => {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 dark:text-slate-500">
        <Star className="w-3.5 h-3.5" />
        {!compact && <span>{emptyLabel}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-300 tabular-nums shrink-0">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
      <span>{average.toFixed(1)}</span>
      <span className="text-amber-600/75 dark:text-amber-400/75 font-normal">({count})</span>
    </span>
  );
};

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  size?: 'sm' | 'md';
}

export const StarRatingInput: React.FC<StarRatingInputProps> = ({
  value,
  onChange,
  size = 'md',
}) => {
  const [hovered, setHovered] = useState<number>(0);
  const display = hovered || value;
  const iconCls = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';

  return (
    <div className="inline-flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= display;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            aria-label={`Оценка ${star} из 5`}
            className="p-0.5 rounded transition-transform hover:scale-110 cursor-pointer"
          >
            <Star
              className={`${iconCls} ${
                filled
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};
