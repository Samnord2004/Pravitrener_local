import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Users,
  ClipboardList,
  Newspaper,
  History,
  ShieldAlert,
  Lock,
  Play,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Send,
  FileDown,
  Activity,
  HeartPulse,
  Ruler,
  Dumbbell,
  ExternalLink,
  Search,
  X,
  Scale,
  Bluetooth,
  BluetoothOff,
  UserCheck,
} from 'lucide-react';
import type {
  AnthropometryRecord,
  Booking,
  ClientActivityStatus,
  ClientProfile,
  ClientProgressNote,
  ClientSubscription,
  EquipmentDevice,
  Exercise,
  LegalAcceptanceRecord,
  PaymentStatus,
  RatingReview,
  Studio,
  TrainerBlogPlatform,
  TrainerBlogPost,
  TrainerPublicProfile,
  TrainerSchedule,
  TrainingSessionRecord,
  UserAccount,
  WorkoutProgram,
} from '../types';
import { apiRequest } from '../utils/api';
import { exportSessionReportPdf } from '../utils/pdfReport';
import { getRatingStats } from '../utils/reviews';
import { RatingBadge } from './RatingStars';
import {
  calculateMiScale2Metrics,
  DEFAULT_MI_SCALE_CALIBRATION,
} from '../utils/miScale2';
import {
  connectRealHardwareDevice,
  disconnectRealHardwareDevice,
  useHardwareTelemetry,
} from '../utils/hardwareManager';
import { getHardwareCapabilities } from '../utils/bluetooth';
import { PWAInstallButton } from './PWAInstallButton';
import { ExercisesLibraryView } from './ExercisesLibraryView';
import { PostureComparisonSection } from './PostureComparisonSection';
import { TrainerAvatar, TrainerProfileEditorForm } from './TrainerProfileCard';
import { DifficultyStars } from './DifficultyStars';
import { LegalAgreementsModal, LegalAgreementsPanel } from './LegalAgreementsModal';
import {
  computeProgramDifficulty,
  inferExerciseDifficulty,
} from '../utils/serviceCategories';

interface TrainerPortalProps {
  currentUser: UserAccount;
  studios: Studio[];
  users: UserAccount[];
  schedules: TrainerSchedule[];
  clients: ClientProfile[];
  bookings: Booking[];
  sessions: TrainingSessionRecord[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  clientSubscriptions: ClientSubscription[];
  trainerPosts: TrainerBlogPost[];
  reviews?: RatingReview[];
  brandName?: string;
  onLegalAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  scaleDevice?: EquipmentDevice;
  onDeviceUpdated?: (dev: EquipmentDevice) => void;
  onClientUpdated?: (c: ClientProfile) => void;
  onCurrentUserUpdated?: (u: UserAccount) => void;
  onUserUpdated?: (u: UserAccount) => void;
  onAnthropometryAdded?: (clientId: string, rec: AnthropometryRecord) => void;
  onAnthropometryUpdated?: (clientId: string, rec: AnthropometryRecord) => void;
  onAnthropometryDeleted?: (clientId: string, recId: string) => void;
  onBookingUpdated: (b: Booking) => void;
  onExerciseAdded: (ex: Exercise) => void;
  onExerciseUpdated: (ex: Exercise) => void;
  onExerciseDeleted: (id: string) => void;
  onProgramAdded: (p: WorkoutProgram) => void;
  onProgramUpdated: (p: WorkoutProgram) => void;
  onProgramDeleted: (id: string) => void;
  onNoteAdded: (clientId: string, note: ClientProgressNote) => void;
  onPostAdded: (post: TrainerBlogPost) => void;
  onPostUpdated: (post: TrainerBlogPost) => void;
  onPostDeleted: (id: string) => void;
  onStartLiveSession: (b: Booking) => void;
  onLaunchProgramInSession: (programId: string) => void;
}

type TrainerTab = 'schedule' | 'clients' | 'exercises' | 'programs' | 'blog' | 'history' | 'profile';

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

const PLATFORM_LABELS: Record<TrainerBlogPlatform, string> = {
  telegram: 'Telegram-канал',
  vk: 'ВКонтакте',
  instagram: 'Instagram / Reels',
  dzen: 'Яндекс Дзен',
  all: 'Мультипост (все сети)',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачено',
  paid_cash: 'Наличные',
  paid_card: 'Карта / QR',
  paid_subscription: 'Абонемент',
  paid_certificate: 'Сертификат',
};

export const TrainerMobilePortalView: React.FC<TrainerPortalProps> = ({
  currentUser,
  studios,
  users,
  schedules,
  clients,
  bookings,
  sessions,
  exercises,
  programs,
  clientSubscriptions,
  trainerPosts,
  reviews = [],
  brandName,
  onLegalAccepted,
  scaleDevice,
  onDeviceUpdated,
  onClientUpdated,
  onCurrentUserUpdated,
  onUserUpdated,
  onAnthropometryAdded,
  onAnthropometryUpdated,
  onAnthropometryDeleted,
  onBookingUpdated,
  onExerciseAdded,
  onExerciseUpdated,
  onExerciseDeleted,
  onProgramAdded,
  onProgramUpdated,
  onProgramDeleted,
  onNoteAdded,
  onPostAdded,
  onPostUpdated,
  onPostDeleted,
  onStartLiveSession,
  onLaunchProgramInSession,
}) => {
  const [tab, setTab] = useState<TrainerTab>('schedule');
  const [showLegalModal, setShowLegalModal] = useState(false);
  const trainersList = useMemo(
    () => users.filter((u) => u.role === 'trainer'),
    [users]
  );
  const [viewedTrainerId, setViewedTrainerId] = useState<string>(() =>
    currentUser.role === 'trainer'
      ? currentUser.id
      : trainersList[0]?.id || currentUser.id
  );
  const activeTrainerId =
    currentUser.role === 'trainer' ? currentUser.id : viewedTrainerId;
  const activeTrainer =
    trainersList.find((t) => t.id === activeTrainerId) || currentUser;

  // Schedule & Bookings state
  const [bookingFilter, setBookingFilter] = useState<'today' | 'upcoming' | 'all'>('upcoming');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Clients (No-copy protected) state
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Live Mi Body Composition Scale 2 BLE anthropometry state
  const liveSensors = useHardwareTelemetry();
  const hwCaps = useMemo(() => getHardwareCapabilities(), []);
  const [scaleHeightBefore, setScaleHeightBefore] = useState('');
  const [scaleHeightAfter, setScaleHeightAfter] = useState('');
  const [scaleBusy, setScaleBusy] = useState(false);
  const [scaleMsg, setScaleMsg] = useState('');
  const [scaleError, setScaleError] = useState(false);
  const [savingScaleAnthro, setSavingScaleAnthro] = useState(false);

  // Edit / Delete Anthropometry Records state
  const [editingAnthroRec, setEditingAnthroRec] = useState<AnthropometryRecord | null>(null);
  const [editAnthroDate, setEditAnthroDate] = useState('');
  const [editAnthroHBefore, setEditAnthroHBefore] = useState('');
  const [editAnthroHAfter, setEditAnthroHAfter] = useState('');
  const [editAnthroWeight, setEditAnthroWeight] = useState('');
  const [editAnthroFat, setEditAnthroFat] = useState('');
  const [editAnthroMuscle, setEditAnthroMuscle] = useState('');
  const [editAnthroWater, setEditAnthroWater] = useState('');
  const [editAnthroProtein, setEditAnthroProtein] = useState('');
  const [editAnthroVisceral, setEditAnthroVisceral] = useState('');
  const [editAnthroBone, setEditAnthroBone] = useState('');
  const [editAnthroBmr, setEditAnthroBmr] = useState('');
  const [editAnthroBodyAge, setEditAnthroBodyAge] = useState('');
  const [editAnthroBodyScore, setEditAnthroBodyScore] = useState('');
  const [editAnthroBpSys, setEditAnthroBpSys] = useState('');
  const [editAnthroBpDia, setEditAnthroBpDia] = useState('');
  const [editAnthroPulse, setEditAnthroPulse] = useState('');
  const [editAnthroFlex, setEditAnthroFlex] = useState('');
  const [editAnthroPain, setEditAnthroPain] = useState('');
  const [editAnthroNotes, setEditAnthroNotes] = useState('');
  const [editAnthroSaving, setEditAnthroSaving] = useState(false);
  const [editAnthroError, setEditAnthroError] = useState('');
  const [confirmDeleteAnthroId, setConfirmDeleteAnthroId] = useState<string | null>(null);
  const [busyDeleteAnthroId, setBusyDeleteAnthroId] = useState<string | null>(null);

  // Programs Builder state
  const [programFilter, setProgramFilter] = useState<'mine' | 'all'>('mine');
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [progTitle, setProgTitle] = useState('');
  const [progLevel, setProgLevel] = useState<WorkoutProgram['level']>('Индивидуальная');
  const [progClientId, setProgClientId] = useState('');
  const [progDescription, setProgDescription] = useState('');
  const [progExerciseIds, setProgExerciseIds] = useState<string[]>([]);
  const [exPickerQuery, setExPickerQuery] = useState('');
  const [exPickerDifficulty, setExPickerDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [savingProgram, setSavingProgram] = useState(false);

  // Blog state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [postPlatform, setPostPlatform] = useState<TrainerBlogPlatform>('telegram');
  const [postCategory, setPostCategory] =
    useState<TrainerBlogPost['category']>('Методика ПравИло');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postHashtags, setPostHashtags] = useState('#ПравИло #ЭталонПравило #ЗдороваяСпина');
  const [postIncludeBooking, setPostIncludeBooking] = useState(true);
  const [postStatus, setPostStatus] = useState<'published' | 'draft'>('published');
  const [savingPost, setSavingPost] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  // History filter
  const [historyQuery, setHistoryQuery] = useState('');

  // Public Trainer Profile state
  const [trainerProfileSaving, setTrainerProfileSaving] = useState(false);
  const [trainerProfileMsg, setTrainerProfileMsg] = useState('');

  const handleSaveTrainerPublicProfile = async (profile: TrainerPublicProfile) => {
    setTrainerProfileSaving(true);
    setTrainerProfileMsg('');
    try {
      if (activeTrainer.id === currentUser.id) {
        const res = await apiRequest<{ user: UserAccount }>('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ trainerProfile: profile }),
        });
        onCurrentUserUpdated?.(res.user);
        onUserUpdated?.(res.user);
      } else {
        const updated = await apiRequest<UserAccount>(`/api/users/${activeTrainer.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ trainerProfile: profile }),
        });
        onUserUpdated?.(updated);
      }
      setTrainerProfileMsg('Публичный профиль тренера сохранён — информация теперь видна клиентам.');
    } catch (err) {
      setTrainerProfileMsg(err instanceof Error ? err.message : 'Ошибка сохранения профиля');
    } finally {
      setTrainerProfileSaving(false);
    }
  };

  // Scoped datasets for activeTrainerId
  const trainerSchedules = useMemo(
    () => schedules.filter((s) => s.trainerId === activeTrainerId && s.active),
    [schedules, activeTrainerId]
  );

  const trainerBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.trainerId === activeTrainerId)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [bookings, activeTrainerId]
  );

  const visibleBookings = useMemo(() => {
    if (bookingFilter === 'today') {
      return trainerBookings.filter(
        (b) => b.date === todayStr && b.status !== 'cancelled'
      );
    }
    if (bookingFilter === 'upcoming') {
      return trainerBookings.filter(
        (b) => b.status !== 'completed' && b.status !== 'cancelled'
      );
    }
    return trainerBookings;
  }, [trainerBookings, bookingFilter, todayStr]);

  const trainerSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.trainerId === activeTrainerId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions, activeTrainerId]
  );

  const trainerClients = useMemo(() => {
    if (currentUser.role === 'trainer') return clients;
    const ids = new Set<string>();
    trainerBookings.forEach((b) => ids.add(b.clientId));
    trainerSessions.forEach((s) => ids.add(s.clientId));
    programs.forEach((p) => {
      if ((p.createdByUserId === activeTrainerId || p.createdBy === activeTrainer.name) && p.clientId) {
        ids.add(p.clientId);
      }
    });
    return clients.filter((c) => ids.has(c.id));
  }, [currentUser.role, clients, trainerBookings, trainerSessions, programs, activeTrainerId, activeTrainer.name]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return trainerClients;
    return trainerClients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.goal.toLowerCase().includes(q)
    );
  }, [trainerClients, clientQuery]);

  const selectedClient = useMemo(
    () =>
      filteredClients.find((c) => c.id === selectedClientId) ||
      trainerClients.find((c) => c.id === selectedClientId) ||
      filteredClients[0] ||
      trainerClients[0],
    [filteredClients, trainerClients, selectedClientId]
  );

  const visiblePrograms = useMemo(() => {
    if (programFilter === 'all') return programs;
    return programs.filter(
      (p) =>
        p.createdByUserId === activeTrainerId ||
        p.createdBy === activeTrainer.name ||
        Boolean(p.clientId)
    );
  }, [programs, programFilter, activeTrainerId, activeTrainer.name]);

  const visiblePosts = useMemo(
    () =>
      trainerPosts
        .filter((p) => p.trainerId === activeTrainerId || p.status === 'published')
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [trainerPosts, activeTrainerId]
  );

  const filteredSessions = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return trainerSessions;
    return trainerSessions.filter(
      (s) =>
        s.clientName.toLowerCase().includes(q) ||
        s.programTitle.toLowerCase().includes(q)
    );
  }, [trainerSessions, historyQuery]);

  const trainerStudio =
    studios.find((s) => s.id === activeTrainer.studioId) || studios[0];

  const todayJsDay = new Date().getDay();
  const todayMonDay = todayJsDay === 0 ? 6 : todayJsDay - 1;

  // No-copy event blocker for client data zone
  const blockCopyProps = {
    onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
    onCut: (e: React.ClipboardEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  };

  const handleConfirmBooking = async (bk: Booking) => {
    const updated = await apiRequest<Booking>(`/api/bookings/${bk.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    });
    onBookingUpdated(updated);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiRequest<ClientProgressNote>(
        `/api/clients/${selectedClient.id}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ text: noteText.trim() }),
        }
      );
      onNoteAdded(selectedClient.id, note);
      setNoteText('');
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleClientStatus = async (clientStatus: ClientActivityStatus) => {
    if (!selectedClient) return;
    const currentStatus: ClientActivityStatus =
      selectedClient.clientStatus === 'inactive' ? 'inactive' : 'active';
    if (currentStatus === clientStatus) return;
    const updated = await apiRequest<ClientProfile>(`/api/clients/${selectedClient.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ clientStatus }),
    });
    onClientUpdated?.(updated);
  };

  const selectedClientLatestAnthro =
    selectedClient?.anthropometry[selectedClient.anthropometry.length - 1];

  const resolvedScaleHeightCm = useMemo(() => {
    const parsed = Number(scaleHeightBefore);
    if (parsed > 90 && parsed < 240) return parsed;
    if (selectedClientLatestAnthro?.heightBeforeCm) {
      return selectedClientLatestAnthro.heightBeforeCm;
    }
    if (selectedClientLatestAnthro?.heightCm) {
      return selectedClientLatestAnthro.heightCm;
    }
    return selectedClient?.gender === 'female' ? 168 : 178;
  }, [scaleHeightBefore, selectedClientLatestAnthro, selectedClient?.gender]);

  const scaleCalibration = scaleDevice?.calibration || DEFAULT_MI_SCALE_CALIBRATION;

  const liveScaleMetrics = useMemo(() => {
    if (!selectedClient || liveSensors.scale.rawWeightKg === null) return null;
    const age = new Date().getFullYear() - (selectedClient.birthYear || 1990);
    return calculateMiScale2Metrics({
      rawWeightKg: liveSensors.scale.rawWeightKg,
      heightCm: resolvedScaleHeightCm,
      ageYears: age,
      gender: selectedClient.gender || 'male',
      rawImpedanceOhm: liveSensors.scale.rawImpedanceOhm ?? undefined,
      calibration: scaleCalibration,
    });
  }, [
    selectedClient,
    liveSensors.scale.rawWeightKg,
    liveSensors.scale.rawImpedanceOhm,
    resolvedScaleHeightCm,
    scaleCalibration,
  ]);

  const handleConnectScaleBle = async () => {
    if (!scaleDevice) {
      setScaleError(true);
      setScaleMsg('Весы Mi Body Composition Scale 2 не настроены в разделе оборудования.');
      return;
    }
    setScaleBusy(true);
    setScaleError(false);
    setScaleMsg('');
    try {
      const res = await connectRealHardwareDevice({
        device: scaleDevice,
        onDeviceUpdated: onDeviceUpdated || (() => undefined),
      });
      setScaleError(!res.success);
      setScaleMsg(res.message);
    } finally {
      setScaleBusy(false);
    }
  };

  const handleDisconnectScaleBle = async () => {
    if (!scaleDevice) return;
    setScaleBusy(true);
    try {
      await disconnectRealHardwareDevice({
        device: scaleDevice,
        onDeviceUpdated: onDeviceUpdated || (() => undefined),
      });
      setScaleError(false);
      setScaleMsg('Весы Mi Scale 2 отключены.');
    } finally {
      setScaleBusy(false);
    }
  };

  const handleSaveScaleAnthropometry = async () => {
    if (!selectedClient || !liveScaleMetrics) return;
    setSavingScaleAnthro(true);
    setScaleError(false);
    const parsedAfter = scaleHeightAfter.trim() ? Number(scaleHeightAfter) : undefined;
    try {
      const rec = await apiRequest<AnthropometryRecord>(
        `/api/clients/${selectedClient.id}/anthropometry`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...liveScaleMetrics,
            phase: parsedAfter ? 'paired' : 'before',
            heightCm: parsedAfter ?? resolvedScaleHeightCm,
            heightBeforeCm: resolvedScaleHeightCm,
            ...(parsedAfter ? { heightAfterCm: parsedAfter } : {}),
            bpSys: selectedClientLatestAnthro?.bpSys ?? 120,
            bpDia: selectedClientLatestAnthro?.bpDia ?? 78,
            pulseRest: selectedClientLatestAnthro?.pulseRest ?? 68,
            flexibilityScore: selectedClientLatestAnthro?.flexibilityScore ?? 74,
            painIndex: selectedClientLatestAnthro?.painIndex ?? 2,
            calibratedScale: scaleCalibration.calibrated,
            notes: `Тренер (${currentUser.name}) · Замер BLE Mi Body Composition Scale 2: ${liveScaleMetrics.weightKg} кг, импеданс ${liveScaleMetrics.impedanceOhm} Ω`,
          }),
        }
      );
      onAnthropometryAdded?.(selectedClient.id, rec);
      setScaleHeightAfter('');
      setScaleMsg(
        `Сохранено в антропометрию: ${liveScaleMetrics.weightKg} кг · жир ${liveScaleMetrics.bodyFatPct}% · мышцы ${liveScaleMetrics.muscleMassKg} кг.`
      );
    } catch (err) {
      setScaleError(true);
      setScaleMsg(
        err instanceof Error ? err.message : 'Не удалось сохранить замер антропометрии'
      );
    } finally {
      setSavingScaleAnthro(false);
    }
  };

  const handleRecordPostHeightOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !selectedClientLatestAnthro || !scaleHeightAfter.trim()) return;
    const afterVal = Number(scaleHeightAfter);
    if (!afterVal || afterVal < 100) return;
    setSavingScaleAnthro(true);
    try {
      const updated = await apiRequest<AnthropometryRecord>(
        `/api/clients/${selectedClient.id}/anthropometry/${selectedClientLatestAnthro.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            heightAfterCm: afterVal,
            notes: `${selectedClientLatestAnthro.notes} · Рост после сессии: ${afterVal.toFixed(1)} см`,
          }),
        }
      );
      onAnthropometryUpdated?.(selectedClient.id, updated);
      setScaleHeightAfter('');
      setScaleMsg(`Рост после тренировки зафиксирован (${afterVal.toFixed(1)} см).`);
    } finally {
      setSavingScaleAnthro(false);
    }
  };

  const openTrainerEditAnthro = (rec: AnthropometryRecord) => {
    setEditingAnthroRec(rec);
    setEditAnthroDate(rec.date || todayStr);
    setEditAnthroHBefore(String(rec.heightBeforeCm));
    setEditAnthroHAfter(rec.heightAfterCm !== undefined ? String(rec.heightAfterCm) : '');
    setEditAnthroWeight(String(rec.weightKg));
    setEditAnthroFat(String(rec.bodyFatPct));
    setEditAnthroMuscle(String(rec.muscleMassKg));
    setEditAnthroWater(String(rec.waterPct));
    setEditAnthroProtein(String(rec.proteinPct ?? ''));
    setEditAnthroVisceral(String(rec.visceralFatLevel ?? ''));
    setEditAnthroBone(String(rec.boneMassKg ?? ''));
    setEditAnthroBmr(String(rec.bmrKcal ?? ''));
    setEditAnthroBodyAge(String(rec.bodyAgeYears ?? ''));
    setEditAnthroBodyScore(String(rec.bodyScore ?? ''));
    setEditAnthroBpSys(String(rec.bpSys));
    setEditAnthroBpDia(String(rec.bpDia));
    setEditAnthroPulse(String(rec.pulseRest));
    setEditAnthroFlex(String(rec.flexibilityScore));
    setEditAnthroPain(String(rec.painIndex));
    setEditAnthroNotes(rec.notes || '');
    setEditAnthroError('');
  };

  const handleTrainerSaveAnthro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !editingAnthroRec) return;
    setEditAnthroSaving(true);
    setEditAnthroError('');
    try {
      const parsedBefore = Number(editAnthroHBefore);
      const parsedAfter = editAnthroHAfter.trim() ? Number(editAnthroHAfter) : null;
      const parsedWeight = Number(editAnthroWeight);
      const payload: Record<string, unknown> = {
        date: editAnthroDate,
        heightBeforeCm: parsedBefore,
        heightAfterCm: parsedAfter,
        weightKg: parsedWeight,
        bodyFatPct: Number(editAnthroFat),
        muscleMassKg: Number(editAnthroMuscle),
        waterPct: Number(editAnthroWater),
        bpSys: Number(editAnthroBpSys),
        bpDia: Number(editAnthroBpDia),
        pulseRest: Number(editAnthroPulse),
        flexibilityScore: Number(editAnthroFlex),
        painIndex: Number(editAnthroPain),
        notes: editAnthroNotes.trim(),
      };
      if (editAnthroProtein.trim()) payload.proteinPct = Number(editAnthroProtein);
      if (editAnthroVisceral.trim()) payload.visceralFatLevel = Number(editAnthroVisceral);
      if (editAnthroBone.trim()) payload.boneMassKg = Number(editAnthroBone);
      if (editAnthroBmr.trim()) payload.bmrKcal = Number(editAnthroBmr);
      if (editAnthroBodyAge.trim()) payload.bodyAgeYears = Number(editAnthroBodyAge);
      if (editAnthroBodyScore.trim()) payload.bodyScore = Number(editAnthroBodyScore);

      const updated = await apiRequest<AnthropometryRecord>(
        `/api/clients/${selectedClient.id}/anthropometry/${editingAnthroRec.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      onAnthropometryUpdated?.(selectedClient.id, updated);
      setEditingAnthroRec(null);
      setScaleError(false);
      setScaleMsg(`Замер от ${updated.date} обновлён.`);
    } catch (err) {
      setEditAnthroError(
        err instanceof Error ? err.message : 'Не удалось обновить замер'
      );
    } finally {
      setEditAnthroSaving(false);
    }
  };

  const handleTrainerDeleteAnthro = async (recId: string) => {
    if (!selectedClient) return;
    setBusyDeleteAnthroId(recId);
    setScaleError(false);
    try {
      await apiRequest(
        `/api/clients/${selectedClient.id}/anthropometry/${recId}`,
        { method: 'DELETE' }
      );
      onAnthropometryDeleted?.(selectedClient.id, recId);
      setConfirmDeleteAnthroId(null);
      if (editingAnthroRec?.id === recId) {
        setEditingAnthroRec(null);
      }
      setScaleMsg('Замер антропометрии удалён.');
    } catch (err) {
      setScaleError(true);
      setScaleMsg(
        err instanceof Error ? err.message : 'Не удалось удалить замер'
      );
    } finally {
      setBusyDeleteAnthroId(null);
    }
  };

  const openNewProgramForm = (presetClientId?: string) => {
    setEditingProgramId(null);
    setProgTitle('');
    setProgLevel('Индивидуальная');
    setProgClientId(presetClientId || '');
    setProgDescription('');
    setProgExerciseIds([]);
    setExPickerQuery('');
    setShowProgramForm(true);
    setTab('programs');
  };

  const openEditProgramForm = (prog: WorkoutProgram) => {
    setEditingProgramId(prog.id);
    setProgTitle(prog.title);
    setProgLevel(prog.level);
    setProgClientId(prog.clientId || '');
    setProgDescription(prog.description);
    setProgExerciseIds([...prog.exerciseIds]);
    setExPickerQuery('');
    setShowProgramForm(true);
  };

  const handleMoveExercise = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= progExerciseIds.length) return;
    const copy = [...progExerciseIds];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setProgExerciseIds(copy);
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progTitle.trim()) return;
    setSavingProgram(true);
    try {
      if (editingProgramId) {
        const updated = await apiRequest<WorkoutProgram>(
          `/api/programs/${editingProgramId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: progTitle.trim(),
              level: progLevel,
              clientId: progClientId || undefined,
              description: progDescription.trim(),
              exerciseIds: progExerciseIds,
            }),
          }
        );
        onProgramUpdated(updated);
      } else {
        const created = await apiRequest<WorkoutProgram>('/api/programs', {
          method: 'POST',
          body: JSON.stringify({
            title: progTitle.trim(),
            level: progLevel,
            clientId: progClientId || undefined,
            description: progDescription.trim(),
            exerciseIds: progExerciseIds,
          }),
        });
        onProgramAdded(created);
      }
      setShowProgramForm(false);
      setEditingProgramId(null);
    } finally {
      setSavingProgram(false);
    }
  };

  const handleDeleteProgram = async (id: string) => {
    await apiRequest(`/api/programs/${id}`, { method: 'DELETE' });
    onProgramDeleted(id);
  };

  const openNewPostForm = () => {
    setEditingPostId(null);
    setPostPlatform('telegram');
    setPostCategory('Методика ПравИло');
    setPostTitle('');
    setPostContent('');
    setPostHashtags('#ПравИло #ЭталонПравило #ЗдороваяСпина');
    setPostIncludeBooking(true);
    setPostStatus('published');
    setShowPostForm(true);
  };

  const openEditPostForm = (post: TrainerBlogPost) => {
    setEditingPostId(post.id);
    setPostPlatform(post.platform);
    setPostCategory(post.category);
    setPostTitle(post.title);
    setPostContent(post.content);
    setPostHashtags(post.hashtags.join(' '));
    setPostIncludeBooking(post.includeBookingLink);
    setPostStatus(post.status);
    setShowPostForm(true);
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;
    setSavingPost(true);
    const parsedTags = postHashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    try {
      if (editingPostId) {
        const updated = await apiRequest<TrainerBlogPost>(
          `/api/trainer-posts/${editingPostId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              platform: postPlatform,
              category: postCategory,
              title: postTitle.trim(),
              content: postContent.trim(),
              hashtags: parsedTags,
              includeBookingLink: postIncludeBooking,
              status: postStatus,
            }),
          }
        );
        onPostUpdated(updated);
      } else {
        const created = await apiRequest<TrainerBlogPost>('/api/trainer-posts', {
          method: 'POST',
          body: JSON.stringify({
            studioId: trainerStudio?.id,
            platform: postPlatform,
            category: postCategory,
            title: postTitle.trim(),
            content: postContent.trim(),
            hashtags: parsedTags,
            includeBookingLink: postIncludeBooking,
            status: postStatus,
          }),
        });
        onPostAdded(created);
      }
      setShowPostForm(false);
      setEditingPostId(null);
    } finally {
      setSavingPost(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    await apiRequest(`/api/trainer-posts/${id}`, { method: 'DELETE' });
    onPostDeleted(id);
  };

  const buildSocialShareText = (post: {
    title: string;
    content: string;
    hashtags: string[];
    includeBookingLink: boolean;
    studioId?: string;
  }) => {
    const stId = post.studioId || trainerStudio?.id || '';
    const bookingUrl = `${window.location.origin}/?book=1${stId ? `&studio=${stId}` : ''}`;
    const lines = [post.title.trim(), '', post.content.trim()];
    if (post.includeBookingLink) {
      lines.push('', `Запись на тренировку в студию: ${bookingUrl}`);
    }
    if (post.hashtags.length > 0) {
      lines.push('', post.hashtags.join(' '));
    }
    return lines.join('\n');
  };

  const handleCopySocialPost = async (post: TrainerBlogPost) => {
    const text = buildSocialShareText(post);
    await navigator.clipboard?.writeText(text);
    setCopiedPostId(post.id);
    setTimeout(() => setCopiedPostId(null), 2200);
  };

  const historyStats = useMemo(() => {
    if (trainerSessions.length === 0) {
      return { count: 0, avgPeak: 0, avgSym: 0, avgHr: 0 };
    }
    const avgPeak =
      trainerSessions.reduce((acc, s) => acc + s.peakWinchKg, 0) /
      trainerSessions.length;
    const avgSym =
      trainerSessions.reduce((acc, s) => acc + s.avgSymmetryPct, 0) /
      trainerSessions.length;
    const avgHr =
      trainerSessions.reduce((acc, s) => acc + s.avgHrBpm, 0) /
      trainerSessions.length;
    return {
      count: trainerSessions.length,
      avgPeak: Number(avgPeak.toFixed(1)),
      avgSym: Math.round(avgSym),
      avgHr: Math.round(avgHr),
    };
  }, [trainerSessions]);

  const activeBookingsCount = trainerBookings.filter(
    (b) => b.status !== 'completed' && b.status !== 'cancelled'
  ).length;

  const activeTrainerStats = useMemo(
    () => getRatingStats(reviews, 'trainer', activeTrainerId),
    [reviews, activeTrainerId]
  );

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      {/* Top Trainer Header Card */}
      <div className="rounded-xl st-surface border st-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <TrainerAvatar trainer={activeTrainer} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold truncate">
                {activeTrainer.name}
              </h2>
              <RatingBadge
                average={activeTrainerStats.average}
                count={activeTrainerStats.count}
              />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold st-accent-soft">
                <Lock className="w-3 h-3" />
                База клиентов защищена
              </span>
            </div>
            <div className="text-xs st-muted truncate">
              Приложение тренера (PWA) · {trainerStudio?.name || 'Студия'} · Записей активно:{' '}
              <span className="font-mono font-semibold">{activeBookingsCount}</span> · Клиентов:{' '}
              <span className="font-mono font-semibold">{trainerClients.length}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role !== 'trainer' && trainersList.length > 0 && (
            <select
              aria-label="Выбор тренера для просмотра PWA"
              value={viewedTrainerId}
              onChange={(e) => setViewedTrainerId(e.target.value)}
              className="px-3 py-2 rounded-lg border st-border st-surface text-xs font-medium"
            >
              {trainersList.map((t) => (
                <option key={t.id} value={t.id}>
                  Тренер: {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowLegalModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 st-accent-text" />
            <span>Соглашения</span>
          </button>
          <PWAInstallButton compact />
        </div>
      </div>

      {/* Desktop Section Tabs */}
      <div className="hidden lg:flex flex-wrap items-center gap-1 p-1 st-surface-muted rounded-lg border st-border w-fit">
        {(
          [
            ['schedule', `График и записи (${activeBookingsCount})`, CalendarClock],
            ['clients', `Мои клиенты (${trainerClients.length})`, Users],
            ['exercises', `База упражнений (${exercises.length})`, Dumbbell],
            ['programs', `Программы (${visiblePrograms.length})`, ClipboardList],
            ['blog', `Блог для соцсетей (${visiblePosts.length})`, Newspaper],
            ['history', `Проведённые (${trainerSessions.length})`, History],
            ['profile', 'Мой профиль (О себе)', UserCheck],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
              tab === k ? 'st-surface shadow-sm font-semibold' : 'st-muted hover:opacity-90'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: WORK SCHEDULE & ACTIVE BOOKINGS */}
      {tab === 'schedule' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Weekly Work Schedule */}
          <div className="lg:col-span-5 rounded-xl st-surface border st-border p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">График работы тренера</h3>
                <div className="text-xs st-muted">
                  Часы приёма студии: {trainerStudio?.openHours || '09:00 – 21:00'}
                </div>
              </div>
              <span className="text-xs font-mono st-accent-text font-semibold">
                {trainerSchedules.length} см./нед
              </span>
            </div>

            <div className="space-y-2">
              {DAYS_FULL.map((dayName, idx) => {
                const shift = trainerSchedules.find((s) => s.dayOfWeek === idx);
                const isToday = idx === todayMonDay;
                const shiftStudio = shift
                  ? studios.find((st) => st.id === shift.studioId)
                  : undefined;
                return (
                  <div
                    key={dayName}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-xs ${
                      isToday
                        ? 'st-accent-soft border-current font-semibold'
                        : shift
                        ? 'st-surface-muted st-border'
                        : 'st-border opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold w-6">{DAYS_SHORT[idx]}</span>
                      <span>{dayName}</span>
                      {isToday && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded st-accent-bg">
                          Сегодня
                        </span>
                      )}
                    </div>
                    {shift ? (
                      <div className="text-right font-mono">
                        <div className="font-semibold">
                          {shift.startTime} – {shift.endTime}
                        </div>
                        {shiftStudio && (
                          <div className="text-[10px] st-muted font-sans">
                            {shiftStudio.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="st-muted font-mono">Выходной</span>
                    )}
                  </div>
                );
              })}
            </div>

            {activeTrainerStats.items.length > 0 && (
              <div className="pt-3 border-t st-border space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Отзывы клиентов о вашей работе</span>
                  <RatingBadge
                    average={activeTrainerStats.average}
                    count={activeTrainerStats.count}
                  />
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {activeTrainerStats.items.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-2.5 rounded-lg st-surface-muted border st-border text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-sans font-semibold">{rev.authorName}</span>
                        <span className="text-amber-600 dark:text-amber-400">
                          ★ {rev.rating} · {rev.updatedAt || rev.createdAt}
                        </span>
                      </div>
                      {rev.comment && <p className="st-muted leading-snug">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active & Upcoming Bookings */}
          <div className="lg:col-span-7 rounded-xl st-surface border st-border p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">Действующие записи</h3>
                <div className="text-xs st-muted">
                  Нажмите «Начать тренировку», чтобы сразу открыть сессию с клиентом
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg st-surface-muted border st-border">
                {(
                  [
                    ['today', 'Сегодня'],
                    ['upcoming', 'Активные'],
                    ['all', 'Все'],
                  ] as const
                ).map(([fk, fl]) => (
                  <button
                    key={fk}
                    type="button"
                    onClick={() => setBookingFilter(fk)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                      bookingFilter === fk ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                    }`}
                  >
                    {fl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {visibleBookings.map((bk) => {
                const st = studios.find((s) => s.id === bk.studioId);
                const statusLabel =
                  bk.status === 'confirmed'
                    ? 'Подтверждена'
                    : bk.status === 'in_progress'
                    ? 'Идёт сессия'
                    : bk.status === 'completed'
                    ? 'Завершена'
                    : bk.status === 'cancelled'
                    ? 'Отменена'
                    : 'Ожидает';
                return (
                  <div
                    key={bk.id}
                    className="p-3.5 rounded-xl st-surface-muted border st-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold st-accent-text">
                          {bk.date} · {bk.time}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-md border st-border st-surface font-medium">
                          {statusLabel}
                        </span>
                      </div>
                      <div className="font-semibold text-sm truncate">
                        {bk.clientName} — {bk.serviceName}
                      </div>
                      <div className="text-xs st-muted">
                        {st?.name || 'Студия'} · {bk.durationMin} мин · {PAYMENT_LABELS[bk.paymentStatus]}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {bk.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmBooking(bk)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 st-secondary-text" />
                          <span>Подтвердить</span>
                        </button>
                      )}
                      {bk.status !== 'completed' && bk.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => onStartLiveSession(bk)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Начать тренировку</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {visibleBookings.length === 0 && (
                <div className="py-10 text-center text-xs st-muted">
                  Нет записей по выбранному фильтру.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY CLIENTS (STRICT NO-COPY PROTECTION) */}
      {tab === 'clients' && (
        <div className="space-y-4" {...blockCopyProps}>
          {/* Security Notice Banner */}
          <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/30 p-3.5 flex items-start gap-3 select-none">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-950 dark:text-amber-100">
              <span className="font-semibold">Защита базы клиентов активна:</span> показаны
              только ваши закреплённые клиенты. Телефон, E-mail и Telegram скрыты на сервере,
              копирование текста, перетаскивание и экспорт контактной базы заблокированы.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 select-none">
            {/* Client List */}
            <div className="lg:col-span-4 rounded-xl st-surface border st-border p-4 space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 st-muted absolute left-3 top-3" />
                <input
                  type="text"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder="Поиск по ФИО или цели..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
              </div>

              <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
                {filteredClients.map((cl) => {
                  const active = selectedClient?.id === cl.id;
                  const latestAnthro = cl.anthropometry[cl.anthropometry.length - 1];
                  return (
                    <button
                      key={cl.id}
                      type="button"
                      onClick={() => {
                        setSelectedClientId(cl.id);
                        setScaleHeightBefore('');
                        setScaleHeightAfter('');
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'st-accent-soft border-current'
                          : 'st-border st-surface hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{cl.name}</span>
                        <span
                          className={`text-[10px] font-medium shrink-0 ${
                            cl.clientStatus === 'inactive'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {cl.clientStatus === 'inactive' ? 'Не ходит' : 'Активный'}
                        </span>
                      </div>
                      <div className="text-[11px] st-muted mt-0.5 truncate">
                        {cl.goal} · {cl.totalSessions} сес.
                      </div>
                      {latestAnthro && (
                        <div className="text-[10px] font-mono st-muted mt-1">
                          Рост {latestAnthro.heightBeforeCm.toFixed(1)} см · Вес{' '}
                          {latestAnthro.weightKg} кг · АД {latestAnthro.bpSys}/{latestAnthro.bpDia}
                        </div>
                      )}
                    </button>
                  );
                })}
                {filteredClients.length === 0 && (
                  <div className="py-8 text-center text-xs st-muted">
                    Закреплённые клиенты не найдены.
                  </div>
                )}
              </div>
            </div>

            {/* Client Clinical Card (No Contacts, No Copy) */}
            <div className="lg:col-span-8 rounded-xl st-surface border st-border p-5 space-y-5">
              {selectedClient ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b st-border pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-xl font-bold">
                          {selectedClient.name}
                        </h3>
                        <span className="text-[11px] px-2 py-0.5 rounded border st-border font-mono st-muted">
                          {selectedClient.gender === 'female' ? 'Ж' : 'М'} ·{' '}
                          {new Date().getFullYear() - selectedClient.birthYear} лет
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                            selectedClient.clientStatus === 'inactive'
                              ? 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                              : 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {selectedClient.clientStatus === 'inactive' ? 'Не ходит' : 'Активный'}
                        </span>
                      </div>
                      <p className="text-xs st-muted mt-1">
                        Цель: <span className="font-medium">{selectedClient.goal}</span>
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md st-surface-muted border st-border text-[11px] st-muted">
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span>Телефон / E-mail / Telegram: Скрыто (защита базы)</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg border st-border p-0.5 st-surface-muted text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleClientStatus('active')}
                          className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                            selectedClient.clientStatus !== 'inactive'
                              ? 'bg-emerald-600 text-white'
                              : 'st-muted'
                          }`}
                        >
                          Активный
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleClientStatus('inactive')}
                          className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                            selectedClient.clientStatus === 'inactive'
                              ? 'bg-amber-600 text-white'
                              : 'st-muted'
                          }`}
                        >
                          Не ходит
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => openNewProgramForm(selectedClient.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Составить программу</span>
                      </button>
                    </div>
                  </div>

                  {/* Contraindications */}
                  <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800/50 text-xs">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">
                      Противопоказания и ограничения:{' '}
                    </span>
                    <span className="text-rose-950 dark:text-rose-100">
                      {selectedClient.contraindications || 'Нет данных'}
                    </span>
                  </div>

                  {/* Anthropometry Summary */}
                  {(() => {
                    const latest =
                      selectedClient.anthropometry[
                        selectedClient.anthropometry.length - 1
                      ];
                    const activeSub = clientSubscriptions.find(
                      (s) => s.clientId === selectedClient.id && s.status === 'active'
                    );
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 rounded-lg st-surface-muted border st-border">
                            <div className="text-[11px] st-muted flex items-center gap-1">
                              <Ruler className="w-3 h-3" /> Рост (до → после)
                            </div>
                            <div className="font-mono text-sm font-bold mt-1">
                              {latest
                                ? `${latest.heightBeforeCm.toFixed(1)}${
                                    latest.heightAfterCm
                                      ? ` → ${latest.heightAfterCm.toFixed(1)}`
                                      : ''
                                  } см`
                                : 'Нет замера'}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg st-surface-muted border st-border">
                            <div className="text-[11px] st-muted flex items-center gap-1">
                              <HeartPulse className="w-3 h-3" /> АД / Пульс
                            </div>
                            <div className="font-mono text-sm font-bold mt-1">
                              {latest ? `${latest.bpSys}/${latest.bpDia} · ${latest.pulseRest}` : '—'}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg st-surface-muted border st-border">
                            <div className="text-[11px] st-muted flex items-center gap-1">
                              <Activity className="w-3 h-3" /> Вес / Мышцы
                            </div>
                            <div className="font-mono text-sm font-bold mt-1">
                              {latest ? `${latest.weightKg} кг · ${latest.muscleMassKg} кг` : '—'}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg st-surface-muted border st-border">
                            <div className="text-[11px] st-muted">Абонемент</div>
                            <div className="font-mono text-sm font-bold mt-1">
                              {activeSub
                                ? `${activeSub.remainingSessions} из ${activeSub.totalSessions} сес.`
                                : 'Разовые визиты'}
                            </div>
                          </div>
                        </div>

                        {/* Direct Mi Body Composition Scale 2 BLE Anthropometry Measurement */}
                        <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Scale className="w-4 h-4 st-accent-text shrink-0" />
                              <div>
                                <div className="text-xs font-semibold">
                                  Замер веса (Mi Body Composition Scale 2 BLE) и роста
                                </div>
                                <div className="text-[11px] st-muted">
                                  {liveSensors.scale.streaming
                                    ? `Поток активен (${liveSensors.scale.lastPacketAt || 'live'})`
                                    : scaleDevice?.connected
                                    ? 'Весы подключены — встаньте на платформу'
                                    : 'Подключите весы для прямой записи антропометрии'}
                                </div>
                              </div>
                            </div>

                            {scaleDevice?.connected ? (
                              <button
                                type="button"
                                disabled={scaleBusy}
                                onClick={handleDisconnectScaleBle}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                <BluetoothOff className="w-3.5 h-3.5" />
                                <span>Отключить весы</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={scaleBusy}
                                onClick={handleConnectScaleBle}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <Bluetooth className="w-3.5 h-3.5" />
                                <span>{scaleBusy ? 'Поиск весов...' : 'Подключить Mi Scale 2'}</span>
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-end gap-2.5 text-xs">
                            <label className="space-y-1">
                              <span className="block text-[11px] st-muted">Рост до (см)</span>
                              <input
                                type="number"
                                step="0.1"
                                min={100}
                                max={235}
                                value={scaleHeightBefore || String(resolvedScaleHeightCm)}
                                onChange={(e) => setScaleHeightBefore(e.target.value)}
                                className="w-24 px-2.5 py-1.5 text-xs font-mono rounded-lg border st-border st-surface select-text"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[11px] st-muted">Рост после (см, опц.)</span>
                              <input
                                type="number"
                                step="0.1"
                                min={100}
                                max={235}
                                placeholder={
                                  latest
                                    ? String((latest.heightBeforeCm + 0.8).toFixed(1))
                                    : 'После сессии'
                                }
                                value={scaleHeightAfter}
                                onChange={(e) => setScaleHeightAfter(e.target.value)}
                                className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg border st-border st-surface select-text"
                              />
                            </label>
                            {latest && latest.heightAfterCm === undefined && scaleHeightAfter.trim() && (
                              <button
                                type="button"
                                disabled={savingScaleAnthro}
                                onClick={handleRecordPostHeightOnly}
                                className="px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Сохранить только рост после
                              </button>
                            )}
                          </div>

                          {(!hwCaps.webBluetooth || hwCaps.inIframe) && !scaleMsg && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300">
                              {hwCaps.inIframe
                                ? 'Web Bluetooth заблокирован внутри iframe предпросмотра — откройте в отдельной вкладке или в Desktop-версии.'
                                : 'Web Bluetooth недоступен в этом браузере — используйте Chrome/Edge или Desktop-приложение.'}
                            </div>
                          )}

                          {scaleMsg && (
                            <div
                              className={`p-2 rounded-lg text-xs border ${
                                scaleError
                                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {scaleMsg}
                            </div>
                          )}

                          {liveScaleMetrics && (
                            <div className="p-3 rounded-lg st-surface border st-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                                <span className="font-bold st-accent-text">
                                  {liveScaleMetrics.weightKg} кг
                                </span>
                                <span>Жир {liveScaleMetrics.bodyFatPct}%</span>
                                <span>Мышцы {liveScaleMetrics.muscleMassKg} кг</span>
                                <span>Вода {liveScaleMetrics.waterPct}%</span>
                                <span>ИМТ {liveScaleMetrics.bmi}</span>
                                <span>Оценка {liveScaleMetrics.bodyScore}/100</span>
                              </div>
                              <button
                                type="button"
                                disabled={savingScaleAnthro}
                                onClick={handleSaveScaleAnthropometry}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                {savingScaleAnthro ? 'Сохранение...' : 'Записать замер в карту'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Anthropometry Measurements History (Edit & Delete) */}
                        <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">
                              История замеров ({selectedClient.anthropometry.length})
                            </span>
                            {latest && (
                              <button
                                type="button"
                                onClick={() => openTrainerEditAnthro(latest)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border st-surface text-[11px] font-medium cursor-pointer"
                              >
                                <Pencil className="w-3 h-3 st-accent-text" />
                                <span>Редактировать последний</span>
                              </button>
                            )}
                          </div>

                          {selectedClient.anthropometry.length === 0 ? (
                            <p className="text-xs st-muted">Замеров пока нет.</p>
                          ) : (
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                              {[...selectedClient.anthropometry]
                                .slice()
                                .reverse()
                                .map((rec) => {
                                  const delta =
                                    rec.heightAfterCm !== undefined
                                      ? +(rec.heightAfterCm - rec.heightBeforeCm).toFixed(1)
                                      : null;
                                  const isConfirming = confirmDeleteAnthroId === rec.id;
                                  const isDeleting = busyDeleteAnthroId === rec.id;
                                  return (
                                    <div
                                      key={rec.id}
                                      className="p-2.5 rounded-lg st-surface border st-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                    >
                                      <div className="space-y-0.5 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 font-mono">
                                          <span className="font-semibold">{rec.date}</span>
                                          <span>
                                            Рост: {rec.heightBeforeCm.toFixed(1)}
                                            {rec.heightAfterCm !== undefined
                                              ? ` → ${rec.heightAfterCm.toFixed(1)}`
                                              : ''}{' '}
                                            см
                                          </span>
                                          {delta !== null && (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                              ({delta >= 0 ? `+${delta}` : delta})
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono st-muted">
                                          <span>{rec.weightKg} кг</span>
                                          <span>Жир {rec.bodyFatPct}%</span>
                                          <span>Мышцы {rec.muscleMassKg} кг</span>
                                          <span>
                                            АД {rec.bpSys}/{rec.bpDia} · {rec.pulseRest}
                                          </span>
                                        </div>
                                        {rec.notes && (
                                          <p className="text-[11px] st-muted truncate">
                                            {rec.notes}
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => openTrainerEditAnthro(rec)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border st-border hover:st-surface-muted text-[11px] font-medium cursor-pointer"
                                          title="Редактировать замер"
                                        >
                                          <Pencil className="w-3 h-3 st-accent-text" />
                                          <span>Изм.</span>
                                        </button>
                                        {isConfirming ? (
                                          <div className="inline-flex items-center gap-1">
                                            <button
                                              type="button"
                                              disabled={isDeleting}
                                              onClick={() => handleTrainerDeleteAnthro(rec.id)}
                                              className="px-2 py-1 rounded-md bg-rose-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                            >
                                              {isDeleting ? '...' : 'Удалить'}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isDeleting}
                                              onClick={() => setConfirmDeleteAnthroId(null)}
                                              className="px-2 py-1 rounded-md border st-border text-[11px] cursor-pointer"
                                            >
                                              Отмена
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteAnthroId(rec.id)}
                                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                            title="Удалить замер"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Posture Laser Level & Photo Angle Assessment (DO / POSLE) */}
                  <PostureComparisonSection
                    client={selectedClient}
                    editable
                    onClientUpdated={onClientUpdated}
                  />

                  {/* Individual programs linked to this client */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold">
                      Индивидуальные программы клиента
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {programs
                        .filter((p) => p.clientId === selectedClient.id)
                        .map((prog) => {
                          const pEx = prog.exerciseIds
                            .map((id) => exercises.find((e) => e.id === id))
                            .filter((e): e is Exercise => Boolean(e));
                          const pDiff = computeProgramDifficulty(pEx);
                          return (
                            <div
                              key={prog.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border st-border st-surface-muted text-xs"
                            >
                              <span className="font-medium">{prog.title}</span>
                              {pEx.length > 0 && (
                                <DifficultyStars value={pDiff.avg} size="xs" showNumeric />
                              )}
                              <span className="font-mono st-muted">
                                ({prog.exerciseIds.length} упр.)
                              </span>
                              <button
                                type="button"
                                onClick={() => onLaunchProgramInSession(prog.id)}
                                className="st-accent-text font-semibold hover:underline cursor-pointer"
                              >
                                В сессию →
                              </button>
                            </div>
                          );
                        })}
                      {programs.filter((p) => p.clientId === selectedClient.id).length ===
                        0 && (
                        <span className="text-xs st-muted">
                          Пока нет индивидуальной программы.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trainer Progress Notes */}
                  <div className="space-y-3 pt-2 border-t st-border">
                    <div className="text-xs font-semibold">
                      Клинические заметки тренера
                    </div>
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Добавить наблюдение по осанке, реакции на тягу, самочувствию..."
                        className="flex-1 px-3 py-2 text-xs rounded-lg border st-border st-surface select-text"
                      />
                      <button
                        type="submit"
                        disabled={savingNote || !noteText.trim()}
                        className="px-3.5 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {savingNote ? '...' : 'Сохранить'}
                      </button>
                    </form>
                    <div className="space-y-2 max-h-44 overflow-y-auto">
                      {selectedClient.notes.map((n) => (
                        <div
                          key={n.id}
                          className="p-2.5 rounded-lg st-surface-muted border st-border text-xs"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono st-muted mb-1">
                            <span>{n.authorName}</span>
                            <span>{n.date}</span>
                          </div>
                          <div>{n.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs st-muted">
                  Выберите клиента слева для просмотра параметров и истории тренировок.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INDIVIDUAL TRAINING PROGRAMS BUILDER */}
      {tab === 'programs' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg st-surface-muted border st-border">
              <button
                type="button"
                onClick={() => setProgramFilter('mine')}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                  programFilter === 'mine' ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                }`}
              >
                Мои и индивидуальные
              </button>
              <button
                type="button"
                onClick={() => setProgramFilter('all')}
                className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                  programFilter === 'all' ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                }`}
              >
                Все программы студии
              </button>
            </div>

            <button
              type="button"
              onClick={() => openNewProgramForm()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Создать индивидуальную программу</span>
            </button>
          </div>

          {showProgramForm && (
            <form
              onSubmit={handleSaveProgram}
              className="rounded-xl st-surface border st-border p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">
                  {editingProgramId
                    ? 'Редактирование программы тренировок'
                    : 'Конструктор индивидуальной программы'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowProgramForm(false)}
                  className="p-1.5 rounded-lg st-muted hover:opacity-80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium st-muted mb-1">
                    Название программы
                  </label>
                  <input
                    type="text"
                    required
                    value={progTitle}
                    onChange={(e) => setProgTitle(e.target.value)}
                    placeholder="Напр.: Декомпрессия грудного отдела (4 нед.)"
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium st-muted mb-1">
                    Уровень
                  </label>
                  <select
                    value={progLevel}
                    onChange={(e) =>
                      setProgLevel(e.target.value as WorkoutProgram['level'])
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  >
                    <option value="Индивидуальная">Индивидуальная</option>
                    <option value="Первая тренировка">Первая тренировка</option>
                    <option value="Вторая тренировка">Вторая тренировка</option>
                    <option value="Продвинутая">Продвинутая</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium st-muted mb-1">
                    Клиент (из ваших записей)
                  </label>
                  <select
                    value={progClientId}
                    onChange={(e) => setProgClientId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  >
                    <option value="">Общий комплекс студии</option>
                    {trainerClients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium st-muted mb-1">
                  Методическое описание и задачи
                </label>
                <textarea
                  rows={2}
                  value={progDescription}
                  onChange={(e) => setProgDescription(e.target.value)}
                  placeholder="Последовательность тяги, ограничения, акценты дыхания..."
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Selected exercises sequence */}
                <div className="p-3.5 rounded-lg st-surface-muted border st-border space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold">
                      Последовательность упражнений ({progExerciseIds.length})
                    </div>
                    {progExerciseIds.length > 0 && (
                      <DifficultyStars
                        value={
                          computeProgramDifficulty(
                            progExerciseIds
                              .map((id) => exercises.find((e) => e.id === id))
                              .filter((e): e is Exercise => Boolean(e))
                          ).avg
                        }
                        size="xs"
                        showNumeric
                        showLabel
                      />
                    )}
                  </div>
                  {progExerciseIds.map((exId, idx) => {
                    const ex = exercises.find((e) => e.id === exId);
                    if (!ex) return null;
                    return (
                      <div
                        key={`${exId}-${idx}`}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg st-surface border st-border text-xs"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono font-bold st-accent-text shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="font-medium truncate">{ex.title}</span>
                          <DifficultyStars
                            value={inferExerciseDifficulty(ex)}
                            size="xs"
                            className="shrink-0"
                          />
                          <span className="font-mono text-[10px] st-muted shrink-0 hidden sm:inline">
                            {ex.defaultDurationSec}с · {ex.recommendedLoadPct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveExercise(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded border st-border disabled:opacity-30 cursor-pointer"
                            title="Выше"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveExercise(idx, 1)}
                            disabled={idx === progExerciseIds.length - 1}
                            className="p-1 rounded border st-border disabled:opacity-30 cursor-pointer"
                            title="Ниже"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setProgExerciseIds((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-1 rounded border st-border text-rose-600 cursor-pointer"
                            title="Убрать"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {progExerciseIds.length === 0 && (
                    <div className="py-6 text-center text-xs st-muted">
                      Добавьте упражнения из каталога справа →
                    </div>
                  )}
                </div>

                {/* Exercise Picker */}
                <div className="p-3.5 rounded-lg st-surface-muted border st-border space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Добавить из базы</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-0.5 p-0.5 rounded st-surface border st-border text-[10px]">
                        {(
                          [
                            ['all', 'Все ★'],
                            ['easy', '1–2★'],
                            ['medium', '3★'],
                            ['hard', '4–5★'],
                          ] as const
                        ).map(([dk, dl]) => (
                          <button
                            key={dk}
                            type="button"
                            onClick={() => setExPickerDifficulty(dk)}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              exPickerDifficulty === dk
                                ? 'st-accent-bg font-semibold'
                                : 'st-muted'
                            }`}
                          >
                            {dl}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={exPickerQuery}
                        onChange={(e) => setExPickerQuery(e.target.value)}
                        placeholder="Поиск..."
                        className="px-2.5 py-1 text-xs rounded border st-border st-surface w-28 sm:w-36"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {exercises
                      .filter((ex) => {
                        const diff = inferExerciseDifficulty(ex);
                        const diffOk =
                          exPickerDifficulty === 'all' ||
                          (exPickerDifficulty === 'easy' && diff <= 2) ||
                          (exPickerDifficulty === 'medium' && diff === 3) ||
                          (exPickerDifficulty === 'hard' && diff >= 4);
                        if (!diffOk) return false;
                        return (
                          !exPickerQuery.trim() ||
                          ex.title
                            .toLowerCase()
                            .includes(exPickerQuery.toLowerCase()) ||
                          ex.category
                            .toLowerCase()
                            .includes(exPickerQuery.toLowerCase())
                        );
                      })
                      .map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() =>
                            setProgExerciseIds((prev) => [...prev, ex.id])
                          }
                          className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg st-surface border st-border text-xs hover:opacity-90 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{ex.title}</div>
                            <div className="flex items-center gap-2 text-[10px] st-muted mt-0.5">
                              <span>
                                {ex.category} · {ex.defaultDurationSec} сек
                              </span>
                              <DifficultyStars
                                value={inferExerciseDifficulty(ex)}
                                size="xs"
                                showNumeric
                              />
                            </div>
                          </div>
                          <Plus className="w-3.5 h-3.5 st-accent-text shrink-0" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProgramForm(false)}
                  className="px-4 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingProgram || !progTitle.trim()}
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingProgram ? 'Сохранение...' : 'Сохранить программу'}
                </button>
              </div>
            </form>
          )}

          {/* Program Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visiblePrograms.map((prog) => {
              const targetClient = prog.clientId
                ? trainerClients.find((c) => c.id === prog.clientId)
                : undefined;
              const isOwn =
                currentUser.role !== 'trainer' ||
                prog.createdByUserId === activeTrainerId ||
                prog.createdBy === activeTrainer.name;
              const progExercises = prog.exerciseIds
                .map((id) => exercises.find((e) => e.id === id))
                .filter(Boolean) as Exercise[];
              const totalSec = progExercises.reduce(
                (acc, e) => acc + e.defaultDurationSec,
                0
              );
              const progDiff = computeProgramDifficulty(progExercises);

              return (
                <div
                  key={prog.id}
                  className="rounded-xl st-surface border st-border p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded st-accent-soft font-semibold">
                            {prog.level}
                          </span>
                          {progExercises.length > 0 && (
                            <DifficultyStars
                              value={progDiff.avg}
                              size="xs"
                              showNumeric
                              showLabel
                            />
                          )}
                        </div>
                        <h4 className="font-display text-base font-bold mt-1">
                          {prog.title}
                        </h4>
                      </div>
                      {isOwn && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditProgramForm(prog)}
                            className="p-1.5 rounded-lg border st-border st-muted hover:opacity-90 cursor-pointer"
                            title="Редактировать"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProgram(prog.id)}
                            className="p-1.5 rounded-lg border st-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {targetClient && (
                      <div className="text-xs font-medium st-accent-text">
                        Персонально для: {targetClient.name}
                      </div>
                    )}
                    {prog.description && (
                      <p className="text-xs st-muted leading-relaxed">
                        {prog.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {progExercises.map((ex, i) => (
                        <span
                          key={`${ex.id}-${i}`}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded st-surface-muted border st-border"
                        >
                          <span>
                            {i + 1}. {ex.title}
                          </span>
                          <DifficultyStars
                            value={inferExerciseDifficulty(ex)}
                            size="xs"
                          />
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t st-border text-xs">
                    <span className="font-mono st-muted">
                      {progExercises.length} упр. · ~{Math.round(totalSec / 60)} мин ·{' '}
                      {prog.createdBy}
                    </span>
                    <button
                      type="button"
                      onClick={() => onLaunchProgramInSession(prog.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg st-accent-bg font-semibold cursor-pointer"
                    >
                      <Dumbbell className="w-3.5 h-3.5" />
                      <span>В тренировку</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: TRAINER SOCIAL MEDIA BLOG */}
      {tab === 'blog' && (
        <div className="space-y-5">
          <div className="rounded-xl st-surface border st-border p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold">
                Блог тренера для социальных сетей
              </h3>
              <p className="text-xs st-muted mt-0.5">
                Готовьте экспертные посты для Telegram, ВКонтакте, Instagram и Дзен с
                ссылкой онлайн-записи. Опубликованные статьи также видят клиенты в своём PWA.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewPostForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Написать пост</span>
            </button>
          </div>

          {showPostForm && (
            <form
              onSubmit={handleSavePost}
              className="grid grid-cols-1 lg:grid-cols-12 gap-5 rounded-xl st-surface border st-border p-5"
            >
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold">
                    {editingPostId ? 'Редактирование публикации' : 'Новый пост для соцсетей'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowPostForm(false)}
                    className="p-1 st-muted cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs st-muted mb-1">Площадка</label>
                    <select
                      value={postPlatform}
                      onChange={(e) =>
                        setPostPlatform(e.target.value as TrainerBlogPlatform)
                      }
                      className="w-full px-2.5 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">Рубрика</label>
                    <select
                      value={postCategory}
                      onChange={(e) =>
                        setPostCategory(
                          e.target.value as TrainerBlogPost['category']
                        )
                      }
                      className="w-full px-2.5 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      <option value="Методика ПравИло">Методика ПравИло</option>
                      <option value="Кейс без ПДн">Кейс без ПДн</option>
                      <option value="Биомеханика">Биомеханика</option>
                      <option value="Анонс и запись">Анонс и запись</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">Статус</label>
                    <select
                      value={postStatus}
                      onChange={(e) =>
                        setPostStatus(e.target.value as 'published' | 'draft')
                      }
                      className="w-full px-2.5 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      <option value="published">Опубликован</option>
                      <option value="draft">Черновик</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs st-muted mb-1">Заголовок поста</label>
                  <input
                    type="text"
                    required
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="Напр.: Почему симметрия 95%+ критична при осевой декомпрессии"
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  />
                </div>

                <div>
                  <label className="block text-xs st-muted mb-1">
                    Текст публикации (без персональных данных клиентов)
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Поделитесь методикой, ощущениями от практики или анонсом свободных окон..."
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  />
                </div>

                <div>
                  <label className="block text-xs st-muted mb-1">Хештеги</label>
                  <input
                    type="text"
                    value={postHashtags}
                    onChange={(e) => setPostHashtags(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={postIncludeBooking}
                    onChange={(e) => setPostIncludeBooking(e.target.checked)}
                  />
                  <span>Прикрепить ссылку на онлайн-запись в студию</span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPostForm(false)}
                    className="px-3.5 py-2 rounded-lg border st-border text-xs cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={savingPost}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{savingPost ? 'Сохранение...' : 'Сохранить пост'}</span>
                  </button>
                </div>
              </div>

              {/* Live Social Card Preview */}
              <div className="lg:col-span-5 rounded-xl st-surface-muted border st-border p-4 flex flex-col justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono st-muted">
                    <span>Предпросмотр · {PLATFORM_LABELS[postPlatform]}</span>
                    <span>{postCategory}</span>
                  </div>
                  <div className="p-3.5 rounded-xl st-surface border st-border text-xs space-y-2 whitespace-pre-wrap leading-relaxed">
                    {postTitle || postContent ? (
                      buildSocialShareText({
                        title: postTitle || 'Заголовок поста',
                        content: postContent || 'Текст публикации...',
                        hashtags: postHashtags
                          .split(/[\s,]+/)
                          .filter(Boolean)
                          .map((t) => (t.startsWith('#') ? t : `#${t}`)),
                        includeBookingLink: postIncludeBooking,
                        studioId: trainerStudio?.id,
                      })
                    ) : (
                      <span className="st-muted">
                        Начните вводить текст слева, чтобы увидеть готовую карточку для
                        публикации в соцсети.
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] st-muted">
                  После сохранения можно в 1 клик скопировать пост с хештегами и ссылкой
                  для вставки в соцсеть.
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visiblePosts.map((post) => {
              const isOwn =
                currentUser.role !== 'trainer' || post.trainerId === activeTrainerId;
              const isCopied = copiedPostId === post.id;
              return (
                <div
                  key={post.id}
                  className="rounded-xl st-surface border st-border p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded st-accent-soft font-semibold">
                          {PLATFORM_LABELS[post.platform]}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded border st-border st-muted">
                          {post.category}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            post.status === 'published'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {post.status === 'published' ? 'Опубликован' : 'Черновик'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono st-muted">
                        {post.publishedAt}
                      </span>
                    </div>

                    <h4 className="font-display text-base font-bold">{post.title}</h4>
                    <p className="text-xs st-muted whitespace-pre-wrap leading-relaxed">
                      {post.content}
                    </p>

                    {post.hashtags.length > 0 && (
                      <div className="text-[11px] font-mono st-accent-text">
                        {post.hashtags.join(' ')}
                      </div>
                    )}
                    {post.includeBookingLink && (
                      <div className="inline-flex items-center gap-1 text-[11px] st-secondary-text">
                        <ExternalLink className="w-3 h-3" />
                        <span>Со ссылкой онлайн-записи в студию</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t st-border">
                    <button
                      type="button"
                      onClick={() => handleCopySocialPost(post)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-90 cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Скопировано для соцсети</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 st-accent-text" />
                          <span>Копировать пост</span>
                        </>
                      )}
                    </button>

                    {isOwn && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditPostForm(post)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs st-muted hover:opacity-90 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Изменить</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          className="p-1.5 rounded-lg border st-border text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: COMPLETED TRAINING SESSIONS HISTORY */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl st-surface border st-border">
              <div className="text-xs st-muted">Проведено тренировок</div>
              <div className="font-mono text-2xl font-bold mt-1">
                {historyStats.count}
              </div>
            </div>
            <div className="p-4 rounded-xl st-surface border st-border">
              <div className="text-xs st-muted">Ср. пиковая тяга</div>
              <div className="font-mono text-2xl font-bold mt-1 st-accent-text">
                {historyStats.avgPeak} кг
              </div>
            </div>
            <div className="p-4 rounded-xl st-surface border st-border">
              <div className="text-xs st-muted">Средняя симметрия</div>
              <div className="font-mono text-2xl font-bold mt-1 st-secondary-text">
                {historyStats.avgSym}%
              </div>
            </div>
            <div className="p-4 rounded-xl st-surface border st-border">
              <div className="text-xs st-muted">Средний пульс</div>
              <div className="font-mono text-2xl font-bold mt-1">
                {historyStats.avgHr} уд/м
              </div>
            </div>
          </div>

          <div className="rounded-xl st-surface border st-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold">
                Журнал проведённых тренировок
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 st-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Фильтр по клиенту или программе..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border st-border st-surface"
                />
              </div>
            </div>

            <div className="space-y-3" {...blockCopyProps}>
              {filteredSessions.map((ses) => {
                const st = studios.find((s) => s.id === ses.studioId);
                return (
                  <div
                    key={ses.id}
                    className="p-4 rounded-xl st-surface-muted border st-border space-y-2.5 select-none"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold st-accent-text">
                            {ses.startedAt}
                          </span>
                          <span className="text-xs st-muted">
                            · {Math.round(ses.durationSec / 60)} мин · {st?.name || 'Студия'}
                          </span>
                        </div>
                        <div className="font-semibold text-sm mt-0.5">
                          {ses.clientName} — {ses.programTitle}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          exportSessionReportPdf({
                            studioName: st?.name || 'ЭТАЛОН ПРАВИЛО',
                            studioAddress: st?.address || '',
                            clientName: ses.clientName,
                            trainerName: ses.trainerName,
                            programTitle: ses.programTitle,
                            dateStr: ses.startedAt.slice(0, 10),
                            durationSec: ses.durationSec,
                            peakWinchKg: ses.peakWinchKg,
                            avgSymmetryPct: ses.avgSymmetryPct,
                            maxLimbLoads: ses.maxLimbLoads,
                            avgHrBpm: ses.avgHrBpm,
                            bpBefore: ses.bpBefore,
                            bpAfter: ses.bpAfter,
                            heightBeforeCm: ses.heightBeforeCm,
                            heightAfterCm: ses.heightAfterCm,
                            completedExercises: ses.completedExercises,
                            telemetryHistory: [],
                            notes: ses.notes,
                            paymentLabel: PAYMENT_LABELS[ses.paymentMethod],
                            amountPaidRub: ses.amountPaidRub,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer self-start"
                      >
                        <FileDown className="w-3.5 h-3.5 st-accent-text" />
                        <span>PDF отчёт</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                      <div className="p-2 rounded st-surface border st-border">
                        <div className="text-[10px] font-sans st-muted">Макс. тяга</div>
                        <div className="font-bold">{ses.peakWinchKg.toFixed(1)} кг</div>
                      </div>
                      <div className="p-2 rounded st-surface border st-border">
                        <div className="text-[10px] font-sans st-muted">Симметрия</div>
                        <div className="font-bold">{ses.avgSymmetryPct}%</div>
                      </div>
                      <div className="p-2 rounded st-surface border st-border">
                        <div className="text-[10px] font-sans st-muted">Конечности (кг)</div>
                        <div className="font-bold text-[11px]">
                          {ses.maxLimbLoads.lh}/{ses.maxLimbLoads.rh} · {ses.maxLimbLoads.lf}/
                          {ses.maxLimbLoads.rf}
                        </div>
                      </div>
                      <div className="p-2 rounded st-surface border st-border">
                        <div className="text-[10px] font-sans st-muted">АД до → после</div>
                        <div className="font-bold">
                          {ses.bpBefore} → {ses.bpAfter}
                        </div>
                      </div>
                      <div className="p-2 rounded st-surface border st-border">
                        <div className="text-[10px] font-sans st-muted">Пульс / Рост</div>
                        <div className="font-bold">
                          {ses.avgHrBpm} уд/м
                          {ses.heightBeforeCm && ses.heightAfterCm
                            ? ` · +${(ses.heightAfterCm - ses.heightBeforeCm).toFixed(1)}см`
                            : ''}
                        </div>
                      </div>
                    </div>

                    {ses.notes && (
                      <div className="text-xs st-muted italic">«{ses.notes}»</div>
                    )}
                  </div>
                );
              })}

              {filteredSessions.length === 0 && (
                <div className="py-10 text-center text-xs st-muted">
                  Проведённых тренировок пока нет.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: EXERCISES DATABASE */}
      {tab === 'exercises' && (
        <ExercisesLibraryView
          currentUser={currentUser}
          exercises={exercises}
          programs={programs}
          clients={trainerClients}
          onExerciseAdded={onExerciseAdded}
          onExerciseUpdated={onExerciseUpdated}
          onExerciseDeleted={onExerciseDeleted}
          onProgramAdded={onProgramAdded}
          onProgramUpdated={onProgramUpdated}
          onProgramDeleted={onProgramDeleted}
          onLaunchProgramInSession={onLaunchProgramInSession}
        />
      )}

      {/* TAB: TRAINER PUBLIC PROFILE ("О СЕБЕ") */}
      {tab === 'profile' && (
        <div className="rounded-xl st-surface border st-border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b st-border pb-3">
            <div>
              <h3 className="font-display text-base font-bold">
                Публичный профиль тренера («О себе» для клиентов)
              </h3>
              <p className="text-xs st-muted">
                Фото, стаж, специализация, стиль работы, ключевые навыки и соцсети — отображаются клиентам в разделе «Студии» и при онлайн-записи
              </p>
            </div>
          </div>

          <TrainerProfileEditorForm
            key={activeTrainer.id}
            initialProfile={activeTrainer.trainerProfile}
            trainerName={activeTrainer.name}
            saving={trainerProfileSaving}
            statusMessage={trainerProfileMsg}
            onSave={handleSaveTrainerPublicProfile}
          />

          <LegalAgreementsPanel
            currentUser={currentUser}
            brandName={brandName}
            compact
            onAccepted={onLegalAccepted}
          />
        </div>
      )}

      {/* Edit Anthropometry Record Modal */}
      {editingAnthroRec && selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <form
            onSubmit={handleTrainerSaveAnthro}
            className="w-full max-w-xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] rounded-2xl st-surface border st-border shadow-2xl flex flex-col overflow-hidden select-text"
          >
            <div className="px-5 py-4 border-b st-border flex items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="font-display text-base font-bold">
                  Редактировать замер — {selectedClient.name}
                </h3>
                <p className="text-[11px] st-muted">
                  Корректировка параметров антропометрии и Mi Scale 2
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAnthroRec(null)}
                className="p-1.5 rounded-lg border st-border hover:st-surface-muted cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              {editAnthroError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
                  {editAnthroError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="st-muted">Дата замера</span>
                  <input
                    type="date"
                    required
                    value={editAnthroDate}
                    onChange={(e) => setEditAnthroDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Рост ДО (см)</span>
                  <input
                    type="number"
                    step="0.1"
                    min={100}
                    max={235}
                    required
                    value={editAnthroHBefore}
                    onChange={(e) => setEditAnthroHBefore(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Рост ПОСЛЕ (см)</span>
                  <input
                    type="number"
                    step="0.1"
                    min={100}
                    max={235}
                    placeholder="Пусто = без замера"
                    value={editAnthroHAfter}
                    onChange={(e) => setEditAnthroHAfter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="space-y-1">
                  <span className="st-muted">Вес (кг)</span>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editAnthroWeight}
                    onChange={(e) => setEditAnthroWeight(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Жир (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editAnthroFat}
                    onChange={(e) => setEditAnthroFat(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Мышцы (кг)</span>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editAnthroMuscle}
                    onChange={(e) => setEditAnthroMuscle(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Вода (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editAnthroWater}
                    onChange={(e) => setEditAnthroWater(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Белок (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editAnthroProtein}
                    onChange={(e) => setEditAnthroProtein(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Висц. жир</span>
                  <input
                    type="number"
                    step="1"
                    value={editAnthroVisceral}
                    onChange={(e) => setEditAnthroVisceral(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Кости (кг)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editAnthroBone}
                    onChange={(e) => setEditAnthroBone(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">BMR (ккал)</span>
                  <input
                    type="number"
                    step="1"
                    value={editAnthroBmr}
                    onChange={(e) => setEditAnthroBmr(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Метаб. возр.</span>
                  <input
                    type="number"
                    step="1"
                    value={editAnthroBodyAge}
                    onChange={(e) => setEditAnthroBodyAge(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Оценка тела</span>
                  <input
                    type="number"
                    step="1"
                    value={editAnthroBodyScore}
                    onChange={(e) => setEditAnthroBodyScore(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">АД верхн.</span>
                  <input
                    type="number"
                    required
                    value={editAnthroBpSys}
                    onChange={(e) => setEditAnthroBpSys(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">АД нижн.</span>
                  <input
                    type="number"
                    required
                    value={editAnthroBpDia}
                    onChange={(e) => setEditAnthroBpDia(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Пульс</span>
                  <input
                    type="number"
                    required
                    value={editAnthroPulse}
                    onChange={(e) => setEditAnthroPulse(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Гибкость</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={editAnthroFlex}
                    onChange={(e) => setEditAnthroFlex(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="st-muted">Боль (0-10)</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    required
                    value={editAnthroPain}
                    onChange={(e) => setEditAnthroPain(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted font-mono"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="st-muted">Примечание к замеру</span>
                <textarea
                  rows={2}
                  value={editAnthroNotes}
                  onChange={(e) => setEditAnthroNotes(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border st-border st-surface-muted"
                />
              </label>
            </div>

            <div className="px-5 py-3.5 border-t st-border flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingAnthroRec(null)}
                className="px-3.5 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={editAnthroSaving}
                className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {editAnthroSaving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile Bottom Thumb-Zone Navigation for Trainer PWA */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 st-surface backdrop-blur-md border-t st-border grid grid-cols-7 h-16">
        {(
          [
            ['schedule', 'График', CalendarClock],
            ['clients', 'Клиенты', Users],
            ['exercises', 'Упражн.', Dumbbell],
            ['programs', 'Прогр.', ClipboardList],
            ['blog', 'Блог', Newspaper],
            ['history', 'История', History],
            ['profile', 'О себе', UserCheck],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
              tab === k ? 'st-accent-text font-semibold' : 'st-muted'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="mt-0.5 truncate max-w-full px-0.5">{label}</span>
          </button>
        ))}
      </nav>

      {showLegalModal && (
        <LegalAgreementsModal
          role={currentUser.role}
          currentUser={currentUser}
          mandatoryMode={false}
          brandName={brandName}
          onAccepted={onLegalAccepted}
          onClose={() => setShowLegalModal(false)}
        />
      )}
    </div>
  );
};
