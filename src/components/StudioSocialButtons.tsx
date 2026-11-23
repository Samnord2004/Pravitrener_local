import React from 'react';
import {
  Building2,
  CheckCircle2,
  Compass,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  BrandAboutInfo,
  MethodologyProgramBlock,
  Studio,
  StudioSocialLinks,
} from '../types';
import {
  STUDIO_SOCIAL_LABELS,
  normalizeStudioSocialUrl,
} from '../utils/brandAbout';
import { MethodologyBlocksExplorer } from './MethodologyBlocksExplorer';

export const StudioSocialButtons: React.FC<{
  socials?: StudioSocialLinks;
  compact?: boolean;
}> = ({ socials, compact = false }) => {
  if (!socials) return null;
  const order: (keyof StudioSocialLinks)[] = [
    'website',
    'telegram',
    'vk',
    'whatsapp',
    'instagram',
    'youtube',
  ];
  const items = order
    .map((key) => ({
      key,
      label: STUDIO_SOCIAL_LABELS[key],
      href: normalizeStudioSocialUrl(key, socials[key]),
    }))
    .filter((item) => Boolean(item.href));

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 rounded-lg border st-border st-surface font-medium hover:opacity-85 transition-opacity ${
            compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
          }`}
        >
          {item.key === 'website' ? (
            <Globe className="w-3.5 h-3.5 st-accent-text shrink-0" />
          ) : (
            <ExternalLink className="w-3.5 h-3.5 st-accent-text shrink-0" />
          )}
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
};

interface BrandAboutSectionProps {
  brandAbout: BrandAboutInfo;
  studios?: Pick<
    Studio,
    'id' | 'name' | 'city' | 'address' | 'phone' | 'email' | 'routeHint' | 'socials'
  >[];
  initialMethodologyBlockId?: string;
  onSelectStudioForBook?: (studioId: string) => void;
  onChooseMethodology?: (block: MethodologyProgramBlock) => void;
}

export const BrandAboutSection: React.FC<BrandAboutSectionProps> = ({
  brandAbout,
  studios = [],
  initialMethodologyBlockId,
  onSelectStudioForBook,
  onChooseMethodology,
}) => {
  return (
    <div className="space-y-5">
      {/* Network Intro & Contacts */}
      <div className="rounded-2xl st-hero-gradient text-white p-5 sm:p-6 space-y-4">
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300">
            О сети и методике
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-bold">
            {brandAbout.brandName}
          </h3>
          {brandAbout.tagline && (
            <p className="text-xs sm:text-sm text-white/85 font-medium">
              {brandAbout.tagline}
            </p>
          )}
        </div>

        {brandAbout.aboutNetwork && (
          <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
            {brandAbout.aboutNetwork}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/15 text-xs">
          {brandAbout.networkPhone && (
            <a
              href={`tel:${brandAbout.networkPhone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-mono transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-amber-300" />
              <span>{brandAbout.networkPhone}</span>
            </a>
          )}
          {brandAbout.networkEmail && (
            <a
              href={`mailto:${brandAbout.networkEmail}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-amber-300" />
              <span>{brandAbout.networkEmail}</span>
            </a>
          )}
        </div>

        {brandAbout.socials && (
          <div className="pt-1">
            <div className="text-[11px] text-white/75 mb-1.5">
              Официальный сайт и соцсети сети:
            </div>
            <div className="text-slate-900 dark:text-slate-100">
              <StudioSocialButtons socials={brandAbout.socials} />
            </div>
          </div>
        )}
      </div>

      {/* Thematic Methodology & Audience Blocks (Sport, Office, Age, Kids, Moms) */}
      <MethodologyBlocksExplorer
        blocks={brandAbout.methodologyBlocks}
        initialBlockId={initialMethodologyBlockId}
        onChooseMethodology={onChooseMethodology}
      />

      {/* Methodology & Why Us */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 rounded-2xl st-surface border st-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 st-accent-text shrink-0" />
            <h4 className="font-display text-base font-bold">
              {brandAbout.methodologyTitle || 'О методике ПравИло'}
            </h4>
          </div>
          <p className="text-xs sm:text-sm st-muted leading-relaxed whitespace-pre-line">
            {brandAbout.methodologyDescription}
          </p>
          {brandAbout.equipmentAndSafety && (
            <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Оборудование и безопасность</span>
              </div>
              <p className="text-xs st-muted leading-relaxed">
                {brandAbout.equipmentAndSafety}
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 rounded-2xl st-surface border st-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <h4 className="font-display text-base font-bold">
              {brandAbout.whyUsTitle || 'Почему выбирают нас'}
            </h4>
          </div>
          <ul className="space-y-2.5">
            {brandAbout.whyUsPoints.map((pt, i) => (
              <li
                key={`${i}-${pt.slice(0, 16)}`}
                className="flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed"
              >
                <span className="w-5 h-5 rounded-full st-accent-soft text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Work Approaches ("Чем и как мы работаем") */}
      {brandAbout.approaches.length > 0 && (
        <div className="rounded-2xl st-surface border st-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 st-accent-text shrink-0" />
            <h4 className="font-display text-base font-bold">
              Подходы в работе: как и чем мы работаем
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {brandAbout.approaches.map((card) => (
              <div
                key={card.id}
                className="p-4 rounded-xl st-surface-muted border st-border space-y-1.5"
              >
                <div className="font-semibold text-xs sm:text-sm">{card.title}</div>
                <p className="text-xs st-muted leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual Studio Contacts & Links */}
      {studios.length > 0 && (
        <div className="rounded-2xl st-surface border st-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 st-accent-text shrink-0" />
            <h4 className="font-display text-base font-bold">
              Контакты, сайты и соцсети студий
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {studios.map((st) => (
              <div
                key={st.id}
                className="p-4 rounded-xl st-surface-muted border st-border flex flex-col justify-between gap-3"
              >
                <div className="space-y-2 text-xs">
                  <div className="font-bold text-sm">{st.name}</div>
                  <div className="flex items-start gap-1.5 st-muted">
                    <MapPin className="w-3.5 h-3.5 st-accent-text shrink-0 mt-0.5" />
                    <span>
                      {st.city}, {st.address}
                    </span>
                  </div>
                  {st.routeHint && (
                    <div className="text-[11px] st-muted leading-snug">
                      {st.routeHint}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {st.phone && (
                      <a
                        href={`tel:${st.phone.replace(/[^\d+]/g, '')}`}
                        className="inline-flex items-center gap-1 font-mono font-semibold st-accent-text hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{st.phone}</span>
                      </a>
                    )}
                    {st.email && (
                      <a
                        href={`mailto:${st.email}`}
                        className="inline-flex items-center gap-1 st-muted hover:underline"
                      >
                        <Mail className="w-3 h-3" />
                        <span>{st.email}</span>
                      </a>
                    )}
                  </div>
                  <StudioSocialButtons socials={st.socials} compact />
                </div>

                {onSelectStudioForBook && (
                  <button
                    type="button"
                    onClick={() => onSelectStudioForBook(st.id)}
                    className="w-full py-2 px-3 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Записаться в этот филиал
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
