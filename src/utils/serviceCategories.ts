import type { ExerciseType, ServiceCategory } from '../types';

export const SERVICE_CATEGORY_OPTIONS: {
  id: ServiceCategory;
  label: string;
  shortLabel: string;
  subtitle: string;
}[] = [
  {
    id: 'relax',
    label: 'Релакс занятия',
    shortLabel: 'Релакс',
    subtitle: 'Мягкое расслабление, дыхательные практики и снятие зажимов',
  },
  {
    id: 'fitness',
    label: 'Фитнес-тренировки (нейро-мышечный фитнес, баланс бревно)',
    shortLabel: 'Фитнес / Баланс бревно',
    subtitle: 'Нейро-мышечный фитнес, координация и работа на баланс-бревне',
  },
  {
    id: 'sport',
    label: 'Спортивные тренировки (силовые, активные)',
    shortLabel: 'Спортивные (силовые)',
    subtitle: 'Высокоинтенсивные силовые и активные нагрузки на ПравИло',
  },
  {
    id: 'wellness',
    label: 'Оздоровительные практики',
    shortLabel: 'Оздоровительные',
    subtitle: 'Диагностика, декомпрессия позвоночника и восстановительный курс',
  },
];

export const SERVICE_CATEGORY_LABEL_MAP: Record<ServiceCategory, string> = {
  relax: 'Релакс занятия',
  fitness: 'Фитнес-тренировки (нейро-мышечный фитнес, баланс бревно)',
  sport: 'Спортивные тренировки (силовые, активные)',
  wellness: 'Оздоровительные практики',
};

export const SERVICE_CATEGORY_SHORT_MAP: Record<ServiceCategory, string> = {
  relax: 'Релакс занятия',
  fitness: 'Фитнес / баланс бревно',
  sport: 'Спортивные (силовые)',
  wellness: 'Оздоровительные практики',
};

export function inferServiceCategory(srv: {
  id?: string;
  name?: string;
  description?: string;
  category?: ServiceCategory;
}): ServiceCategory {
  if (srv.category && SERVICE_CATEGORY_LABEL_MAP[srv.category]) {
    return srv.category;
  }
  const text = `${srv.id || ''} ${srv.name || ''} ${srv.description || ''}`.toLowerCase();
  if (/релакс|дыха|мягк|расслаб|сняти/.test(text)) return 'relax';
  if (/фитнес|нейро|баланс|бревно|координ/.test(text)) return 'fitness';
  if (/спорт|силов|активн|интенсив|глубокая декомпрессия/.test(text)) return 'sport';
  return 'wellness';
}

export const EXERCISE_TYPE_OPTIONS: ExerciseType[] = [
  'Декомпрессия',
  'Нейро-мышечный фитнес',
  'Баланс бревно',
  'Силовое удержание',
  'Релакс и дыхание',
  'Оздоровительная практика',
];

export function inferExerciseType(ex: {
  category?: string;
  title?: string;
  exerciseType?: ExerciseType;
}): ExerciseType {
  if (ex.exerciseType && EXERCISE_TYPE_OPTIONS.includes(ex.exerciseType)) {
    return ex.exerciseType;
  }
  const text = `${ex.category || ''} ${ex.title || ''}`.toLowerCase();
  if (/бревн|баланс/.test(text)) return 'Баланс бревно';
  if (/нейро|фитнес/.test(text)) return 'Нейро-мышечный фитнес';
  if (/силов/.test(text)) return 'Силовое удержание';
  if (/релакс|дыхан|раскрыт/.test(text)) return 'Релакс и дыхание';
  if (/восстанов|ротац/.test(text)) return 'Оздоровительная практика';
  return 'Декомпрессия';
}

export interface DifficultyLevelMeta {
  value: number;
  label: string;
  shortLabel: string;
  starColorClass: string;
  badgeClass: string;
}

export const DIFFICULTY_LEVELS: DifficultyLevelMeta[] = [
  {
    value: 1,
    label: 'Лёгкий старт (1/5)',
    shortLabel: 'Лёгкий старт',
    starColorClass: 'text-emerald-500 fill-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  {
    value: 2,
    label: 'Мягкая адаптация (2/5)',
    shortLabel: 'Мягкая',
    starColorClass: 'text-teal-500 fill-teal-500',
    badgeClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
  },
  {
    value: 3,
    label: 'Средняя нагрузка (3/5)',
    shortLabel: 'Средняя',
    starColorClass: 'text-amber-500 fill-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    value: 4,
    label: 'Выше среднего (4/5)',
    shortLabel: 'Повышенная',
    starColorClass: 'text-orange-500 fill-orange-500',
    badgeClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  {
    value: 5,
    label: 'Высокая интенсивность (5/5)',
    shortLabel: 'Высокая',
    starColorClass: 'text-rose-500 fill-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
];

export function clampDifficulty(val: unknown): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

export function inferExerciseDifficulty(ex?: {
  difficulty?: number;
  category?: string;
  title?: string;
  recommendedLoadPct?: number;
}): number {
  if (!ex) return 3;
  if (ex.difficulty !== undefined && Number.isFinite(Number(ex.difficulty))) {
    return clampDifficulty(ex.difficulty);
  }
  if (ex.category === 'Силовое удержание' || (ex.recommendedLoadPct ?? 0) >= 85) return 5;
  if (ex.category === 'Ротация') return 4;
  if (ex.category === 'Грудной отдел' || ex.category === 'Восстановление') return 2;
  if ((ex.recommendedLoadPct ?? 70) <= 55) return 1;
  return 3;
}

export function getDifficultyMeta(difficulty: number): DifficultyLevelMeta {
  const clamped = clampDifficulty(difficulty);
  return DIFFICULTY_LEVELS[clamped - 1];
}

export function computeProgramDifficulty(
  exercisesInProgram: {
    difficulty?: number;
    category?: string;
    title?: string;
    recommendedLoadPct?: number;
  }[]
): { avg: number; rounded: number; max: number; meta: DifficultyLevelMeta } {
  if (!exercisesInProgram.length) {
    return { avg: 0, rounded: 1, max: 0, meta: DIFFICULTY_LEVELS[0] };
  }
  const scores = exercisesInProgram.map((e) => inferExerciseDifficulty(e));
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / scores.length) * 10) / 10;
  const rounded = clampDifficulty(Math.round(avg));
  const max = Math.max(...scores);
  return {
    avg,
    rounded,
    max,
    meta: getDifficultyMeta(rounded),
  };
}
