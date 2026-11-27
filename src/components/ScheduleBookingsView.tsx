import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Play,
  Check,
  X,
  Clock,
  Trash2,
  Building2,
  Pencil,
  Calendar as CalendarIcon,
  CalendarDays,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  User,
  Phone,
  CreditCard,
} from 'lucide-react';
import type {
  Booking,
  BookingStatus,
  ClientProfile,
  LegalAcceptanceRecord,
  PaymentStatus,
  RatingReview,
  ServiceItem,
  Studio,
  TrainerSchedule,
  UserAccount,
} from '../types';
import { apiRequest } from '../utils/api';
import { getRatingStats } from '../utils/reviews';
import { RatingBadge } from './RatingStars';
import { LegalAgreementsPanel } from './LegalAgreementsModal';
import {
  formatStudioOpenHours,
  getStudioHoursBounds,
  getStudioHoursForDate,
  isTimeWithinOpenHours,
  isWeekendDate,
  parseStudioScheduleHours,
} from '../utils/studioHours';
import {
  SERVICE_CATEGORY_OPTIONS,
  inferServiceCategory,
} from '../utils/serviceCategories';

interface ScheduleProps {
  currentUser: UserAccount;
  studios: Studio[];
  selectedStudioId: string;
  users: UserAccount[];
  clients: ClientProfile[];
  services: ServiceItem[];
  bookings: Booking[];
  schedules: TrainerSchedule[];
  reviews?: RatingReview[];
  brandName?: string;
  onLegalAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  onBookingCreated: (b: Booking) => void;
  onBookingUpdated: (b: Booking) => void;
  onBookingDeleted?: (id: string) => void;
  onScheduleAdded: (s: TrainerSchedule) => void;
  onScheduleUpdated?: (s: TrainerSchedule) => void;
  onScheduleDeleted: (id: string) => void;
  onStudioUpdated?: (s: Studio) => void;
  onStartLiveSession: (booking: Booking) => void;
}

const STATUS_LABELS: Record<
  BookingStatus,
  { text: string; tone: string; dot: string; cardBorder: string; badgeBg: string }
> = {
  pending: {
    text: 'Ожидает',
    tone: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    cardBorder: 'border-l-amber-500',
    badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  confirmed: {
    text: 'Подтверждена',
    tone: 'text-cyan-700 dark:text-cyan-400',
    dot: 'bg-cyan-500',
    cardBorder: 'border-l-cyan-500',
    badgeBg: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  },
  in_progress: {
    text: 'В процессе',
    tone: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    cardBorder: 'border-l-emerald-500',
    badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  completed: {
    text: 'Завершена',
    tone: 'text-slate-500',
    dot: 'bg-slate-400',
    cardBorder: 'border-l-slate-400',
    badgeBg: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  },
  cancelled: {
    text: 'Отменена',
    tone: 'text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
    cardBorder: 'border-l-rose-500',
    badgeBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачено',
  paid_cash: 'Наличные',
  paid_card: 'Карта / перевод',
  paid_subscription: 'Абонемент',
  paid_certificate: 'Сертификат',
};

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FULL_DAYS = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];
const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];
const MONTHS_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

function addDays(d: Date, delta: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function getWeekDates(anchor: Date): Date[] {
  const monday = getMondayOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getMonthGridDates(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = getMondayOfWeek(firstOfMonth);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const totalDays =
    Math.ceil((lastOfMonth.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1;
  const cellsCount = totalDays <= 35 ? 35 : 42;
  return Array.from({ length: cellsCount }, (_, i) => addDays(start, i));
}

function parseTimeHourMin(timeStr: string): { hour: number; min: number } {
  const [hStr, mStr] = (timeStr || '12:00').split(':');
  const hour = Math.max(0, Math.min(23, Number(hStr) || 0));
  const min = Math.max(0, Math.min(59, Number(mStr) || 0));
  return { hour, min };
}

export const ScheduleBookingsView: React.FC<ScheduleProps> = ({
  currentUser,
  studios,
  selectedStudioId,
  users,
  clients,
  services,
  bookings,
  schedules,
  reviews = [],
  brandName,
  onLegalAccepted,
  onBookingCreated,
  onBookingUpdated,
  onBookingDeleted,
  onScheduleAdded,
  onScheduleUpdated,
  onScheduleDeleted,
  onStudioUpdated,
  onStartLiveSession,
}) => {
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week');
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => new Date());
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [trainerFilter, setTrainerFilter] = useState<string>('all');

  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [liveError, setLiveError] = useState('');

  // Studio Reception Hours edit state (Weekday & Weekend)
  const [editingStudioId, setEditingStudioId] = useState<string | null>(null);
  const [editWeekdayStart, setEditWeekdayStart] = useState('09:00');
  const [editWeekdayEnd, setEditWeekdayEnd] = useState('21:00');
  const [editWeekendStart, setEditWeekendStart] = useState('10:00');
  const [editWeekendEnd, setEditWeekendEnd] = useState('20:00');
  const [studioHoursError, setStudioHoursError] = useState('');
  const [savingStudioHours, setSavingStudioHours] = useState(false);

  const trainers = useMemo(() => users.filter((u) => u.role === 'trainer'), [users]);

  // New Booking Modal State
  const [bStudioId, setBStudioId] = useState(studios[0]?.id || '');
  const [bClientId, setBClientId] = useState(clients[0]?.id || '');
  const [bTrainerId, setBTrainerId] = useState(trainers[0]?.id || '');
  const [bServiceId, setBServiceId] = useState(services[0]?.id || '');
  const [bDate, setBDate] = useState(() => toIsoDate(new Date()));
  const [bTime, setBTime] = useState('15:00');
  const [bPromo, setBPromo] = useState('');
  const [bookingError, setBookingError] = useState('');

  // Add / Edit Trainer Shift State
  const [editingShift, setEditingShift] = useState<TrainerSchedule | null>(null);
  const [schTrainerId, setSchTrainerId] = useState(trainers[0]?.id || '');
  const [schStudioId, setSchStudioId] = useState(studios[0]?.id || '');
  const [schDay, setSchDay] = useState(0);
  const [schStart, setSchStart] = useState('09:00');
  const [schEnd, setSchEnd] = useState('19:00');
  const [schActive, setSchActive] = useState(true);
  const [shiftError, setShiftError] = useState('');
  const [savingShift, setSavingShift] = useState(false);

  // Expanded Booking Card & Real-time Editor State
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [listExpandedId, setListExpandedId] = useState<string | null>(null);
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [confirmDeleteBookingId, setConfirmDeleteBookingId] = useState<string | null>(null);
  const [ebStudioId, setEbStudioId] = useState('');
  const [ebClientId, setEbClientId] = useState('');
  const [ebTrainerId, setEbTrainerId] = useState('');
  const [ebServiceId, setEbServiceId] = useState('');
  const [ebDate, setEbDate] = useState('');
  const [ebTime, setEbTime] = useState('12:00');
  const [ebDuration, setEbDuration] = useState(60);
  const [ebStatus, setEbStatus] = useState<BookingStatus>('confirmed');
  const [ebPaymentStatus, setEbPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [ebPromoCode, setEbPromoCode] = useState('');
  const [ebFinalAmount, setEbFinalAmount] = useState(0);
  const [ebSaving, setEbSaving] = useState(false);
  const [ebError, setEbError] = useState('');

  // Push & Pull Drag State (Bookings + Trainer Shifts)
  const [dragBookingId, setDragBookingId] = useState<string | null>(null);
  const dragBookingIdRef = useRef<string | null>(null);
  const [dragHoverSlot, setDragHoverSlot] = useState<string | null>(null); // `${date}|${time}` or date
  const [draggingShift, setDraggingShift] = useState<{
    id: string;
    fromDayIdx: number;
    trainerName: string;
    timeText: string;
    studioName: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [dragHoverDayIdx, setDragHoverDayIdx] = useState<number | null>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const shiftGridRef = useRef<HTMLDivElement | null>(null);
  const shiftPointerDragRef = useRef<{
    shift: TrainerSchedule;
    trainerName: string;
    studioName: string;
    startX: number;
    startY: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const dragHoverDayRef = useRef<number | null>(null);
  const suppressShiftClickRef = useRef(false);

  const canManageSchedule = currentUser.role === 'owner' || currentUser.role === 'admin';
  const todayIso = toIsoDate(new Date());

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        const studioOk = selectedStudioId === 'all' || b.studioId === selectedStudioId;
        const statusOk = statusFilter === 'all' || b.status === statusFilter;
        const roleTrainerOk = currentUser.role !== 'trainer' || b.trainerId === currentUser.id;
        const filterTrainerOk = trainerFilter === 'all' || b.trainerId === trainerFilter;
        return studioOk && statusOk && roleTrainerOk && filterTrainerOk;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });
  }, [bookings, selectedStudioId, statusFilter, trainerFilter, currentUser]);

  const expandedBooking = useMemo(
    () => bookings.find((b) => b.id === expandedBookingId) || null,
    [bookings, expandedBookingId]
  );

  // Sync edit form when real-time WS updates happen for the opened booking (if not currently editing)
  useEffect(() => {
    if (!expandedBooking || isEditingBooking) return;
    setEbStudioId(expandedBooking.studioId);
    setEbClientId(expandedBooking.clientId);
    setEbTrainerId(expandedBooking.trainerId);
    setEbServiceId(expandedBooking.serviceId);
    setEbDate(expandedBooking.date);
    setEbTime(expandedBooking.time);
    setEbDuration(expandedBooking.durationMin);
    setEbStatus(expandedBooking.status);
    setEbPaymentStatus(expandedBooking.paymentStatus);
    setEbPromoCode(expandedBooking.promoCode || '');
    setEbFinalAmount(expandedBooking.finalAmountRub);
  }, [expandedBooking, isEditingBooking]);

  const openExpandedBooking = (bk: Booking, startInEdit = false) => {
    setExpandedBookingId(bk.id);
    setConfirmDeleteBookingId(null);
    setEbError('');
    setEbStudioId(bk.studioId);
    setEbClientId(bk.clientId);
    setEbTrainerId(bk.trainerId);
    setEbServiceId(bk.serviceId);
    setEbDate(bk.date);
    setEbTime(bk.time);
    setEbDuration(bk.durationMin);
    setEbStatus(bk.status);
    setEbPaymentStatus(bk.paymentStatus);
    setEbPromoCode(bk.promoCode || '');
    setEbFinalAmount(bk.finalAmountRub);
    setIsEditingBooking(startInEdit);
  };

  const openNewBookingAt = (dateStr?: string, timeStr?: string) => {
    setBookingError('');
    if (dateStr) setBDate(dateStr);
    if (timeStr) setBTime(timeStr);
    if (selectedStudioId !== 'all') setBStudioId(selectedStudioId);
    else if (!bStudioId && studios[0]) setBStudioId(studios[0].id);
    if (!bClientId && clients[0]) setBClientId(clients[0].id);
    if (!bTrainerId && trainers[0]) setBTrainerId(trainers[0].id);
    if (!bServiceId && services[0]) setBServiceId(services[0].id);
    setShowNewBooking(true);
  };

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    setLiveError('');
    try {
      const updated = await apiRequest<Booking>(`/api/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onBookingUpdated(updated);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Не удалось изменить статус записи');
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    try {
      const created = await apiRequest<Booking>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          studioId: bStudioId || studios[0]?.id,
          clientId: bClientId || clients[0]?.id,
          trainerId: bTrainerId || trainers[0]?.id,
          serviceId: bServiceId || services[0]?.id,
          date: bDate,
          time: bTime,
          promoCode: bPromo || undefined,
          status: 'confirmed',
        }),
      });
      onBookingCreated(created);
      setShowNewBooking(false);
      setBPromo('');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Ошибка создания записи');
    }
  };

  const handleSaveBookingEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedBooking) return;
    setEbError('');
    setEbSaving(true);
    try {
      const updated = await apiRequest<Booking>(`/api/bookings/${expandedBooking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          studioId: ebStudioId,
          clientId: ebClientId,
          trainerId: ebTrainerId,
          serviceId: ebServiceId,
          date: ebDate,
          time: ebTime,
          durationMin: Number(ebDuration) || 60,
          status: ebStatus,
          paymentStatus: ebPaymentStatus,
          promoCode: ebPromoCode.trim() || undefined,
          finalAmountRub: Number(ebFinalAmount),
        }),
      });
      onBookingUpdated(updated);
      setIsEditingBooking(false);
    } catch (err) {
      setEbError(err instanceof Error ? err.message : 'Не удалось сохранить изменения записи');
    } finally {
      setEbSaving(false);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    setEbError('');
    try {
      await apiRequest(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      onBookingDeleted?.(bookingId);
      setConfirmDeleteBookingId(null);
      if (expandedBookingId === bookingId) setExpandedBookingId(null);
      if (listExpandedId === bookingId) setListExpandedId(null);
    } catch (err) {
      setEbError(err instanceof Error ? err.message : 'Не удалось удалить запись');
    }
  };

  // Real-time Drag & Drop Move (Push & Pull)
  const handleDropBooking = async (targetDate: string, targetTime?: string) => {
    const id = dragBookingId;
    setDragBookingId(null);
    setDragHoverSlot(null);
    if (!id) return;
    const bk = bookings.find((x) => x.id === id);
    if (!bk) return;

    const nextTime = targetTime || bk.time;
    if (bk.date === targetDate && bk.time === nextTime) return;

    const prevSnapshot = { ...bk };
    const optimistic: Booking = { ...bk, date: targetDate, time: nextTime };
    onBookingUpdated(optimistic);
    setLiveError('');

    try {
      const updated = await apiRequest<Booking>(`/api/bookings/${bk.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ date: targetDate, time: nextTime }),
      });
      onBookingUpdated(updated);
    } catch (err) {
      onBookingUpdated(prevSnapshot);
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Не удалось переместить запись на выбранное время'
      );
    }
  };

  const handleStartEditStudioHours = (studio: Studio) => {
    const parsed = parseStudioScheduleHours(studio);
    setEditingStudioId(studio.id);
    setEditWeekdayStart(parsed.weekday.start);
    setEditWeekdayEnd(parsed.weekday.end);
    setEditWeekendStart(parsed.weekend.start);
    setEditWeekendEnd(parsed.weekend.end);
    setStudioHoursError('');
  };

  const handleSaveStudioHours = async (studioId: string) => {
    setStudioHoursError('');
    if (!editWeekdayStart || !editWeekdayEnd || editWeekdayEnd <= editWeekdayStart) {
      setStudioHoursError('В будни время закрытия должно быть позже времени открытия');
      return;
    }
    if (!editWeekendStart || !editWeekendEnd || editWeekendEnd <= editWeekendStart) {
      setStudioHoursError('В выходные время закрытия должно быть позже времени открытия');
      return;
    }
    setSavingStudioHours(true);
    try {
      const formatted = formatStudioOpenHours(
        { start: editWeekdayStart, end: editWeekdayEnd },
        { start: editWeekendStart, end: editWeekendEnd }
      );
      const updated = await apiRequest<Studio>(`/api/studios/${studioId}`, {
        method: 'PATCH',
        body: JSON.stringify(formatted),
      });
      onStudioUpdated?.(updated);
      setEditingStudioId(null);
    } catch (err) {
      setStudioHoursError(
        err instanceof Error ? err.message : 'Не удалось обновить часы приёма'
      );
    } finally {
      setSavingStudioHours(false);
    }
  };

  const openAddShiftModal = (dayIdx = 0) => {
    setEditingShift(null);
    setShiftError('');
    setSchTrainerId(trainers[0]?.id || '');
    setSchStudioId(
      selectedStudioId !== 'all' ? selectedStudioId : studios[0]?.id || ''
    );
    setSchDay(dayIdx);
    setSchStart('09:00');
    setSchEnd('19:00');
    setSchActive(true);
    setShowShiftModal(true);
  };

  const openEditShiftModal = (sh: TrainerSchedule) => {
    setEditingShift(sh);
    setShiftError('');
    setSchTrainerId(sh.trainerId);
    setSchStudioId(sh.studioId);
    setSchDay(sh.dayOfWeek);
    setSchStart(sh.startTime);
    setSchEnd(sh.endTime);
    setSchActive(sh.active !== false);
    setShowShiftModal(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftError('');
    if (!schEnd || !schStart || schEnd <= schStart) {
      setShiftError('Время окончания смены должно быть позже начала');
      return;
    }
    setSavingShift(true);
    try {
      if (editingShift) {
        const updated = await apiRequest<TrainerSchedule>(
          `/api/schedules/${editingShift.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              trainerId: schTrainerId || trainers[0]?.id,
              studioId: schStudioId || studios[0]?.id,
              dayOfWeek: schDay,
              startTime: schStart,
              endTime: schEnd,
              active: schActive,
            }),
          }
        );
        onScheduleUpdated?.(updated);
      } else {
        const created = await apiRequest<TrainerSchedule>('/api/schedules', {
          method: 'POST',
          body: JSON.stringify({
            trainerId: schTrainerId || trainers[0]?.id,
            studioId: schStudioId || studios[0]?.id,
            dayOfWeek: schDay,
            startTime: schStart,
            endTime: schEnd,
            active: schActive,
          }),
        });
        onScheduleAdded(created);
      }
      setShowShiftModal(false);
      setEditingShift(null);
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : 'Не удалось сохранить смену');
    } finally {
      setSavingShift(false);
    }
  };

  const moveShiftToDay = useCallback(
    async (sh: TrainerSchedule, targetDayIdx: number) => {
      if (!canManageSchedule || sh.dayOfWeek === targetDayIdx) return;
      setLiveError('');
      const prev = { ...sh };
      onScheduleUpdated?.({ ...sh, dayOfWeek: targetDayIdx });
      try {
        const updated = await apiRequest<TrainerSchedule>(`/api/schedules/${sh.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ dayOfWeek: targetDayIdx }),
        });
        onScheduleUpdated?.(updated);
      } catch (err) {
        onScheduleUpdated?.(prev);
        setLiveError(err instanceof Error ? err.message : 'Не удалось перенести смену');
      }
    },
    [canManageSchedule, onScheduleUpdated]
  );

  const detectHoveredShiftDay = (clientX: number, clientY: number): number | null => {
    const container = shiftGridRef.current;
    if (!container) return null;
    const columns = container.querySelectorAll<HTMLElement>('[data-shift-day-idx]');
    for (const col of columns) {
      const rect = col.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const raw = col.getAttribute('data-shift-day-idx');
        const parsed = raw !== null ? Number(raw) : NaN;
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
          return parsed;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      const active = shiftPointerDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;

      const dist = Math.hypot(ev.clientX - active.startX, ev.clientY - active.startY);
      if (!active.moved) {
        if (dist < 5) return;
        active.moved = true;
      }

      ev.preventDefault();
      const hovered = detectHoveredShiftDay(ev.clientX, ev.clientY);
      dragHoverDayRef.current = hovered;
      setDragHoverDayIdx(hovered);
      setDraggingShift({
        id: active.shift.id,
        fromDayIdx: active.shift.dayOfWeek,
        trainerName: active.trainerName,
        timeText: `${active.shift.startTime}–${active.shift.endTime}`,
        studioName: active.studioName,
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
    };

    const finishPointerDrag = (ev: PointerEvent, isDrop: boolean) => {
      const active = shiftPointerDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      const wasMoved = active.moved;
      const shift = active.shift;
      const targetDay = isDrop
        ? detectHoveredShiftDay(ev.clientX, ev.clientY) ?? dragHoverDayRef.current
        : null;

      shiftPointerDragRef.current = null;
      dragHoverDayRef.current = null;
      setDraggingShift(null);
      setDragHoverDayIdx(null);

      if (wasMoved) {
        suppressShiftClickRef.current = true;
        window.setTimeout(() => {
          suppressShiftClickRef.current = false;
        }, 160);
        if (targetDay !== null && targetDay !== shift.dayOfWeek) {
          void moveShiftToDay(shift, targetDay);
        }
      }
    };

    const onPointerUp = (ev: PointerEvent) => finishPointerDrag(ev, true);
    const onPointerCancel = (ev: PointerEvent) => finishPointerDrag(ev, false);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [moveShiftToDay]);

  const handleShiftPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    sh: TrainerSchedule,
    trainerName: string,
    studioName: string
  ) => {
    if (!canManageSchedule) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-no-drag="true"], button, a, input, select, textarea')) {
      return;
    }
    shiftPointerDragRef.current = {
      shift: sh,
      trainerName,
      studioName,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      moved: false,
    };
    dragHoverDayRef.current = sh.dayOfWeek;
  };

  const handleDeleteShift = async (id: string) => {
    if (!canManageSchedule || deletingShiftId === id) return;
    setLiveError('');
    setShiftError('');
    setDeletingShiftId(id);
    try {
      await apiRequest(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onScheduleDeleted(id);
      if (editingShift?.id === id) {
        setShowShiftModal(false);
        setEditingShift(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось удалить смену';
      setLiveError(msg);
      setShiftError(msg);
    } finally {
      setDeletingShiftId((cur) => (cur === id ? null : cur));
    }
  };

  const visibleStudios = useMemo(
    () => studios.filter((s) => selectedStudioId === 'all' || s.id === selectedStudioId),
    [studios, selectedStudioId]
  );

  // Calendar grid hour bounds from studio open hours
  const calendarHours = useMemo(() => {
    let minH = 9;
    let maxH = 21;
    visibleStudios.forEach((st) => {
      const bounds = getStudioHoursBounds(st);
      const startH = parseTimeHourMin(bounds.start).hour;
      const endParsed = parseTimeHourMin(bounds.end);
      const endH = endParsed.min > 0 ? endParsed.hour : Math.max(startH + 1, endParsed.hour - 1);
      if (startH < minH) minH = startH;
      if (endH > maxH) maxH = endH;
    });
    // Also ensure bookings outside default range remain visible
    filteredBookings.forEach((bk) => {
      const h = parseTimeHourMin(bk.time).hour;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    });
    minH = Math.max(6, minH);
    maxH = Math.min(23, maxH);
    return Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  }, [visibleStudios, filteredBookings]);

  const weekDates = useMemo(() => getWeekDates(calendarAnchor), [calendarAnchor]);
  const monthGridDates = useMemo(() => getMonthGridDates(calendarAnchor), [calendarAnchor]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    filteredBookings.forEach((bk) => {
      const list = map.get(bk.date) || [];
      list.push(bk);
      map.set(bk.date, list);
    });
    return map;
  }, [filteredBookings]);

  const bookingStudio =
    studios.find((s) => s.id === (bStudioId || studios[0]?.id)) || studios[0];
  const bookingStudioRange = getStudioHoursForDate(bookingStudio, bDate);
  const bookingIsWeekend = isWeekendDate(bDate);
  const bookingTimeOutOfRange = bookingStudio
    ? !isTimeWithinOpenHours(bTime, bookingStudio, bDate)
    : false;
  const shiftStudio =
    studios.find((s) => s.id === (schStudioId || studios[0]?.id)) || studios[0];

  const editBookingStudio =
    studios.find((s) => s.id === ebStudioId) || studios[0];
  const editBookingRange = getStudioHoursForDate(editBookingStudio, ebDate);
  const editBookingIsWeekend = isWeekendDate(ebDate);
  const editBookingOutOfRange =
    editBookingStudio && ebStatus !== 'cancelled'
      ? !isTimeWithinOpenHours(ebTime, editBookingStudio, ebDate)
      : false;

  const navigatePeriod = (dir: -1 | 1) => {
    if (viewMode === 'month') {
      setCalendarAnchor(
        (prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
      );
    } else {
      setCalendarAnchor((prev) => addDays(prev, dir * 7));
    }
  };

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return `${MONTHS_FULL[calendarAnchor.getMonth()]} ${calendarAnchor.getFullYear()}`;
    }
    const first = weekDates[0];
    const last = weekDates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()}–${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
    }
    return `${first.getDate()} ${MONTHS_SHORT[first.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }, [viewMode, calendarAnchor, weekDates]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-4 border-b st-border">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="inline-flex items-center gap-1 p-1 st-surface-muted rounded-lg border st-border">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'week' ? 'st-surface shadow-sm' : 'st-muted hover:opacity-90'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Неделя</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'month' ? 'st-surface shadow-sm' : 'st-muted hover:opacity-90'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Месяц</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'list' ? 'st-surface shadow-sm' : 'st-muted hover:opacity-90'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>Список</span>
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-1 p-1 st-surface-muted rounded-lg border st-border">
            {(
              [
                ['all', 'Все'],
                ['pending', 'Ожидают'],
                ['confirmed', 'Подтверждены'],
                ['in_progress', 'Идут'],
                ['completed', 'Завершены'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === key
                    ? 'st-surface shadow-sm'
                    : 'st-muted hover:opacity-90'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {currentUser.role !== 'trainer' && trainers.length > 0 && (
            <select
              aria-label="Фильтр по тренеру"
              value={trainerFilter}
              onChange={(e) => setTrainerFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border st-border st-surface cursor-pointer"
            >
              <option value="all">Все тренеры</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => openNewBookingAt()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg st-accent-bg text-xs font-medium hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Новая запись</span>
        </button>
      </div>

      {liveError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          <span>{liveError}</span>
          <button
            type="button"
            onClick={() => setLiveError('')}
            className="p-1 rounded hover:opacity-80 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Calendar / List Section */}
      {viewMode !== 'list' ? (
        <div className="rounded-xl st-surface border st-border overflow-hidden">
          {/* Calendar Header Navigation */}
          <div className="px-4 sm:px-5 py-3.5 border-b st-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border st-border st-surface-muted p-0.5">
                <button
                  type="button"
                  onClick={() => navigatePeriod(-1)}
                  className="p-1.5 rounded-md hover:opacity-80 cursor-pointer"
                  aria-label="Предыдущий период"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarAnchor(new Date())}
                  className="px-2.5 py-1 text-xs font-medium hover:opacity-80 cursor-pointer"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => navigatePeriod(1)}
                  className="p-1.5 rounded-md hover:opacity-80 cursor-pointer"
                  aria-label="Следующий период"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-display text-base font-semibold capitalize">
                {periodLabel}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] st-muted">
              <span>Перетащите запись на другой день или время для переноса · Нажмите на запись, чтобы раскрыть</span>
              <span className="font-mono font-medium">
                Записей: {filteredBookings.length}
              </span>
            </div>
          </div>

          {viewMode === 'week' ? (
            /* WEEK CALENDAR (Hourly Grid with 30-min push&pull Drop Zones) */
            <div className="overflow-x-auto">
              <div className="min-w-[880px]">
                {/* Day Headers */}
                <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b st-border st-surface-muted">
                  <div className="p-2 text-[11px] font-mono st-muted flex items-center justify-center border-r st-border">
                    Время
                  </div>
                  {weekDates.map((d, idx) => {
                    const iso = toIsoDate(d);
                    const isToday = iso === todayIso;
                    const dayShifts = schedules.filter(
                      (s) =>
                        s.dayOfWeek === idx &&
                        s.active !== false &&
                        (selectedStudioId === 'all' || s.studioId === selectedStudioId) &&
                        (trainerFilter === 'all' || s.trainerId === trainerFilter)
                    );
                    return (
                      <div
                        key={iso}
                        className={`px-2.5 py-2 border-r last:border-r-0 st-border flex items-center justify-between gap-1 ${
                          isToday ? 'st-accent-soft' : ''
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            <span>
                              {DAYS[idx]} {d.getDate()} {MONTHS_SHORT[d.getMonth()]}
                            </span>
                            {isToday && (
                              <span className="w-1.5 h-1.5 rounded-full st-accent-bg inline-block" />
                            )}
                          </div>
                          <div className="text-[10px] st-muted">
                            {dayShifts.length > 0
                              ? `Смен: ${dayShifts.length}`
                              : 'Нет смен'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openNewBookingAt(iso, '12:00')}
                          title={`Записать на ${iso}`}
                          className="p-1 rounded border st-border st-surface text-[10px] st-muted hover:opacity-90 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Hourly Grid Rows */}
                <div className="divide-y st-border">
                  {calendarHours.map((hour) => {
                    const hourLabel = `${String(hour).padStart(2, '0')}:00`;
                    const halfLabel = `${String(hour).padStart(2, '0')}:30`;
                    return (
                      <div
                        key={hour}
                        className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] min-h-[76px]"
                      >
                        {/* Hour Label */}
                        <div className="px-2 py-2 text-[11px] font-mono st-muted border-r st-border flex items-start justify-center tabular-nums">
                          {hourLabel}
                        </div>

                        {/* Day Cells (with :00 and :30 drop targets) */}
                        {weekDates.map((d) => {
                          const iso = toIsoDate(d);
                          const slotBookings = (bookingsByDate.get(iso) || []).filter(
                            (bk) => parseTimeHourMin(bk.time).hour === hour
                          );

                          const renderDropSubZone = (slotTime: string, isHalf: boolean) => {
                            const slotKey = `${iso}|${slotTime}`;
                            const isOver = dragHoverSlot === slotKey;
                            const subBookings = slotBookings.filter((bk) => {
                              const { min } = parseTimeHourMin(bk.time);
                              return isHalf ? min >= 30 : min < 30;
                            });

                            return (
                              <div
                                key={slotTime}
                                onDragOver={(e) => {
                                  if (!dragBookingId) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (dragHoverSlot !== slotKey) {
                                    setDragHoverSlot(slotKey);
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragHoverSlot === slotKey) setDragHoverSlot(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  handleDropBooking(iso, slotTime);
                                }}
                                onClick={(e) => {
                                  if (e.target === e.currentTarget && subBookings.length === 0) {
                                    openNewBookingAt(iso, slotTime);
                                  }
                                }}
                                title={
                                  subBookings.length === 0
                                    ? `Нажмите, чтобы записать на ${slotTime}`
                                    : undefined
                                }
                                className={`flex-1 min-h-[38px] p-1 space-y-1 transition-colors ${
                                  isHalf ? 'border-t border-dashed st-border' : ''
                                } ${
                                  isOver
                                    ? 'bg-cyan-500/15 ring-1 ring-inset ring-cyan-500'
                                    : subBookings.length === 0
                                    ? 'hover:bg-slate-500/5 cursor-pointer'
                                    : ''
                                }`}
                              >
                                {isOver && subBookings.length === 0 && (
                                  <div className="text-[10px] font-mono st-accent-text text-center py-1">
                                    → {slotTime}
                                  </div>
                                )}
                                {subBookings.map((bk) => {
                                  const meta = STATUS_LABELS[bk.status];
                                  const isDragging = dragBookingId === bk.id;
                                  const bkClient = clients.find((c) => c.id === bk.clientId);
                                  const isGuestBooking = Boolean(
                                    bkClient &&
                                      (bk.studioId !== bkClient.studioId ||
                                        (bkClient.assignedTrainerId && bk.trainerId !== bkClient.assignedTrainerId))
                                  );
                                  return (
                                    <div
                                      key={bk.id}
                                      draggable
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        setDragBookingId(bk.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', bk.id);
                                      }}
                                      onDragEnd={() => {
                                        setDragBookingId(null);
                                        setDragHoverSlot(null);
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openExpandedBooking(bk, false);
                                      }}
                                      className={`group rounded-md border st-border border-l-4 ${meta.cardBorder} st-surface px-2 py-1.5 shadow-sm hover:shadow-md transition-all cursor-pointer select-none ${
                                        isDragging ? 'opacity-40 scale-95' : ''
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold tabular-nums">
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}
                                          />
                                          <span>{bk.time}</span>
                                        </span>
                                        <span
                                          className="opacity-45 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
                                          title="Перетащить запись"
                                        >
                                          <GripVertical className="w-3 h-3" />
                                        </span>
                                      </div>
                                      <div className="text-[11px] font-semibold truncate mt-0.5">
                                        {bk.clientName}
                                      </div>
                                      <div className="text-[10px] st-muted truncate">
                                        {bk.trainerName} · {bk.durationMin}м
                                        {isGuestBooking ? ' · гость' : ''}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          };

                          return (
                            <div
                              key={iso}
                              className={`border-r last:border-r-0 st-border flex flex-col ${
                                iso === todayIso ? 'bg-cyan-500/[0.025]' : ''
                              }`}
                            >
                              {renderDropSubZone(hourLabel, false)}
                              {renderDropSubZone(halfLabel, true)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* MONTH CALENDAR (Push & Pull between Dates) */
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b st-border st-surface-muted">
                  {DAYS.map((dayName) => (
                    <div
                      key={dayName}
                      className="px-3 py-2 text-xs font-semibold text-center border-r last:border-r-0 st-border"
                    >
                      {dayName}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 divide-x divide-y st-border">
                  {monthGridDates.map((d) => {
                    const iso = toIsoDate(d);
                    const isCurrentMonth = d.getMonth() === calendarAnchor.getMonth();
                    const isToday = iso === todayIso;
                    const dayBookings = bookingsByDate.get(iso) || [];
                    const isOver = dragHoverSlot === iso;

                    return (
                      <div
                        key={iso}
                        onDragOver={(e) => {
                          if (!dragBookingId) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragHoverSlot !== iso) setDragHoverSlot(iso);
                        }}
                        onDragLeave={() => {
                          if (dragHoverSlot === iso) setDragHoverSlot(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropBooking(iso);
                        }}
                        className={`min-h-[126px] p-2 space-y-1.5 transition-colors ${
                          !isCurrentMonth ? 'opacity-45 st-surface-muted' : ''
                        } ${isToday ? 'bg-cyan-500/[0.04]' : ''} ${
                          isOver ? 'bg-cyan-500/15 ring-2 ring-inset ring-cyan-500' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                              isToday ? 'st-accent-bg' : ''
                            }`}
                          >
                            {d.getDate()}
                          </span>
                          <button
                            type="button"
                            onClick={() => openNewBookingAt(iso, '12:00')}
                            title={`Добавить запись на ${iso}`}
                            className="p-0.5 rounded st-muted hover:opacity-100 opacity-60 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          {dayBookings.map((bk) => {
                            const meta = STATUS_LABELS[bk.status];
                            const isDragging = dragBookingId === bk.id;
                            return (
                              <div
                                key={bk.id}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  setDragBookingId(bk.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', bk.id);
                                }}
                                onDragEnd={() => {
                                  setDragBookingId(null);
                                  setDragHoverSlot(null);
                                }}
                                onClick={() => openExpandedBooking(bk, false)}
                                className={`group rounded border st-border border-l-4 ${meta.cardBorder} st-surface px-1.5 py-1 text-[11px] shadow-xs hover:shadow cursor-pointer select-none ${
                                  isDragging ? 'opacity-40' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono font-semibold truncate">
                                    {bk.time} · {bk.clientName}
                                  </span>
                                  <GripVertical className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100 cursor-grab" />
                                </div>
                                <div className="text-[10px] st-muted truncate">
                                  {bk.trainerName}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* LIST VIEW (With click-to-expand row & edit button) */
        <div className="rounded-xl st-surface border st-border overflow-hidden">
          <div className="px-5 py-4 border-b st-border flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">
              Список бронирований в реальном времени
            </h3>
            <span className="text-xs font-mono st-muted">
              Записей: {filteredBookings.length} · Нажмите на строку для раскрытия
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b st-border text-xs st-muted text-left">
                  <th className="py-2.5 px-5 font-medium">Дата / Время</th>
                  <th className="py-2.5 px-5 font-medium">Клиент</th>
                  <th className="py-2.5 px-5 font-medium">Услуга и студия</th>
                  <th className="py-2.5 px-5 font-medium">Тренер</th>
                  <th className="py-2.5 px-5 font-medium text-right">Сумма</th>
                  <th className="py-2.5 px-5 font-medium">Статус</th>
                  <th className="py-2.5 px-5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y st-border">
                {filteredBookings.map((bk) => {
                  const st = studios.find((s) => s.id === bk.studioId);
                  const cl = clients.find((c) => c.id === bk.clientId);
                  const statusMeta = STATUS_LABELS[bk.status];
                  const isRowExpanded = listExpandedId === bk.id;
                  return (
                    <React.Fragment key={bk.id}>
                      <tr
                        onClick={() =>
                          setListExpandedId((prev) => (prev === bk.id ? null : bk.id))
                        }
                        className="hover:bg-slate-500/5 cursor-pointer"
                      >
                        <td className="py-3 px-5 font-mono text-xs tabular-nums whitespace-nowrap">
                          <div className="font-semibold">{bk.date}</div>
                          <div className="st-muted">
                            {bk.time} · {bk.durationMin} мин
                          </div>
                        </td>
                        <td className="py-3 px-5 font-medium">
                          <div>{bk.clientName}</div>
                          {cl &&
                            (bk.studioId !== cl.studioId ||
                              (cl.assignedTrainerId && bk.trainerId !== cl.assignedTrainerId)) && (
                              <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                Гостевое занятие / другая студия
                              </div>
                            )}
                        </td>
                        <td className="py-3 px-5">
                          <div>{bk.serviceName}</div>
                          <div className="text-xs st-muted">{st?.name || 'Студия'}</div>
                        </td>
                        <td className="py-3 px-5 st-muted">{bk.trainerName}</td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold">
                            {bk.finalAmountRub.toLocaleString('ru-RU')} ₽
                          </div>
                          <div className="text-[11px] st-muted">
                            {PAYMENT_LABELS[bk.paymentStatus]}
                          </div>
                        </td>
                        <td className="py-3 px-5 whitespace-nowrap">
                          <span className={`text-xs font-medium ${statusMeta.tone}`}>
                            ● {statusMeta.text}
                          </span>
                        </td>
                        <td
                          className="py-3 px-5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openExpandedBooking(bk, true)}
                              title="Редактировать запись"
                              className="p-1.5 rounded-md border st-border st-muted hover:opacity-90 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {bk.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(bk.id, 'confirmed')}
                                title="Подтвердить"
                                className="p-1.5 rounded-md border st-border text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(bk.status === 'confirmed' || bk.status === 'in_progress') && (
                              <button
                                type="button"
                                onClick={() => onStartLiveSession(bk)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md st-accent-bg text-xs font-medium cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                <span>
                                  {bk.status === 'in_progress' ? 'В сессию' : 'Начать'}
                                </span>
                              </button>
                            )}
                            {bk.status !== 'completed' && bk.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(bk.id, 'cancelled')}
                                title="Отменить"
                                className="p-1.5 rounded-md border st-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isRowExpanded && (
                        <tr className="st-surface-muted">
                          <td colSpan={7} className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                              <div className="flex flex-wrap items-center gap-4">
                                <span>
                                  <strong>Телефон:</strong> {cl?.phone || '—'}
                                </span>
                                <span>
                                  <strong>Telegram:</strong> {cl?.telegram || '—'}
                                </span>
                                <span>
                                  <strong>Часы студии:</strong> {st?.openHours || '—'}
                                </span>
                                {bk.promoCode && (
                                  <span>
                                    <strong>Промокод:</strong>{' '}
                                    <span className="font-mono">{bk.promoCode}</span>
                                  </span>
                                )}
                                <span>
                                  <strong>Создана:</strong> {bk.createdAt}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openExpandedBooking(bk, true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Открыть и редактировать</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!filteredBookings.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm st-muted">
                      Записей по выбранным фильтрам нет. Создайте новую запись.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trainer Shift Schedule (Real-time Editable + Pointer Drag & Drop Across Days) */}
      <div className="rounded-xl st-surface border st-border overflow-hidden">
        <div className="px-5 py-4 border-b st-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">
              График работы тренеров по дням недели
            </h3>
            <p className="text-xs st-muted mt-0.5">
              Редактируется в реальном времени · Перетащите карточку смены на другой день недели, нажмите для правки или удалите кнопкой корзины
            </p>
          </div>
          {canManageSchedule && (
            <button
              type="button"
              onClick={() => openAddShiftModal(0)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Добавить смену</span>
            </button>
          )}
        </div>

        <div
          ref={shiftGridRef}
          className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x st-border"
        >
          {DAYS.map((dayName, idx) => {
            const dayShifts = schedules.filter(
              (s) =>
                s.dayOfWeek === idx &&
                (selectedStudioId === 'all' || s.studioId === selectedStudioId)
            );
            const isDropTarget =
              Boolean(draggingShift) &&
              dragHoverDayIdx === idx &&
              draggingShift?.fromDayIdx !== idx;
            return (
              <div
                key={dayName}
                data-shift-day-idx={idx}
                className={`p-3 space-y-2 min-h-[150px] transition-colors ${
                  isDropTarget ? 'bg-cyan-500/15 ring-2 ring-inset ring-cyan-500' : ''
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 border-b st-border">
                  <span className="text-xs font-semibold">{dayName}</span>
                  {canManageSchedule && (
                    <button
                      type="button"
                      onClick={() => openAddShiftModal(idx)}
                      title={`Добавить смену (${FULL_DAYS[idx]})`}
                      className="p-1 rounded st-muted hover:opacity-100 opacity-75 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isDropTarget && (
                  <div className="px-2 py-1 rounded-md border border-dashed border-cyan-500/70 bg-cyan-500/10 text-[10px] font-medium st-accent-text text-center">
                    Перенести в {dayName}
                  </div>
                )}

                {dayShifts.map((sh) => {
                  const tr = trainers.find((t) => t.id === sh.trainerId);
                  const st = studios.find((s) => s.id === sh.studioId);
                  const isPaused = sh.active === false;
                  const isBeingDragged = draggingShift?.id === sh.id;
                  const isDeleting = deletingShiftId === sh.id;
                  const trStats = tr ? getRatingStats(reviews, 'trainer', tr.id) : { average: 0, count: 0 };
                  return (
                    <div
                      key={sh.id}
                      onPointerDown={(e) =>
                        handleShiftPointerDown(e, sh, tr?.name || 'Тренер', st?.name || '')
                      }
                      onClick={() => {
                        if (suppressShiftClickRef.current) return;
                        if (canManageSchedule) openEditShiftModal(sh);
                      }}
                      className={`p-2 rounded-lg st-surface-muted border st-border text-xs space-y-1 select-none transition-all ${
                        canManageSchedule
                          ? 'cursor-grab active:cursor-grabbing hover:shadow-sm'
                          : ''
                      } ${isPaused ? 'opacity-60' : ''} ${
                        isBeingDragged ? 'opacity-35 scale-95 ring-1 ring-cyan-500/60' : ''
                      } ${isDeleting ? 'opacity-45 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {canManageSchedule && (
                            <GripVertical className="w-3.5 h-3.5 st-muted shrink-0 touch-none" />
                          )}
                          <span className="font-medium truncate">{tr?.name || 'Тренер'}</span>
                        </div>

                        {canManageSchedule && (
                          <div
                            data-no-drag="true"
                            className="flex items-center gap-0.5 shrink-0"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditShiftModal(sh);
                              }}
                              title="Редактировать смену"
                              aria-label="Редактировать смену"
                              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-cyan-600 hover:bg-cyan-500/10 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteShift(sh.id);
                              }}
                              title="Удалить смену"
                              aria-label="Удалить смену"
                              className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <div className="font-mono text-[11px] font-semibold st-accent-text">
                          {sh.startTime}–{sh.endTime}
                          {isPaused ? ' · Пауза' : ''}
                        </div>
                        {trStats.count > 0 && (
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 shrink-0">
                            ★{trStats.average.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] st-muted truncate">{st?.name}</div>
                    </div>
                  );
                })}
                {!dayShifts.length && !isDropTarget && (
                  <div className="text-[11px] st-muted pt-2">Нет смен</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Drag Preview for Trainer Shift */}
      {draggingShift && (
        <div
          style={{
            left: draggingShift.clientX + 12,
            top: draggingShift.clientY + 12,
          }}
          className="fixed z-[90] pointer-events-none w-44 rounded-lg st-surface border-2 border-cyan-500 px-2.5 py-2 shadow-2xl text-xs space-y-0.5 opacity-95"
        >
          <div className="flex items-center gap-1 font-semibold truncate">
            <GripVertical className="w-3.5 h-3.5 st-accent-text shrink-0" />
            <span className="truncate">{draggingShift.trainerName}</span>
          </div>
          <div className="font-mono text-[11px] st-accent-text">{draggingShift.timeText}</div>
          {draggingShift.studioName && (
            <div className="text-[10px] st-muted truncate">{draggingShift.studioName}</div>
          )}
        </div>
      )}

      {/* Studio Reception Hours Management */}
      <div className="rounded-xl st-surface border st-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 st-accent-text" />
            <h3 className="font-display text-sm font-semibold">Время приёма в студиях</h3>
          </div>
          <span className="text-xs st-muted">
            Определяет доступные часы для записи клиентов и смен тренеров
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleStudios.map((st) => {
            const isEditing = editingStudioId === st.id;
            const sched = parseStudioScheduleHours(st);
            const canEditThis =
              canManageSchedule &&
              (currentUser.role === 'owner' ||
                !currentUser.studioId ||
                currentUser.studioId === st.id);
            const stStats = getRatingStats(reviews, 'studio', st.id);
            return (
              <div
                key={st.id}
                className="p-3 rounded-lg st-surface-muted border st-border space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">{st.name}</span>
                      <RatingBadge average={stStats.average} count={stStats.count} compact />
                    </div>
                    <div className="text-[11px] st-muted truncate">
                      {st.city} · {st.address}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono st-muted shrink-0">
                    Рам: {st.framesCount}
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium st-muted">
                        Будни (Пн–Пт)
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          aria-label="Будни открытие"
                          value={editWeekdayStart}
                          onChange={(e) => setEditWeekdayStart(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs font-mono rounded border st-border st-surface"
                        />
                        <span className="text-xs st-muted">—</span>
                        <input
                          type="time"
                          aria-label="Будни закрытие"
                          value={editWeekdayEnd}
                          onChange={(e) => setEditWeekdayEnd(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs font-mono rounded border st-border st-surface"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium st-muted">
                          Выходные (Сб–Вс)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditWeekendStart(editWeekdayStart);
                            setEditWeekendEnd(editWeekdayEnd);
                          }}
                          className="text-[10px] st-accent-text hover:underline cursor-pointer"
                        >
                          Как в будни
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          aria-label="Выходные открытие"
                          value={editWeekendStart}
                          onChange={(e) => setEditWeekendStart(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs font-mono rounded border st-border st-surface"
                        />
                        <span className="text-xs st-muted">—</span>
                        <input
                          type="time"
                          aria-label="Выходные закрытие"
                          value={editWeekendEnd}
                          onChange={(e) => setEditWeekendEnd(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs font-mono rounded border st-border st-surface"
                        />
                      </div>
                    </div>

                    {studioHoursError && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">
                        {studioHoursError}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingStudioId(null)}
                        className="px-2.5 py-1 text-[11px] rounded border st-border st-muted cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={savingStudioHours}
                        onClick={() => handleSaveStudioHours(st.id)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded st-accent-bg cursor-pointer disabled:opacity-60"
                      >
                        {savingStudioHours ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-2 pt-0.5">
                    <div className="space-y-0.5 text-xs font-mono tabular-nums">
                      <div className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 st-accent-text shrink-0" />
                        <span className="st-muted font-sans text-[11px]">Будни:</span>
                        <span className="font-semibold">
                          {sched.weekday.start} – {sched.weekday.end}
                        </span>
                      </div>
                      <div className="pl-5 flex items-center gap-1.5">
                        <span className="st-muted font-sans text-[11px]">Выходные:</span>
                        <span className="font-semibold">
                          {sched.weekend.start} – {sched.weekend.end}
                        </span>
                      </div>
                    </div>
                    {canEditThis && (
                      <button
                        type="button"
                        onClick={() => handleStartEditStudioHours(st)}
                        className="text-xs font-medium st-accent-text hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Изменить приём
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentUser.role === 'admin' && (
        <LegalAgreementsPanel
          currentUser={currentUser}
          brandName={brandName}
          compact
          onAccepted={onLegalAccepted}
        />
      )}

      {/* Modal: Expanded Booking Card & Real-time Editor */}
      {expandedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => {
            setExpandedBookingId(null);
            setIsEditingBooking(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl my-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b st-border">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      STATUS_LABELS[expandedBooking.status].badgeBg
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        STATUS_LABELS[expandedBooking.status].dot
                      }`}
                    />
                    <span>{STATUS_LABELS[expandedBooking.status].text}</span>
                  </span>
                  <span className="text-xs font-mono st-muted tabular-nums">
                    {expandedBooking.date} · {expandedBooking.time} ({expandedBooking.durationMin} мин)
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold">
                  {expandedBooking.clientName}
                </h3>
                <div className="text-xs st-muted">{expandedBooking.serviceName}</div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setExpandedBookingId(null);
                  setIsEditingBooking(false);
                }}
                className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {ebError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {ebError}
              </div>
            )}

            {!isEditingBooking ? (
              /* READ / EXPANDED DETAILS VIEW */
              <div className="space-y-4">
                {(() => {
                  const cl = clients.find((c) => c.id === expandedBooking.clientId);
                  const st = studios.find((s) => s.id === expandedBooking.studioId);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg st-surface-muted border st-border space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 st-accent-text" />
                          <span>Клиент и контакты</span>
                        </div>
                        <div>{expandedBooking.clientName}</div>
                        <div className="st-muted flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{cl?.phone || 'Телефон не указан'}</span>
                        </div>
                        {cl?.telegram && (
                          <div className="st-muted font-mono">TG: {cl.telegram}</div>
                        )}
                      </div>

                      <div className="p-3 rounded-lg st-surface-muted border st-border space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 st-accent-text" />
                          <span>Студия и тренер</span>
                        </div>
                        <div>{st?.name || 'Студия'}</div>
                        <div className="st-muted">Тренер: {expandedBooking.trainerName}</div>
                        {cl &&
                          (expandedBooking.studioId !== cl.studioId ||
                            (cl.assignedTrainerId &&
                              expandedBooking.trainerId !== cl.assignedTrainerId)) && (
                            <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              Занятие в другой студии / у нового тренера
                            </div>
                          )}
                        {st && (
                          <div className="st-muted font-mono">Приём: {st.openHours}</div>
                        )}
                      </div>

                      <div className="p-3 rounded-lg st-surface-muted border st-border space-y-1 sm:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 st-accent-text" />
                            <span>Оплата и стоимость</span>
                          </div>
                          <span className="font-mono text-sm font-bold">
                            {expandedBooking.finalAmountRub.toLocaleString('ru-RU')} ₽
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 st-muted">
                          <span>Статус оплаты: {PAYMENT_LABELS[expandedBooking.paymentStatus]}</span>
                          {expandedBooking.promoCode && (
                            <span className="font-mono">
                              Промокод: {expandedBooking.promoCode}
                            </span>
                          )}
                          <span>Создана: {expandedBooking.createdAt}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t st-border">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingBooking(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Редактировать запись</span>
                    </button>

                    {canManageSchedule &&
                      (confirmDeleteBookingId === expandedBooking.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteBooking(expandedBooking.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Подтвердить удаление
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBookingId(null)}
                            className="px-2 py-1.5 rounded-lg border st-border text-xs st-muted cursor-pointer"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBookingId(expandedBooking.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Удалить</span>
                        </button>
                      ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {expandedBooking.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleStatusChange(expandedBooking.id, 'confirmed')
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border st-border text-xs font-medium text-cyan-700 dark:text-cyan-400 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Подтвердить</span>
                      </button>
                    )}
                    {(expandedBooking.status === 'confirmed' ||
                      expandedBooking.status === 'in_progress') && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedBookingId(null);
                          onStartLiveSession(expandedBooking);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>
                          {expandedBooking.status === 'in_progress'
                            ? 'Открыть сессию'
                            : 'Начать сессию'}
                        </span>
                      </button>
                    )}
                    {expandedBooking.status !== 'completed' &&
                      expandedBooking.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(expandedBooking.id, 'cancelled')
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border st-border text-xs font-medium text-rose-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Отменить запись</span>
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ) : (
              /* REAL-TIME EDIT FORM INSIDE EXPANDED BOOKING */
              <form onSubmit={handleSaveBookingEdit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Студия</label>
                    <select
                      value={ebStudioId}
                      onChange={(e) => setEbStudioId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {studios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.openHours})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Клиент</label>
                    <select
                      value={ebClientId}
                      onChange={(e) => setEbClientId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Тренер</label>
                    <select
                      value={ebTrainerId}
                      onChange={(e) => setEbTrainerId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Услуга</label>
                    <select
                      value={ebServiceId}
                      onChange={(e) => {
                        const srvId = e.target.value;
                        setEbServiceId(srvId);
                        const srv = services.find((s) => s.id === srvId);
                        if (srv) {
                          setEbDuration(srv.durationMin);
                          setEbFinalAmount(srv.priceRub);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {SERVICE_CATEGORY_OPTIONS.map((cat) => {
                        const groupItems = services
                          .filter((s) => s.active !== false && inferServiceCategory(s) === cat.id)
                          .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
                        if (groupItems.length === 0) return null;
                        return (
                          <optgroup key={cat.id} label={cat.label}>
                            {groupItems.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} — {s.priceRub} ₽ ({s.durationMin} мин)
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Дата</label>
                    <input
                      type="date"
                      required
                      value={ebDate}
                      onChange={(e) => setEbDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Время</label>
                    <input
                      type="time"
                      required
                      value={ebTime}
                      onChange={(e) => setEbTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Длит. (мин)</label>
                    <input
                      type="number"
                      min={15}
                      max={240}
                      value={ebDuration}
                      onChange={(e) => setEbDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>

                {editBookingOutOfRange && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                    Выбранное время ({ebTime}) вне часов приёма студии ({editBookingIsWeekend ? 'выходные' : 'будни'}:{' '}
                    {editBookingRange.start} – {editBookingRange.end}).
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Статус записи</label>
                    <select
                      value={ebStatus}
                      onChange={(e) => setEbStatus(e.target.value as BookingStatus)}
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {(Object.keys(STATUS_LABELS) as BookingStatus[]).map((stKey) => (
                        <option key={stKey} value={stKey}>
                          {STATUS_LABELS[stKey].text}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Оплата</label>
                    <select
                      value={ebPaymentStatus}
                      onChange={(e) =>
                        setEbPaymentStatus(e.target.value as PaymentStatus)
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {(Object.keys(PAYMENT_LABELS) as PaymentStatus[]).map((pk) => (
                        <option key={pk} value={pk}>
                          {PAYMENT_LABELS[pk]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Итоговая сумма (₽)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={ebFinalAmount}
                      onChange={(e) => setEbFinalAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Промокод</label>
                    <input
                      type="text"
                      value={ebPromoCode}
                      onChange={(e) => setEbPromoCode(e.target.value)}
                      placeholder="Не указан"
                      className="w-full px-3 py-2 text-xs font-mono uppercase rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t st-border">
                  <button
                    type="button"
                    onClick={() => setIsEditingBooking(false)}
                    className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={ebSaving}
                    className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer disabled:opacity-60"
                  >
                    {ebSaving ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: New Booking */}
      {showNewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateBooking}
            className="w-full max-w-md rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl my-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                Новая запись на тренировку
              </h3>
              <button
                type="button"
                onClick={() => setShowNewBooking(false)}
                className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium st-muted mb-1">Студия</label>
              <select
                value={bStudioId}
                onChange={(e) => setBStudioId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium st-muted mb-1">Клиент</label>
              <select
                value={bClientId}
                onChange={(e) => setBClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium st-muted mb-1">Тренер</label>
              <select
                value={bTrainerId}
                onChange={(e) => setBTrainerId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selCl = clients.find((c) => c.id === bClientId);
              if (
                selCl &&
                (bStudioId !== selCl.studioId ||
                  (selCl.assignedTrainerId && bTrainerId !== selCl.assignedTrainerId))
              ) {
                return (
                  <div className="p-2.5 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-800 dark:text-cyan-200">
                    Запись в другую студию или к новому тренеру: выбранный тренер автоматически увидит карту клиента для проведения занятия.
                  </div>
                );
              }
              return null;
            })()}
            <div>
              <label className="block text-xs font-medium st-muted mb-1">Услуга</label>
              <select
                value={bServiceId}
                onChange={(e) => setBServiceId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {SERVICE_CATEGORY_OPTIONS.map((cat) => {
                  const groupItems = services
                    .filter((s) => s.active !== false && inferServiceCategory(s) === cat.id)
                    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
                  if (groupItems.length === 0) return null;
                  return (
                    <optgroup key={cat.id} label={cat.label}>
                      {groupItems.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.priceRub} ₽ ({s.durationMin} мин)
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium st-muted mb-1">Дата</label>
                <input
                  type="date"
                  value={bDate}
                  onChange={(e) => setBDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium st-muted mb-1">
                  Время ({bookingIsWeekend ? 'выходные' : 'будни'}: {bookingStudioRange.start}–{bookingStudioRange.end})
                </label>
                <input
                  type="time"
                  min={bookingStudioRange.start}
                  max={bookingStudioRange.end}
                  value={bTime}
                  onChange={(e) => {
                    setBTime(e.target.value);
                    setBookingError('');
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface font-mono"
                />
              </div>
            </div>
            {bookingTimeOutOfRange && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                Выбранное время ({bTime}) вне часов приёма студии ({bookingIsWeekend ? 'выходные' : 'будни'}: {bookingStudioRange.start} – {bookingStudioRange.end}).
              </div>
            )}
            {bookingError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {bookingError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium st-muted mb-1">
                Промокод (необязательно)
              </label>
              <input
                type="text"
                placeholder="FIRST20"
                value={bPromo}
                onChange={(e) => setBPromo(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface font-mono uppercase"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewBooking(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer"
              >
                Записать клиента
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Add or Edit Trainer Shift */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveShift}
            className="w-full max-w-md rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                {editingShift ? 'Редактировать смену тренера' : 'Добавить смену тренера'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowShiftModal(false);
                  setEditingShift(null);
                }}
                className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shiftError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {shiftError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium st-muted mb-1">Тренер</label>
              <select
                value={schTrainerId}
                onChange={(e) => setSchTrainerId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium st-muted mb-1">
                Студия {shiftStudio ? `(приём ${shiftStudio.openHours})` : ''}
              </label>
              <select
                value={schStudioId}
                onChange={(e) => setSchStudioId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.openHours})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium st-muted mb-1">День недели</label>
              <select
                value={schDay}
                onChange={(e) => setSchDay(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              >
                {FULL_DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium st-muted mb-1">Начало</label>
                <input
                  type="time"
                  value={schStart}
                  onChange={(e) => setSchStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium st-muted mb-1">Окончание</label>
                <input
                  type="time"
                  value={schEnd}
                  onChange={(e) => setSchEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface font-mono"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={schActive}
                onChange={(e) => setSchActive(e.target.checked)}
              />
              <span>Смена активна (участвует в онлайн-записи)</span>
            </label>

            <div className="flex items-center justify-between gap-2 pt-2 border-t st-border">
              {editingShift ? (
                <button
                  type="button"
                  onClick={() => handleDeleteShift(editingShift.id)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border st-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить</span>
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowShiftModal(false);
                    setEditingShift(null);
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingShift}
                  className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer disabled:opacity-60"
                >
                  {savingShift
                    ? 'Сохранение...'
                    : editingShift
                    ? 'Сохранить изменения'
                    : 'Сохранить смену'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
