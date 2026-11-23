import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Baby,
  Briefcase,
  CheckCircle2,
  Dumbbell,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import type { MethodologyProgramBlock } from '../types';
import { DEFAULT_METHODOLOGY_BLOCKS } from '../utils/brandAbout';

interface MethodologyBlocksExplorerProps {
  blocks?: MethodologyProgramBlock[];
  initialBlockId?: string;
  onChooseMethodology?: (block: MethodologyProgramBlock) => void;
}

const ACCENT_STYLE_MAP: Record<
  NonNullable<MethodologyProgramBlock['accentTone']>,
  {
    activeTab: string;
    badge: string;
    promo: string;
    numberBg: string;
    borderAccent: string;
  }
> = {
  cyan: {
    activeTab: 'bg-cyan-600 text-white border-cyan-600 shadow-sm',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800',
    promo: 'bg-rose-600 text-white',
    numberBg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
    borderAccent: 'border-l-4 border-l-cyan-600',
  },
  violet: {
    activeTab: 'bg-indigo-600 text-white border-indigo-600 shadow-sm',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    promo: 'bg-indigo-600 text-white',
    numberBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
    borderAccent: 'border-l-4 border-l-indigo-600',
  },
  emerald: {
    activeTab: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    promo: 'bg-emerald-600 text-white',
    numberBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    borderAccent: 'border-l-4 border-l-emerald-600',
  },
  amber: {
    activeTab: 'bg-amber-600 text-white border-amber-600 shadow-sm',
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    promo: 'bg-amber-600 text-white',
    numberBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    borderAccent: 'border-l-4 border-l-amber-500',
  },
  rose: {
    activeTab: 'bg-rose-600 text-white border-rose-600 shadow-sm',
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    promo: 'bg-rose-600 text-white',
    numberBg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
    borderAccent: 'border-l-4 border-l-rose-500',
  },
};

function renderSlugIcon(slug: string, className = 'w-4 h-4 shrink-0') {
  if (slug === 'sport') return <Dumbbell className={className} />;
  if (slug === 'office') return <Briefcase className={className} />;
  if (slug === 'age') return <HeartHandshake className={className} />;
  if (slug === 'kids') return <Baby className={className} />;
  if (slug === 'moms') return <Users className={className} />;
  return <Sparkles className={className} />;
}

export const MethodologyBlocksExplorer: React.FC<MethodologyBlocksExplorerProps> = ({
  blocks,
  initialBlockId,
  onChooseMethodology,
}) => {
  const activeBlocks = useMemo(() => {
    const source = blocks && blocks.length > 0 ? blocks : DEFAULT_METHODOLOGY_BLOCKS;
    const filtered = source.filter((b) => b.active !== false);
    return filtered.length > 0 ? filtered : source;
  }, [blocks]);

  const [selectedId, setSelectedId] = useState<string>(
    () => initialBlockId || activeBlocks[0]?.id || ''
  );

  useEffect(() => {
    if (initialBlockId && activeBlocks.some((b) => b.id === initialBlockId)) {
      setSelectedId(initialBlockId);
    }
  }, [initialBlockId, activeBlocks]);

  useEffect(() => {
    if (!activeBlocks.some((b) => b.id === selectedId) && activeBlocks[0]) {
      setSelectedId(activeBlocks[0].id);
    }
  }, [activeBlocks, selectedId]);

  const current = useMemo(
    () => activeBlocks.find((b) => b.id === selectedId) || activeBlocks[0],
    [activeBlocks, selectedId]
  );

  if (!current) return null;

  const tone = ACCENT_STYLE_MAP[current.accentTone || 'cyan'];

  return (
    <section className="rounded-2xl st-surface border st-border p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider st-accent-text font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Изучение и выбор направления</span>
          </div>
          <h3 className="font-display text-lg sm:text-xl font-bold">
            Методика ПравИло для ваших целей и возраста
          </h3>
          <p className="text-xs st-muted">
            Выберите подходящий блок ниже, чтобы изучить эффекты, причины заниматься и сразу перейти к записи.
          </p>
        </div>
      </div>

      {/* Audience / Program Selector Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {activeBlocks.map((block) => {
          const isSelected = block.id === current.id;
          const blockTone = ACCENT_STYLE_MAP[block.accentTone || 'cyan'];
          return (
            <button
              key={block.id}
              type="button"
              onClick={() => setSelectedId(block.id)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                isSelected
                  ? blockTone.activeTab
                  : 'st-surface-muted st-border hover:opacity-85'
              }`}
            >
              <span className="shrink-0">{renderSlugIcon(block.slug, 'w-4 h-4')}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate leading-tight">
                  {block.title}
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    isSelected ? 'text-white/85' : 'st-muted'
                  }`}
                >
                  {block.badge}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Presentation Block Showcase */}
      <div className={`rounded-2xl st-surface-muted border st-border overflow-hidden ${tone.borderAccent}`}>
        {/* Hero Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 sm:p-6 items-center">
          <div className={`${current.heroImageUrl ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${tone.badge}`}
              >
                {renderSlugIcon(current.slug, 'w-3.5 h-3.5')}
                <span>{current.badge}</span>
              </span>
              {current.promoBadge && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${tone.promo}`}
                >
                  <Tag className="w-3 h-3" />
                  <span>{current.promoBadge}</span>
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h4 className="font-display text-xl sm:text-2xl font-bold">{current.title}</h4>
              {current.subtitle && (
                <p className="text-xs sm:text-sm font-medium st-accent-text">{current.subtitle}</p>
              )}
            </div>

            {current.quoteOrMotto && (
              <blockquote className="px-3.5 py-2.5 rounded-xl st-surface border st-border text-xs sm:text-sm font-medium italic">
                «{current.quoteOrMotto}»
              </blockquote>
            )}

            <p className="text-xs sm:text-sm st-muted leading-relaxed whitespace-pre-line">
              {current.summary}
            </p>

            {current.recommendedServiceHint && (
              <div className="text-xs">
                <span className="st-muted">Рекомендуемое направление: </span>
                <span className="font-semibold">{current.recommendedServiceHint}</span>
              </div>
            )}

            {onChooseMethodology && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onChooseMethodology(current)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl st-accent-bg text-xs font-semibold cursor-pointer hover:opacity-90"
                >
                  <span>Выбрать эту методику и записаться</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {current.heroImageUrl && (
            <div className="lg:col-span-5">
              <div className="aspect-[16/10] rounded-xl overflow-hidden border st-border bg-slate-200 dark:bg-slate-800 shadow-sm">
                <img
                  src={current.heroImageUrl}
                  alt={current.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        {/* Slide Feature Cards */}
        {current.featureCards.length > 0 && (
          <div className="px-5 sm:px-6 pb-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider st-muted">
              Ключевые акценты программы
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {current.featureCards.map((card) => (
                <div
                  key={card.id}
                  className="p-3.5 rounded-xl st-surface border st-border space-y-1.5"
                >
                  <div className="font-display text-sm font-bold">{card.heading}</div>
                  <p className="text-xs st-muted leading-relaxed">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reasons List + Safety Note */}
        {(current.reasons.length > 0 || current.contraindicationsNote) && (
          <div className="px-5 sm:px-6 pb-6 pt-2 border-t st-border grid grid-cols-1 lg:grid-cols-12 gap-5">
            {current.reasons.length > 0 && (
              <div className="lg:col-span-8 space-y-2.5 pt-2">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{current.reasonsTitle || 'Причины выбрать это направление'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {current.reasons.map((reason, idx) => (
                    <div
                      key={`${current.id}-rs-${idx}`}
                      className="flex items-start gap-2 text-xs leading-relaxed"
                    >
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${tone.numberBg}`}
                      >
                        {idx + 1}
                      </span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {current.contraindicationsNote && (
              <div
                className={`${
                  current.reasons.length > 0 ? 'lg:col-span-4' : 'lg:col-span-12'
                } pt-2`}
              >
                <div className="p-3.5 rounded-xl st-surface border st-border space-y-1.5 h-full flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Протокол и подготовка</span>
                    </div>
                    <p className="text-xs st-muted leading-relaxed">
                      {current.contraindicationsNote}
                    </p>
                  </div>
                  {onChooseMethodology && (
                    <button
                      type="button"
                      onClick={() => onChooseMethodology(current)}
                      className="w-full py-2 px-3 rounded-lg border st-border st-surface-muted text-xs font-semibold hover:opacity-85 cursor-pointer"
                    >
                      Записаться по программе →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
