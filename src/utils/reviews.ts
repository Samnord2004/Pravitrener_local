import type { RatingReview, ReviewTargetType } from '../types';

export const STUDIO_PHOTO_PRESETS = [
  {
    label: 'Зал ПравИло (основной зал)',
    url: '/src/assets/images/studio_hero_pravilo_1795103073467.jpg',
  },
  {
    label: 'Растяжка на тренажёре',
    url: '/src/assets/images/exercise_star_stretch_1795103073739.jpg',
  },
  {
    label: 'Зона грудного раскрытия',
    url: '/src/assets/images/exercise_shoulder_open_1795103072729.jpg',
  },
  {
    label: 'Тренировочная зона с креплениями',
    url: '/src/assets/images/exercise_twist_hang_1795103073130.jpg',
  },
];

export interface RatingStats {
  average: number;
  count: number;
  items: RatingReview[];
}

export function getRatingStats(
  reviews: RatingReview[] | undefined,
  targetType: ReviewTargetType,
  targetId: string
): RatingStats {
  const list = (reviews || [])
    .filter((r) => r.targetType === targetType && r.targetId === targetId)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

  if (list.length === 0) {
    return { average: 0, count: 0, items: [] };
  }
  const sum = list.reduce((acc, r) => acc + Number(r.rating || 0), 0);
  return {
    average: Number((sum / list.length).toFixed(1)),
    count: list.length,
    items: list,
  };
}

export function isValidStudioPhotoSrc(src: string): boolean {
  const trimmed = (src || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/src/assets/')) {
    return !trimmed.includes('..');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) {
    return trimmed.length <= 2_500_000;
  }
  return false;
}

export function compressStudioPhoto(file: File): Promise<string> {
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
        const maxSide = 1200;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
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
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(rawUrl);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}
