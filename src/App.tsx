import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  Activity,
  Dumbbell,
  Users,
  Cpu,
  TicketPercent,
  Send,
  Smartphone,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  BellRing,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Sun,
  Moon,
  ClipboardList,
  Scale,
  Flag,
  ArrowUpRight,
} from 'lucide-react';
import type {
  Booking,
  ClientActivityStatus,
  ClientProfile,
  ClientSubscription,
  EquipmentDevice,
  Exercise,
  LegalAcceptanceRecord,
  MessagingSettings,
  MessengerMessage,
  NotificationLog,
  NotificationTemplate,
  PromoCode,
  RatingReview,
  ServiceItem,
  Studio,
  StudioStyleTheme,
  SubscriptionPlan,
  SubscriptionUsage,
  TrainerSchedule,
  TrainingSessionRecord,
  UserAccount,
  WorkoutProgram,
  LiveHardwarePacket,
  TrainerBlogPost,
  BrandAboutInfo,
  LegalAgreementDoc,
} from './types';
import {
  ingestHardwarePacket,
  syncHardwareDeviceRegistry,
} from './utils/hardwareManager';
import {
  apiRequest,
  getAuthToken,
  loadCachedState,
  saveCachedState,
  setAuthToken,
} from './utils/api';
import {
  STYLE_THEME_OPTIONS,
  applyBackgroundSettingsToDom,
  applyStyleThemeToDom,
  getInitialBackgroundSettings,
  getInitialStyleTheme,
} from './utils/themes';
import { LoginView } from './components/LoginView';
import { PublicBookingView } from './components/PublicBookingView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { DesktopBlePickerModal } from './components/DesktopBlePickerModal';
import { OverviewAnalyticsView } from './components/OverviewAnalyticsView';
import { ScheduleBookingsView } from './components/ScheduleBookingsView';
import {
  LiveTrainingSessionView,
  type ActiveLiveSessionBannerState,
} from './components/LiveTrainingSessionView';
import { ExercisesLibraryView } from './components/ExercisesLibraryView';
import { ClientsDatabaseView } from './components/ClientsDatabaseView';
import { EquipmentHardwareView } from './components/EquipmentHardwareView';
import { ServicesPromosSubsView } from './components/ServicesPromosSubsView';
import { NotificationsCenterView } from './components/NotificationsCenterView';
import { ClientMobilePortalView } from './components/ClientMobilePortalView';
import { TrainerMobilePortalView } from './components/TrainerMobilePortalView';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import { StaffPushPromptModal } from './components/StaffPushPromptModal';
import { LegalAgreementsModal } from './components/LegalAgreementsModal';
import {
  setActiveLegalBundle,
  userNeedsLegalAcceptance,
} from './utils/legalAgreements';
import {
  formatNewBookingAlert,
  getNotificationPermissionState,
  isBookingRelevantForStaff,
  isStaffRole,
  requestStaffPushPermission,
  shouldShowFirstLoginPushPrompt,
  showStaffSystemNotification,
  type StaffPushPermissionState,
} from './utils/staffNotifications';
import {
  applyAndroidAppManifestToDocument,
  getActiveAndroidAppFlavor,
  type AndroidAppFlavor,
} from './utils/androidApps';

type NavTab =
  | 'overview'
  | 'schedule'
  | 'session'
  | 'exercises'
  | 'clients'
  | 'equipment'
  | 'services'
  | 'notifications'
  | 'trainer_portal'
  | 'client_portal';

interface AppStateData {
  studios: Studio[];
  users: UserAccount[];
  schedules: TrainerSchedule[];
  services: ServiceItem[];
  promos: PromoCode[];
  subscriptionPlans: SubscriptionPlan[];
  clientSubscriptions: ClientSubscription[];
  subscriptionUsages: SubscriptionUsage[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  clients: ClientProfile[];
  bookings: Booking[];
  equipment: EquipmentDevice[];
  sessions: TrainingSessionRecord[];
  templates: NotificationTemplate[];
  notificationLogs: NotificationLog[];
  birthdayAutomationEnabled?: boolean;
  messagingSettings?: MessagingSettings;
  messengerMessages?: MessengerMessage[];
  trainerPosts?: TrainerBlogPost[];
  reviews?: RatingReview[];
  brandAbout?: BrandAboutInfo;
  legalAcceptances?: LegalAcceptanceRecord[];
  legalDocuments?: LegalAgreementDoc[];
  legalBundleVersion?: string;
}

const ROLE_DEFAULT_TAB: Record<UserAccount['role'], NavTab> = {
  owner: 'overview',
  admin: 'schedule',
  trainer: 'trainer_portal',
  client: 'client_portal',
};

function resolveDefaultTabForUser(
  user: UserAccount,
  androidFlavor: AndroidAppFlavor | null
): { tab: NavTab; ownerAdmin: boolean } {
  if (user.role === 'owner') {
    if (androidFlavor === 'admin') return { tab: 'schedule', ownerAdmin: true };
    if (androidFlavor === 'trainer') return { tab: 'trainer_portal', ownerAdmin: false };
    if (androidFlavor === 'client') return { tab: 'client_portal', ownerAdmin: false };
  }
  return { tab: ROLE_DEFAULT_TAB[user.role], ownerAdmin: false };
}

const ROLE_TITLES: Record<UserAccount['role'], string> = {
  owner: 'Владелец сети',
  admin: 'Администратор',
  trainer: 'Тренер',
  client: 'Клиент',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const [data, setData] = useState<AppStateData | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedStudioId, setSelectedStudioId] = useState<string>('all');
  const [activeBookingForSession, setActiveBookingForSession] = useState<Booking | null>(null);
  const [activeProgramIdForSession, setActiveProgramIdForSession] = useState<string | null>(null);
  const [activeSessionBanner, setActiveSessionBanner] = useState<ActiveLiveSessionBannerState>({
    active: false,
    clientName: '',
    programTitle: '',
    exerciseTitle: '',
    sessionElapsedSec: 0,
    isRunning: false,
  });
  const [finishSessionSignal, setFinishSessionSignal] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalSuccessNotice, setLegalSuccessNotice] = useState('');
  const [ownerAdminMode, setOwnerAdminMode] = useState(false);
  const [pushToast, setPushToast] = useState<NotificationLog | null>(null);
  const [publicBrandAbout, setPublicBrandAbout] = useState<BrandAboutInfo | undefined>(undefined);
  const [wsConnected, setWsConnected] = useState(false);
  const [pushPermission, setPushPermission] = useState<StaffPushPermissionState>(() =>
    getNotificationPermissionState()
  );
  const [showStaffPushPrompt, setShowStaffPushPrompt] = useState(false);
  const currentUserRef = useRef<UserAccount | null>(null);
  const dataRef = useRef<AppStateData | null>(null);
  const [publicBookingMode, setPublicBookingMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('book') === '1';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('atlant_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [styleTheme, setStyleTheme] = useState<StudioStyleTheme>(() => getInitialStyleTheme());
  const [bgImage, setBgImage] = useState<string>(() => getInitialBackgroundSettings().imageUrl);
  const [bgOpacity, setBgOpacity] = useState<number>(() => getInitialBackgroundSettings().opacity);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('atlant_sidebar_collapsed') === '1';
  });

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const syncPerm = () => setPushPermission(getNotificationPermissionState());
    window.addEventListener('focus', syncPerm);
    document.addEventListener('visibilitychange', syncPerm);
    return () => {
      window.removeEventListener('focus', syncPerm);
      document.removeEventListener('visibilitychange', syncPerm);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        const user = currentUserRef.current;
        if (user && isStaffRole(user.role)) {
          setActiveTab(user.role === 'trainer' ? 'trainer_portal' : 'schedule');
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  useEffect(() => {
    localStorage.setItem('atlant_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    applyStyleThemeToDom(styleTheme, theme);
  }, [styleTheme, theme]);

  useEffect(() => {
    applyBackgroundSettingsToDom(bgImage, bgOpacity);
  }, [bgImage, bgOpacity]);

  useEffect(() => {
    if (data?.equipment) {
      syncHardwareDeviceRegistry(data.equipment);
    }
  }, [data?.equipment]);

  const loadAppState = useCallback(async (user: UserAccount) => {
    try {
      const state = await apiRequest<AppStateData>('/api/state');
      setData(state);
      if (state.legalDocuments || state.legalBundleVersion) {
        setActiveLegalBundle(state.legalDocuments, state.legalBundleVersion);
      }
      syncHardwareDeviceRegistry(state.equipment || []);
      saveCachedState({ user, state });
    } catch {
      const cached = loadCachedState<{ user: UserAccount; state: AppStateData }>();
      if (cached?.data?.state) {
        setData(cached.data.state);
        if (cached.data.state.legalDocuments || cached.data.state.legalBundleVersion) {
          setActiveLegalBundle(
            cached.data.state.legalDocuments,
            cached.data.state.legalBundleVersion
          );
        }
        syncHardwareDeviceRegistry(cached.data.state.equipment || []);
      }
    }
  }, []);

  // Fetch public branding/home screen config & public legal documents on mount
  useEffect(() => {
    fetch('/api/public/brand-about')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && typeof res === 'object') {
          setPublicBrandAbout(res as BrandAboutInfo);
        }
      })
      .catch(() => undefined);

    fetch('/api/public/legal-agreements')
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { documents?: LegalAgreementDoc[]; bundleVersion?: string } | null) => {
        if (res && typeof res === 'object') {
          setActiveLegalBundle(res.documents, res.bundleVersion);
        }
      })
      .catch(() => undefined);
  }, []);

  const activeAndroidFlavor = useMemo(() => getActiveAndroidAppFlavor(), []);

  useEffect(() => {
    applyAndroidAppManifestToDocument(
      activeAndroidFlavor,
      data?.brandAbout?.brandName || publicBrandAbout?.brandName
    );
  }, [activeAndroidFlavor, data?.brandAbout?.brandName, publicBrandAbout?.brandName]);

  // Restore session on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    apiRequest<{ user: UserAccount }>('/api/auth/me')
      .then(async ({ user }) => {
        setCurrentUser(user);
        const resolved = resolveDefaultTabForUser(user, activeAndroidFlavor);
        setActiveTab(resolved.tab);
        setOwnerAdminMode(resolved.ownerAdmin);
        setSelectedStudioId(user.role === 'owner' ? 'all' : user.studioId || 'all');
        setPushPermission(getNotificationPermissionState());
        if (shouldShowFirstLoginPushPrompt(user)) {
          setShowStaffPushPrompt(true);
        }
        await loadAppState(user);
      })
      .catch(() => {
        const cached = loadCachedState<{ user: UserAccount; state: AppStateData }>();
        if (!navigator.onLine && cached?.data) {
          setCurrentUser(cached.data.user);
          setData(cached.data.state);
          const resolved = resolveDefaultTabForUser(cached.data.user, activeAndroidFlavor);
          setActiveTab(resolved.tab);
          setOwnerAdminMode(resolved.ownerAdmin);
        } else {
          setAuthToken(null);
        }
      })
      .finally(() => setAuthChecked(true));
  }, [loadAppState, activeAndroidFlavor]);

  // Real-time WebSocket connection
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { event: string; payload: unknown };
          const activeUser = currentUserRef.current;
          if (msg.event === 'booking:created') {
            const bk = msg.payload as Booking;
            setData((prev) =>
              prev && !prev.bookings.some((x) => x.id === bk.id)
                ? { ...prev, bookings: [bk, ...prev.bookings] }
                : prev
            );

            if (
              activeUser &&
              isStaffRole(activeUser.role) &&
              isBookingRelevantForStaff(activeUser, bk) &&
              bk.createdByUserId !== activeUser.id
            ) {
              const studio = dataRef.current?.studios.find((s) => s.id === bk.studioId);
              const alert = formatNewBookingAlert(bk, studio?.name);
              setPushToast({
                id: `bk-toast-${bk.id}`,
                channel: 'push',
                recipientName: activeUser.name,
                recipientContact: bk.clientName,
                clientId: bk.clientId,
                subject: alert.title,
                messagePreview: alert.body,
                cabinetLink: '/',
                status: 'delivered',
                sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
              });
              void showStaffSystemNotification({
                title: alert.title,
                body: alert.body,
                tag: `booking-${bk.id}`,
                bookingId: bk.id,
                onFocusClick: () => {
                  setActiveTab(
                    activeUser.role === 'trainer' ? 'trainer_portal' : 'schedule'
                  );
                },
              });
            }
          } else if (msg.event === 'booking:updated') {
            const bk = msg.payload as Booking;
            setData((prev) =>
              prev
                ? { ...prev, bookings: prev.bookings.map((x) => (x.id === bk.id ? bk : x)) }
                : prev
            );
          } else if (msg.event === 'booking:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? { ...prev, bookings: prev.bookings.filter((x) => x.id !== payload.id) }
                : prev
            );
          } else if (msg.event === 'schedule:created') {
            const sch = msg.payload as TrainerSchedule;
            if (activeUser?.role === 'trainer' && sch.trainerId !== activeUser.id) return;
            setData((prev) =>
              prev && !prev.schedules.some((s) => s.id === sch.id)
                ? { ...prev, schedules: [...prev.schedules, sch] }
                : prev
            );
          } else if (msg.event === 'schedule:updated') {
            const sch = msg.payload as TrainerSchedule;
            setData((prev) => {
              if (!prev) return prev;
              if (activeUser?.role === 'trainer' && sch.trainerId !== activeUser.id) {
                return { ...prev, schedules: prev.schedules.filter((s) => s.id !== sch.id) };
              }
              const exists = prev.schedules.some((s) => s.id === sch.id);
              return {
                ...prev,
                schedules: exists
                  ? prev.schedules.map((s) => (s.id === sch.id ? sch : s))
                  : [...prev.schedules, sch],
              };
            });
          } else if (msg.event === 'schedule:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? { ...prev, schedules: prev.schedules.filter((s) => s.id !== payload.id) }
                : prev
            );
          } else if (msg.event === 'equipment:updated') {
            const dev = msg.payload as EquipmentDevice;
            setData((prev) =>
              prev
                ? { ...prev, equipment: prev.equipment.map((x) => (x.id === dev.id ? dev : x)) }
                : prev
            );
          } else if (msg.event === 'hardware:telemetry') {
            const pkt = msg.payload as LiveHardwarePacket;
            ingestHardwarePacket(pkt);
          } else if (msg.event === 'studio:updated') {
            const st = msg.payload as Studio;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.studios.some((s) => s.id === st.id);
              return {
                ...prev,
                studios: exists
                  ? prev.studios.map((s) => (s.id === st.id ? st : s))
                  : [...prev.studios, st],
              };
            });
          } else if (msg.event === 'studio:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    studios: prev.studios.filter((s) => s.id !== payload.id),
                    schedules: prev.schedules.filter((sch) => sch.studioId !== payload.id),
                    reviews: (prev.reviews || []).filter(
                      (r) => !(r.targetType === 'studio' && r.targetId === payload.id)
                    ),
                  }
                : prev
            );
            setSelectedStudioId((curr) => (curr === payload.id ? 'all' : curr));
          } else if (msg.event === 'brand-about:updated') {
            const ba = msg.payload as BrandAboutInfo;
            setPublicBrandAbout(ba);
            setData((prev) => (prev ? { ...prev, brandAbout: ba } : prev));
          } else if (msg.event === 'review:updated') {
            const rev = msg.payload as RatingReview;
            setData((prev) => {
              if (!prev) return prev;
              const list = prev.reviews || [];
              const exists = list.some((r) => r.id === rev.id);
              return {
                ...prev,
                reviews: exists
                  ? list.map((r) => (r.id === rev.id ? rev : r))
                  : [rev, ...list],
              };
            });
          } else if (msg.event === 'review:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    reviews: (prev.reviews || []).filter((r) => r.id !== payload.id),
                  }
                : prev
            );
          } else if (msg.event === 'notification:push') {
            const log = msg.payload as NotificationLog;
            setData((prev) =>
              prev && !prev.notificationLogs.some((n) => n.id === log.id)
                ? { ...prev, notificationLogs: [log, ...prev.notificationLogs] }
                : prev
            );
            const skipStaffDuplicate =
              Boolean(activeUser && isStaffRole(activeUser.role)) &&
              log.subject === 'Онлайн-запись по ссылке';
            if (!skipStaffDuplicate) {
              setPushToast(log);
              void showStaffSystemNotification({
                title: log.subject,
                body: log.messagePreview,
                tag: `nlog-${log.id}`,
              });
            }
          } else if (msg.event === 'messenger:message') {
            const mmsg = msg.payload as MessengerMessage;
            setData((prev) => {
              if (!prev) return prev;
              const existing = prev.messengerMessages || [];
              if (existing.some((x) => x.id === mmsg.id)) return prev;
              return { ...prev, messengerMessages: [...existing, mmsg] };
            });
          } else if (msg.event === 'messenger:read') {
            const payload = msg.payload as { clientId?: string };
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    messengerMessages: (prev.messengerMessages || []).map((m) =>
                      !payload.clientId || m.clientId === payload.clientId
                        ? { ...m, readByAdmin: true }
                        : m
                    ),
                  }
                : prev
            );
          } else if (msg.event === 'trainer-post:updated') {
            const post = msg.payload as TrainerBlogPost;
            setData((prev) => {
              if (!prev) return prev;
              const existing = prev.trainerPosts || [];
              const has = existing.some((p) => p.id === post.id);
              return {
                ...prev,
                trainerPosts: has
                  ? existing.map((p) => (p.id === post.id ? post : p))
                  : [post, ...existing],
              };
            });
          } else if (msg.event === 'trainer-post:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    trainerPosts: (prev.trainerPosts || []).filter(
                      (p) => p.id !== payload.id
                    ),
                  }
                : prev
            );
          } else if (msg.event === 'exercise:updated') {
            const ex = msg.payload as Exercise;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.exercises.some((item) => item.id === ex.id);
              return {
                ...prev,
                exercises: exists
                  ? prev.exercises.map((item) => (item.id === ex.id ? ex : item))
                  : [ex, ...prev.exercises],
              };
            });
          } else if (msg.event === 'exercise:hidden') {
            const payload = msg.payload as { id?: string; createdByUserId?: string };
            if (!payload.id) return;
            const canStillSee =
              activeUser?.role === 'owner' ||
              activeUser?.role === 'admin' ||
              (activeUser?.role === 'trainer' &&
                payload.createdByUserId === activeUser.id);
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    exercises: canStillSee
                      ? prev.exercises.map((item) =>
                          item.id === payload.id
                            ? { ...item, visibility: 'hidden' }
                            : item
                        )
                      : prev.exercises.filter((item) => item.id !== payload.id),
                  }
                : prev
            );
          } else if (msg.event === 'exercise:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    exercises: prev.exercises.filter((item) => item.id !== payload.id),
                    programs: prev.programs.map((prog) => ({
                      ...prog,
                      exerciseIds: prog.exerciseIds.filter((eid) => eid !== payload.id),
                    })),
                  }
                : prev
            );
          } else if (msg.event === 'program:updated') {
            const prog = msg.payload as WorkoutProgram;
            if (!prog || !prog.id) return;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.programs.some((item) => item.id === prog.id);
              return {
                ...prev,
                programs: exists
                  ? prev.programs.map((item) => (item.id === prog.id ? prog : item))
                  : [prog, ...prev.programs],
              };
            });
          } else if (msg.event === 'program:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    programs: prev.programs.filter((item) => item.id !== payload.id),
                  }
                : prev
            );
          } else if (msg.event === 'user:access-revoked') {
            const payload = msg.payload as { userId?: string; reason?: string };
            if (payload.userId && payload.userId === activeUser?.id) {
              setAuthToken(null);
              setCurrentUser(null);
              setData(null);
              setOwnerAdminMode(false);
              setShowSettings(false);
              setShowStaffPushPrompt(false);
              setSessionNotice(
                payload.reason ||
                  'Доступ к приложению отозван владельцем или администратором (увольнение или сброс пароля).'
              );
            }
          } else if (msg.event === 'user:updated') {
            const raw = msg.payload as UserAccount | { user?: UserAccount };
            const u = ('user' in raw && raw.user ? raw.user : raw) as UserAccount;
            if (!u || !u.id) return;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.users.some((item) => item.id === u.id);
              return {
                ...prev,
                users: exists
                  ? prev.users.map((item) => (item.id === u.id ? u : item))
                  : [...prev.users, u],
              };
            });
            if (u.id === activeUser?.id) {
              setCurrentUser(u);
            }
          } else if (msg.event === 'client:updated') {
            const rawCl = msg.payload as ClientProfile;
            if (!rawCl || !rawCl.id) return;
            const viewer = currentUserRef.current;
            const cl: ClientProfile =
              viewer?.role === 'trainer'
                ? {
                    ...rawCl,
                    userId: undefined,
                    phone: 'Скрыто (защита базы)',
                    email: 'Скрыто',
                    telegram: 'Скрыто',
                    telegramChatId: undefined,
                  }
                : rawCl;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.clients.some((c) => c.id === cl.id);
              return exists
                ? {
                    ...prev,
                    clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)),
                  }
                : prev;
            });
          } else if (msg.event === 'client:transferred') {
            if (currentUserRef.current) {
              loadAppState(currentUserRef.current);
            }
          } else if (msg.event === 'service:updated') {
            const srv = msg.payload as ServiceItem;
            setData((prev) => {
              if (!prev) return prev;
              const exists = prev.services.some((s) => s.id === srv.id);
              return {
                ...prev,
                services: exists
                  ? prev.services.map((s) => (s.id === srv.id ? srv : s))
                  : [...prev.services, srv],
              };
            });
          } else if (msg.event === 'service:deleted') {
            const payload = msg.payload as { id?: string };
            if (!payload.id) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    services: prev.services.filter((s) => s.id !== payload.id),
                  }
                : prev
            );
          } else if (msg.event === 'client:status-updated') {
            const payload = msg.payload as {
              id?: string;
              clientStatus?: ClientActivityStatus;
            };
            if (!payload.id || !payload.clientStatus) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    clients: prev.clients.map((c) =>
                      c.id === payload.id
                        ? { ...c, clientStatus: payload.clientStatus }
                        : c
                    ),
                  }
                : prev
            );
          } else if (msg.event === 'client:posture-updated') {
            const payload = msg.payload as {
              clientId?: string;
              postureAssessments?: ClientProfile['postureAssessments'];
            };
            if (!payload.clientId || !Array.isArray(payload.postureAssessments)) return;
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    clients: prev.clients.map((c) =>
                      c.id === payload.clientId
                        ? { ...c, postureAssessments: payload.postureAssessments }
                        : c
                    ),
                  }
                : prev
            );
          } else if (msg.event === 'legal:accepted' || msg.event === 'legal:updated') {
            const rec = msg.payload as LegalAcceptanceRecord;
            if (!rec?.id) return;
            setData((prev) => {
              if (!prev) return prev;
              const viewer = currentUserRef.current;
              if (viewer && viewer.role !== 'owner' && rec.userId !== viewer.id) {
                return prev;
              }
              const list = prev.legalAcceptances || [];
              const exists = list.some((item) => item.id === rec.id);
              return {
                ...prev,
                legalAcceptances: exists
                  ? list.map((item) => (item.id === rec.id ? rec : item))
                  : [rec, ...list],
              };
            });
          } else if (msg.event === 'legal-docs:updated') {
            const payload = msg.payload as {
              documents?: LegalAgreementDoc[];
              bundleVersion?: string;
            };
            if (!payload || !Array.isArray(payload.documents)) return;
            setActiveLegalBundle(payload.documents, payload.bundleVersion);
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    legalDocuments: payload.documents,
                    legalBundleVersion: payload.bundleVersion || prev.legalBundleVersion,
                  }
                : prev
            );
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [currentUserId]);

  const handleLoginSuccess = async (user: UserAccount) => {
    setSessionNotice('');
    setCurrentUser(user);
    const resolved = resolveDefaultTabForUser(user, activeAndroidFlavor);
    setActiveTab(resolved.tab);
    setOwnerAdminMode(resolved.ownerAdmin);
    setSelectedStudioId(user.role === 'owner' ? 'all' : user.studioId || 'all');
    const perm = getNotificationPermissionState();
    setPushPermission(perm);
    if (shouldShowFirstLoginPushPrompt(user)) {
      setShowStaffPushPrompt(true);
    }
    await loadAppState(user);
  };

  const handleLogout = () => {
    if (data?.brandAbout) {
      setPublicBrandAbout(data.brandAbout);
    }
    setActiveSessionBanner({
      active: false,
      clientName: '',
      programTitle: '',
      exerciseTitle: '',
      sessionElapsedSec: 0,
      isRunning: false,
    });
    setAuthToken(null);
    setCurrentUser(null);
    setData(null);
    setOwnerAdminMode(false);
    setShowStaffPushPrompt(false);
    setSessionNotice('');
  };

  useEffect(() => {
    if (!activeSessionBanner.active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeSessionBanner.active]);

  const unreadMessagesCount = useMemo(
    () =>
      (data?.messengerMessages || []).filter(
        (m) => m.direction === 'inbound' && !m.readByAdmin
      ).length,
    [data?.messengerMessages]
  );

  const navItems = useMemo(() => {
    if (!currentUser) return [];
    const role = currentUser.role;
    const all: { id: NavTab; label: string; badge?: number; icon: React.ComponentType<{ className?: string }>; roles: UserAccount['role'][] }[] = [
      { id: 'overview', label: 'Обзор и аналитика', icon: BarChart3, roles: ['owner', 'admin'] },
      { id: 'schedule', label: 'Расписание и записи', icon: CalendarClock, roles: ['owner', 'admin'] },
      { id: 'session', label: 'Тренировочная сессия', icon: Activity, roles: ['owner', 'admin', 'trainer'] },
      { id: 'exercises', label: 'База упражнений', icon: Dumbbell, roles: ['owner', 'admin', 'trainer'] },
      { id: 'clients', label: 'База клиентов', icon: Users, roles: ['owner', 'admin'] },
      { id: 'equipment', label: 'Оборудование BLE', icon: Cpu, roles: ['owner', 'admin', 'trainer'] },
      { id: 'services', label: 'Услуги и абонементы', icon: TicketPercent, roles: ['owner', 'admin'] },
      {
        id: 'notifications',
        label: 'Рассылки и чаты',
        badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
        icon: Send,
        roles: ['owner', 'admin'],
      },
      { id: 'trainer_portal', label: 'Приложение тренера (PWA)', icon: ClipboardList, roles: ['trainer', 'owner'] },
      { id: 'client_portal', label: 'Кабинет клиента (PWA)', icon: Smartphone, roles: ['client', 'owner'] },
    ];
    return all.filter((item) => item.roles.includes(role));
  }, [currentUser, unreadMessagesCount]);

  // Enforce strict role boundaries on activeTab
  useEffect(() => {
    if (!currentUser) return;
    if (!navItems.some((n) => n.id === activeTab)) {
      setActiveTab(ROLE_DEFAULT_TAB[currentUser.role]);
    }
  }, [currentUser, navItems, activeTab]);

  if (publicBookingMode) {
    return (
      <PublicBookingView
        onExitToLogin={() => {
          setPublicBookingMode(false);
          if (window.location.search.includes('book=1')) {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    );
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center st-canvas text-sm st-muted">
        Загрузка системы студии...
      </div>
    );
  }

  if (!currentUser || !data) {
    return (
      <LoginView
        sessionNotice={sessionNotice}
        brandAbout={data?.brandAbout || publicBrandAbout}
        onOpenPublicBooking={() => setPublicBookingMode(true)}
        onSuccess={handleLoginSuccess}
      />
    );
  }

  const activeNavMeta = navItems.find((n) => n.id === activeTab);

  const isSessionTab = activeTab === 'session';

  return (
    <div
      className={`flex flex-col st-canvas ${
        isSessionTab ? 'min-h-screen lg:h-screen lg:overflow-hidden' : 'min-h-screen'
      }`}
    >
      <div className="st-ornament-bar shrink-0" />
      <div className="flex flex-1 min-h-0">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[264px] shrink-0 st-surface border-r st-border flex flex-col justify-between transition-all duration-200 ${
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[264px]'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {/* Brand */}
          <div
            className={`h-14 border-b st-border flex items-center shrink-0 gap-2 ${
              sidebarCollapsed ? 'px-4 lg:px-2 lg:justify-center' : 'px-4 justify-between'
            }`}
          >
            <div className="flex items-center min-w-0">
              {sidebarCollapsed ? (
                <div className="w-8 h-8 rounded-lg bg-white border st-border p-1 flex items-center justify-center shrink-0">
                  <img
                    src={
                      data.brandAbout?.logoIconUrl ||
                      data.brandAbout?.logoUrl ||
                      '/assets/aistudio/logo_icon_etalon.png'
                    }
                    alt={data.brandAbout?.brandName || 'ЭТАЛОН ПРАВИЛО'}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-9 rounded-lg bg-white border st-border px-2 py-0.5 flex items-center justify-center min-w-0 max-w-[196px]">
                  <img
                    src={data.brandAbout?.logoUrl || '/assets/aistudio/logo_full_etalon.png'}
                    alt={data.brandAbout?.brandName || 'ЭТАЛОН ПРАВИЛО'}
                    className="h-full w-auto max-w-full object-contain"
                  />
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Свернуть боковое меню"
                aria-label="Свернуть боковое меню"
                className="hidden lg:inline-flex p-1.5 rounded-lg st-muted hover:opacity-85 cursor-pointer shrink-0"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Owner Mode Switch (Owner can perform Admin role) */}
          {currentUser.role === 'owner' && (
            <div className={`pt-3 ${sidebarCollapsed ? 'px-3 lg:px-2' : 'px-4'}`}>
              <button
                type="button"
                title={ownerAdminMode ? 'Режим: Администратор студии' : 'Режим: Владелец сети'}
                onClick={() => {
                  const next = !ownerAdminMode;
                  setOwnerAdminMode(next);
                  if (next) setActiveTab('schedule');
                  else setActiveTab('overview');
                }}
                className={`w-full py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  sidebarCollapsed ? 'px-3 lg:px-0 lg:text-center' : 'px-3 text-left'
                } ${
                  ownerAdminMode
                    ? 'st-accent-soft border-current font-semibold'
                    : 'st-border st-muted hover:opacity-90'
                }`}
              >
                <span className={sidebarCollapsed ? 'lg:hidden' : ''}>
                  {ownerAdminMode ? 'Режим: Администратор студии' : 'Режим: Владелец сети'}
                </span>
                {sidebarCollapsed && (
                  <span className="hidden lg:inline font-mono text-[11px] font-bold">
                    {ownerAdminMode ? 'АДМ' : 'ВЛД'}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Menu Tabs */}
          <nav className={`p-3 space-y-1 flex-1 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
                  } ${
                    active
                      ? 'st-accent-bg shadow-sm'
                      : 'st-muted hover:opacity-90'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                      {item.label}
                    </span>
                  </span>
                  {item.badge && !sidebarCollapsed && (
                    <span className={`font-mono text-[11px] font-bold ${active ? 'text-white' : 'st-accent-text'}`}>
                      +{item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Profile Footer */}
        <div className={`p-3 border-t st-border space-y-2 shrink-0 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
          <div
            className={`px-2 py-1.5 flex items-center gap-2.5 ${
              sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
            }`}
          >
            <div
              title={`${currentUser.name} (${ROLE_TITLES[currentUser.role]})`}
              className="w-8 h-8 rounded-full st-accent-bg flex items-center justify-center text-xs font-bold shrink-0"
            >
              {currentUser.avatarInitials}
            </div>
            <div className={`min-w-0 flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <div className="text-xs font-semibold truncate">{currentUser.name}</div>
              <div className="text-[11px] st-muted truncate">
                {ROLE_TITLES[currentUser.role]}
              </div>
            </div>
          </div>

          <button
            type="button"
            title="Юридические соглашения и конфиденциальность"
            onClick={() => {
              setShowLegalModal(true);
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-between gap-2 py-2 px-2.5 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-90 cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Scale className="w-3.5 h-3.5 st-accent-text shrink-0" />
              <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                Юридические соглашения
              </span>
            </span>
            {!sidebarCollapsed && currentUser.role !== 'owner' && (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  currentUser.legalAcceptedAt ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            )}
          </button>

          <div className={`grid grid-cols-2 gap-1.5 ${sidebarCollapsed ? 'lg:grid-cols-1' : ''}`}>
            <button
              type="button"
              title="Настройки"
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>Настройки</span>
            </button>
            <button
              type="button"
              title="Выйти"
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border st-border text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>Выйти</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top Bar (3-zone contract) */}
        <header className="h-14 px-4 sm:px-5 st-surface border-b st-border flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border st-border"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню'}
              aria-label={sidebarCollapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню'}
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium st-muted hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
              <span>{sidebarCollapsed ? 'Меню' : 'Свернуть'}</span>
            </button>
            <h1 className="font-display text-lg sm:text-xl font-bold truncate">
              {activeNavMeta?.label || 'Рабочее пространство'}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <label className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border st-border st-surface-muted text-xs">
              <Palette className="w-3.5 h-3.5 st-accent-text shrink-0" />
              <select
                aria-label="Культурный стиль оформления"
                value={styleTheme}
                onChange={(e) => setStyleTheme(e.target.value as StudioStyleTheme)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
              >
                {STYLE_THEME_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {opt.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? 'Тёмная палитра' : 'Светлая палитра'}
              className="p-2 rounded-lg border st-border st-surface text-xs cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 st-gold-text" />}
            </button>
            <span
              className={`hidden xl:inline-flex items-center gap-1.5 text-xs font-mono ${
                wsConnected ? 'st-secondary-text' : 'st-muted'
              }`}
            >
              {wsConnected ? '● Live' : '○ Офлайн'}
            </span>
            {isStaffRole(currentUser.role) && pushPermission === 'default' && (
              <button
                type="button"
                onClick={async () => {
                  const res = await requestStaffPushPermission(currentUser.id);
                  setPushPermission(res);
                }}
                title="Включить Push-уведомления о новых записях"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border st-border st-accent-soft text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Включить Push</span>
              </button>
            )}
            <PWAInstallButton compact />
          </div>
        </header>

        {/* Active View Content */}
        <main
          className={`flex-1 min-h-0 ${
            isSessionTab
              ? 'p-2.5 sm:p-3 overflow-y-auto lg:overflow-hidden'
              : 'p-4 sm:p-6 lg:p-8 overflow-y-auto'
          }`}
        >
          {legalSuccessNotice && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <span>{legalSuccessNotice}</span>
              <button
                type="button"
                onClick={() => setLegalSuccessNotice('')}
                className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewAnalyticsView
              currentUser={currentUser}
              studios={data.studios}
              selectedStudioId={selectedStudioId}
              onSelectStudio={setSelectedStudioId}
              users={data.users}
              bookings={data.bookings}
              sessions={data.sessions}
              clients={data.clients}
              services={data.services}
              reviews={data.reviews || []}
              brandAbout={data.brandAbout}
              legalAcceptances={data.legalAcceptances || []}
              onLegalAccepted={({ user, record }) => {
                setCurrentUser(user);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                      }
                    : prev
                );
              }}
              onLegalMarkedRead={(rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        legalAcceptances: (prev.legalAcceptances || []).map((r) =>
                          r.id === rec.id ? rec : r
                        ),
                      }
                    : prev
                )
              }
              onBrandAboutUpdated={(ba) => {
                setPublicBrandAbout(ba);
                setData((prev) => (prev ? { ...prev, brandAbout: ba } : prev));
              }}
              onStudioAdded={(st) =>
                setData((prev) =>
                  prev && !prev.studios.some((s) => s.id === st.id)
                    ? { ...prev, studios: [...prev.studios, st] }
                    : prev
                )
              }
              onStudioUpdated={(st) =>
                setData((prev) =>
                  prev
                    ? { ...prev, studios: prev.studios.map((s) => (s.id === st.id ? st : s)) }
                    : prev
                )
              }
              onStudioDeleted={(id) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        studios: prev.studios.filter((s) => s.id !== id),
                        schedules: prev.schedules.filter((sch) => sch.studioId !== id),
                        reviews: (prev.reviews || []).filter(
                          (r) => !(r.targetType === 'studio' && r.targetId === id)
                        ),
                      }
                    : prev
                );
                if (selectedStudioId === id) {
                  setSelectedStudioId('all');
                }
              }}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleBookingsView
              currentUser={currentUser}
              studios={data.studios}
              selectedStudioId={selectedStudioId}
              users={data.users}
              clients={data.clients}
              services={data.services}
              bookings={data.bookings}
              schedules={data.schedules}
              reviews={data.reviews || []}
              brandName={data.brandAbout?.brandName}
              onLegalAccepted={({ user, record }) => {
                setCurrentUser(user);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                      }
                    : prev
                );
              }}
              onBookingCreated={(bk) =>
                setData((prev) =>
                  prev && !prev.bookings.some((x) => x.id === bk.id)
                    ? { ...prev, bookings: [bk, ...prev.bookings] }
                    : prev
                )
              }
              onBookingUpdated={(bk) =>
                setData((prev) =>
                  prev
                    ? { ...prev, bookings: prev.bookings.map((x) => (x.id === bk.id ? bk : x)) }
                    : prev
                )
              }
              onBookingDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? { ...prev, bookings: prev.bookings.filter((x) => x.id !== id) }
                    : prev
                )
              }
              onScheduleAdded={(sch) =>
                setData((prev) =>
                  prev && !prev.schedules.some((s) => s.id === sch.id)
                    ? { ...prev, schedules: [...prev.schedules, sch] }
                    : prev
                )
              }
              onScheduleUpdated={(sch) =>
                setData((prev) =>
                  prev
                    ? { ...prev, schedules: prev.schedules.map((s) => (s.id === sch.id ? sch : s)) }
                    : prev
                )
              }
              onScheduleDeleted={(id) =>
                setData((prev) =>
                  prev ? { ...prev, schedules: prev.schedules.filter((s) => s.id !== id) } : prev
                )
              }
              onStudioUpdated={(st) =>
                setData((prev) =>
                  prev
                    ? { ...prev, studios: prev.studios.map((s) => (s.id === st.id ? st : s)) }
                    : prev
                )
              }
              onStartLiveSession={(bk) => {
                setActiveBookingForSession(bk);
                setActiveTab('session');
              }}
            />
          )}

          {(activeTab === 'session' || activeSessionBanner.active) && currentUser.role !== 'client' && (
            <div className={activeTab === 'session' ? 'lg:h-full' : 'hidden'}>
              <LiveTrainingSessionView
                currentUser={currentUser}
                users={data.users}
                studios={data.studios}
                clients={data.clients}
                exercises={data.exercises}
                programs={data.programs}
                equipment={data.equipment}
                clientSubscriptions={data.clientSubscriptions}
                promos={data.promos}
                activeBooking={activeBookingForSession}
                initialProgramId={activeProgramIdForSession}
                openFinishModalSignal={finishSessionSignal}
                onActiveSessionStateChange={setActiveSessionBanner}
                onSessionSaved={() => loadAppState(currentUser)}
                onClientUpdated={(cl) =>
                  setData((prev) =>
                    prev
                      ? { ...prev, clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)) }
                      : prev
                  )
                }
                onDeviceUpdated={(dev) =>
                  setData((prev) =>
                    prev
                      ? { ...prev, equipment: prev.equipment.map((d) => (d.id === dev.id ? dev : d)) }
                      : prev
                  )
                }
              />
            </div>
          )}

          {activeTab === 'exercises' && currentUser.role !== 'client' && (
            <ExercisesLibraryView
              currentUser={currentUser}
              exercises={data.exercises}
              programs={data.programs}
              clients={data.clients}
              readOnly={false}
              onExerciseAdded={(ex) =>
                setData((prev) => {
                  if (!prev) return prev;
                  if (prev.exercises.some((item) => item.id === ex.id)) return prev;
                  return { ...prev, exercises: [ex, ...prev.exercises] };
                })
              }
              onExerciseUpdated={(ex) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        exercises: prev.exercises.map((item) =>
                          item.id === ex.id ? ex : item
                        ),
                      }
                    : prev
                )
              }
              onExerciseDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        exercises: prev.exercises.filter((item) => item.id !== id),
                        programs: prev.programs.map((prog) => ({
                          ...prog,
                          exerciseIds: prog.exerciseIds.filter((eid) => eid !== id),
                        })),
                      }
                    : prev
                )
              }
              onProgramAdded={(prog) =>
                setData((prev) => {
                  if (!prev) return prev;
                  if (prev.programs.some((item) => item.id === prog.id)) return prev;
                  return { ...prev, programs: [prog, ...prev.programs] };
                })
              }
              onProgramUpdated={(prog) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        programs: prev.programs.map((item) =>
                          item.id === prog.id ? prog : item
                        ),
                      }
                    : prev
                )
              }
              onProgramDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        programs: prev.programs.filter((item) => item.id !== id),
                      }
                    : prev
                )
              }
              onLaunchProgramInSession={(programId) => {
                setActiveProgramIdForSession(programId);
                setActiveTab('session');
              }}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsDatabaseView
              studios={data.studios}
              selectedStudioId={selectedStudioId}
              clients={data.clients}
              sessions={data.sessions}
              clientSubscriptions={data.clientSubscriptions}
              users={data.users}
              currentUser={currentUser}
              scaleDevice={data.equipment.find((d) => d.type === 'xiaomi_scale')}
              onDeviceUpdated={(dev) =>
                setData((prev) =>
                  prev
                    ? { ...prev, equipment: prev.equipment.map((d) => (d.id === dev.id ? dev : d)) }
                    : prev
                )
              }
              onClientAdded={(cl) =>
                setData((prev) => (prev ? { ...prev, clients: [cl, ...prev.clients] } : prev))
              }
              onClientUpdated={(cl) =>
                setData((prev) =>
                  prev
                    ? { ...prev, clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)) }
                    : prev
                )
              }
              onClientTransferred={() => loadAppState(currentUser)}
              onAnthropometryAdded={(clientId, rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.some((a) => a.id === rec.id)
                                  ? c.anthropometry
                                  : [...c.anthropometry, rec],
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onAnthropometryUpdated={(clientId, rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.map((a) =>
                                  a.id === rec.id ? rec : a
                                ),
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onAnthropometryDeleted={(clientId, recId) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.filter((a) => a.id !== recId),
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onNoteAdded={(clientId, note) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId ? { ...c, notes: [note, ...c.notes] } : c
                        ),
                      }
                    : prev
                )
              }
              onOpenInSession={(clientId) => {
                const cl = data.clients.find((c) => c.id === clientId);
                if (cl) {
                  setActiveBookingForSession({
                    id: '',
                    studioId: cl.studioId,
                    clientId: cl.id,
                    clientName: cl.name,
                    trainerId: cl.assignedTrainerId || currentUser.id,
                    trainerName: cl.assignedTrainerName || currentUser.name,
                    serviceId: data.services[0]?.id || '',
                    serviceName: data.services[0]?.name || 'Сессия',
                    priceRub: 4200,
                    date: new Date().toISOString().slice(0, 10),
                    time: '12:00',
                    durationMin: 60,
                    status: 'in_progress',
                    paymentStatus: 'unpaid',
                    finalAmountRub: 4200,
                    createdAt: new Date().toISOString().slice(0, 10),
                  });
                }
                setActiveTab('session');
              }}
            />
          )}

          {activeTab === 'equipment' && (
            <EquipmentHardwareView
              equipment={data.equipment}
              clients={data.clients}
              onDeviceUpdated={(dev) =>
                setData((prev) =>
                  prev
                    ? { ...prev, equipment: prev.equipment.map((d) => (d.id === dev.id ? dev : d)) }
                    : prev
                )
              }
              onSyncClientReading={async (clientId, payload) => {
                const rec = await apiRequest<ClientProfile['anthropometry'][number]>(
                  `/api/clients/${clientId}/anthropometry`,
                  {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  }
                );
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? { ...c, anthropometry: [...c.anthropometry, rec] }
                            : c
                        ),
                      }
                    : prev
                );
              }}
            />
          )}

          {activeTab === 'services' && (
            <ServicesPromosSubsView
              studios={data.studios}
              clients={data.clients}
              services={data.services}
              promos={data.promos}
              subscriptionPlans={data.subscriptionPlans}
              clientSubscriptions={data.clientSubscriptions}
              subscriptionUsages={data.subscriptionUsages}
              onServiceAdded={(srv) =>
                setData((prev) => (prev ? { ...prev, services: [...prev.services, srv] } : prev))
              }
              onServiceUpdated={(srv) =>
                setData((prev) =>
                  prev
                    ? { ...prev, services: prev.services.map((s) => (s.id === srv.id ? srv : s)) }
                    : prev
                )
              }
              onServiceDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? { ...prev, services: prev.services.filter((s) => s.id !== id) }
                    : prev
                )
              }
              onPromoAdded={(pr) =>
                setData((prev) => (prev ? { ...prev, promos: [...prev.promos, pr] } : prev))
              }
              onPromoUpdated={(pr) =>
                setData((prev) =>
                  prev
                    ? { ...prev, promos: prev.promos.map((p) => (p.id === pr.id ? pr : p)) }
                    : prev
                )
              }
              onSubscriptionPlanAdded={(pl) =>
                setData((prev) =>
                  prev ? { ...prev, subscriptionPlans: [...prev.subscriptionPlans, pl] } : prev
                )
              }
              onSubscriptionPlanUpdated={(pl) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        subscriptionPlans: prev.subscriptionPlans.map((item) =>
                          item.id === pl.id ? pl : item
                        ),
                      }
                    : prev
                )
              }
              onSubscriptionPlanDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        subscriptionPlans: prev.subscriptionPlans.filter((item) => item.id !== id),
                      }
                    : prev
                )
              }
              onSubscriptionIssued={() => loadAppState(currentUser)}
              onSubscriptionUpdated={() => loadAppState(currentUser)}
              onSubscriptionDeleted={() => loadAppState(currentUser)}
              onSubscriptionsBulkCleanup={() => loadAppState(currentUser)}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsCenterView
              currentUser={currentUser}
              studios={data.studios}
              clients={data.clients}
              bookings={data.bookings}
              promos={data.promos}
              clientSubscriptions={data.clientSubscriptions}
              templates={data.templates}
              logs={data.notificationLogs}
              messagingSettings={data.messagingSettings}
              messengerMessages={data.messengerMessages || []}
              birthdayAutomationEnabled={data.birthdayAutomationEnabled}
              legalAcceptances={data.legalAcceptances || []}
              brandName={data.brandAbout?.brandName}
              onLegalAccepted={({ user, record }) => {
                setCurrentUser(user);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                      }
                    : prev
                );
              }}
              onLegalMarkedRead={(rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        legalAcceptances: (prev.legalAcceptances || []).map((r) =>
                          r.id === rec.id ? rec : r
                        ),
                      }
                    : prev
                )
              }
              onBirthdayAutomationToggle={(enabled) =>
                setData((prev) =>
                  prev ? { ...prev, birthdayAutomationEnabled: enabled } : prev
                )
              }
              onTemplateAdded={(tpl) =>
                setData((prev) => (prev ? { ...prev, templates: [tpl, ...prev.templates] } : prev))
              }
              onLogsAdded={(newLogs) =>
                setData((prev) =>
                  prev
                    ? { ...prev, notificationLogs: [...newLogs, ...prev.notificationLogs] }
                    : prev
                )
              }
              onMessagingSettingsUpdated={(s) =>
                setData((prev) => (prev ? { ...prev, messagingSettings: s } : prev))
              }
              onMessengerMessageAdded={(mmsg) =>
                setData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.messengerMessages || [];
                  if (existing.some((x) => x.id === mmsg.id)) return prev;
                  return { ...prev, messengerMessages: [...existing, mmsg] };
                })
              }
              onMessengerMarkedRead={(clId) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        messengerMessages: (prev.messengerMessages || []).map((m) =>
                          !clId || m.clientId === clId ? { ...m, readByAdmin: true } : m
                        ),
                      }
                    : prev
                )
              }
              onOpenPublicBookingPreview={(query) => {
                window.history.replaceState({}, '', `/${query}`);
                setPublicBookingMode(true);
              }}
            />
          )}

          {activeTab === 'trainer_portal' && currentUser.role !== 'admin' && currentUser.role !== 'client' && (
            <TrainerMobilePortalView
              currentUser={currentUser}
              studios={data.studios}
              users={data.users}
              schedules={data.schedules}
              clients={data.clients}
              bookings={data.bookings}
              sessions={data.sessions}
              exercises={data.exercises}
              programs={data.programs}
              clientSubscriptions={data.clientSubscriptions}
              trainerPosts={data.trainerPosts || []}
              reviews={data.reviews || []}
              brandName={data.brandAbout?.brandName}
              onLegalAccepted={({ user, record }) => {
                setCurrentUser(user);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                      }
                    : prev
                );
              }}
              scaleDevice={data.equipment.find((d) => d.type === 'xiaomi_scale')}
              onDeviceUpdated={(dev) =>
                setData((prev) =>
                  prev
                    ? { ...prev, equipment: prev.equipment.map((d) => (d.id === dev.id ? dev : d)) }
                    : prev
                )
              }
              onClientUpdated={(cl) =>
                setData((prev) =>
                  prev
                    ? { ...prev, clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)) }
                    : prev
                )
              }
              onClientTransferred={() => loadAppState(currentUser)}
              onCurrentUserUpdated={(u) => {
                setCurrentUser(u);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((item) => (item.id === u.id ? u : item)),
                      }
                    : prev
                );
              }}
              onUserUpdated={(u) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((item) => (item.id === u.id ? u : item)),
                      }
                    : prev
                )
              }
              onAnthropometryAdded={(clientId, rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.some((a) => a.id === rec.id)
                                  ? c.anthropometry
                                  : [...c.anthropometry, rec],
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onAnthropometryUpdated={(clientId, rec) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.map((a) =>
                                  a.id === rec.id ? rec : a
                                ),
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onAnthropometryDeleted={(clientId, recId) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId
                            ? {
                                ...c,
                                anthropometry: c.anthropometry.filter((a) => a.id !== recId),
                              }
                            : c
                        ),
                      }
                    : prev
                )
              }
              onBookingUpdated={(bk) =>
                setData((prev) =>
                  prev
                    ? { ...prev, bookings: prev.bookings.map((x) => (x.id === bk.id ? bk : x)) }
                    : prev
                )
              }
              onExerciseAdded={(ex) =>
                setData((prev) => {
                  if (!prev) return prev;
                  if (prev.exercises.some((item) => item.id === ex.id)) return prev;
                  return { ...prev, exercises: [ex, ...prev.exercises] };
                })
              }
              onExerciseUpdated={(ex) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        exercises: prev.exercises.map((item) =>
                          item.id === ex.id ? ex : item
                        ),
                      }
                    : prev
                )
              }
              onExerciseDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        exercises: prev.exercises.filter((item) => item.id !== id),
                        programs: prev.programs.map((prog) => ({
                          ...prog,
                          exerciseIds: prog.exerciseIds.filter((eid) => eid !== id),
                        })),
                      }
                    : prev
                )
              }
              onProgramAdded={(prog) =>
                setData((prev) =>
                  prev ? { ...prev, programs: [prog, ...prev.programs] } : prev
                )
              }
              onProgramUpdated={(prog) =>
                setData((prev) =>
                  prev
                    ? { ...prev, programs: prev.programs.map((p) => (p.id === prog.id ? prog : p)) }
                    : prev
                )
              }
              onProgramDeleted={(id) =>
                setData((prev) =>
                  prev ? { ...prev, programs: prev.programs.filter((p) => p.id !== id) } : prev
                )
              }
              onNoteAdded={(clientId, note) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clients: prev.clients.map((c) =>
                          c.id === clientId ? { ...c, notes: [note, ...c.notes] } : c
                        ),
                      }
                    : prev
                )
              }
              onPostAdded={(post) =>
                setData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.trainerPosts || [];
                  if (existing.some((x) => x.id === post.id)) return prev;
                  return { ...prev, trainerPosts: [post, ...existing] };
                })
              }
              onPostUpdated={(post) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        trainerPosts: (prev.trainerPosts || []).map((p) =>
                          p.id === post.id ? post : p
                        ),
                      }
                    : prev
                )
              }
              onPostDeleted={(id) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        trainerPosts: (prev.trainerPosts || []).filter((p) => p.id !== id),
                      }
                    : prev
                )
              }
              onStartLiveSession={(bk) => {
                setActiveBookingForSession(bk);
                setActiveTab('session');
              }}
              onLaunchProgramInSession={(programId) => {
                setActiveProgramIdForSession(programId);
                setActiveTab('session');
              }}
            />
          )}

          {activeTab === 'client_portal' && currentUser.role !== 'admin' && currentUser.role !== 'trainer' && (
            <ClientMobilePortalView
              currentUser={currentUser}
              studios={data.studios}
              trainers={data.users.filter((u) => u.role === 'trainer')}
              services={data.services}
              client={data.clients[0]}
              bookings={data.bookings}
              sessions={data.sessions}
              subscriptions={data.clientSubscriptions}
              notifications={data.notificationLogs}
              messengerMessages={(data.messengerMessages || []).filter(
                (m) => !data.clients[0] || m.clientId === data.clients[0].id
              )}
              trainerPosts={(data.trainerPosts || []).filter(
                (p) => p.status === 'published'
              )}
              reviews={data.reviews || []}
              brandAbout={data.brandAbout}
              onBookingCreated={(bk) =>
                setData((prev) => (prev ? { ...prev, bookings: [bk, ...prev.bookings] } : prev))
              }
              onMessengerMessageAdded={(mmsg) =>
                setData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.messengerMessages || [];
                  if (existing.some((x) => x.id === mmsg.id)) return prev;
                  return { ...prev, messengerMessages: [...existing, mmsg] };
                })
              }
              onReviewSaved={(rev) =>
                setData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.reviews || [];
                  const has = existing.some((r) => r.id === rev.id);
                  return {
                    ...prev,
                    reviews: has
                      ? existing.map((r) => (r.id === rev.id ? rev : r))
                      : [rev, ...existing],
                  };
                })
              }
              onCurrentUserUpdated={(u) => {
                setCurrentUser(u);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((item) => (item.id === u.id ? u : item)),
                      }
                    : prev
                );
              }}
              onClientUpdated={(cl) =>
                setData((prev) =>
                  prev
                    ? { ...prev, clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)) }
                    : prev
                )
              }
              onLegalAccepted={({ user, record }) => {
                setCurrentUser(user);
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                      }
                    : prev
                );
              }}
            />
          )}
        </main>
      </div>
      </div>

      {/* Top-Right Non-Blocking Interactive Dialog for Uninterrupted Active Session */}
      {activeSessionBanner.active && activeTab !== 'session' && (
        <div
          role="dialog"
          aria-label="Продолжается тренировка"
          className="fixed top-16 right-4 z-[55] w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-white border border-emerald-400/50 p-3.5 shadow-2xl backdrop-blur-md space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold tracking-wide text-emerald-300 truncate">
                Продолжается тренировка
              </span>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-cyan-300 shrink-0">
              {String(Math.floor(activeSessionBanner.sessionElapsedSec / 60)).padStart(2, '0')}:
              {String(activeSessionBanner.sessionElapsedSec % 60).padStart(2, '0')}
            </span>
          </div>

          <div className="text-[11px] text-slate-200 leading-snug space-y-0.5">
            <div className="font-semibold truncate">{activeSessionBanner.clientName}</div>
            <div className="text-slate-400 truncate">
              {activeSessionBanner.exerciseTitle} · запись данных идёт в фоне
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('session')}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>К тренировке</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('session');
                setFinishSessionSignal((s) => s + 1);
              }}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-400/50 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 text-[11px] font-semibold cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Окончить</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Push Notification Toast */}
      {pushToast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-xl st-hero-gradient text-white border border-white/20 p-4 shadow-xl space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              <Bell className="w-3.5 h-3.5" />
              <span>{pushToast.subject}</span>
            </div>
            <button
              type="button"
              onClick={() => setPushToast(null)}
              className="text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-white/90 leading-relaxed">{pushToast.messagePreview}</p>
        </div>
      )}

      {/* Profile & Appearance Settings Modal */}
      {showSettings && (
        <ProfileSettingsModal
          currentUser={currentUser}
          users={data.users}
          studios={data.studios}
          clientProfile={data.clients.find((c) => c.userId === currentUser.id)}
          brandAbout={data.brandAbout}
          theme={theme}
          styleTheme={styleTheme}
          bgImage={bgImage}
          bgOpacity={bgOpacity}
          onToggleTheme={setTheme}
          onSelectStyleTheme={setStyleTheme}
          onChangeBgImage={setBgImage}
          onChangeBgOpacity={setBgOpacity}
          onCurrentUserUpdated={(u) => {
            setCurrentUser(u);
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    users: prev.users.map((item) => (item.id === u.id ? u : item)),
                  }
                : prev
            );
          }}
          onClientUpdated={(cl) =>
            setData((prev) =>
              prev
                ? { ...prev, clients: prev.clients.map((c) => (c.id === cl.id ? cl : c)) }
                : prev
            )
          }
          onBrandAboutUpdated={(ba) => {
            setPublicBrandAbout(ba);
            setData((prev) => (prev ? { ...prev, brandAbout: ba } : prev));
          }}
          onUserCreated={(u) =>
            setData((prev) => (prev ? { ...prev, users: [...prev.users, u] } : prev))
          }
          onUserUpdated={(u) =>
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    users: prev.users.map((item) => (item.id === u.id ? u : item)),
                  }
                : prev
            )
          }
          onPushPermissionChange={setPushPermission}
          onLegalAccepted={({ user, record }) => {
            setCurrentUser(user);
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    users: prev.users.map((u) => (u.id === user.id ? user : u)),
                    legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                  }
                : prev
            );
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Mandatory First-Login Legal Agreements & Read Confirmation Modal (Admin, Trainer, Client) */}
      {(userNeedsLegalAcceptance(currentUser, data.legalBundleVersion) || showLegalModal) && (
        <LegalAgreementsModal
          role={currentUser.role}
          currentUser={currentUser}
          mandatoryMode={userNeedsLegalAcceptance(currentUser, data.legalBundleVersion)}
          brandName={data.brandAbout?.brandName}
          customDocuments={data.legalDocuments}
          bundleVersion={data.legalBundleVersion}
          onAccepted={({ user, record }) => {
            setCurrentUser(user);
            setShowLegalModal(false);
            setLegalSuccessNotice(
              `Юридические соглашения приняты (${record.readConfirmedAt}). Подтверждение ознакомления отправлено владельцу студии.`
            );
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    users: prev.users.map((item) => (item.id === user.id ? user : item)),
                    legalAcceptances: [record, ...(prev.legalAcceptances || [])],
                  }
                : prev
            );
          }}
          onClose={() => {
            if (!userNeedsLegalAcceptance(currentUser, data.legalBundleVersion)) {
              setShowLegalModal(false);
            }
          }}
        />
      )}

      {/* First-login Staff Push Notification Permission Prompt (after Legal Agreements accepted) */}
      {showStaffPushPrompt &&
        isStaffRole(currentUser.role) &&
        !userNeedsLegalAcceptance(currentUser, data.legalBundleVersion) && (
        <StaffPushPromptModal
          user={currentUser}
          onPermissionUpdated={(perm) => setPushPermission(perm)}
          onClose={() => setShowStaffPushPrompt(false)}
        />
      )}

      <DesktopBlePickerModal />
      <OfflineIndicator />
    </div>
  );
}
