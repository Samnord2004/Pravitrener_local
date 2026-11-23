import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Smartphone,
  Star,
  TicketPercent,
  UserCheck,
  Mail,
} from 'lucide-react';
import type {
  Booking,
  MethodologyProgramBlock,
  PublicBookingInfo,
  ServiceCategory,
} from '../types';
import { DEFAULT_BRAND_ABOUT } from '../utils/brandAbout';
import {
  generateReceptionSlots,
  getStudioHoursForDate,
  isWeekendDate,
} from '../utils/studioHours';
import {
  SERVICE_CATEGORY_OPTIONS,
  inferServiceCategory,
} from '../utils/serviceCategories';
import { getRatingStats } from '../utils/reviews';
import { formatExperienceYears } from '../utils/trainerProfile';
import { RatingBadge } from './RatingStars';
import { PWAInstallButton } from './PWAInstallButton';
import { BrandAboutSection, StudioSocialButtons } from './StudioSocialButtons';
import {
  TrainerAvatar,
  TrainerProfileDetailModal,
  TrainerSocialButtons,
  type TrainerPublicUser,
} from './TrainerProfileCard';

interface PublicBookingViewProps {
  onExitToLogin?: () => void;
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({ onExitToLogin }) => {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialStudioId = query.get('studio') || '';
  const initialClientId = query.get('clientId') || '';
  const initialPromo = query.get('promo') || '';

  const [info, setInfo] = useState<PublicBookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [studioId, setStudioId] = useState(initialStudioId);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [serviceCatFilter, setServiceCatFilter] = useState<'all' | ServiceCategory>('all');
  const [serviceId, setServiceId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState('12:00');
  const [promoCode, setPromoCode] = useState(initialPromo);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientTelegram, setClientTelegram] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [chosenMethodology, setChosenMethodology] = useState('');
  const [detailTrainer, setDetailTrainer] = useState<TrainerPublicUser | null>(null);
  const [confirmed, setConfirmed] = useState<{
    booking: Booking;
    studioAddress: string;
    cabinetLink: string;
  } | null>(null);

  useEffect(() => {
    const url = initialClientId
      ? `/api/public/booking-info?clientId=${encodeURIComponent(initialClientId)}`
      : '/api/public/booking-info';
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось загрузить расписание студий');
        return (await r.json()) as PublicBookingInfo;
      })
      .then((data) => {
        setInfo(data);
        const preferredStudio =
          data.studios.find((s) => s.id === initialStudioId)?.id ||
          data.prefillClient?.studioId ||
          data.studios[0]?.id ||
          '';
        setStudioId(preferredStudio);
        setServiceId(data.services[0]?.id || '');
        const studioTrainer =
          data.trainers.find((t) => t.studioId === preferredStudio) || data.trainers[0];
        setTrainerId(studioTrainer?.id || '');
        if (data.prefillClient) {
          setClientName(data.prefillClient.name);
          setClientPhone(data.prefillClient.phone);
          setClientEmail(data.prefillClient.email);
          setClientTelegram(data.prefillClient.telegram);
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки');
      })
      .finally(() => setLoading(false));
  }, [initialClientId, initialStudioId]);

  const selectedStudio = useMemo(
    () => info?.studios.find((s) => s.id === studioId) || info?.studios[0],
    [info, studioId]
  );

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [selectedStudio?.id]);

  const availableSlots = useMemo(
    () => generateReceptionSlots(selectedStudio, 60, date),
    [selectedStudio, date]
  );
  const selectedDayHours = useMemo(
    () => getStudioHoursForDate(selectedStudio, date),
    [selectedStudio, date]
  );

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(time)) {
      setTime(availableSlots[0]);
    }
  }, [availableSlots, time]);

  const selectedService = useMemo(
    () => info?.services.find((s) => s.id === serviceId) || info?.services[0],
    [info, serviceId]
  );

  const selectedStudioStats = useMemo(
    () =>
      selectedStudio
        ? getRatingStats(info?.reviews, 'studio', selectedStudio.id)
        : { average: 0, count: 0, items: [] },
    [info?.reviews, selectedStudio]
  );

  const selectedTrainer = useMemo(
    () => info?.trainers.find((t) => t.id === trainerId) || info?.trainers[0],
    [info, trainerId]
  );

  const selectedTrainerStats = useMemo(
    () =>
      trainerId
        ? getRatingStats(info?.reviews, 'trainer', trainerId)
        : { average: 0, count: 0, items: [] },
    [info?.reviews, trainerId]
  );

  const matchedPromo = useMemo(() => {
    const code = promoCode.trim().toUpperCase();
    if (!code || !info) return undefined;
    return info.promos.find(
      (p) => p.code.toUpperCase() === code && (p.studioId === 'all' || p.studioId === studioId)
    );
  }, [promoCode, info, studioId]);

  const finalPrice = useMemo(() => {
    const base = selectedService?.priceRub || 0;
    if (!matchedPromo) return base;
    return Math.round(base * (1 - matchedPromo.discountPercent / 100));
  }, [selectedService, matchedPromo]);

  const handleSelectStudio = (nextStudio: string) => {
    setStudioId(nextStudio);
    if (!info) return;
    const tr = info.trainers.find((t) => t.studioId === nextStudio);
    if (tr) setTrainerId(tr.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const resp = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioId,
          serviceId,
          trainerId,
          date,
          time,
          promoCode: promoCode.trim() || undefined,
          clientId: info?.prefillClient?.id,
          clientName,
          clientPhone,
          clientEmail,
          clientTelegram,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || 'Не удалось создать запись');
      }
      setConfirmed(json);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Ошибка отправки заявки');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen st-canvas flex items-center justify-center p-6 text-sm st-muted">
        Загрузка расписания онлайн-записи ЭТАЛОН ПРАВИЛО...
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen st-canvas flex flex-col items-center justify-center p-6 gap-4 text-center">
        <div className="text-sm text-rose-600">{loadError || 'Форма записи временно недоступна'}</div>
        {onExitToLogin && (
          <button
            type="button"
            onClick={onExitToLogin}
            className="px-4 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
          >
            Перейти ко входу в кабинет
          </button>
        )}
      </div>
    );
  }

  const studioPhotos = Array.isArray(selectedStudio?.photos) ? selectedStudio!.photos! : [];

  return (
    <div className="min-h-screen st-canvas flex flex-col">
      <div className="st-ornament-bar" />
      <header className="st-surface border-b st-border px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 rounded-lg bg-white border st-border px-2.5 py-1 flex items-center shrink-0">
            <img
              src="/assets/aistudio/logo_full_etalon.png"
              alt="ЭТАЛОН ПРАВИЛО"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="text-xs st-muted truncate hidden sm:block">Прямая онлайн-запись на сессию</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />
          {onExitToLogin && (
            <button
              type="button"
              onClick={onExitToLogin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-85 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Вход в кабинет</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Selected Studio Showcase (Photos, Description, Ratings) */}
        <div className="lg:col-span-5 space-y-5">
          {selectedStudio && (
            <div className="rounded-2xl st-surface border st-border overflow-hidden">
              {studioPhotos.length > 0 ? (
                <div>
                  <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <img
                      src={studioPhotos[activePhotoIndex] || studioPhotos[0]}
                      alt={selectedStudio.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {studioPhotos.length > 1 && (
                    <div className="p-2 flex gap-2 overflow-x-auto st-surface-muted border-b st-border">
                      {studioPhotos.map((src, idx) => (
                        <button
                          key={`${selectedStudio.id}-pub-${idx}`}
                          type="button"
                          onClick={() => setActivePhotoIndex(idx)}
                          className={`w-16 h-10 rounded overflow-hidden border shrink-0 cursor-pointer ${
                            idx === activePhotoIndex
                              ? 'border-cyan-600 ring-2 ring-cyan-500/30'
                              : 'st-border opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img src={src} alt={`Фото ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[16/8] st-surface-muted border-b st-border flex flex-col items-center justify-center text-xs st-muted">
                  <Building2 className="w-7 h-7 opacity-40 mb-1" />
                  <span>{selectedStudio.name}</span>
                </div>
              )}

              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">{selectedStudio.name}</h2>
                  <RatingBadge
                    average={selectedStudioStats.average}
                    count={selectedStudioStats.count}
                  />
                </div>
                <div className="space-y-1.5 text-xs st-muted">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 st-accent-text shrink-0" />
                    <span>{selectedStudio.city}, {selectedStudio.address}</span>
                  </div>
                  {selectedStudio.routeHint && (
                    <div className="text-[11px] pl-5">{selectedStudio.routeHint}</div>
                  )}
                  <div className="flex items-center gap-2 font-mono">
                    <Phone className="w-3.5 h-3.5 st-accent-text shrink-0" />
                    <a
                      href={`tel:${selectedStudio.phone.replace(/[^\d+]/g, '')}`}
                      className="st-accent-text hover:underline"
                    >
                      {selectedStudio.phone}
                    </a>
                  </div>
                  {selectedStudio.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 st-accent-text shrink-0" />
                      <a href={`mailto:${selectedStudio.email}`} className="hover:underline">
                        {selectedStudio.email}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2 font-mono">
                    <Clock className="w-3.5 h-3.5 st-accent-text shrink-0" />
                    <span>{selectedStudio.openHours}</span>
                  </div>
                </div>

                <StudioSocialButtons socials={selectedStudio.socials} compact />

                {selectedStudio.description && (
                  <p className="text-xs st-muted leading-relaxed pt-2 border-t st-border">
                    {selectedStudio.description}
                  </p>
                )}

                {selectedStudioStats.items.length > 0 && (
                  <div className="pt-2 border-t st-border space-y-2">
                    <div className="text-[11px] font-semibold st-muted uppercase tracking-wider">
                      Отзывы о студии ({selectedStudioStats.items.length})
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {selectedStudioStats.items.map((rev) => (
                        <div key={rev.id} className="p-2.5 rounded-lg st-surface-muted border st-border text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{rev.authorName}</span>
                            <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                              {rev.rating}
                            </span>
                          </div>
                          {rev.comment && <p className="st-muted mt-0.5">{rev.comment}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl st-surface border st-border p-5 space-y-3">
            <h3 className="font-display text-base font-bold">Как проходит запись</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex gap-3">
                <span className="font-mono font-bold st-accent-text">01.</span>
                <span>Вы сравниваете студии по фото, описанию и отзывам, выбираете тренера и удобный час.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono font-bold st-accent-text">02.</span>
                <span>Заявка сразу отображается у администратора в режиме реального времени и в журнале диалогов.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono font-bold st-accent-text">03.</span>
                <span>После сессии вся телеметрия, рост до/после и возможность оценить студию и тренера доступны в личном кабинете.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Booking Form or Confirmation */}
        <div className="lg:col-span-7">
          {confirmed ? (
            <div className="rounded-2xl st-surface border st-border p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full st-accent-soft flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold">Запись успешно оформлена</h2>
                  <div className="text-xs st-muted font-mono">Номер заявки: {confirmed.booking.id}</div>
                </div>
              </div>

              <div className="p-4 rounded-xl st-surface-muted border st-border grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="st-muted">Услуга</div>
                  <div className="font-semibold mt-0.5">{confirmed.booking.serviceName}</div>
                </div>
                <div>
                  <div className="st-muted">Дата и время</div>
                  <div className="font-mono font-bold mt-0.5">
                    {confirmed.booking.date} в {confirmed.booking.time}
                  </div>
                </div>
                <div>
                  <div className="st-muted">Адрес студии</div>
                  <div className="font-medium mt-0.5">{confirmed.studioAddress}</div>
                </div>
                <div>
                  <div className="st-muted">Тренер · Стоимость</div>
                  <div className="font-mono font-bold mt-0.5">
                    {confirmed.booking.trainerName} · {confirmed.booking.finalAmountRub.toLocaleString('ru-RU')} ₽
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmed(null)}
                  className="px-4 py-2.5 rounded-lg border st-border text-xs font-medium cursor-pointer"
                >
                  Создать ещё одну запись
                </button>
                {onExitToLogin && (
                  <button
                    type="button"
                    onClick={onExitToLogin}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Открыть личный кабинет клиента</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl st-surface border st-border p-5 sm:p-6 space-y-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold">Параметры визита</h2>
                <span className="text-xs font-mono st-accent-text font-semibold tabular-nums">
                  {finalPrice.toLocaleString('ru-RU')} ₽
                </span>
              </div>

              {chosenMethodology && (
                <div className="p-3 rounded-xl st-accent-soft border st-border text-xs">
                  {chosenMethodology}
                </div>
              )}

              {/* Studio Visual Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-medium st-muted">Выберите студию</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {info.studios.map((s) => {
                    const isSelected = s.id === studioId;
                    const stats = getRatingStats(info.reviews, 'studio', s.id);
                    const cover = Array.isArray(s.photos) ? s.photos[0] : '';
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudio(s.id)}
                        className={`text-left rounded-xl border overflow-hidden cursor-pointer transition-all flex flex-col ${
                          isSelected
                            ? 'border-cyan-600 ring-2 ring-cyan-500/25 st-surface-muted'
                            : 'st-border st-surface hover:border-slate-400'
                        }`}
                      >
                        {cover && (
                          <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-800">
                            <img src={cover} alt={s.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="p-2.5 space-y-1 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-bold leading-snug">{s.name}</span>
                            <RatingBadge average={stats.average} count={stats.count} compact />
                          </div>
                          <div className="text-[11px] st-muted line-clamp-1">{s.address}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium st-muted">Тренер</label>
                  <RatingBadge
                    average={selectedTrainerStats.average}
                    count={selectedTrainerStats.count}
                  />
                </div>
                <select
                  value={trainerId}
                  onChange={(e) => setTrainerId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border st-border st-surface"
                >
                  {info.trainers.map((t) => {
                    const stStats = getRatingStats(info.reviews, 'trainer', t.id);
                    const label =
                      stStats.count > 0 ? ` ★ ${stStats.average.toFixed(1)} (${stStats.count})` : '';
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}{label}
                      </option>
                    );
                  })}
                </select>

                {selectedTrainer && (
                  <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <TrainerAvatar trainer={selectedTrainer} size="sm" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold">{selectedTrainer.name}</span>
                            {selectedTrainer.trainerProfile?.experienceYears ? (
                              <span className="text-[11px] font-mono st-accent-text font-semibold">
                                Стаж: {formatExperienceYears(selectedTrainer.trainerProfile.experienceYears)}
                              </span>
                            ) : null}
                          </div>
                          {selectedTrainer.trainerProfile?.specialization && (
                            <div className="text-[11px] st-muted line-clamp-1">
                              {selectedTrainer.trainerProfile.specialization}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailTrainer(selectedTrainer)}
                        className="px-2.5 py-1 rounded-lg border st-border st-surface text-[11px] font-medium hover:opacity-85 cursor-pointer shrink-0"
                      >
                        О тренере →
                      </button>
                    </div>

                    {selectedTrainer.trainerProfile?.workStyle && (
                      <div className="text-[11px] st-muted leading-relaxed line-clamp-2">
                        <span className="font-semibold">Стиль работы:</span>{' '}
                        {selectedTrainer.trainerProfile.workStyle}
                      </div>
                    )}

                    {selectedTrainer.trainerProfile?.skills &&
                      selectedTrainer.trainerProfile.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedTrainer.trainerProfile.skills.slice(0, 4).map((skill) => (
                            <span
                              key={skill}
                              className="px-2 py-0.5 rounded st-surface border st-border text-[10px]"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}

                    <TrainerSocialButtons socials={selectedTrainer.trainerProfile?.socials} />

                    {selectedTrainerStats.items[0]?.comment && (
                      <div className="text-[11px] st-muted italic pt-1 border-t st-border">
                        Отзыв: «{selectedTrainerStats.items[0].comment}» —{' '}
                        {selectedTrainerStats.items[0].authorName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium st-muted">Направление и услуга</label>
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
                    Все направления
                  </button>
                  {SERVICE_CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setServiceCatFilter(cat.id);
                        const firstInCat = info.services
                          .filter((s) => inferServiceCategory(s) === cat.id)
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
                  className="w-full px-3 py-2.5 text-sm rounded-lg border st-border st-surface"
                >
                  {SERVICE_CATEGORY_OPTIONS.filter(
                    (cat) => serviceCatFilter === 'all' || cat.id === serviceCatFilter
                  ).map((cat) => {
                    const groupItems = info.services
                      .filter((s) => inferServiceCategory(s) === cat.id)
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium st-muted mb-1">Дата посещения</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium st-muted mb-1 flex items-center gap-1">
                    <TicketPercent className="w-3.5 h-3.5 st-accent-text" />
                    <span>Промокод (если есть)</span>
                  </label>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Например: FIRST20"
                    className="w-full px-3 py-2.5 text-sm font-mono uppercase rounded-lg border st-border st-surface"
                  />
                  {matchedPromo && (
                    <div className="text-[11px] st-secondary-text mt-1 font-medium">
                      Применён «{matchedPromo.title}» (−{matchedPromo.discountPercent}%)
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium st-muted mb-1.5 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 st-accent-text" />
                  <span>
                    Время записи ({isWeekendDate(date) ? 'выходные' : 'будни'}: {selectedDayHours.start} – {selectedDayHours.end})
                  </span>
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      className={`py-2 rounded-lg text-xs font-mono font-medium border cursor-pointer transition-colors ${
                        time === slot
                          ? 'st-accent-bg border-transparent'
                          : 'st-surface st-border hover:opacity-80'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t st-border space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <UserCheck className="w-4 h-4 st-accent-text" />
                  <span>Контактные данные для подтверждения</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Ваше имя и фамилия"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="px-3 py-2.5 text-sm rounded-lg border st-border st-surface"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="+7 (999) 000-00-00"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="px-3 py-2.5 text-sm font-mono rounded-lg border st-border st-surface"
                  />
                  <input
                    type="text"
                    placeholder="Telegram (@username)"
                    value={clientTelegram}
                    onChange={(e) => setClientTelegram(e.target.value)}
                    className="px-3 py-2.5 text-sm font-mono rounded-lg border st-border st-surface"
                  />
                  <input
                    type="email"
                    placeholder="Email для отчёта тренировки"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="px-3 py-2.5 text-sm rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl st-accent-bg text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting
                  ? 'Оформляем запись...'
                  : `Записаться на ${date} в ${time} · ${finalPrice.toLocaleString('ru-RU')} ₽`}
              </button>
            </form>
          )}
        </div>
      </main>

      <section className="max-w-6xl w-full mx-auto px-4 sm:px-8 pb-10">
        <BrandAboutSection
          brandAbout={info.brandAbout || DEFAULT_BRAND_ABOUT}
          studios={info.studios}
          onSelectStudioForBook={(id) => {
            handleSelectStudio(id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onChooseMethodology={(block: MethodologyProgramBlock) => {
            const cat = block.recommendedServiceCategory || 'all';
            setServiceCatFilter(cat);
            if (cat !== 'all') {
              const firstInCat = info.services
                .filter((s) => inferServiceCategory(s) === cat)
                .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))[0];
              if (firstInCat) setServiceId(firstInCat.id);
            }
            setChosenMethodology(
              `Выбрана программа «${block.title}»${
                block.recommendedServiceHint ? ` (${block.recommendedServiceHint})` : ''
              }.`
            );
            setConfirmed(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </section>

      {detailTrainer && (
        <TrainerProfileDetailModal
          trainer={detailTrainer}
          studio={info.studios.find((s) => s.id === detailTrainer.studioId) as any}
          ratingAverage={getRatingStats(info.reviews, 'trainer', detailTrainer.id).average}
          ratingCount={getRatingStats(info.reviews, 'trainer', detailTrainer.id).count}
          reviews={getRatingStats(info.reviews, 'trainer', detailTrainer.id).items}
          onBookTrainer={() => setTrainerId(detailTrainer.id)}
          onClose={() => setDetailTrainer(null)}
        />
      )}
    </div>
  );
};
