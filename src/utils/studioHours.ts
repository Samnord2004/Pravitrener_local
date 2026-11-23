export interface StudioHoursRange {
  start: string;
  end: string;
}

export interface StudioScheduleHours {
  weekday: StudioHoursRange;
  weekend: StudioHoursRange;
}

export type StudioHoursInput =
  | string
  | {
      openHours?: string;
      weekdayOpenHours?: string;
      weekendOpenHours?: string;
    };

function normalizeTime(hhmm: string, fallback: string): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function isWeekendDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function parseOpenHours(openHours?: string): StudioHoursRange {
  const m = openHours?.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
  if (!m) return { start: '09:00', end: '21:00' };
  return {
    start: normalizeTime(m[1], '09:00'),
    end: normalizeTime(m[2], '21:00'),
  };
}

export function formatOpenHours(start: string, end: string): string {
  return `${normalizeTime(start, '09:00')} – ${normalizeTime(end, '21:00')}`;
}

export function parseStudioScheduleHours(input?: StudioHoursInput): StudioScheduleHours {
  if (!input) {
    return {
      weekday: { start: '09:00', end: '21:00' },
      weekend: { start: '09:00', end: '21:00' },
    };
  }

  if (typeof input === 'string') {
    const matches = Array.from(
      input.matchAll(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/g)
    );
    if (matches.length >= 2) {
      return {
        weekday: {
          start: normalizeTime(matches[0][1], '09:00'),
          end: normalizeTime(matches[0][2], '21:00'),
        },
        weekend: {
          start: normalizeTime(matches[1][1], '09:00'),
          end: normalizeTime(matches[1][2], '21:00'),
        },
      };
    }
    const single = parseOpenHours(input);
    return { weekday: single, weekend: { ...single } };
  }

  const fromCombined = input.openHours
    ? parseStudioScheduleHours(input.openHours)
    : {
        weekday: { start: '09:00', end: '21:00' },
        weekend: { start: '09:00', end: '21:00' },
      };

  const weekday = input.weekdayOpenHours
    ? parseOpenHours(input.weekdayOpenHours)
    : fromCombined.weekday;
  const weekend = input.weekendOpenHours
    ? parseOpenHours(input.weekendOpenHours)
    : input.weekdayOpenHours && !input.openHours?.includes('Сб')
    ? { ...weekday }
    : fromCombined.weekend;

  return { weekday, weekend };
}

export function formatStudioOpenHours(
  weekday: StudioHoursRange,
  weekend: StudioHoursRange
): {
  openHours: string;
  weekdayOpenHours: string;
  weekendOpenHours: string;
} {
  const weekdayOpenHours = formatOpenHours(weekday.start, weekday.end);
  const weekendOpenHours = formatOpenHours(weekend.start, weekend.end);
  const openHours =
    weekdayOpenHours === weekendOpenHours
      ? weekdayOpenHours
      : `Пн–Пт ${weekdayOpenHours} · Сб–Вс ${weekendOpenHours}`;
  return { openHours, weekdayOpenHours, weekendOpenHours };
}

export function getStudioHoursForDate(
  input?: StudioHoursInput,
  dateStr?: string
): StudioHoursRange {
  const parsed = parseStudioScheduleHours(input);
  return isWeekendDate(dateStr) ? parsed.weekend : parsed.weekday;
}

export function getStudioHoursBounds(input?: StudioHoursInput): StudioHoursRange {
  const { weekday, weekend } = parseStudioScheduleHours(input);
  return {
    start: weekday.start <= weekend.start ? weekday.start : weekend.start,
    end: weekday.end >= weekend.end ? weekday.end : weekend.end,
  };
}

export function isTimeWithinOpenHours(
  time: string,
  input?: StudioHoursInput,
  dateStr?: string
): boolean {
  const { start, end } = getStudioHoursForDate(input, dateStr);
  const norm = normalizeTime(time, start);
  return norm >= start && norm <= end;
}

export function generateReceptionSlots(
  input?: StudioHoursInput,
  stepMinutes = 60,
  dateStr?: string
): string[] {
  const { start, end } = getStudioHoursForDate(input, dateStr);
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMin(start);
  const endMin = toMin(end);
  if (endMin <= startMin) return [start];

  const slots: string[] = [];
  const lastStart = Math.max(startMin, endMin - 60);
  for (let cur = startMin; cur <= lastStart; cur += stepMinutes) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots.length ? slots : [start];
}
