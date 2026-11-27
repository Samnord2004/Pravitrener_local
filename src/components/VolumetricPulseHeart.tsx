import React from 'react';

interface VolumetricPulseHeartProps {
  bpm: number;
  connected?: boolean;
  sensorContact?: boolean;
  compact?: boolean;
  overlay?: boolean;
  minBpm?: number;
  maxBpm?: number;
}

export const VolumetricPulseHeart: React.FC<VolumetricPulseHeartProps> = ({
  bpm,
  connected = false,
  sensorContact,
  compact = false,
  overlay = false,
  minBpm,
  maxBpm,
}) => {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : 0;
  const beating = safeBpm > 0;
  const beatDurationSec = beating
    ? (60 / Math.max(35, Math.min(220, safeBpm))).toFixed(3)
    : undefined;

  const sizePx = overlay ? 42 : compact ? 52 : 76;

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${
        overlay
          ? 'px-2.5 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-sm border border-rose-500/70 shadow-lg text-white'
          : ''
      }`}
    >
      <div
        className={`relative flex items-center justify-center ${
          beating ? 'animate-heart-lubdub' : 'opacity-70'
        }`}
        style={{
          width: sizePx,
          height: sizePx,
          ...(beating ? { animationDuration: `${beatDurationSec}s` } : {}),
        }}
        title={
          beating
            ? `Пульс: ${safeBpm} уд/мин (интервал ${beatDurationSec} с)`
            : 'Ожидание сигнала пульсометра'
        }
      >
        {/* Outer radial glow */}
        {beating && (
          <div
            className="absolute inset-0.5 rounded-full bg-rose-500/35 blur-md pointer-events-none"
            aria-hidden="true"
          />
        )}
        <svg
          viewBox="0 0 120 112"
          className="w-full h-full drop-shadow-[0_6px_12px_rgba(225,29,72,0.5)]"
          aria-label={beating ? `Пульс ${safeBpm} ударов в минуту` : 'Пульсометр не активен'}
        >
          <defs>
            <radialGradient id="heartVolumetricGrad" cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#ff758f" />
              <stop offset="35%" stopColor="#f43f5e" />
              <stop offset="72%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </radialGradient>
            <linearGradient id="heartRimHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe4e6" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#fda4af" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#4c0519" stopOpacity="0.55" />
            </linearGradient>
            <radialGradient id="heartSpecular" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 3D Volumetric Heart Body */}
          <path
            d="M60 103 C57 100 11 70 11 36 C11 18 25 6 41 6 C51 6 57 12 60 19 C63 12 69 6 79 6 C95 6 109 18 109 36 C109 70 63 100 60 103 Z"
            fill="url(#heartVolumetricGrad)"
            stroke="url(#heartRimHighlight)"
            strokeWidth="2.4"
          />

          {/* Lower depth shadow contour */}
          <path
            d="M21 53 C31 74 52 90 60 96 C69 89 91 72 100 50 C88 70 66 84 60 88 C51 82 32 69 21 53 Z"
            fill="#4c0519"
            opacity="0.32"
          />

          {/* Upper-left glossy 3D highlight */}
          <ellipse
            cx="36"
            cy="28"
            rx="14"
            ry="8.5"
            transform="rotate(-28 36 28)"
            fill="url(#heartSpecular)"
          />
          <circle cx="26" cy="40" r="3.6" fill="#ffffff" opacity="0.55" />
          <ellipse
            cx="84"
            cy="26"
            rx="8"
            ry="4"
            transform="rotate(24 84 26)"
            fill="#ffe4e6"
            opacity="0.35"
          />
        </svg>
      </div>

      <div className="mt-0.5 text-center leading-tight">
        <div
          className={`font-mono font-extrabold tabular-nums tracking-tight ${
            overlay ? 'text-rose-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          <span className={overlay ? 'text-lg sm:text-xl' : compact ? 'text-xl' : 'text-3xl'}>
            {beating ? safeBpm : '—'}
          </span>
          <span
            className={`ml-1 text-[10px] font-semibold ${
              overlay ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            уд/м
          </span>
        </div>
        {!beating && connected && (
          <div className="text-[9px] font-medium text-amber-400 mt-0.5 whitespace-nowrap">
            {sensorContact === false ? 'Нет контакта' : 'Поиск пульса...'}
          </div>
        )}
        {!beating && !connected && (
          <div
            className={`text-[9px] mt-0.5 whitespace-nowrap ${
              overlay ? 'text-slate-300' : 'text-slate-400'
            }`}
          >
            Пульс —
          </div>
        )}
        {beating && (minBpm || maxBpm) && (
          <div
            className={`text-[9px] font-mono tabular-nums mt-0.5 whitespace-nowrap ${
              overlay ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            мин {minBpm ?? safeBpm} · макс {maxBpm ?? safeBpm}
          </div>
        )}
      </div>
    </div>
  );
};
