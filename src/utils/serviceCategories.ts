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
