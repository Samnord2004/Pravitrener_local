import type { TrainerPublicProfile, TrainerSocialLinks } from '../types';
import { isValidStudioPhotoSrc } from './reviews';

export const TRAINER_SKILL_SUGGESTIONS = [
  'Декомпрессия позвоночника',
  'Нейро-мышечная коррекция',
  'Работа с триггерными точками',
  'Миография (MYOblue EMG)',
  'Оценка осанки и лазерный уровень',
  'Восстановление после спорта',
  'Мобилизация грудного отдела',
  'Баланс-бревно и проприоцепция',
  'Дыхательные практики',
  'Коррекция сколиотической дуги',
];

export function normalizeSocialUrl(
  platform: keyof TrainerSocialLinks,
  raw: unknown
): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return '';
  }

  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    return trimmed.slice(0, 300);
  }

  // Convert clean @handles or short domain paths into safe https:// URLs
  const cleanHandle = trimmed.replace(/^@+/, '').replace(/[^a-zA-Z0-9._\-/]/g, '');
  if (!cleanHandle) return '';

  if (platform === 'telegram') {
    if (lower.startsWith('t.me/')) return `https://${trimmed.slice(0, 200)}`;
    return `https://t.me/${cleanHandle}`;
  }
  if (platform === 'vk') {
    if (lower.startsWith('vk.com/')) return `https://${trimmed.slice(0, 200)}`;
    return `https://vk.com/${cleanHandle}`;
  }
  if (platform === 'instagram') {
    if (lower.startsWith('instagram.com/')) return `https://${trimmed.slice(0, 200)}`;
    return `https://instagram.com/${cleanHandle}`;
  }
  if (platform === 'youtube') {
    if (lower.startsWith('youtube.com/') || lower.startsWith('youtu.be/')) {
      return `https://${trimmed.slice(0, 200)}`;
    }
    return `https://youtube.com/@${cleanHandle}`;
  }
  if (platform === 'website') {
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
      return `https://${trimmed.slice(0, 300)}`;
    }
  }
  return '';
}

function sanitizeStringList(raw: unknown, maxItems = 12, maxLen = 120): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().slice(0, maxLen);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeTrainerProfile(raw: unknown): TrainerPublicProfile {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const photoRaw = typeof obj.photoUrl === 'string' ? obj.photoUrl.trim() : '';
  const photoUrl = isValidStudioPhotoSrc(photoRaw) ? photoRaw : '';

  const expNum = Number(obj.experienceYears);
  const experienceYears =
    Number.isFinite(expNum) && expNum >= 0 ? Math.min(60, Math.round(expNum)) : undefined;

  const socialsObj = (
    obj.socials && typeof obj.socials === 'object' ? obj.socials : {}
  ) as Record<string, unknown>;

  const socials: TrainerSocialLinks = {};
  const tg = normalizeSocialUrl('telegram', socialsObj.telegram);
  const vk = normalizeSocialUrl('vk', socialsObj.vk);
  const ig = normalizeSocialUrl('instagram', socialsObj.instagram);
  const yt = normalizeSocialUrl('youtube', socialsObj.youtube);
  const web = normalizeSocialUrl('website', socialsObj.website);
  if (tg) socials.telegram = tg;
  if (vk) socials.vk = vk;
  if (ig) socials.instagram = ig;
  if (yt) socials.youtube = yt;
  if (web) socials.website = web;

  return {
    photoUrl,
    experienceYears,
    specialization:
      typeof obj.specialization === 'string' ? obj.specialization.trim().slice(0, 200) : '',
    bio: typeof obj.bio === 'string' ? obj.bio.trim().slice(0, 2500) : '',
    workStyle: typeof obj.workStyle === 'string' ? obj.workStyle.trim().slice(0, 1000) : '',
    skills: sanitizeStringList(obj.skills, 14, 80),
    highlights: sanitizeStringList(obj.highlights, 10, 180),
    socials,
  };
}

export function formatExperienceYears(years?: number): string {
  if (typeof years !== 'number' || !Number.isFinite(years) || years <= 0) {
    return 'Опыт не указан';
  }
  const mod100 = years % 100;
  const mod10 = years % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${years} лет`;
  if (mod10 === 1) return `${years} год`;
  if (mod10 >= 2 && mod10 <= 4) return `${years} года`;
  return `${years} лет`;
}

export function compressImageFile(file: File, maxSide = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Пустой файл изображения'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Файл не является корректным изображением'));
      img.onload = () => {
        let width = img.naturalWidth || 1000;
        let height = img.naturalHeight || 1000;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(rawUrl);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}
