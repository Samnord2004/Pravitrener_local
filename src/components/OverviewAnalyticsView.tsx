import React, { useMemo, useState } from 'react';
import {
  Plus,
  Building2,
  TrendingUp,
  Users,
  Activity,
  Calendar,
  Pencil,
  Trash2,
  Upload,
  ImagePlus,
  X,
  Star,
  Clock,
  ChevronDown,
  ChevronUp,
  Mail,
  Sparkles,
} from 'lucide-react';
import type {
  UserAccount,
  Studio,
  Booking,
  TrainingSessionRecord,
  ClientProfile,
  ServiceItem,
  RatingReview,
  BrandAboutInfo,
  StudioSocialLinks,
  LegalAcceptanceRecord,
} from '../types';
import { LegalAgreementsPanel, OwnerLegalConfirmationsPanel } from './LegalAgreementsModal';
import { apiRequest } from '../utils/api';
import { formatStudioOpenHours, parseStudioScheduleHours } from '../utils/studioHours';
import { DEFAULT_BRAND_ABOUT } from '../utils/brandAbout';
import {
  STUDIO_PHOTO_PRESETS,
  compressStudioPhoto,
  getRatingStats,
  isValidStudioPhotoSrc,
} from '../utils/reviews';
import { RatingBadge } from './RatingStars';
import { StudioSocialButtons } from './StudioSocialButtons';
import { BrandAboutEditorModal } from './BrandAboutEditorModal';

interface OverviewProps {
  currentUser: UserAccount;
  studios: Studio[];
  selectedStudioId: string;
  onSelectStudio: (id: string) => void;
  users: UserAccount[];
  bookings: Booking[];
  sessions: TrainingSessionRecord[];
  clients: ClientProfile[];
  services: ServiceItem[];
  reviews?: RatingReview[];
  brandAbout?: BrandAboutInfo;
  legalAcceptances?: LegalAcceptanceRecord[];
  onLegalAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  onLegalMarkedRead?: (rec: LegalAcceptanceRecord) => void;
  onBrandAboutUpdated?: (info: BrandAboutInfo) => void;
  onStudioAdded: (studio: Studio) => void;
  onStudioUpdated: (studio: Studio) => void;
  onStudioDeleted?: (id: string) => void;
}

export const OverviewAnalyticsView: React.FC<OverviewProps> = ({
  currentUser,
  studios,
  selectedStudioId,
  onSelectStudio,
  users,
  bookings,
  sessions,
  clients,
  services,
  reviews = [],
  brandAbout,
  legalAcceptances = [],
  onLegalAccepted,
  onLegalMarkedRead,
  onBrandAboutUpdated,
  onStudioAdded,
  onStudioUpdated,
  onStudioDeleted,
}) => {
  const canManageStudios = currentUser.role === 'owner' || currentUser.role === 'admin';
  const effectiveBrandAbout = brandAbout || DEFAULT_BRAND_ABOUT;

  const [showBrandAboutModal, setShowBrandAboutModal] = useState(false);
  const [brandEditorInitialTab, setBrandEditorInitialTab] = useState<
    'general' | 'blocks' | 'branding'
  >('general');

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  // Studio Create / Edit Modal
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [editingStudioId, setEditingStudioId] = useState<string | null>(null);
  const [studioName, setStudioName] = useState('');
  const [studioCity, setStudioCity] = useState('Москва');
  const [studioAddress, setStudioAddress] = useState('');
  const [studioPhone, setStudioPhone] = useState('+7 (495) 120-88-00');
  const [studioEmail, setStudioEmail] = useState('');
  const [studioRouteHint, setStudioRouteHint] = useState('');
  const [studioWebsite, setStudioWebsite] = useState('');
  const [studioTelegram, setStudioTelegram] = useState('');
  const [studioVk, setStudioVk] = useState('');
  const [studioWhatsapp, setStudioWhatsapp] = useState('');
  const [studioInstagram, setStudioInstagram] = useState('');
  const [studioYoutube, setStudioYoutube] = useState('');
  const [studioWeekdayStart, setStudioWeekdayStart] = useState('09:00');
  const [studioWeekdayEnd, setStudioWeekdayEnd] = useState('22:00');
  const [studioWeekendStart, setStudioWeekendStart] = useState('10:00');
  const [studioWeekendEnd, setStudioWeekendEnd] = useState('20:00');
  const [studioFrames, setStudioFrames] = useState(2);
  const [studioTargetRev, setStudioTargetRev] = useState(450000);
  const [studioActive, setStudioActive] = useState(true);
  const [studioDescription, setStudioDescription] = useState('');
  const [studioPhotos, setStudioPhotos] = useState<string[]>([]);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [studioModalBusy, setStudioModalBusy] = useState(false);
  const [studioModalError, setStudioModalError] = useState('');

  // Quick inline hours editing & delete confirm
  const [editingHoursStudioId, setEditingHoursStudioId] = useState<string | null>(null);
  const [hoursDraftStart, setHoursDraftStart] = useState('09:00');
  const [hoursDraftEnd, setHoursDraftEnd] = useState('21:00');
  const [hoursDraftWeekendStart, setHoursDraftWeekendStart] = useState('10:00');
  const [hoursDraftWeekendEnd, setHoursDraftWeekendEnd] = useState('20:00');
  const [confirmDeleteStudioId, setConfirmDeleteStudioId] = useState<string | null>(null);
  const [studioActionError, setStudioActionError] = useState('');
  const [expandedReviewsStudioId, setExpandedReviewsStudioId] = useState<string | null>(null);

  const scopedBookings = useMemo(() => {
    return bookings.filter((b) => {
      const studioMatch = selectedStudioId === 'all' || b.studioId === selectedStudioId;
      const dateMatch = (!dateFrom || b.date >= dateFrom) && (!dateTo || b.date <= dateTo);
      return studioMatch && dateMatch;
    });
  }, [bookings, selectedStudioId, dateFrom, dateTo]);

  const scopedSessions = useMemo(() => {
    return sessions.filter((s) => {
      const studioMatch = selectedStudioId === 'all' || s.studioId === selectedStudioId;
      const d = s.startedAt.slice(0, 10);
      const dateMatch = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
      return studioMatch && dateMatch;
    });
  }, [sessions, selectedStudioId, dateFrom, dateTo]);

  const scopedClients = useMemo(() => {
    return clients.filter((c) => selectedStudioId === 'all' || c.studioId === selectedStudioId);
  }, [clients, selectedStudioId]);

  const totalRevenue = useMemo(() => {
    const fromBookings = scopedBookings
      .filter((b) => b.status === 'completed' || b.paymentStatus !== 'unpaid')
      .reduce((acc, b) => acc + b.finalAmountRub, 0);
    const fromSessions = scopedSessions
      .filter((s) => !s.bookingId)
      .reduce((acc, s) => acc + s.amountPaidRub, 0);
    return fromBookings + fromSessions;
  }, [scopedBookings, scopedSessions]);

  const avgNps = useMemo(() => {
    if (!scopedClients.length) return 0;
    return Math.round(scopedClients.reduce((acc, c) => acc + c.npsScore, 0) / scopedClients.length);
  }, [scopedClients]);

  const repeatRate = useMemo(() => {
    if (!scopedClients.length) return 0;
    const returning = scopedClients.filter((c) => c.totalSessions >= 2).length;
    return Math.round((returning / scopedClients.length) * 100);
  }, [scopedClients]);

  const trainers = useMemo(() => {
    return users.filter(
      (u) => u.role === 'trainer' && (selectedStudioId === 'all' || u.studioId === selectedStudioId)
    );
  }, [users, selectedStudioId]);

  const trainerMetrics = useMemo(() => {
    return trainers.map((tr) => {
      const trBookings = scopedBookings.filter((b) => b.trainerId === tr.id && b.status !== 'cancelled');
      const completed = trBookings.filter((b) => b.status === 'completed').length;
      const hours = trBookings.reduce((acc, b) => acc + b.durationMin / 60, 0);
      const revenue = trBookings.reduce((acc, b) => acc + b.finalAmountRub, 0);
      const utilizationPct = Math.min(100, Math.round((hours / 40) * 100) + 32);
      const ratingStats = getRatingStats(reviews, 'trainer', tr.id);
      return {
        trainer: tr,
        totalBookings: trBookings.length,
        completed,
        hours: hours.toFixed(1),
        revenue,
        utilizationPct,
        ratingStats,
      };
    });
  }, [trainers, scopedBookings, reviews]);

  const serviceBreakdown = useMemo(() => {
    return services.map((srv) => {
      const list = scopedBookings.filter((b) => b.serviceId === srv.id && b.status !== 'cancelled');
      const rev = list.reduce((acc, b) => acc + b.finalAmountRub, 0);
      return { service: srv, count: list.length, revenue: rev };
    });
  }, [services, scopedBookings]);

  const openCreateStudioModal = () => {
    setEditingStudioId(null);
    setStudioModalError('');
    setStudioName('');
    setStudioCity('Москва');
    setStudioAddress('');
    setStudioPhone('+7 (495) 120-88-00');
    setStudioEmail('');
    setStudioRouteHint('');
    setStudioWebsite('');
    setStudioTelegram('');
    setStudioVk('');
    setStudioWhatsapp('');
    setStudioInstagram('');
    setStudioYoutube('');
    setStudioWeekdayStart('09:00');
    setStudioWeekdayEnd('22:00');
    setStudioWeekendStart('10:00');
    setStudioWeekendEnd('20:00');
    setStudioFrames(2);
    setStudioTargetRev(450000);
    setStudioActive(true);
    setStudioDescription('');
    setStudioPhotos([]);
    setPhotoUrlInput('');
    setShowStudioModal(true);
  };

  const openEditStudioModal = (st: Studio) => {
    const parsed = parseStudioScheduleHours(st);
    setEditingStudioId(st.id);
    setStudioModalError('');
    setStudioName(st.name);
    setStudioCity(st.city || 'Москва');
    setStudioAddress(st.address || '');
    setStudioPhone(st.phone || '');
    setStudioEmail(st.email || '');
    setStudioRouteHint(st.routeHint || '');
    setStudioWebsite(st.socials?.website || '');
    setStudioTelegram(st.socials?.telegram || '');
    setStudioVk(st.socials?.vk || '');
    setStudioWhatsapp(st.socials?.whatsapp || '');
    setStudioInstagram(st.socials?.instagram || '');
    setStudioYoutube(st.socials?.youtube || '');
    setStudioWeekdayStart(parsed.weekday.start);
    setStudioWeekdayEnd(parsed.weekday.end);
    setStudioWeekendStart(parsed.weekend.start);
    setStudioWeekendEnd(parsed.weekend.end);
    setStudioFrames(st.framesCount || 1);
    setStudioTargetRev(st.monthlyTargetRevenue || 450000);
    setStudioActive(st.active !== false);
    setStudioDescription(st.description || '');
    setStudioPhotos(Array.isArray(st.photos) ? [...st.photos] : []);
    setPhotoUrlInput('');
    setShowStudioModal(true);
  };

  const handleStudioFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setStudioModalError('');
    const added: string[] = [];
    for (const file of files) {
      if (studioPhotos.length + added.length >= 10) {
        setStudioModalError('Можно добавить не более 10 фотографий на студию');
        break;
      }
      try {
        const compressed = await compressStudioPhoto(file);
        added.push(compressed);
      } catch (err) {
        setStudioModalError(
          err instanceof Error ? err.message : 'Ошибка загрузки фотографии'
        );
      }
    }
    if (added.length > 0) {
      setStudioPhotos((prev) => [...prev, ...added].slice(0, 10));
    }
  };

  const handleAddPhotoUrl = () => {
    const url = photoUrlInput.trim();
    if (!url) return;
    if (!isValidStudioPhotoSrc(url)) {
      setStudioModalError('Укажите корректный URL изображения (https://..., /assets/... или /src/assets/...)');
      return;
    }
    if (studioPhotos.length >= 10) {
      setStudioModalError('Можно добавить не более 10 фотографий на студию');
      return;
    }
    if (!studioPhotos.includes(url)) {
      setStudioPhotos((prev) => [...prev, url]);
    }
    setPhotoUrlInput('');
    setStudioModalError('');
  };

  const handleSaveStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioModalError('');
    if (!studioName.trim() || !studioAddress.trim()) {
      setStudioModalError('Укажите название и адрес студии');
      return;
    }
    if (studioWeekdayEnd <= studioWeekdayStart) {
      setStudioModalError('В будни время закрытия должно быть позже открытия');
      return;
    }
    if (studioWeekendEnd <= studioWeekendStart) {
      setStudioModalError('В выходные время закрытия должно быть позже открытия');
      return;
    }

    const formatted = formatStudioOpenHours(
      { start: studioWeekdayStart, end: studioWeekdayEnd },
      { start: studioWeekendStart, end: studioWeekendEnd }
    );
    const socials: StudioSocialLinks = {
      ...(studioWebsite.trim() ? { website: studioWebsite.trim() } : {}),
      ...(studioTelegram.trim() ? { telegram: studioTelegram.trim() } : {}),
      ...(studioVk.trim() ? { vk: studioVk.trim() } : {}),
      ...(studioWhatsapp.trim() ? { whatsapp: studioWhatsapp.trim() } : {}),
      ...(studioInstagram.trim() ? { instagram: studioInstagram.trim() } : {}),
      ...(studioYoutube.trim() ? { youtube: studioYoutube.trim() } : {}),
    };
    const payload = {
      name: studioName.trim(),
      city: studioCity.trim() || 'Москва',
      address: studioAddress.trim(),
      phone: studioPhone.trim() || '+7 (495) 000-00-00',
      email: studioEmail.trim(),
      routeHint: studioRouteHint.trim(),
      socials,
      ...formatted,
      framesCount: Math.max(1, Math.min(20, Number(studioFrames) || 1)),
      monthlyTargetRevenue: Math.max(0, Number(studioTargetRev) || 0),
      active: studioActive,
      description: studioDescription.trim(),
      photos: studioPhotos,
    };

    setStudioModalBusy(true);
    try {
      if (editingStudioId) {
        const updated = await apiRequest<Studio>(`/api/studios/${editingStudioId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onStudioUpdated(updated);
      } else {
        const created = await apiRequest<Studio>('/api/studios', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onStudioAdded(created);
      }
      setShowStudioModal(false);
    } catch (err) {
      setStudioModalError(
        err instanceof Error ? err.message : 'Не удалось сохранить студию'
      );
    } finally {
      setStudioModalBusy(false);
    }
  };

  const handleSaveStudioHours = async (studioId: string) => {
    setStudioActionError('');
    if (!hoursDraftStart || !hoursDraftEnd || hoursDraftEnd <= hoursDraftStart) {
      setStudioActionError('В будни время закрытия должно быть позже открытия');
      return;
    }
    if (!hoursDraftWeekendStart || !hoursDraftWeekendEnd || hoursDraftWeekendEnd <= hoursDraftWeekendStart) {
      setStudioActionError('В выходные время закрытия должно быть позже открытия');
      return;
    }
    const formatted = formatStudioOpenHours(
      { start: hoursDraftStart, end: hoursDraftEnd },
      { start: hoursDraftWeekendStart, end: hoursDraftWeekendEnd }
    );
    try {
      const updated = await apiRequest<Studio>(`/api/studios/${studioId}`, {
        method: 'PATCH',
        body: JSON.stringify(formatted),
      });
      onStudioUpdated(updated);
      setEditingHoursStudioId(null);
    } catch (err) {
      setStudioActionError(
        err instanceof Error ? err.message : 'Не удалось обновить часы приёма'
      );
    }
  };

  const handleDeleteStudio = async (studioId: string) => {
    setStudioActionError('');
    try {
      await apiRequest<{ ok: boolean; id: string }>(`/api/studios/${studioId}`, {
        method: 'DELETE',
      });
      setConfirmDeleteStudioId(null);
      onStudioDeleted?.(studioId);
    } catch (err) {
      setStudioActionError(
        err instanceof Error ? err.message : 'Не удалось удалить студию'
      );
      setConfirmDeleteStudioId(null);
    }
  };

  const applyPresetRange = (daysBack: number) => {
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    const to = new Date();
    to.setDate(to.getDate() + 7);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6">
      {/* Studio Switcher & Date Range Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role === 'owner' && (
            <button
              type="button"
              onClick={() => onSelectStudio('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedStudioId === 'all'
                  ? 'bg-slate-900 text-white dark:bg-cyan-600'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              Вся сеть ({studios.length})
            </button>
          )}
          {studios.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onSelectStudio(st.id)}
              disabled={currentUser.role === 'admin' && currentUser.studioId !== st.id}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 ${
                selectedStudioId === st.id
                  ? 'bg-slate-900 text-white dark:bg-cyan-600'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              {st.name}
            </button>
          ))}
          {canManageStudios && (
            <button
              type="button"
              onClick={openCreateStudioModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-600 hover:text-cyan-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить студию</span>
            </button>
          )}
        </div>

        {/* Date Period Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => applyPresetRange(7)}
              className="px-2.5 py-1 text-xs rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
            >
              7 дней
            </button>
            <button
              type="button"
              onClick={() => applyPresetRange(30)}
              className="px-2.5 py-1 text-xs rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
            >
              30 дней
            </button>
            <button
              type="button"
              onClick={() => applyPresetRange(180)}
              className="px-2.5 py-1 text-xs rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
            >
              Полгода
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-xs"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Выручка за период</span>
            <TrendingUp className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {totalRevenue.toLocaleString('ru-RU')} ₽
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Оплаченных броней: {scopedBookings.filter((b) => b.paymentStatus !== 'unpaid').length}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Загруженность тренеров</span>
            <Activity className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {trainerMetrics.length
              ? Math.round(
                  trainerMetrics.reduce((a, b) => a + b.utilizationPct, 0) / trainerMetrics.length
                )
              : 0}
            %
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Активных тренеров: {trainers.length} · Броней: {scopedBookings.length}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Лояльность клиентов (NPS)</span>
            <Users className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums">{avgNps}%</div>
          <div className="mt-1 text-xs text-slate-500">
            Возвращаемость (2+ визита): {repeatRate}%
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Проведено сессий</span>
            <Building2 className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {scopedSessions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Клиентов в базе: {scopedClients.length}
          </div>
        </div>
      </div>

      {/* Main Split: Trainer Workload + Studios Network */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">Загруженность и рейтинг тренеров</h3>
            <span className="text-xs text-slate-500">{dateFrom} — {dateTo}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {trainerMetrics.map(
              ({ trainer, totalBookings, completed, hours, revenue, utilizationPct, ratingStats }) => {
                const st = studios.find((s) => s.id === trainer.studioId);
                return (
                  <div key={trainer.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {trainer.name}
                        </span>
                        <RatingBadge average={ratingStats.average} count={ratingStats.count} />
                      </div>
                      <div className="text-xs text-slate-500">
                        {st?.name || 'Сеть'} · Записей: {totalBookings} · Завершено: {completed} · {hours} ч
                      </div>
                      {ratingStats.items[0]?.comment && (
                        <div className="text-[11px] text-slate-500 italic line-clamp-1">
                          «{ratingStats.items[0].comment}» — {ratingStats.items[0].authorName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 sm:min-w-[230px]">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Загрузка</span>
                          <span className="font-mono font-semibold tabular-nums">{utilizationPct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-cyan-600 rounded-full"
                            style={{ width: `${utilizationPct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right font-mono text-sm font-semibold tabular-nums whitespace-nowrap">
                        {revenue.toLocaleString('ru-RU')} ₽
                      </div>
                    </div>
                  </div>
                );
              }
            )}
            {!trainerMetrics.length && (
              <div className="p-6 text-sm text-slate-500 text-center">
                В выбранной студии пока нет назначенных тренеров.
              </div>
            )}
          </div>
        </div>

        {/* Studios & Operating Hours */}
        <div className="lg:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold">Студии и режим работы</h3>
              <span className="text-xs text-slate-500">
                Всего в сети: {studios.length} · описание, фото и рейтинги
              </span>
            </div>
            {canManageStudios && (
              <button
                type="button"
                onClick={openCreateStudioModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать студию</span>
              </button>
            )}
          </div>

          {studioActionError && (
            <div className="mx-5 mt-4 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {studioActionError}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {studios
              .filter((st) => selectedStudioId === 'all' || st.id === selectedStudioId)
              .map((st) => {
                const stRev = bookings
                  .filter((b) => b.studioId === st.id && b.status !== 'cancelled')
                  .reduce((a, b) => a + b.finalAmountRub, 0);
                const isEditingHours = editingHoursStudioId === st.id;
                const isConfirmDelete = confirmDeleteStudioId === st.id;
                const isReviewsExpanded = expandedReviewsStudioId === st.id;
                const scheduleHours = parseStudioScheduleHours(st);
                const photos = Array.isArray(st.photos) ? st.photos : [];
                const ratingStats = getRatingStats(reviews, 'studio', st.id);

                return (
                  <div key={st.id} className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      {photos[0] ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 relative bg-slate-100 dark:bg-slate-800">
                          <img
                            src={photos[0]}
                            alt={st.name}
                            className="w-full h-full object-cover"
                          />
                          {photos.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono leading-none">
                              +{photos.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-[10px] text-slate-400 shrink-0">
                          <Building2 className="w-4 h-4 mb-0.5" />
                          <span>Нет фото</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">{st.name}</span>
                              <RatingBadge average={ratingStats.average} count={ratingStats.count} />
                              {st.active === false && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                  Скрыта
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {st.city} · {st.address} · {st.phone} · Рам: {st.framesCount}
                            </div>
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums text-cyan-700 dark:text-cyan-400 shrink-0">
                            {stRev.toLocaleString('ru-RU')} ₽
                          </span>
                        </div>

                        {st.description ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                            {st.description}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic mt-1.5">
                            Описание студии не добавлено — нажмите «Редактировать», чтобы клиенты могли выбирать филиал по описанию и фото.
                          </p>
                        )}

                        {(st.email || st.routeHint || st.socials) && (
                          <div className="mt-2 space-y-1.5">
                            {(st.email || st.routeHint) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                {st.email && (
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3 text-cyan-600" />
                                    {st.email}
                                  </span>
                                )}
                                {st.routeHint && <span>{st.routeHint}</span>}
                              </div>
                            )}
                            <StudioSocialButtons socials={st.socials} compact />
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditingHours ? (
                      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            Будни (Пн–Пт)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={hoursDraftStart}
                              onChange={(e) => setHoursDraftStart(e.target.value)}
                              className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <span className="text-xs text-slate-400">—</span>
                            <input
                              type="time"
                              value={hoursDraftEnd}
                              onChange={(e) => setHoursDraftEnd(e.target.value)}
                              className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            Выходные (Сб–Вс)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={hoursDraftWeekendStart}
                              onChange={(e) => setHoursDraftWeekendStart(e.target.value)}
                              className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <span className="text-xs text-slate-400">—</span>
                            <input
                              type="time"
                              value={hoursDraftWeekendEnd}
                              onChange={(e) => setHoursDraftWeekendEnd(e.target.value)}
                              className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setHoursDraftWeekendStart(hoursDraftStart);
                              setHoursDraftWeekendEnd(hoursDraftEnd);
                            }}
                            className="text-[11px] text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            Как в будни
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingHoursStudioId(null)}
                              className="px-2 py-1 text-xs text-slate-500 cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveStudioHours(st.id)}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          <div>
                            Будни (Пн–Пт): {scheduleHours.weekday.start} – {scheduleHours.weekday.end}
                          </div>
                          <div>
                            Выходные (Сб–Вс): {scheduleHours.weekend.start} – {scheduleHours.weekend.end}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {ratingStats.count > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReviewsStudioId(isReviewsExpanded ? null : st.id)
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-amber-400 cursor-pointer"
                            >
                              <span>Отзывы ({ratingStats.count})</span>
                              {isReviewsExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}

                          {canManageStudios && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingHoursStudioId(st.id);
                                  setHoursDraftStart(scheduleHours.weekday.start);
                                  setHoursDraftEnd(scheduleHours.weekday.end);
                                  setHoursDraftWeekendStart(scheduleHours.weekend.start);
                                  setHoursDraftWeekendEnd(scheduleHours.weekend.end);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500 cursor-pointer"
                              >
                                <Clock className="w-3 h-3" />
                                <span>Часы</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditStudioModal(st)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-cyan-700 dark:text-cyan-400 hover:border-cyan-500 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Редактировать</span>
                              </button>

                              {isConfirmDelete ? (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                                  <span className="text-[11px] text-rose-700 dark:text-rose-300">Удалить?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStudio(st.id)}
                                    className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[11px] font-medium cursor-pointer"
                                  >
                                    Да
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStudioId(null)}
                                    className="px-1 py-0.5 text-[11px] text-slate-500 cursor-pointer"
                                  >
                                    Нет
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={studios.length <= 1}
                                  title={
                                    studios.length <= 1
                                      ? 'В сети должна оставаться хотя бы одна студия'
                                      : 'Удалить студию'
                                  }
                                  onClick={() => setConfirmDeleteStudioId(st.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:border-rose-400 disabled:opacity-40 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Удалить</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {isReviewsExpanded && ratingStats.items.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        {ratingStats.items.map((rev) => (
                          <div
                            key={rev.id}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{rev.authorName}</span>
                              <div className="flex items-center gap-2 font-mono text-[11px]">
                                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                  {rev.rating}
                                </span>
                                <span className="text-slate-400">{rev.updatedAt || rev.createdAt}</span>
                              </div>
                            </div>
                            {rev.comment && (
                              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                {rev.comment}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Services Analytics */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-base font-semibold">Эффективность по услугам</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-left">
                <th className="py-2.5 px-5 font-medium">Услуга</th>
                <th className="py-2.5 px-5 font-medium text-right">Длительность</th>
                <th className="py-2.5 px-5 font-medium text-right">Тариф</th>
                <th className="py-2.5 px-5 font-medium text-right">Записей за период</th>
                <th className="py-2.5 px-5 font-medium text-right">Оборот</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {serviceBreakdown.map(({ service, count, revenue }) => (
                <tr key={service.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-5 font-medium">{service.name}</td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-500">
                    {service.durationMin} мин
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums">
                    {service.priceRub.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums">{count}</td>
                  <td className="py-3 px-5 text-right font-mono font-semibold tabular-nums">
                    {revenue.toLocaleString('ru-RU')} ₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner Section: Network, Methodology, Approaches & Contacts for Clients */}
      {currentUser.role === 'owner' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                <Sparkles className="w-4 h-4" />
                <span>Информация для клиентов (PWA-кабинет и онлайн-запись)</span>
              </div>
              <h3 className="font-display text-base font-semibold">
                {effectiveBrandAbout.brandName} — методика, сеть и подходы в работе
              </h3>
              {effectiveBrandAbout.tagline && (
                <p className="text-xs text-slate-500">{effectiveBrandAbout.tagline}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBrandEditorInitialTab('branding');
                  setShowBrandAboutModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/70"
              >
                <ImagePlus className="w-3.5 h-3.5 text-cyan-600" />
                <span>Логотип и главная</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrandEditorInitialTab('blocks');
                  setShowBrandAboutModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-cyan-600 text-cyan-700 dark:text-cyan-300 text-xs font-medium cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  Блоки методик ({(effectiveBrandAbout.methodologyBlocks || []).length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrandEditorInitialTab('general');
                  setShowBrandAboutModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer hover:opacity-90"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Редактировать информацию</span>
              </button>
            </div>
          </div>

          {(effectiveBrandAbout.methodologyBlocks || []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(effectiveBrandAbout.methodologyBlocks || []).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBrandEditorInitialTab('blocks');
                    setShowBrandAboutModal(true);
                  }}
                  className={`px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                    b.active === false
                      ? 'border-slate-200 dark:border-slate-800 text-slate-400 line-through'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-cyan-500'
                  }`}
                >
                  {b.title}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-semibold">О сети и методике</div>
              <p className="text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                {effectiveBrandAbout.methodologyDescription}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-semibold">Блок «Почему мы» и подходы</div>
              <div className="text-slate-600 dark:text-slate-300">
                Преимуществ: <span className="font-mono font-semibold">{effectiveBrandAbout.whyUsPoints.length}</span> ·
                Карточек подходов: <span className="font-mono font-semibold">{effectiveBrandAbout.approaches.length}</span>
              </div>
              <p className="text-slate-500 line-clamp-2">
                {effectiveBrandAbout.whyUsPoints[0] || 'Добавьте ключевые преимущества методики и сети'}
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="font-semibold">Контакты сети и соцсети</div>
              <div className="text-slate-600 dark:text-slate-300 font-mono">
                {effectiveBrandAbout.networkPhone || 'Телефон не указан'}
                {effectiveBrandAbout.networkEmail ? ` · ${effectiveBrandAbout.networkEmail}` : ''}
              </div>
              <StudioSocialButtons socials={effectiveBrandAbout.socials} compact />
            </div>
          </div>
        </div>
      )}

      {currentUser.role === 'owner' && (
        <OwnerLegalConfirmationsPanel
          confirmations={legalAcceptances}
          onMarkedRead={onLegalMarkedRead}
        />
      )}

      <LegalAgreementsPanel
        currentUser={currentUser}
        brandName={effectiveBrandAbout.brandName}
        onAccepted={onLegalAccepted}
      />

      {/* Modal: Create / Edit Studio */}
      {showStudioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-4 overflow-hidden">
          <form
            onSubmit={handleSaveStudio}
            className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">
                {editingStudioId ? 'Редактировать студию' : 'Новая студия в сети'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStudioModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Название филиала
                </label>
                <input
                  type="text"
                  required
                  placeholder="ЭТАЛОН ПРАВИЛО · Сити"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Город
                </label>
                <input
                  type="text"
                  value={studioCity}
                  onChange={(e) => setStudioCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Адрес
                </label>
                <input
                  type="text"
                  required
                  placeholder="Пресненская наб., 12"
                  value={studioAddress}
                  onChange={(e) => setStudioAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Телефон
                </label>
                <input
                  type="text"
                  placeholder="+7 (495) 120-88-00"
                  value={studioPhone}
                  onChange={(e) => setStudioPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Тренажёров ПравИло
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={studioFrames}
                  onChange={(e) => setStudioFrames(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Плановая выручка / мес (₽)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={studioTargetRev}
                  onChange={(e) => setStudioTargetRev(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Время приёма — Будни (Пн–Пт)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={studioWeekdayStart}
                    onChange={(e) => setStudioWeekdayStart(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    type="time"
                    value={studioWeekdayEnd}
                    onChange={(e) => setStudioWeekdayEnd(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Время приёма — Выходные (Сб–Вс)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStudioWeekendStart(studioWeekdayStart);
                      setStudioWeekendEnd(studioWeekdayEnd);
                    }}
                    className="text-[11px] text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    Как в будни
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={studioWeekendStart}
                    onChange={(e) => setStudioWeekendStart(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    type="time"
                    value={studioWeekendEnd}
                    onChange={(e) => setStudioWeekendEnd(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Описание студии (отображается клиентам при выборе филиала)
              </label>
              <textarea
                rows={3}
                placeholder="Например: просторные залы в 3 минутах от метро, 2 рамы ПравИло с датчиками тяги, душевые, парковка, чайная зона..."
                value={studioDescription}
                onChange={(e) => setStudioDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {/* Contacts & Socials for Studio */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-semibold">Контакты филиала, сайт и соцсети (для клиентов)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">E-mail студии</label>
                  <input
                    type="email"
                    placeholder="tverskaya@etalon-pravilo.ru"
                    value={studioEmail}
                    onChange={(e) => setStudioEmail(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Как добраться / парковка</label>
                  <input
                    type="text"
                    placeholder="м. Маяковская, 4 мин пешком, вход со двора"
                    value={studioRouteHint}
                    onChange={(e) => setStudioRouteHint(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Сайт (https://...)"
                  value={studioWebsite}
                  onChange={(e) => setStudioWebsite(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="Telegram (@handle или ссылка)"
                  value={studioTelegram}
                  onChange={(e) => setStudioTelegram(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="ВКонтакте (https://vk.com/...)"
                  value={studioVk}
                  onChange={(e) => setStudioVk(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="WhatsApp (+7999...)"
                  value={studioWhatsapp}
                  onChange={(e) => setStudioWhatsapp(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="Instagram (@handle)"
                  value={studioInstagram}
                  onChange={(e) => setStudioInstagram(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder="YouTube (https://youtube.com/...)"
                  value={studioYoutube}
                  onChange={(e) => setStudioYoutube(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            {/* Studio Photos Editor */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold">Фотографии студии ({studioPhotos.length}/10)</div>
                  <div className="text-[11px] text-slate-500">
                    Первое фото используется как обложка карточки для клиентов
                  </div>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer hover:opacity-90">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Загрузить фото</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleStudioFilesUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && !studioPhotos.includes(v) && studioPhotos.length < 10) {
                      setStudioPhotos((prev) => [...prev, v]);
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">+ Добавить готовое фото студии...</option>
                  {STUDIO_PHOTO_PRESETS.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={photoUrlInput}
                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                    placeholder="Или вставьте URL фото (https://...)"
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={handleAddPhotoUrl}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Добавить</span>
                  </button>
                </div>
              </div>

              {studioPhotos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {studioPhotos.map((src, idx) => (
                    <div
                      key={`${idx}-${src.slice(0, 32)}`}
                      className="group relative aspect-[16/10] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                    >
                      <img src={src} alt={`Фото студии ${idx + 1}`} className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-mono">
                          Обложка
                        </span>
                      )}
                      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                        {idx > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setStudioPhotos((prev) => {
                                const next = [...prev];
                                const [picked] = next.splice(idx, 1);
                                return [picked, ...next];
                              })
                            }
                            className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] cursor-pointer hover:bg-black/90"
                          >
                            На обложку
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setStudioPhotos((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Удалить фото"
                          className="p-1 rounded bg-rose-600/90 text-white cursor-pointer hover:bg-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                  Фотографии ещё не добавлены. Загрузите фото с устройства или выберите из пресетов.
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={studioActive}
                onChange={(e) => setStudioActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Студия активна и открыта для записи клиентов</span>
            </label>

            {studioModalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {studioModalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowStudioModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={studioModalBusy}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                {studioModalBusy
                  ? 'Сохранение...'
                  : editingStudioId
                  ? 'Сохранить изменения'
                  : 'Создать студию'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBrandAboutModal && currentUser.role === 'owner' && (
        <BrandAboutEditorModal
          initialBrandAbout={effectiveBrandAbout}
          initialTab={brandEditorInitialTab}
          onSaved={(updated) => onBrandAboutUpdated?.(updated)}
          onClose={() => setShowBrandAboutModal(false)}
        />
      )}
    </div>
  );
};
