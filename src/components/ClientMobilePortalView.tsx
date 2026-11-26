import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  TrendingUp,
  Bell,
  User,
  Home,
  CheckCircle2,
  Ticket,
  WifiOff,
  Building2,
  MapPin,
  Phone,
  Clock,
  Star,
  ChevronLeft,
  ChevronRight,
  X,
  Images,
  Pencil,
  Mail,
  Sparkles,
  Scale,
} from 'lucide-react';
import type {
  Booking,
  BrandAboutInfo,
  ClientProfile,
  ClientSubscription,
  LegalAcceptanceRecord,
  MessengerMessage,
  MethodologyProgramBlock,
  NotificationLog,
  RatingReview,
  ReviewTargetType,
  ServiceCategory,
  ServiceItem,
  Studio,
  TrainerBlogPost,
  TrainingSessionRecord,
  UserAccount,
} from '../types';
import { apiRequest } from '../utils/api';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { DEFAULT_BRAND_ABOUT } from '../utils/brandAbout';
import {
  generateReceptionSlots,
  getStudioHoursForDate,
  isWeekendDate,
  parseStudioScheduleHours,
} from '../utils/studioHours';
import {
  SERVICE_CATEGORY_OPTIONS,
  inferServiceCategory,
} from '../utils/serviceCategories';
import { getRatingStats } from '../utils/reviews';
import { formatExperienceYears } from '../utils/trainerProfile';
import { RatingBadge, StarRatingInput } from './RatingStars';
import { PWAInstallButton } from './PWAInstallButton';
import { MiScale2Breakdown } from './MiScale2Breakdown';
import { PostureComparisonSection } from './PostureComparisonSection';
import { BrandAboutSection, StudioSocialButtons } from './StudioSocialButtons';
import { LegalAgreementsModal, LegalAgreementsPanel } from './LegalAgreementsModal';
import {
  TrainerAvatar,
  TrainerProfileDetailModal,
  TrainerSocialButtons,
  type TrainerPublicUser,
} from './TrainerProfileCard';

interface ClientPortalProps {
  currentUser: UserAccount;
  studios: Studio[];
  trainers: UserAccount[];
  services: ServiceItem[];
  client: ClientProfile | undefined;
  bookings: Booking[];
  sessions: TrainingSessionRecord[];
  subscriptions: ClientSubscription[];
  notifications: NotificationLog[];
  messengerMessages: MessengerMessage[];
  trainerPosts?: TrainerBlogPost[];
  reviews?: RatingReview[];
  brandAbout?: BrandAboutInfo;
  onBookingCreated: (b: Booking) => void;
  onMessengerMessageAdded: (m: MessengerMessage) => void;
  onReviewSaved?: (rev: RatingReview) => void;
  onCurrentUserUpdated?: (u: UserAccount) => void;
  onClientUpdated?: (c: ClientProfile) => void;
  onLegalAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
}

export const ClientMobilePortalView: React.FC<ClientPortalProps> = ({
  currentUser,
  studios,
  trainers,
  services,
  client,
  bookings,
  sessions,
  subscriptions,
  notifications,
  messengerMessages,
  trainerPosts = [],
  reviews = [],
  brandAbout,
  onBookingCreated,
  onMessengerMessageAdded,
  onReviewSaved,
  onCurrentUserUpdated,
  onClientUpdated,
  onLegalAccepted,
}) => {
  const [tab, setTab] = useState<'home' | 'studios' | 'book' | 'progress' | 'about' | 'alerts'>('home');
  const [showLegalModal, setShowLegalModal] = useState(false);
  const effectiveBrandAbout = brandAbout || DEFAULT_BRAND_ABOUT;
  const [selectedMethodologyBlockId, setSelectedMethodologyBlockId] = useState<string>('');
  const [chosenMethodologyNotice, setChosenMethodologyNotice] = useState<string>('');
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const isOnline = useOnlineStatus();

  const activeStudios = useMemo(
    () => studios.filter((s) => s.active !== false),
    [studios]
  );
  const visibleStudios = activeStudios.length > 0 ? activeStudios : studios;

  // Booking form
  const [studioId, setStudioId] = useState(visibleStudios[0]?.id || '');
  const [serviceCatFilter, setServiceCatFilter] = useState<'all' | ServiceCategory>('all');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [trainerId, setTrainerId] = useState(trainers[0]?.id || '');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (visibleStudios.length > 0 && !visibleStudios.some((s) => s.id === studioId)) {
      setStudioId(visibleStudios[0].id);
    }
  }, [visibleStudios, studioId]);

  const selectedStudio = useMemo(
    () => visibleStudios.find((s) => s.id === studioId) || visibleStudios[0],
    [visibleStudios, studioId]
  );
  const availableSlots = useMemo(
    () => generateReceptionSlots(selectedStudio, 60, date),
    [selectedStudio, date]
  );
  const selectedDayHours = useMemo(
    () => getStudioHoursForDate(selectedStudio, date),
    [selectedStudio, date]
  );

  const [time, setTime] = useState(() => availableSlots[0] || '12:00');
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [pushStatus, setPushStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Studio Gallery Lightbox
  const [galleryStudio, setGalleryStudio] = useState<Studio | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Rating Form State (for Studios & Trainers)
  const [ratingModal, setRatingModal] = useState<{
    targetType: ReviewTargetType;
    targetId: string;
    targetName: string;
  } | null>(null);
  const [draftRating, setDraftRating] = useState(5);
  const [draftComment, setDraftComment] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingNotice, setRatingNotice] = useState('');

  // Personal Profile Modal
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pTg, setPTg] = useState('');
  const [pStudioId, setPStudioId] = useState('');
  const [pGender, setPGender] = useState<'male' | 'female'>('male');
  const [pBirthDate, setPBirthDate] = useState('');
  const [pGoal, setPGoal] = useState('');
  const [pContra, setPContra] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [detailTrainer, setDetailTrainer] = useState<TrainerPublicUser | null>(null);

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(time)) {
      setTime(availableSlots[0]);
    }
  }, [availableSlots, time]);

  const upcomingBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'completed' && b.status !== 'cancelled'),
    [bookings]
  );

  const activeSub = useMemo(
    () => subscriptions.find((s) => s.status === 'active'),
    [subscriptions]
  );

  const latestAnthro = client?.anthropometry[client.anthropometry.length - 1];

  const myClientKey = client?.id || currentUser.id;
  const findMyReview = (targetType: ReviewTargetType, targetId: string) =>
    reviews.find(
      (r) =>
        r.targetType === targetType &&
        r.targetId === targetId &&
        (r.clientId === myClientKey || r.clientId === currentUser.id)
    );

  const openRatingModal = (
    targetType: ReviewTargetType,
    targetId: string,
    targetName: string
  ) => {
    const existing = findMyReview(targetType, targetId);
    setRatingModal({ targetType, targetId, targetName });
    setDraftRating(existing?.rating || 5);
    setDraftComment(existing?.comment || '');
    setRatingError('');
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingModal) return;
    setRatingError('');
    setRatingBusy(true);
    try {
      const saved = await apiRequest<RatingReview>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          targetType: ratingModal.targetType,
          targetId: ratingModal.targetId,
          rating: draftRating,
          comment: draftComment.trim(),
        }),
      });
      onReviewSaved?.(saved);
      setRatingNotice(
        `Спасибо! Ваша оценка (${saved.rating}/5) для «${ratingModal.targetName}» сохранена и видна всем.`
      );
      setRatingModal(null);
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : 'Не удалось сохранить оценку');
    } finally {
      setRatingBusy(false);
    }
  };

  const openProfileEditModal = () => {
    setPName(client?.name || currentUser.name || '');
    setPPhone(client?.phone || currentUser.phone || '');
    setPEmail(client?.email || currentUser.email || '');
    setPTg(client?.telegram || currentUser.telegramHandle || '');
    setPStudioId(client?.studioId || currentUser.studioId || studios[0]?.id || '');
    setPGender(client?.gender || 'male');
    setPBirthDate(client?.birthDate || '');
    setPGoal(client?.goal || '');
    setPContra(client?.contraindications || '');
    setProfileErr('');
    setShowProfileEdit(true);
  };

  const handleSavePersonalData = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr('');
    setProfileBusy(true);
    try {
      const res = await apiRequest<{ user: UserAccount; client?: ClientProfile | null }>(
        '/api/auth/profile',
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: pName.trim(),
            phone: pPhone.trim(),
            email: pEmail.trim(),
            telegramHandle: pTg.trim(),
            ...(pStudioId ? { studioId: pStudioId } : {}),
            ...(client
              ? {
                  gender: pGender,
                  birthDate: pBirthDate,
                  goal: pGoal.trim(),
                  contraindications: pContra.trim(),
                }
              : {}),
          }),
        }
      );
      onCurrentUserUpdated?.(res.user);
      if (res.client) onClientUpdated?.(res.client);
      setShowProfileEdit(false);
      setRatingNotice('Личные данные успешно обновлены.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Не удалось сохранить данные');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleEnablePush = async () => {
    if (typeof Notification === 'undefined') {
      setPushStatus('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
    if (perm === 'granted') {
      new Notification('ЭТАЛОН ПРАВИЛО', {
        body: 'Push-напоминания о тренировках и оплате успешно включены.',
        icon: '/pwa-192x192.png',
      });
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    if (!isOnline) {
      setBookingSuccess('Вы офлайн — запись доступна после восстановления сети.');
      return;
    }
    try {
      const created = await apiRequest<Booking>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          studioId,
          clientId: client?.id,
          trainerId,
          serviceId,
          date,
          time,
          status: 'pending',
        }),
      });
      onBookingCreated(created);
      setBookingSuccess(`Запись создана на ${created.date} в ${created.time}. Ожидайте подтверждения.`);
      setTab('home');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Не удалось создать запись');
    }
  };

  const handleSendClientChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() || !isOnline) return;
    setSendingChat(true);
    try {
      const msg = await apiRequest<MessengerMessage>('/api/messenger/messages', {
        method: 'POST',
        body: JSON.stringify({
          clientId: client?.id,
          channel: 'web_chat',
          text: chatText.trim(),
        }),
      });
      onMessengerMessageAdded(msg);
      setChatText('');
    } finally {
      setSendingChat(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Top Status & PWA Bar */}
      <div className="rounded-xl st-surface border st-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full st-accent-bg flex items-center justify-center font-display font-bold text-sm shrink-0">
            {currentUser.avatarInitials}
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">
              {client?.name || currentUser.name}
            </h2>
            <div className="text-xs st-muted">
              Личный кабинет клиента · Сессий проведено: {client?.totalSessions ?? sessions.length}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <WifiOff className="w-3.5 h-3.5" />
              Офлайн-кэш активен
            </span>
          )}
          <button
            type="button"
            onClick={openProfileEditModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer min-h-[40px]"
          >
            <Pencil className="w-3.5 h-3.5 st-accent-text" />
            <span>Мои данные</span>
          </button>
          <button
            type="button"
            onClick={handleEnablePush}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer min-h-[40px]"
          >
            <Bell className="w-3.5 h-3.5 st-accent-text" />
            <span>
              {pushStatus === 'granted' ? 'Push включены' : 'Включить Push-уведомления'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowLegalModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer min-h-[40px]"
          >
            <Scale className="w-3.5 h-3.5 st-accent-text" />
            <span>Соглашения</span>
          </button>
          <PWAInstallButton compact />
        </div>
      </div>

      {/* Desktop Tabs */}
      <div className="hidden lg:flex flex-wrap items-center gap-1 p-1 st-surface-muted rounded-lg border st-border w-fit">
        {(
          [
            ['home', 'Обзор и записи'],
            ['studios', `Студии и рейтинги (${visibleStudios.length})`],
            ['book', 'Записаться на сессию'],
            ['progress', 'Мой прогресс'],
            ['about', 'О нас и методика'],
            ['alerts', `Чат и уведомления (${messengerMessages.length + notifications.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === k ? 'st-surface shadow-sm font-semibold' : 'st-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {bookingSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bookingSuccess}</span>
        </div>
      )}

      {ratingNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0" />
            <span>{ratingNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setRatingNotice('')}
            className="text-amber-600 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB: HOME */}
      {tab === 'home' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Active Subscription Card */}
          <div className="lg:col-span-5 rounded-2xl st-hero-gradient text-white p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-amber-300">
                  {activeSub ? (activeSub.type === 'certificate' ? 'Сертификат' : 'Абонемент') : 'Разовые визиты'}
                </div>
                <div className="font-display text-xl font-bold mt-1">
                  {activeSub?.planName || 'Без активного абонемента'}
                </div>
              </div>
              <Ticket className="w-6 h-6 text-amber-300" />
            </div>

            {activeSub ? (
              <div className="flex items-end justify-between pt-4 border-t border-white/15">
                <div>
                  <div className="text-xs text-white/75">Осталось тренировок</div>
                  <div className="font-mono text-3xl font-bold tabular-nums mt-0.5">
                    {activeSub.remainingSessions} <span className="text-sm font-normal text-white/70">из {activeSub.totalSessions}</span>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-white/85">
                  <div>Код: {activeSub.code}</div>
                  <div>до {activeSub.expiresAt}</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/80">
                Оформите абонемент на 4 или 8 тренировок у администратора студии для выгодной стоимости.
              </p>
            )}
          </div>

          {/* Upcoming Bookings */}
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Мои ближайшие записи</h3>
              <button
                type="button"
                onClick={() => setTab('book')}
                className="text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                + Записаться
              </button>
            </div>
            <div className="space-y-3">
              {upcomingBookings.map((bk) => {
                const st = studios.find((s) => s.id === bk.studioId);
                return (
                  <div
                    key={bk.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-sm">{bk.serviceName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {st?.name} · Тренер {bk.trainerName}
                      </div>
                    </div>
                    <div className="text-left sm:text-right font-mono text-xs">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {bk.date} в {bk.time}
                      </div>
                      <div className="text-cyan-700 dark:text-cyan-400">
                        {bk.status === 'confirmed' ? 'Подтверждена' : bk.status === 'in_progress' ? 'Идёт сейчас' : 'Ожидает подтверждения'}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!upcomingBookings.length && (
                <div className="py-6 text-center text-xs text-slate-500">
                  У вас пока нет активных записей. Нажмите «Записаться», чтобы выбрать студию и удобное время.
                </div>
              )}
            </div>
          </div>

          {/* Quick Studios & Ratings Preview */}
          <div className="lg:col-span-12 rounded-2xl st-surface border st-border p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">Наши студии и рейтинги</h3>
                <p className="text-xs st-muted">
                  Смотрите фото и описания студий, выбирайте удобный филиал и оценивайте студии и тренеров
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('studios')}
                className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
              >
                Все студии, фото и оценки →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visibleStudios.map((st) => {
                const stats = getRatingStats(reviews, 'studio', st.id);
                const photos = Array.isArray(st.photos) ? st.photos : [];
                return (
                  <div
                    key={st.id}
                    className="rounded-xl st-surface-muted border st-border overflow-hidden flex flex-col"
                  >
                    {photos[0] ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryStudio(st);
                          setGalleryIndex(0);
                        }}
                        className="relative aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-slate-800 cursor-pointer group"
                      >
                        <img
                          src={photos[0]}
                          alt={st.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {photos.length > 1 && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono inline-flex items-center gap-1">
                            <Images className="w-3 h-3" />
                            {photos.length} фото
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-xs st-muted">
                        <Building2 className="w-6 h-6 opacity-40" />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm">{st.name}</div>
                          <RatingBadge average={stats.average} count={stats.count} />
                        </div>
                        <div className="text-xs st-muted flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{st.city}, {st.address}</span>
                        </div>
                        {st.description && (
                          <p className="text-xs st-muted line-clamp-2 leading-relaxed">
                            {st.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t st-border">
                        <button
                          type="button"
                          onClick={() => {
                            setStudioId(st.id);
                            setTab('book');
                          }}
                          className="flex-1 py-1.5 px-2.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                        >
                          Записаться
                        </button>
                        <button
                          type="button"
                          onClick={() => openRatingModal('studio', st.id, st.name)}
                          className="py-1.5 px-2.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:border-amber-400"
                        >
                          Оценить
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Brand & Methodology Quick Card */}
          <div className="lg:col-span-12 rounded-2xl st-surface border st-border p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold st-accent-text">
                  <Sparkles className="w-4 h-4" />
                  <span>{effectiveBrandAbout.brandName} · Изучите и выберите методику</span>
                </div>
                <p className="text-xs st-muted leading-relaxed">
                  {effectiveBrandAbout.tagline || effectiveBrandAbout.aboutNetwork}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                  {effectiveBrandAbout.networkPhone && (
                    <a
                      href={`tel:${effectiveBrandAbout.networkPhone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1 font-mono font-semibold st-accent-text hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{effectiveBrandAbout.networkPhone}</span>
                    </a>
                  )}
                  {effectiveBrandAbout.networkEmail && (
                    <a
                      href={`mailto:${effectiveBrandAbout.networkEmail}`}
                      className="inline-flex items-center gap-1 st-muted hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{effectiveBrandAbout.networkEmail}</span>
                    </a>
                  )}
                </div>
                <StudioSocialButtons socials={effectiveBrandAbout.socials} compact />
              </div>
              <button
                type="button"
                onClick={() => setTab('about')}
                className="px-4 py-2.5 rounded-xl st-accent-bg text-xs font-semibold cursor-pointer shrink-0 self-start md:self-center"
              >
                Изучить все направления и методику →
              </button>
            </div>

            {(effectiveBrandAbout.methodologyBlocks || []).filter((b) => b.active !== false).length > 0 && (
              <div className="pt-3 border-t st-border flex flex-wrap gap-2">
                {(effectiveBrandAbout.methodologyBlocks || [])
                  .filter((b) => b.active !== false)
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setSelectedMethodologyBlockId(b.id);
                        setTab('about');
                      }}
                      className="px-3 py-1.5 rounded-lg border st-border st-surface-muted text-xs font-semibold hover:opacity-85 cursor-pointer"
                    >
                      {b.title}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Published Trainer Blog Posts */}
          {trainerPosts.length > 0 && (
            <div className="lg:col-span-12 rounded-2xl st-surface border st-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">
                  Блог тренеров студии: методика и советы
                </h3>
                <span className="text-xs font-mono st-muted">
                  Публикаций: {trainerPosts.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {trainerPosts.slice(0, 4).map((post) => (
                  <article
                    key={post.id}
                    className="p-4 rounded-xl st-surface-muted border st-border space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono st-muted">
                      <span className="st-accent-text font-semibold">{post.category}</span>
                      <span>
                        {post.trainerName} · {post.publishedAt.slice(0, 10)}
                      </span>
                    </div>
                    <h4 className="font-display text-sm font-bold">{post.title}</h4>
                    <p className="text-xs st-muted leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {post.content}
                    </p>
                    {post.hashtags.length > 0 && (
                      <div className="text-[11px] font-mono st-accent-text">
                        {post.hashtags.join(' ')}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="lg:col-span-12">
            <LegalAgreementsPanel
              currentUser={currentUser}
              brandName={effectiveBrandAbout.brandName}
              compact
              onAccepted={onLegalAccepted}
            />
          </div>
        </div>
      )}

      {/* TAB: STUDIOS & RATINGS */}
      {tab === 'studios' && (
        <div className="space-y-8">
          {/* Studios Showcase & Rating */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold">Выбор студии: фото, описание и оценки</h3>
                <p className="text-xs st-muted">
                  Сравните филиалы сети, посмотрите фотографии залов и оставьте свой отзыв о студии
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {visibleStudios.map((st) => {
                const stats = getRatingStats(reviews, 'studio', st.id);
                const myRev = findMyReview('studio', st.id);
                const photos = Array.isArray(st.photos) ? st.photos : [];
                const scheduleHours = parseStudioScheduleHours(st);

                return (
                  <div
                    key={st.id}
                    className="rounded-2xl st-surface border st-border overflow-hidden flex flex-col"
                  >
                    {/* Photo Gallery */}
                    {photos.length > 0 ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setGalleryStudio(st);
                            setGalleryIndex(0);
                          }}
                          className="block w-full aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer group"
                        >
                          <img
                            src={photos[0]}
                            alt={st.name}
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                          />
                        </button>
                        {photos.length > 1 && (
                          <div className="p-2 flex gap-2 overflow-x-auto bg-slate-50 dark:bg-slate-950/60 border-b st-border">
                            {photos.map((photoUrl, idx) => (
                              <button
                                key={`${st.id}-ph-${idx}`}
                                type="button"
                                onClick={() => {
                                  setGalleryStudio(st);
                                  setGalleryIndex(idx);
                                }}
                                className="w-16 h-11 rounded-md overflow-hidden border st-border shrink-0 cursor-pointer hover:opacity-85"
                              >
                                <img
                                  src={photoUrl}
                                  alt={`${st.name} ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-[16/7] bg-slate-100 dark:bg-slate-800/50 flex flex-col items-center justify-center text-xs st-muted border-b st-border">
                        <Building2 className="w-7 h-7 opacity-40 mb-1" />
                        <span>Фотографии студии скоро появятся</span>
                      </div>
                    )}

                    <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-display text-base font-bold">{st.name}</h4>
                            <div className="text-xs st-muted flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 st-accent-text" />
                                {st.city}, {st.address}
                              </span>
                              <a
                                href={`tel:${st.phone.replace(/[^\d+]/g, '')}`}
                                className="inline-flex items-center gap-1 font-mono st-accent-text hover:underline"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {st.phone}
                              </a>
                              {st.email && (
                                <a
                                  href={`mailto:${st.email}`}
                                  className="inline-flex items-center gap-1 hover:underline"
                                >
                                  <Mail className="w-3.5 h-3.5 st-accent-text" />
                                  {st.email}
                                </a>
                              )}
                            </div>
                            {st.routeHint && (
                              <div className="text-[11px] st-muted mt-1">{st.routeHint}</div>
                            )}
                          </div>
                          <RatingBadge average={stats.average} count={stats.count} />
                        </div>

                        <StudioSocialButtons socials={st.socials} compact />

                        <div className="flex flex-wrap gap-2 text-[11px] font-mono st-muted">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded st-surface-muted border st-border">
                            <Clock className="w-3 h-3" />
                            Пн–Пт {scheduleHours.weekday.start}–{scheduleHours.weekday.end}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded st-surface-muted border st-border">
                            <Clock className="w-3 h-3" />
                            Сб–Вс {scheduleHours.weekend.start}–{scheduleHours.weekend.end}
                          </span>
                          <span className="px-2 py-0.5 rounded st-surface-muted border st-border">
                            Тренажёров: {st.framesCount}
                          </span>
                        </div>

                        <p className="text-xs st-muted leading-relaxed">
                          {st.description || 'Уютная студия сети ЭТАЛОН ПРАВИЛО с полным телеметрическим контролем нагрузки и опытными инструкторами.'}
                        </p>

                        {/* Studio Reviews List */}
                        {stats.items.length > 0 && (
                          <div className="pt-2 border-t st-border space-y-2">
                            <div className="text-[11px] font-semibold st-muted uppercase tracking-wider">
                              Отзывы клиентов ({stats.items.length})
                            </div>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {stats.items.map((rev) => (
                                <div
                                  key={rev.id}
                                  className="p-2.5 rounded-lg st-surface-muted border st-border text-xs space-y-0.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{rev.authorName}</span>
                                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                                      <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                      {rev.rating} · {rev.updatedAt || rev.createdAt}
                                    </span>
                                  </div>
                                  {rev.comment && <p className="st-muted leading-relaxed">{rev.comment}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3 border-t st-border">
                        <button
                          type="button"
                          onClick={() => {
                            setStudioId(st.id);
                            setTab('book');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                        >
                          Выбрать студию и записаться
                        </button>
                        <button
                          type="button"
                          onClick={() => openRatingModal('studio', st.id, st.name)}
                          className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:border-amber-400"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500" />
                          <span>{myRev ? `Моя оценка: ${myRev.rating}/5` : 'Оценить студию'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trainers Rating Section */}
          <section className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold">Тренеры сети и рейтинг специалистов</h3>
              <p className="text-xs st-muted">
                Все оценки и отзывы открыты для клиентов, тренеров и администрации студии
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {trainers.map((tr) => {
                const st = studios.find((s) => s.id === tr.studioId);
                const stats = getRatingStats(reviews, 'trainer', tr.id);
                const myRev = findMyReview('trainer', tr.id);
                const prof = tr.trainerProfile;
                return (
                  <div
                    key={tr.id}
                    className="rounded-2xl st-surface border st-border p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <TrainerAvatar trainer={tr} size="md" />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{tr.name}</div>
                            <div className="text-xs st-muted truncate">{st?.name || 'Сеть ЭТАЛОН ПРАВИЛО'}</div>
                            {prof?.experienceYears ? (
                              <div className="text-[11px] font-mono st-accent-text font-semibold mt-0.5">
                                Стаж: {formatExperienceYears(prof.experienceYears)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <RatingBadge average={stats.average} count={stats.count} />
                      </div>

                      {prof?.specialization && (
                        <div className="text-xs font-medium leading-snug">
                          {prof.specialization}
                        </div>
                      )}

                      {prof?.workStyle && (
                        <p className="text-[11px] st-muted leading-relaxed line-clamp-2">
                          {prof.workStyle}
                        </p>
                      )}

                      {prof?.skills && prof.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {prof.skills.slice(0, 3).map((sk) => (
                            <span
                              key={sk}
                              className="px-2 py-0.5 rounded st-surface-muted border st-border text-[10px]"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}

                      <TrainerSocialButtons socials={prof?.socials} />

                      {stats.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 pt-1 border-t st-border">
                          {stats.items.map((rev) => (
                            <div
                              key={rev.id}
                              className="p-2.5 rounded-lg st-surface-muted border st-border text-xs space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{rev.authorName}</span>
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                  {rev.rating}
                                </span>
                              </div>
                              {rev.comment && <p className="st-muted leading-relaxed">{rev.comment}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs st-muted py-1">
                          Пока нет отзывов — станьте первым, кто оценит работу тренера.
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-3 border-t st-border">
                      <button
                        type="button"
                        onClick={() => setDetailTrainer(tr)}
                        className="w-full py-1.5 px-3 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-85 cursor-pointer"
                      >
                        О тренере: опыт, стиль, навыки →
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (tr.studioId) setStudioId(tr.studioId);
                            setTrainerId(tr.id);
                            setTab('book');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                        >
                          Записаться к тренеру
                        </button>
                        <button
                          type="button"
                          onClick={() => openRatingModal('trainer', tr.id, tr.name)}
                          className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:border-amber-400"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500" />
                          <span>{myRev ? `${myRev.rating}/5` : 'Оценить'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB: BOOK */}
      {tab === 'book' && (
        <form
          onSubmit={handleCreateBooking}
          className="max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Онлайн-запись на сессию ПравИло</h3>
            <button
              type="button"
              onClick={() => setTab('studios')}
              className="text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Подробнее о студиях и отзывах →
            </button>
          </div>

          {chosenMethodologyNotice && (
            <div className="p-3 rounded-xl st-accent-soft border st-border text-xs flex flex-wrap items-center justify-between gap-2">
              <span>{chosenMethodologyNotice}</span>
              <button
                type="button"
                onClick={() => setTab('about')}
                className="font-semibold underline cursor-pointer"
              >
                Изучить другие методики
              </button>
            </div>
          )}

          {/* Visual Studio Chooser with Photos, Descriptions, and Ratings */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">Выберите студию</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {visibleStudios.map((s) => {
                const isSelected = s.id === studioId;
                const stats = getRatingStats(reviews, 'studio', s.id);
                const photos = Array.isArray(s.photos) ? s.photos : [];
                return (
                  <div
                    key={s.id}
                    onClick={() => setStudioId(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setStudioId(s.id);
                      }
                    }}
                    className={`rounded-xl border overflow-hidden cursor-pointer transition-all flex flex-col ${
                      isSelected
                        ? 'border-cyan-600 ring-2 ring-cyan-500/25 bg-cyan-50/40 dark:bg-cyan-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    {photos[0] && (
                      <div className="relative aspect-[16/9] bg-slate-100 dark:bg-slate-800">
                        <img
                          src={photos[0]}
                          alt={s.name}
                          className="w-full h-full object-cover"
                        />
                        {photos.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGalleryStudio(s);
                              setGalleryIndex(0);
                            }}
                            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono cursor-pointer"
                          >
                            Фото ({photos.length})
                          </button>
                        )}
                      </div>
                    )}
                    <div className="p-3 space-y-1 flex-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="text-xs font-bold leading-snug">{s.name}</span>
                        <RatingBadge average={stats.average} count={stats.count} compact />
                      </div>
                      <div className="text-[11px] text-slate-500">{s.address}</div>
                      {s.description && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-snug pt-0.5">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">Направление и услуга</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setServiceCatFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                  serviceCatFilter === 'all'
                    ? 'st-accent-bg border-transparent'
                    : 'st-surface st-border st-muted'
                }`}
              >
                Все
              </button>
              {SERVICE_CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setServiceCatFilter(cat.id);
                    const firstInCat = services
                      .filter((s) => s.active !== false && inferServiceCategory(s) === cat.id)
                      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))[0];
                    if (firstInCat) setServiceId(firstInCat.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                    serviceCatFilter === cat.id
                      ? 'st-accent-bg border-transparent'
                      : 'st-surface st-border st-muted'
                  }`}
                >
                  {cat.shortLabel}
                </button>
              ))}
            </div>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {SERVICE_CATEGORY_OPTIONS.filter(
                (cat) => serviceCatFilter === 'all' || cat.id === serviceCatFilter
              ).map((cat) => {
                const groupItems = services
                  .filter((s) => s.active !== false && inferServiceCategory(s) === cat.id)
                  .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
                if (groupItems.length === 0) return null;
                return (
                  <optgroup key={cat.id} label={cat.label}>
                    {groupItems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.priceRub.toLocaleString('ru-RU')} ₽ ({s.durationMin} мин)
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Тренер (с рейтингом)</label>
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {trainers.map((t) => {
                const trStats = getRatingStats(reviews, 'trainer', t.id);
                const ratingLabel =
                  trStats.count > 0 ? ` ★ ${trStats.average.toFixed(1)} (${trStats.count})` : '';
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}{ratingLabel}
                  </option>
                );
              })}
            </select>
            {(() => {
              const selTrainer = trainers.find((t) => t.id === trainerId);
              if (!selTrainer) return null;
              return (
                <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TrainerAvatar trainer={selTrainer} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {selTrainer.name}
                        {selTrainer.trainerProfile?.experienceYears
                          ? ` · Стаж ${formatExperienceYears(selTrainer.trainerProfile.experienceYears)}`
                          : ''}
                      </div>
                      {selTrainer.trainerProfile?.specialization && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {selTrainer.trainerProfile.specialization}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailTrainer(selTrainer)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium cursor-pointer"
                  >
                    Подробнее о тренере →
                  </button>
                </div>
              );
            })()}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Дата</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Время ({isWeekendDate(date) ? 'выходные' : 'будни'}: {selectedDayHours.start} – {selectedDayHours.end})
              </label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {availableSlots.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          {bookingError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {bookingError}
            </div>
          )}
          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-slate-900 dark:bg-cyan-600 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-cyan-500 cursor-pointer"
          >
            Подтвердить запись
          </button>
        </form>
      )}

      {/* TAB: PROGRESS */}
      {tab === 'progress' && (
        <div className="space-y-5">
          {latestAnthro && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Рост до → после</div>
                  <div className="font-mono text-xl font-bold mt-1 tabular-nums">
                    {latestAnthro.heightBeforeCm.toFixed(1)}
                    {latestAnthro.heightAfterCm ? ` → ${latestAnthro.heightAfterCm.toFixed(1)}` : ''} см
                  </div>
                  {typeof latestAnthro.heightDeltaCm === 'number' && (
                    <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Динамика: {latestAnthro.heightDeltaCm >= 0 ? '+' : ''}
                      {latestAnthro.heightDeltaCm.toFixed(1)} см
                    </div>
                  )}
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Вес · ИМТ (Mi Scale 2)</div>
                  <div className="font-mono text-xl font-bold mt-1 tabular-nums">
                    {latestAnthro.weightKg} кг
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    ИМТ {latestAnthro.bmi} · Идеал {latestAnthro.idealWeightKg} кг
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Давление (тонометр)</div>
                  <div className="font-mono text-xl font-bold mt-1 tabular-nums">
                    {latestAnthro.bpSys}/{latestAnthro.bpDia}
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    Пульс {latestAnthro.pulseRest} уд/мин
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Оценка тела · Гибкость</div>
                  <div className="font-mono text-xl font-bold mt-1 tabular-nums">
                    {latestAnthro.bodyScore}/100
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    Гибкость {latestAnthro.flexibilityScore}/100 · Боль {latestAnthro.painIndex}/10
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
                <MiScale2Breakdown
                  metrics={latestAnthro}
                  gender={client?.gender || 'male'}
                  ageYears={new Date().getFullYear() - (client?.birthYear || 1990)}
                  heightCm={latestAnthro.heightAfterCm ?? latestAnthro.heightBeforeCm ?? latestAnthro.heightCm ?? 175}
                />
              </div>
            </div>
          )}

          {client && <PostureComparisonSection client={client} editable={false} />}

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-display text-base font-semibold">Динамика завершённых тренировок</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.map((ses) => {
                const st = studios.find((s) => s.id === ses.studioId);
                return (
                  <div key={ses.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{ses.programTitle}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {ses.startedAt.slice(0, 10)} · {st?.name || 'Студия'} · Тренер {ses.trainerName} · АД {ses.bpBefore} → {ses.bpAfter}
                      </div>
                      {ses.notes && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{ses.notes}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-left sm:text-right font-mono text-xs">
                        <div className="text-sm font-bold text-cyan-700 dark:text-cyan-400">
                          Тяга {ses.peakWinchKg.toFixed(1)} кг
                        </div>
                        <div className="text-slate-500">Симметрия {ses.avgSymmetryPct}%</div>
                      </div>
                      {ses.trainerId && (
                        <button
                          type="button"
                          onClick={() =>
                            openRatingModal('trainer', ses.trainerId, ses.trainerName)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:border-amber-400 cursor-pointer"
                        >
                          <Star className="w-3 h-3 text-amber-500" />
                          <span>Оценить тренера</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: CHAT & ALERTS */}
      {tab === 'alerts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Studio Chat */}
          <div className="lg:col-span-7 rounded-2xl st-surface border st-border p-5 flex flex-col justify-between gap-4 min-h-[380px]">
            <div className="flex items-center justify-between border-b st-border pb-3">
              <div>
                <h3 className="font-display text-base font-bold">Чат с администратором студии</h3>
                <div className="text-xs st-muted">Мгновенная переписка через Telegram / PWA-кабинет</div>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {messengerMessages.map((m) => {
                const isMe = m.direction === 'inbound';
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 text-xs space-y-1 border ${
                        isMe ? 'st-accent-bg border-transparent' : 'st-surface-muted st-border'
                      }`}
                    >
                      <div className={`text-[10px] font-mono ${isMe ? 'text-white/75' : 'st-muted'}`}>
                        {m.senderName} · {m.sentAt}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                    </div>
                  </div>
                );
              })}
              {messengerMessages.length === 0 && (
                <div className="py-10 text-center text-xs st-muted">
                  Напишите администратору, чтобы подобрать удобное время, продлить абонемент или задать вопрос.
                </div>
              )}
            </div>

            <form onSubmit={handleSendClientChat} className="flex gap-2 pt-2 border-t st-border">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder={isOnline ? 'Написать администратору...' : 'Чат доступен при подключении к сети'}
                disabled={!isOnline}
                className="flex-1 px-3 py-2 text-xs rounded-lg border st-border st-surface"
              />
              <button
                type="submit"
                disabled={!isOnline || sendingChat || !chatText.trim()}
                className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {sendingChat ? '...' : 'Отправить'}
              </button>
            </form>
          </div>

          {/* Alerts History */}
          <div className="lg:col-span-5 rounded-2xl st-surface border st-border p-5 space-y-3">
            <h3 className="font-display text-base font-bold">Уведомления и напоминания</h3>
            <div className="divide-y st-border max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{n.subject}</span>
                    <span className="font-mono st-muted">{n.sentAt}</span>
                  </div>
                  <p className="text-xs st-muted leading-relaxed">{n.messagePreview}</p>
                </div>
              ))}
              {!notifications.length && (
                <div className="py-6 text-center text-xs st-muted">Новых уведомлений нет.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: ABOUT NETWORK & METHODOLOGY */}
      {tab === 'about' && (
        <div className="space-y-5">
          <BrandAboutSection
            brandAbout={effectiveBrandAbout}
            studios={visibleStudios}
            initialMethodologyBlockId={selectedMethodologyBlockId}
            onSelectStudioForBook={(id) => {
              setStudioId(id);
              setTab('book');
            }}
            onChooseMethodology={(block: MethodologyProgramBlock) => {
              const targetCat = block.recommendedServiceCategory || 'all';
              setServiceCatFilter(targetCat);
              if (targetCat !== 'all') {
                const matching = services
                  .filter((s) => s.active !== false && inferServiceCategory(s) === targetCat)
                  .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))[0];
                if (matching) setServiceId(matching.id);
              }
              setChosenMethodologyNotice(
                `Выбрана программа «${block.title}»${
                  block.recommendedServiceHint ? ` (${block.recommendedServiceHint})` : ''
                }.`
              );
              setTab('book');
            }}
          />
          <LegalAgreementsPanel
            currentUser={currentUser}
            brandName={effectiveBrandAbout.brandName}
            compact
            onAccepted={onLegalAccepted}
          />
        </div>
      )}

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 st-surface backdrop-blur-md border-t st-border grid grid-cols-6 h-16">
        <button
          type="button"
          onClick={() => setTab('home')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'home' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="mt-0.5">Главная</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('studios')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'studios' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="mt-0.5">Студии</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('book')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'book' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <CalendarPlus className="w-5 h-5" />
          <span className="mt-0.5">Запись</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('progress')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'progress' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="mt-0.5">Прогресс</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('about')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'about' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="mt-0.5">О нас</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('alerts')}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
            tab === 'alerts' ? 'st-accent-text' : 'st-muted'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="mt-0.5">Чат</span>
        </button>
      </nav>

      {/* Modal: Studio Photo Gallery Lightbox */}
      {galleryStudio && (galleryStudio.photos || []).length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <div className="font-display text-sm font-bold">{galleryStudio.name}</div>
                <div className="text-xs text-slate-500">
                  Фото {galleryIndex + 1} из {galleryStudio.photos!.length} · {galleryStudio.address}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGalleryStudio(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-black aspect-[16/10] flex items-center justify-center">
              <img
                src={galleryStudio.photos![galleryIndex]}
                alt={`${galleryStudio.name} ${galleryIndex + 1}`}
                className="max-h-full max-w-full object-contain"
              />
              {galleryStudio.photos!.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryIndex((i) =>
                        i === 0 ? galleryStudio.photos!.length - 1 : i - 1
                      )
                    }
                    className="absolute left-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/85 cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryIndex((i) =>
                        (i + 1) % galleryStudio.photos!.length
                      )
                    }
                    className="absolute right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/85 cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rate Studio or Trainer */}
      {ratingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={handleSubmitRating}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {ratingModal.targetType === 'studio' ? 'Оценка студии' : 'Оценка тренера'}
                </div>
                <h3 className="font-display text-lg font-bold mt-0.5">{ratingModal.targetName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setRatingModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Ваша оценка (от 1 до 5 звёзд)
              </label>
              <div className="flex items-center gap-3">
                <StarRatingInput value={draftRating} onChange={setDraftRating} />
                <span className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                  {draftRating} / 5
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Отзыв или комментарий (будет виден всем)
              </label>
              <textarea
                rows={3}
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                placeholder="Поделитесь впечатлениями о тренировке, атмосфере или работе тренера..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {ratingError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {ratingError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRatingModal(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={ratingBusy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                {ratingBusy ? 'Сохраняем...' : 'Сохранить оценку'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Personal Data */}
      {showProfileEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePersonalData}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3.5 shadow-xl my-8"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold">Редактировать личные данные</h3>
              <button
                type="button"
                onClick={() => setShowProfileEdit(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">ФИО</label>
              <input
                type="text"
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Телефон</label>
                <input
                  type="text"
                  value={pPhone}
                  onChange={(e) => setPPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Telegram</label>
                <input
                  type="text"
                  placeholder="@username"
                  value={pTg}
                  onChange={(e) => setPTg(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">E-mail</label>
              <input
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Основная студия</label>
                <select
                  value={pStudioId}
                  onChange={(e) => setPStudioId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {client && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Пол</label>
                    <select
                      value={pGender}
                      onChange={(e) => setPGender(e.target.value as 'male' | 'female')}
                      className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="male">Мужской</option>
                      <option value="female">Женский</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Дата рождения</label>
                    <input
                      type="date"
                      value={pBirthDate}
                      onChange={(e) => setPBirthDate(e.target.value)}
                      className="w-full px-2 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </>
              )}
            </div>

            {client && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Цель тренировок</label>
                  <input
                    type="text"
                    value={pGoal}
                    onChange={(e) => setPGoal(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Особенности / ограничения</label>
                  <input
                    type="text"
                    value={pContra}
                    onChange={(e) => setPContra(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </>
            )}

            {profileErr && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {profileErr}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProfileEdit(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={profileBusy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                {profileBusy ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detailTrainer && (
        <TrainerProfileDetailModal
          trainer={detailTrainer}
          studio={studios.find((s) => s.id === detailTrainer.studioId)}
          ratingAverage={getRatingStats(reviews, 'trainer', detailTrainer.id).average}
          ratingCount={getRatingStats(reviews, 'trainer', detailTrainer.id).count}
          reviews={getRatingStats(reviews, 'trainer', detailTrainer.id).items}
          onBookTrainer={() => {
            if (detailTrainer.studioId) setStudioId(detailTrainer.studioId);
            setTrainerId(detailTrainer.id);
            setTab('book');
          }}
          onRateTrainer={() => openRatingModal('trainer', detailTrainer.id, detailTrainer.name)}
          onClose={() => setDetailTrainer(null)}
        />
      )}

      {showLegalModal && (
        <LegalAgreementsModal
          role={currentUser.role}
          currentUser={currentUser}
          mandatoryMode={false}
          brandName={effectiveBrandAbout.brandName}
          onAccepted={onLegalAccepted}
          onClose={() => setShowLegalModal(false)}
        />
      )}
    </div>
  );
};
