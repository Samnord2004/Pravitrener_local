import type {
  PostureAngleMeasurement,
  PostureAssessmentRecord,
  PostureMeasurementType,
  PosturePoint,
  PostureViewProjection,
} from '../types';
import { isValidStudioPhotoSrc } from './reviews';

export const POSTURE_PROJECTION_LABELS: Record<PostureViewProjection, string> = {
  front: 'Фронтально спереди',
  back: 'Вид со спины',
  side_left: 'Профиль слева',
  side_right: 'Профиль справа',
};

export interface PostureMeasurementPreset {
  id: string;
  label: string;
  hint: string;
  type: PostureMeasurementType;
  color: string;
}

export const POSTURE_MEASUREMENT_PRESETS: PostureMeasurementPreset[] = [
  {
    id: 'shoulders',
    label: 'Перекос плеч (акромионы)',
    hint: 'Кликните левое и правое плечо для расчёта наклона относительно горизонта',
    type: 'tilt',
    color: '#22d3ee',
  },
  {
    id: 'pelvis',
    label: 'Перекос таза (гребни)',
    hint: 'Кликните левый и правый гребень подвздошной кости',
    type: 'tilt',
    color: '#f59e0b',
  },
  {
    id: 'head_tilt',
    label: 'Наклон головы (линия ушей/глаз)',
    hint: 'Кликните мочки ушей или внешние углы глаз (2 точки)',
    type: 'tilt',
    color: '#38bdf8',
  },
  {
    id: 'spine_plumb',
    label: 'Отклонение оси от отвеса',
    hint: 'Кликните две вертикальные точки оси тела (например C7 и крестец)',
    type: 'tilt',
    color: '#a855f7',
  },
  {
    id: 'cervical_fhp',
    label: 'Шейный угол (FHP)',
    hint: 'Кликните 3 точки: ухо → седьмой шейный позвонок (C7) → точка надплечья/вертикаль',
    type: 'joint',
    color: '#10b981',
  },
  {
    id: 'thoracic_curve',
    label: 'Изгиб позвоночника / осанки',
    hint: 'Кликните 3 точки: верхняя → вершина дуги → нижняя опора',
    type: 'joint',
    color: '#f43f5e',
  },
  {
    id: 'knee_angle',
    label: 'Угол сустава (колено / таз)',
    hint: 'Кликните 3 точки: проксимальная → сустав (вершина) → дистальная',
    type: 'joint',
    color: '#ec4899',
  },
  {
    id: 'custom_tilt',
    label: 'Свободный наклон (2 точки)',
    hint: 'Кликните 2 точки для измерения отклонения от горизонтали или вертикали',
    type: 'tilt',
    color: '#06b6d4',
  },
  {
    id: 'custom_joint',
    label: 'Свободный угол (3 точки)',
    hint: 'Кликните 3 точки (вторая точка — вершина угла)',
    type: 'joint',
    color: '#84cc16',
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
    // For tilt: smaller angle = straighter posture.
    // For joint: compare deviation from 180 or exact angle shift.
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

    out.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim().slice(0, 64)
          : `ang-${out.length + 1}`,
      label,
      type,
      points,
      angleDeg,
      deviationDeg,
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

  const laserHorizonsRaw = Array.isArray(obj.laserHorizonsPct)
    ? obj.laserHorizonsPct
    : [20, 38, 60];
  const laserHorizonsPct = laserHorizonsRaw
    .slice(0, 4)
    .map((v, i) => clampPct(v, [20, 38, 60, 78][i] ?? 50));

  const rawTilt = Number(obj.laserTiltDeg);
  const laserTiltDeg = Number.isFinite(rawTilt)
    ? Number(Math.max(-10, Math.min(10, rawTilt)).toFixed(1))
    : 0;

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
      laserHorizonsPct: laserHorizonsPct.length > 0 ? laserHorizonsPct : [20, 38, 60],
      laserTiltDeg,
      fineGrid: Boolean(obj.fineGrid),
      beforeMeasurements: sanitizeMeasurementList(obj.beforeMeasurements),
      afterMeasurements: sanitizeMeasurementList(obj.afterMeasurements),
      notes: typeof obj.notes === 'string' ? obj.notes.trim().slice(0, 1500) : '',
      recordedBy:
        typeof obj.recordedBy === 'string' && obj.recordedBy.trim()
          ? obj.recordedBy.trim().slice(0, 120)
          : recordedBy,
    },
  };
}
