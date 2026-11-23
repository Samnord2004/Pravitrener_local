import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Globe,
  ImagePlus,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  RatingReview,
  Studio,
  TrainerPublicProfile,
  TrainerSocialLinks,
  UserAccount,
} from '../types';
import {
  TRAINER_SKILL_SUGGESTIONS,
  compressImageFile,
  formatExperienceYears,
  normalizeSocialUrl,
} from '../utils/trainerProfile';
import { RatingBadge } from './RatingStars';

export type TrainerPublicUser = Pick<
  UserAccount,
  'id' | 'name' | 'studioId' | 'avatarInitials' | 'trainerProfile'
>;

export const TrainerSocialButtons: React.FC<{ socials?: TrainerSocialLinks }> = ({
  socials,
}) => {
  if (!socials) return null;
  const links: { key: keyof TrainerSocialLinks; label: string; href: string }[] = [];
  (['telegram', 'vk', 'instagram', 'youtube', 'website'] as const).forEach((k) => {
    const safeHref = normalizeSocialUrl(k, socials[k]);
    if (!safeHref) return;
    const labels: Record<keyof TrainerSocialLinks, string> = {
      telegram: 'Telegram',
      vk: 'ВКонтакте',
      instagram: 'Instagram',
      youtube: 'YouTube',
      website: 'Сайт',
    };
    links.push({ key: k, label: labels[k], href: safeHref });
  });

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border st-surface text-[11px] font-medium hover:opacity-85 transition-opacity"
        >
          {item.key === 'website' ? (
            <Globe className="w-3 h-3 st-accent-text" />
          ) : (
            <ExternalLink className="w-3 h-3 st-accent-text" />
          )}
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
};

export const TrainerAvatar: React.FC<{
  trainer: TrainerPublicUser;
  size?: 'sm' | 'md' | 'lg';
}> = ({ trainer, size = 'md' }) => {
  const photo = trainer.trainerProfile?.photoUrl;
  const dim =
    size === 'lg'
      ? 'w-20 h-20 text-xl'
      : size === 'sm'
      ? 'w-10 h-10 text-xs'
      : 'w-12 h-12 text-sm';

  if (photo) {
    return (
      <img
        src={photo}
        alt={trainer.name}
        className={`${dim} rounded-full object-cover border st-border shrink-0 bg-slate-100 dark:bg-slate-800`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full st-accent-bg flex items-center justify-center font-display font-bold shrink-0`}
    >
      {trainer.avatarInitials || 'ТР'}
    </div>
  );
};

interface TrainerProfileDetailModalProps {
  trainer: TrainerPublicUser;
  studio?: Studio;
  ratingAverage: number;
  ratingCount: number;
  reviews?: RatingReview[];
  onBookTrainer?: () => void;
  onRateTrainer?: () => void;
  onClose: () => void;
}

export const TrainerProfileDetailModal: React.FC<TrainerProfileDetailModalProps> = ({
  trainer,
  studio,
  ratingAverage,
  ratingCount,
  reviews = [],
  onBookTrainer,
  onRateTrainer,
  onClose,
}) => {
  const prof = trainer.trainerProfile;
  const skills = prof?.skills || [];
  const highlights = prof?.highlights || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl st-surface border st-border p-5 sm:p-6 space-y-5 shadow-2xl my-6">
        <div className="flex items-start justify-between gap-3 border-b st-border pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <TrainerAvatar trainer={trainer} size="lg" />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl font-bold truncate">
                  {trainer.name}
                </h3>
                <RatingBadge average={ratingAverage} count={ratingCount} />
              </div>
              <div className="text-xs st-muted flex flex-wrap items-center gap-2">
                <span>{studio?.name || 'Сеть ЭТАЛОН ПРАВИЛО'}</span>
                {prof?.experienceYears ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded st-surface-muted border st-border font-mono font-semibold st-accent-text">
                    <Award className="w-3 h-3" />
                    Стаж: {formatExperienceYears(prof.experienceYears)}
                  </span>
                ) : null}
              </div>
              {prof?.specialization && (
                <div className="text-xs font-medium st-accent-text leading-snug">
                  {prof.specialization}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg st-muted hover:opacity-80 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {prof?.bio && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider st-muted">
                О тренере и опыте
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{prof.bio}</p>
            </div>
          )}

          {prof?.workStyle && (
            <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="w-3.5 h-3.5 st-accent-text" />
                <span>Стиль работы с клиентами</span>
              </div>
              <p className="st-muted leading-relaxed whitespace-pre-wrap">
                {prof.workStyle}
              </p>
            </div>
          )}

          {skills.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider st-muted">
                Навыки и методики
              </div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-lg st-accent-soft text-[11px] font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {highlights.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider st-muted">
                Ключевые особенности и достижения
              </div>
              <ul className="space-y-1.5">
                {highlights.map((item, idx) => (
                  <li key={`${item}-${idx}`} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prof?.socials && Object.values(prof.socials).some(Boolean) && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider st-muted">
                Социальные сети и контакты
              </div>
              <TrainerSocialButtons socials={prof.socials} />
            </div>
          )}

          {!prof?.bio && !prof?.workStyle && skills.length === 0 && (
            <div className="p-4 rounded-xl st-surface-muted border st-border text-center st-muted">
              Тренер скоро дополнит подробное описание опыта и методик работы.
            </div>
          )}

          {reviews.length > 0 && (
            <div className="pt-2 border-t st-border space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider st-muted">
                Отзывы клиентов ({reviews.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-2.5 rounded-lg st-surface-muted border st-border space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{rev.authorName}</span>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                        {rev.rating} · {rev.updatedAt || rev.createdAt}
                      </span>
                    </div>
                    {rev.comment && <p className="st-muted leading-relaxed">{rev.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t st-border">
          {onRateTrainer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRateTrainer();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer hover:border-amber-400"
            >
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span>Оценить тренера</span>
            </button>
          )}
          {onBookTrainer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onBookTrainer();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Записаться к тренеру</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface TrainerProfileEditorFormProps {
  initialProfile?: TrainerPublicProfile;
  trainerName: string;
  saving?: boolean;
  statusMessage?: string;
  onSave: (profile: TrainerPublicProfile) => Promise<void> | void;
}

export const TrainerProfileEditorForm: React.FC<TrainerProfileEditorFormProps> = ({
  initialProfile,
  trainerName,
  saving = false,
  statusMessage = '',
  onSave,
}) => {
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.photoUrl || '');
  const [experienceYears, setExperienceYears] = useState(
    initialProfile?.experienceYears !== undefined ? String(initialProfile.experienceYears) : ''
  );
  const [specialization, setSpecialization] = useState(
    initialProfile?.specialization || ''
  );
  const [bio, setBio] = useState(initialProfile?.bio || '');
  const [workStyle, setWorkStyle] = useState(initialProfile?.workStyle || '');
  const [skills, setSkills] = useState<string[]>(initialProfile?.skills || []);
  const [newSkill, setNewSkill] = useState('');
  const [highlightsText, setHighlightsText] = useState(
    (initialProfile?.highlights || []).join('\n')
  );
  const [telegram, setTelegram] = useState(initialProfile?.socials?.telegram || '');
  const [vk, setVk] = useState(initialProfile?.socials?.vk || '');
  const [instagram, setInstagram] = useState(initialProfile?.socials?.instagram || '');
  const [youtube, setYoutube] = useState(initialProfile?.socials?.youtube || '');
  const [website, setWebsite] = useState(initialProfile?.socials?.website || '');
  const [photoError, setPhotoError] = useState('');

  const addSkill = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    if (skills.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    setSkills((prev) => [...prev, clean].slice(0, 14));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const expParsed = experienceYears.trim() ? Number(experienceYears) : undefined;
    const highlights = highlightsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10);

    await onSave({
      photoUrl: photoUrl.trim(),
      experienceYears:
        expParsed !== undefined && Number.isFinite(expParsed)
          ? Math.max(0, Math.min(60, Math.round(expParsed)))
          : undefined,
      specialization: specialization.trim(),
      bio: bio.trim(),
      workStyle: workStyle.trim(),
      skills,
      highlights,
      socials: {
        telegram: telegram.trim(),
        vk: vk.trim(),
        instagram: instagram.trim(),
        youtube: youtube.trim(),
        website: website.trim(),
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      {/* Photo + Experience + Specialization */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
        <div className="sm:col-span-4 flex flex-col items-center gap-2 p-3 rounded-xl st-surface-muted border st-border">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={trainerName}
              className="w-24 h-24 rounded-full object-cover border st-border"
            />
          ) : (
            <div className="w-24 h-24 rounded-full st-accent-soft flex items-center justify-center text-xs font-medium text-center p-2">
              Нет фото
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg st-accent-bg text-[11px] font-medium cursor-pointer">
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{photoUrl ? 'Заменить фото' : 'Загрузить фото'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoError('');
                  try {
                    const compressed = await compressImageFile(file, 900, 0.84);
                    setPhotoUrl(compressed);
                  } catch (err) {
                    setPhotoError(
                      err instanceof Error ? err.message : 'Ошибка загрузки фото'
                    );
                  }
                  e.target.value = '';
                }}
              />
            </label>
            {photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border st-border text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          <input
            type="text"
            value={photoUrl.startsWith('data:') ? '' : photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="или вставьте URL портрета"
            className="w-full px-2 py-1 text-[11px] rounded border st-border st-surface"
          />
          {photoError && <div className="text-[11px] text-rose-600">{photoError}</div>}
        </div>

        <div className="sm:col-span-8 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block st-muted mb-1">Стаж / опыт (лет)</label>
              <input
                type="number"
                min={0}
                max={60}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                placeholder="Например: 7"
                className="w-full px-3 py-2 font-mono rounded-lg border st-border st-surface"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block st-muted mb-1">Главная специализация</label>
              <input
                type="text"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="Биомеханическая декомпрессия, коррекция осанки..."
                className="w-full px-3 py-2 rounded-lg border st-border st-surface"
              />
            </div>
          </div>

          <div>
            <label className="block st-muted mb-1">О себе, образовании и подходе (видно клиентам)</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Расскажите о квалификации, сертификациях, спортивном или медицинском бэкграунде..."
              className="w-full px-3 py-2 rounded-lg border st-border st-surface"
            />
          </div>

          <div>
            <label className="block st-muted mb-1">Стиль работы с клиентом</label>
            <textarea
              rows={2}
              value={workStyle}
              onChange={(e) => setWorkStyle(e.target.value)}
              placeholder="Например: бережный плавный вход, акцент на дыхание и контроль симметрии..."
              className="w-full px-3 py-2 rounded-lg border st-border st-surface"
            />
          </div>
        </div>
      </div>

      {/* Skills Chips */}
      <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-2.5">
        <div className="font-semibold">Ключевые навыки и методики ({skills.length})</div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg st-accent-soft text-[11px] font-medium"
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => setSkills((prev) => prev.filter((item) => item !== skill))}
                  className="hover:opacity-75 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill(newSkill);
                setNewSkill('');
              }
            }}
            placeholder="Добавить навык и нажать +"
            className="flex-1 px-3 py-1.5 rounded-lg border st-border st-surface"
          />
          <button
            type="button"
            onClick={() => {
              addSkill(newSkill);
              setNewSkill('');
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border st-border st-surface font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {TRAINER_SKILL_SUGGESTIONS.filter((s) => !skills.includes(s)).map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => addSkill(sug)}
              className="px-2 py-0.5 rounded border st-border st-surface text-[10px] st-muted hover:opacity-90 cursor-pointer"
            >
              + {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Highlights & Socials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block st-muted mb-1">
            Ключевые особенности / достижения (каждый пункт с новой строки)
          </label>
          <textarea
            rows={4}
            value={highlightsText}
            onChange={(e) => setHighlightsText(e.target.value)}
            placeholder={'Более 2 000 проведённых сессий\nРабота со спортсменами и офисными сотрудниками'}
            className="w-full px-3 py-2 rounded-lg border st-border st-surface"
          />
        </div>

        <div className="space-y-2">
          <label className="block st-muted">Социальные сети (ссылка или @никнейм)</label>
          <input
            type="text"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="Telegram: @username или https://t.me/..."
            className="w-full px-3 py-1.5 rounded-lg border st-border st-surface"
          />
          <input
            type="text"
            value={vk}
            onChange={(e) => setVk(e.target.value)}
            placeholder="ВКонтакте: https://vk.com/..."
            className="w-full px-3 py-1.5 rounded-lg border st-border st-surface"
          />
          <input
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="Instagram: @username или https://instagram.com/..."
            className="w-full px-3 py-1.5 rounded-lg border st-border st-surface"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="YouTube"
              className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
            />
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Личный сайт"
              className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t st-border">
        <span className="text-xs st-accent-text font-medium">{statusMessage}</span>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить публичный профиль тренера'}
        </button>
      </div>
    </form>
  );
};
