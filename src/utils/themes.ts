import type { StudioStyleTheme } from '../types';

export interface StyleThemeOption {
  id: StudioStyleTheme;
  name: string;
  subtitle: string;
  fontLabel: string;
  fontDisplayPreview: string;
  swatches: [string, string, string, string];
}

export const STYLE_THEME_OPTIONS: StyleThemeOption[] = [
  {
    id: 'slavic',
    name: 'Славянский',
    subtitle: 'Тёплый лён, киноварь, янтарь и лесной изумруд',
    fontLabel: 'Шрифты: Cormorant Infant + PT Sans',
    fontDisplayPreview: "'Cormorant Infant', Georgia, serif",
    swatches: ['#FAF5EA', '#B32B24', '#C98A1C', '#26644E'],
  },
  {
    id: 'japanese',
    name: 'Японский классический',
    subtitle: 'Бумага васи, киноварь тории, матча и суми-э',
    fontLabel: 'Шрифты: Playfair Display + Manrope',
    fontDisplayPreview: "'Playfair Display', Georgia, serif",
    swatches: ['#F7F2E7', '#C73A2B', '#B28728', '#3F6D52'],
  },
  {
    id: 'viking',
    name: 'Стиль Викинг',
    subtitle: 'Скандинавский камень, кованая бронза и фьорд',
    fontLabel: 'Шрифты: Oswald + Rubik',
    fontDisplayPreview: "'Oswald', sans-serif",
    swatches: ['#F1F4F7', '#B86A19', '#1B6472', '#9E342C'],
  },
  {
    id: 'modern',
    name: 'Классика ЭТАЛОН',
    subtitle: 'Светлый алебастр, лазурь и тёплый янтарь',
    fontLabel: 'Шрифты: Exo 2 + Inter',
    fontDisplayPreview: "'Exo 2', sans-serif",
    swatches: ['#F3F7FA', '#08819E', '#15845D', '#D97706'],
  },
];

export const BACKGROUND_PRESETS: { id: string; label: string; url: string }[] = [
  { id: 'none', label: 'Без фона', url: '' },
  { id: 'dragon', label: 'Дракон', url: '/assets/aistudio/IMG_6064_172a7fc2.JPG' },
  { id: 'studio', label: 'Зал ПравИло', url: '/src/assets/images/studio_hero_pravilo_1795103073467.jpg' },
];

export const STYLE_STORAGE_KEY = 'atlant_style_theme';
export const THEME_STORAGE_KEY = 'atlant_theme';
export const BG_IMAGE_STORAGE_KEY = 'atlant_bg_image';
export const BG_OPACITY_STORAGE_KEY = 'atlant_bg_opacity';

export function getInitialStyleTheme(): StudioStyleTheme {
  try {
    const saved = localStorage.getItem(STYLE_STORAGE_KEY);
    if (saved === 'slavic' || saved === 'japanese' || saved === 'viking' || saved === 'modern') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'slavic';
}

export function applyStyleThemeToDom(styleTheme: StudioStyleTheme, colorMode: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.setAttribute('data-style', styleTheme);
  if (colorMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, styleTheme);
    localStorage.setItem(THEME_STORAGE_KEY, colorMode);
  } catch {
    // ignore
  }
}

export function getInitialBackgroundSettings(): { imageUrl: string; opacity: number } {
  let imageUrl = '';
  let opacity = 0.25;
  try {
    imageUrl = localStorage.getItem(BG_IMAGE_STORAGE_KEY) || '';
    const savedOp = localStorage.getItem(BG_OPACITY_STORAGE_KEY);
    if (savedOp !== null) {
      const parsed = Number(savedOp);
      if (Number.isFinite(parsed)) {
        opacity = Math.max(0, Math.min(1, parsed));
      }
    }
  } catch {
    // ignore storage errors
  }
  return { imageUrl, opacity };
}

export function applyBackgroundSettingsToDom(imageUrl: string, opacity: number): { stored: boolean } {
  const cleanUrl = imageUrl.trim();
  const clampedOpacity = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 0.25));
  const root = document.documentElement;

  if (cleanUrl) {
    const cssSafeUrl = cleanUrl.replace(/["\\]/g, '\\$&');
    root.style.setProperty('--st-bg-image', `url("${cssSafeUrl}")`);
    root.style.setProperty('--st-bg-opacity', String(clampedOpacity));
    root.setAttribute('data-has-bg', 'true');
  } else {
    root.style.setProperty('--st-bg-image', 'none');
    root.style.setProperty('--st-bg-opacity', '0');
    root.removeAttribute('data-has-bg');
  }

  let stored = true;
  try {
    if (cleanUrl) {
      localStorage.setItem(BG_IMAGE_STORAGE_KEY, cleanUrl);
    } else {
      localStorage.removeItem(BG_IMAGE_STORAGE_KEY);
    }
    localStorage.setItem(BG_OPACITY_STORAGE_KEY, String(clampedOpacity));
  } catch {
    stored = false;
  }
  return { stored };
}
