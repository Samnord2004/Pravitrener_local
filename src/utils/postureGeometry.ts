import type {
  PostureAngleMeasurement,
  PostureAssessmentRecord,
  PostureBodyRegion,
  PostureMeasurementType,
  PosturePoint,
  PostureTiltDirection,
  PostureViewProjection,
} from '../types';
import { isValidStudioPhotoSrc } from './reviews';
import {
  generateKinesiologyReport,
  inferMeasurementRegion,
  sanitizeKinesiologyReport,
} from './appliedKinesiology';

export const POSTURE_PROJECTION_LABELS: Record<PostureViewProjection, string> = {
  front: 'Анфас (вид спереди)',
  back: 'Вид сзади (со спины)',
  side_left: 'Профиль слева',
  side_right: 'Профиль справа',
};

// L1 Голова (14%), L2 Шея (23%), L3 Плечи (32%), L4 Таз (54%), L5 Ноги/Колени (77%)
export const DEFAULT_LASER_HORIZONS: number[] = [14, 23, 32, 54, 77];

export const LASER_HORIZON_NAMES: string[] = [
  'L1 Голова',
  'L2 Шея',
  'L3 Плечи',
  'L4 Таз',
  'L5 Ноги',
];

export const DEFAULT_GRID_DENSITY = 20;
export const MIN_GRID_DENSITY = 4;
export const MAX_GRID_DENSITY = 50;

export function normalizeGridDensity(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_GRID_DENSITY;
  return Math.max(MIN_GRID_DENSITY, Math.min(MAX_GRID_DENSITY, Math.round(n)));
}

export function formatGridStepLabel(density: number): string {
  const safe = normalizeGridDensity(density);
  const step = 100 / safe;
  return Number.isInteger(step) ? `${step}%` : `${Number(step.toFixed(1))}%`;
}

export function normalizeLaserHorizons(raw?: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_LASER_HORIZONS];
  }
  const nums = raw.map((v, i) => clampPct(v, DEFAULT_LASER_HORIZONS[i] ?? 50));
  if (nums.length >= 5) {
    return nums.slice(0, 5);
  }
  if (nums.length === 4) {
    // Legacy: [head, shoulders, pelvis, legs] -> insert neck halfway between head and shoulders
    const neck = Number(Math.min(nums[1] - 2, (nums[0] + nums[1]) / 2).toFixed(1));
    return [nums[0], Math.max(nums[0] + 2, neck), nums[1], nums[2], nums[3]];
  }
  if (nums.length === 3) {
    const neck = Number(Math.min(nums[1] - 2, (nums[0] + nums[1]) / 2).toFixed(1));
    return [nums[0], Math.max(nums[0] + 2, neck), nums[1], nums[2], DEFAULT_LASER_HORIZONS[4]];
  }
  return DEFAULT_LASER_HORIZONS.map((d, i) => nums[i] ?? d);
}

export interface PostureMeasurementPreset {
  id: string;
  region: PostureBodyRegion;
  label: string;
  hint: string;
  type: PostureMeasurementType;
  color: string;
  recommendedViews?: PostureViewProjection[];
}

export const POSTURE_MEASUREMENT_PRESETS: PostureMeasurementPreset[] = [
  // Голова и шея
  {
    id: 'head_tilt',
    region: 'head',
    label: 'Голова: наклон (мочки ушей / глаза)',
    hint: 'Анфас/сзади: кликните левую и правую мочку уха (или внешние углы глаз) — 2 точки',
    type: 'tilt',
    color: '#38bdf8',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'neck_tilt',
    region: 'head',
    label: 'Шея: смещение / наклон оси (C2–C7)',
    hint: 'Анфас/сзади: кликните основание затылка/подбородок и яремную вырезку/C7 — 2 точки',
    type: 'tilt',
    color: '#06b6d4',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'cervical_fhp',
    region: 'head',
    label: 'Голова/шея: выдвижение вперёд (FHP)',
    hint: 'В профиль: кликните 3 точки — козелок уха → C7 (основание шеи) → плечевой сустав/вертикаль',
    type: 'joint',
    color: '#10b981',
    recommendedViews: ['side_left', 'side_right'],
  },
  // Плечи и лопатки
  {
    id: 'shoulders',
    region: 'shoulders',
    label: 'Плечи: перекос (акромионы)',
    hint: 'Анфас/сзади: кликните левый и правый акромион (край плеча) — 2 точки',
    type: 'tilt',
    color: '#22d3ee',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'scapulae',
    region: 'shoulders',
    label: 'Лопатки: уровень нижних углов',
    hint: 'Вид со спины: кликните нижние углы левой и правой лопатки — 2 точки',
    type: 'tilt',
    color: '#0ea5e9',
    recommendedViews: ['back'],
  },
  {
    id: 'shoulder_protraction',
    region: 'shoulders',
    label: 'Плечи: протракция / сутулость (профиль)',
    hint: 'В профиль: кликните C7 (основание шеи) и центр плечевого сустава (акромион) — 2 точки',
    type: 'tilt',
    color: '#14b8a6',
    recommendedViews: ['side_left', 'side_right'],
  },
  {
    id: 'goniometer_arm',
    region: 'shoulders',
    label: 'Гониометр: плечо – локоть – запястье',
    hint: 'Гониометр (3 точки): поставьте точку на плечевом суставе → локтевом суставе (вершина) → запястье; программа рассчитает угол и отклонение от 180°',
    type: 'joint',
    color: '#f97316',
    recommendedViews: ['front', 'back', 'side_left', 'side_right'],
  },
  // Таз и поясница
  {
    id: 'pelvis',
    region: 'pelvis',
    label: 'Таз: перекос гребней (ПВПО / ЗВПО)',
    hint: 'Анфас/сзади: кликните левый и правый гребень подвздошной кости (ПВПО спереди или ЗВПО сзади) — 2 точки',
    type: 'tilt',
    color: '#f59e0b',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'pelvis_sagittal',
    region: 'pelvis',
    label: 'Таз: наклон вперёд / назад (ПВПО–ЗВПО)',
    hint: 'В профиль: кликните переднюю (ПВПО) и заднюю (ЗВПО) ость таза — 2 точки',
    type: 'tilt',
    color: '#ea580c',
    recommendedViews: ['side_left', 'side_right'],
  },
  // Ноги, колени и стопы
  {
    id: 'legs_knees',
    region: 'legs',
    label: 'Ноги: уровень коленей (надколенники)',
    hint: 'Анфас/сзади: кликните центры (или верхние края) левого и правого надколенника — 2 точки',
    type: 'tilt',
    color: '#ec4899',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'legs_valgus',
    region: 'legs',
    label: 'Ноги: ось ноги (вальгус X / варус O)',
    hint: 'Анфас/сзади: кликните 3 точки одной ноги — ТБС (бедро) → центр колена → голеностоп',
    type: 'joint',
    color: '#d946ef',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'legs_feet',
    region: 'legs',
    label: 'Стопы: завал пятки / ось ахилла',
    hint: 'Вид сзади/анфас: кликните верхнюю точку ахиллова сухожилия и центр пятки (или уровень лодыжек) — 2 точки',
    type: 'tilt',
    color: '#f43f5e',
    recommendedViews: ['back', 'front'],
  },
  {
    id: 'knee_angle',
    region: 'legs',
    label: 'Ноги: угол колена в профиль (рекурвация)',
    hint: 'В профиль: кликните 3 точки — большой вертел бедра → центр колена → наружная лодыжка',
    type: 'joint',
    color: '#fb7185',
    recommendedViews: ['side_left', 'side_right'],
  },
  // Ось позвоночника
  {
    id: 'spine_plumb',
    region: 'spine',
    label: 'Позвоночник: смещение оси от отвеса (C7–крестец)',
    hint: 'Анфас/сзади: кликните C7 (яремную вырезку) и центр крестца (пупок/S1) — 2 точки',
    type: 'tilt',
    color: '#a855f7',
    recommendedViews: ['front', 'back'],
  },
  {
    id: 'body_plumb_sagittal',
    region: 'spine',
    label: 'Профиль: завал оси тела вперёд/назад (ухо–лодыжка)',
    hint: 'В профиль: кликните центр плеча/уха и наружную лодыжку для оценки падения корпуса — 2 точки',
    type: 'tilt',
    color: '#6366f1',
    recommendedViews: ['side_left', 'side_right'],
  },
  {
    id: 'thoracic_curve',
    region: 'spine',
    label: 'Позвоночник: изгиб дуги / кифоз / сколиоз',
    hint: 'Кликните 3 точки вдоль позвоночника: верхняя опора → вершина дуги → нижняя опора',
    type: 'joint',
    color: '#8b5cf6',
  },
  {
    id: 'custom_tilt',
    region: 'spine',
    label: 'Свободный наклон (2 точки)',
    hint: 'Кликните любые 2 точки для расчёта отклонения от горизонтали или вертикали',
    type: 'tilt',
    color: '#06b6d4',
  },
  {
    id: 'custom_joint',
    region: 'spine',
    label: 'Гониометр: свободный угол (3 точки)',
    hint: 'Инструмент «Гониометр»: поставьте 3 точки (плечо–локоть–запястье или любой сустав; вторая точка — вершина) для авторасчёта угла и отклонения от 180°',
    type: 'joint',
    color: '#84cc16',
    recommendedViews: ['front', 'back', 'side_left', 'side_right'],
  },
];

function clampPct(v: unknown, fallback = 50): number {
  const num = Number(v);
  if (!Number.isFinite(num)) return fallback;
  return Number(Math.max(0, Math.min(100, num)).toFixed(2));
}

/**
 * Computes angle in degrees using optional aspect ratio (naturalHeight / naturalWidth)
 * so measurements on non-square photos are geometrically true.
 */
export function computeMeasurementAngle(
  type: PostureMeasurementType,
  points: PosturePoint[],
  aspectHeightOverWidth = 1.333
): { angleDeg: number; deviationDeg: number; reference: 'horizontal' | 'vertical' | 'joint' } {
  const aspect =
    Number.isFinite(aspectHeightOverWidth) && aspectHeightOverWidth > 0.2
      ? aspectHeightOverWidth
      : 1.333;

  if (type === 'tilt' && points.length >= 2) {
    const dx = points[1].xPct - points[0].xPct;
    const dy = (points[1].yPct - points[0].yPct) * aspect;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return { angleDeg: 0, deviationDeg: 0, reference: 'horizontal' };
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
      const rounded = Number(deg.toFixed(1));
      return { angleDeg: rounded, deviationDeg: rounded, reference: 'horizontal' };
    }
    const deg = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
    const rounded = Number(deg.toFixed(1));
    return { angleDeg: rounded, deviationDeg: rounded, reference: 'vertical' };
  }

  if (type === 'joint' && points.length >= 3) {
    const [a, b, c] = points;
    const bax = a.xPct - b.xPct;
    const bay = (a.yPct - b.yPct) * aspect;
    const bcx = c.xPct - b.xPct;
    const bcy = (c.yPct - b.yPct) * aspect;
    const magBA = Math.hypot(bax, bay);
    const magBC = Math.hypot(bcx, bcy);
    if (magBA < 0.001 || magBC < 0.001) {
      return { angleDeg: 180, deviationDeg: 0, reference: 'joint' };
    }
    const cosVal = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (magBA * magBC)));
    const deg = Number(((Math.acos(cosVal) * 180) / Math.PI).toFixed(1));
    const deviationDeg = Number(Math.abs(180 - deg).toFixed(1));
    return { angleDeg: deg, deviationDeg, reference: 'joint' };
  }

  return { angleDeg: 0, deviationDeg: 0, reference: 'horizontal' };
}

export function computeMeasurementDirection(
  presetId: string | undefined,
  type: PostureMeasurementType,
  points: PosturePoint[],
  projection: PostureViewProjection,
  plumbXPct = 50,
  angleDeg = 0,
  deviationDeg = 0
): { direction: PostureTiltDirection; directionLabel: string } {
  if (type === 'tilt' && points.length >= 2) {
    const [p1, p2] = points;
    const isHorizontal = Math.abs(p2.xPct - p1.xPct) >= Math.abs(p2.yPct - p1.yPct);

    if (
      presetId === 'pelvis_sagittal' ||
      ((projection === 'side_left' || projection === 'side_right') && isHorizontal)
    ) {
      if (angleDeg < 1.2) return { direction: 'neutral', directionLabel: 'Нейтральное положение' };
      const leftScreenPt = p1.xPct <= p2.xPct ? p1 : p2;
      const rightScreenPt = p1.xPct <= p2.xPct ? p2 : p1;
      const anteriorPt = projection === 'side_left' ? leftScreenPt : rightScreenPt;
      const posteriorPt = projection === 'side_left' ? rightScreenPt : leftScreenPt;
      if (anteriorPt.yPct > posteriorPt.yPct) {
        return { direction: 'forward', directionLabel: 'Передний наклон (вперёд)' };
      }
      return { direction: 'backward', directionLabel: 'Задний наклон (назад)' };
    }

    if (isHorizontal) {
      if (angleDeg < 1.0) {
        return { direction: 'neutral', directionLabel: 'Горизонтально (в норме)' };
      }
      const leftScreenPt = p1.xPct <= p2.xPct ? p1 : p2;
      const rightScreenPt = p1.xPct <= p2.xPct ? p2 : p1;
      const leftScreenIsHigher = leftScreenPt.yPct < rightScreenPt.yPct;

      if (projection === 'front') {
        return leftScreenIsHigher
          ? { direction: 'right_higher', directionLabel: 'Правая сторона выше' }
          : { direction: 'left_higher', directionLabel: 'Левая сторона выше' };
      }
      if (projection === 'back') {
        return leftScreenIsHigher
          ? { direction: 'left_higher', directionLabel: 'Левая сторона выше' }
          : { direction: 'right_higher', directionLabel: 'Правая сторона выше' };
      }
      return leftScreenIsHigher
        ? { direction: 'backward', directionLabel: 'Смещение / наклон' }
        : { direction: 'forward', directionLabel: 'Смещение / наклон' };
    }

    // Vertical line deviation from plumb
    if (angleDeg < 1.2) {
      return { direction: 'neutral', directionLabel: 'Совпадает с отвесом' };
    }
    const topPt = p1.yPct <= p2.yPct ? p1 : p2;
    const bottomPt = p1.yPct <= p2.yPct ? p2 : p1;
    const dxTop = topPt.xPct - bottomPt.xPct;
    if (projection === 'front') {
      return dxTop > 0
        ? { direction: 'shift_left', directionLabel: 'Отклонение оси влево (по клиенту)' }
        : { direction: 'shift_right', directionLabel: 'Отклонение оси вправо (по клиенту)' };
    }
    if (projection === 'back') {
      return dxTop > 0
        ? { direction: 'shift_right', directionLabel: 'Отклонение оси вправо (по клиенту)' }
        : { direction: 'shift_left', directionLabel: 'Отклонение оси влево (по клиенту)' };
    }
    const forwardShift = projection === 'side_left' ? dxTop < 0 : dxTop > 0;
    return forwardShift
      ? { direction: 'forward', directionLabel: 'Смещение вперёд от отвеса' }
      : { direction: 'backward', directionLabel: 'Смещение назад от отвеса' };
  }

  if (type === 'joint' && points.length >= 3) {
    const [a, b, c] = points;
    if (presetId === 'legs_valgus' && (projection === 'front' || projection === 'back')) {
      if (deviationDeg < 2.5) {
        return { direction: 'neutral', directionLabel: 'Ось колена в норме' };
      }
      const lineMidX = (a.xPct + c.xPct) / 2;
      const distLineToPlumb = Math.abs(lineMidX - plumbXPct);
      const distKneeToPlumb = Math.abs(b.xPct - plumbXPct);
      if (distKneeToPlumb < distLineToPlumb) {
        return { direction: 'valgus', directionLabel: 'Вальгус (X-смещение колена внутрь)' };
      }
      return { direction: 'varus', directionLabel: 'Варус (O-смещение колена наружу)' };
    }

    if (presetId === 'cervical_fhp') {
      return deviationDeg > 12
        ? { direction: 'forward', directionLabel: 'Выдвижение головы вперёд' }
        : { direction: 'neutral', directionLabel: 'Шейный угол в норме' };
    }
  }

  return {
    direction: 'neutral',
    directionLabel: deviationDeg < 1.5 ? 'В пределах нормы' : `Отклонение ${deviationDeg.toFixed(1)}°`,
  };
}

export interface BeforeAfterComparisonRow {
  label: string;
  type: PostureMeasurementType;
  beforeDeg: number;
  afterDeg: number;
  beforeRefVal: number;
  afterRefVal: number;
  deltaDeg: number;
  improved: boolean;
}

export function buildBeforeAfterComparison(
  beforeList: PostureAngleMeasurement[] = [],
  afterList: PostureAngleMeasurement[] = []
): BeforeAfterComparisonRow[] {
  const rows: BeforeAfterComparisonRow[] = [];
  const usedAfter = new Set<string>();

  for (const b of beforeList) {
    const match = afterList.find(
      (a) => !usedAfter.has(a.id) && a.label.trim().toLowerCase() === b.label.trim().toLowerCase()
    );
    if (!match) continue;
    usedAfter.add(match.id);
    const beforeScore = b.type === 'tilt' ? b.angleDeg : (b.deviationDeg ?? Math.abs(180 - b.angleDeg));
    const afterScore =
      match.type === 'tilt' ? match.angleDeg : (match.deviationDeg ?? Math.abs(180 - match.angleDeg));
    const deltaDeg = Number((afterScore - beforeScore).toFixed(1));
    rows.push({
      label: b.label,
      type: b.type,
      beforeDeg: b.angleDeg,
      afterDeg: match.angleDeg,
      beforeRefVal: Number(beforeScore.toFixed(1)),
      afterRefVal: Number(afterScore.toFixed(1)),
      deltaDeg,
      improved: deltaDeg < -0.1,
    });
  }
  return rows;
}

function sanitizeMeasurementList(raw: unknown): PostureAngleMeasurement[] {
  if (!Array.isArray(raw)) return [];
  const validRegions = new Set<PostureBodyRegion>(['head', 'shoulders', 'pelvis', 'legs', 'spine']);
  const validDirs = new Set<PostureTiltDirection>([
    'left_higher',
    'right_higher',
    'shift_left',
    'shift_right',
    'forward',
    'backward',
    'valgus',
    'varus',
    'neutral',
  ]);
  const out: PostureAngleMeasurement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const type: PostureMeasurementType = obj.type === 'joint' ? 'joint' : 'tilt';
    const rawPoints = Array.isArray(obj.points) ? obj.points : [];
    const points: PosturePoint[] = rawPoints
      .filter((p) => p && typeof p === 'object')
      .slice(0, type === 'joint' ? 3 : 2)
      .map((p) => {
        const pt = p as Record<string, unknown>;
        return { xPct: clampPct(pt.xPct), yPct: clampPct(pt.yPct) };
      });
    const reqPoints = type === 'joint' ? 3 : 2;
    if (points.length < reqPoints) continue;

    const rawAngle = Number(obj.angleDeg);
    const angleDeg = Number.isFinite(rawAngle)
      ? Number(Math.max(0, Math.min(180, rawAngle)).toFixed(1))
      : computeMeasurementAngle(type, points).angleDeg;
    const rawDev = Number(obj.deviationDeg);
    const deviationDeg = Number.isFinite(rawDev)
      ? Number(Math.max(0, Math.min(180, rawDev)).toFixed(1))
      : Number((type === 'tilt' ? angleDeg : Math.abs(180 - angleDeg)).toFixed(1));

    const label =
      typeof obj.label === 'string' && obj.label.trim()
        ? obj.label.trim().slice(0, 120)
        : type === 'joint'
        ? 'Суставной угол'
        : 'Угол наклона';
    const color =
      typeof obj.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj.color.trim())
        ? obj.color.trim()
        : '#22d3ee';
    const presetId =
      typeof obj.presetId === 'string' && obj.presetId.trim()
        ? obj.presetId.trim().slice(0, 64)
        : undefined;
    const region = validRegions.has(obj.region as PostureBodyRegion)
      ? (obj.region as PostureBodyRegion)
      : inferMeasurementRegion({
          id: 'tmp',
          presetId,
          label,
          type,
          points,
          angleDeg,
        });
    const direction = validDirs.has(obj.direction as PostureTiltDirection)
      ? (obj.direction as PostureTiltDirection)
      : undefined;
    const directionLabel =
      typeof obj.directionLabel === 'string' && obj.directionLabel.trim()
        ? obj.directionLabel.trim().slice(0, 120)
        : undefined;

    out.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim().slice(0, 64)
          : `ang-${out.length + 1}`,
      presetId,
      region,
      label,
      type,
      points,
      angleDeg,
      deviationDeg,
      direction,
      directionLabel,
      color,
    });
    if (out.length >= 20) break;
  }
  return out;
}

export function sanitizePostureAssessmentInput(
  raw: unknown,
  fallbackId: string,
  recordedBy?: string
): { ok: true; record: PostureAssessmentRecord } | { ok: false; error: string } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const beforePhotoUrl =
    typeof obj.beforePhotoUrl === 'string' ? obj.beforePhotoUrl.trim() : '';
  if (!isValidStudioPhotoSrc(beforePhotoUrl)) {
    return {
      ok: false,
      error: 'Загрузите корректное фото ДО коррекции (JPEG, PNG, WebP или URL)',
    };
  }
  const afterRaw = typeof obj.afterPhotoUrl === 'string' ? obj.afterPhotoUrl.trim() : '';
  const afterPhotoUrl = afterRaw && isValidStudioPhotoSrc(afterRaw) ? afterRaw : undefined;

  const projectionRaw = typeof obj.projection === 'string' ? obj.projection : 'front';
  const projection: PostureViewProjection =
    projectionRaw === 'back' ||
    projectionRaw === 'side_left' ||
    projectionRaw === 'side_right'
      ? projectionRaw
      : 'front';

  const date =
    typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)
      ? obj.date
      : new Date().toISOString().slice(0, 10);

  const laserHorizonsPct = normalizeLaserHorizons(obj.laserHorizonsPct);

  const rawTilt = Number(obj.laserTiltDeg);
  const laserTiltDeg = Number.isFinite(rawTilt)
    ? Number(Math.max(-10, Math.min(10, rawTilt)).toFixed(1))
    : 0;

  const beforeMeasurements = sanitizeMeasurementList(obj.beforeMeasurements);
  const afterMeasurements = sanitizeMeasurementList(obj.afterMeasurements);
  const sanitizedReport =
    sanitizeKinesiologyReport(obj.kinesiologyReport) ||
    generateKinesiologyReport(beforeMeasurements, projection);

  return {
    ok: true,
    record: {
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim().slice(0, 64)
          : fallbackId,
      date,
      projection,
      beforePhotoUrl,
      afterPhotoUrl,
      laserEnabled: obj.laserEnabled !== false,
      laserPlumbXPct: Math.max(5, Math.min(95, clampPct(obj.laserPlumbXPct, 50))),
      laserHorizonsPct,
      laserTiltDeg,
      fineGrid: Boolean(obj.fineGrid),
      gridDensity: normalizeGridDensity(obj.gridDensity),
      beforeMeasurements,
      afterMeasurements,
      kinesiologyReport: sanitizedReport,
      notes: typeof obj.notes === 'string' ? obj.notes.trim().slice(0, 1500) : '',
      recordedBy:
        typeof obj.recordedBy === 'string' && obj.recordedBy.trim()
          ? obj.recordedBy.trim().slice(0, 120)
          : recordedBy,
    },
  };
}
