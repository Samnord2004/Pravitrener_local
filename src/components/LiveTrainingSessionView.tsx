import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  CheckCircle2,
  SkipForward,
  Flag,
  FileDown,
  BatteryCharging,
  Wifi,
  HeartPulse,
  Activity,
  Scale,
  Cpu,
  Gauge,
  SlidersHorizontal,
  CreditCard,
  AlertTriangle,
  Bluetooth,
  Loader2,
  Usb,
  Unplug,
  RotateCcw,
  Lock,
  Unlock,
  Move,
  Minus,
  Plus,
  Type,
} from 'lucide-react';
import type {
  Booking,
  ClientProfile,
  ClientSubscription,
  CompletedExerciseLog,
  EquipmentDevice,
  Exercise,
  PaymentStatus,
  PromoCode,
  Studio,
  TelemetryPoint,
  TrainingSessionRecord,
  UserAccount,
  WorkoutProgram,
} from '../types';
import { apiRequest } from '../utils/api';
import {
  getHardwareCapabilities,
  measureBloodPressureBle,
  measureBloodPressureNative,
} from '../utils/bluetooth';
import {
  connectRealHardwareDevice,
  disconnectRealHardwareDevice,
  useHardwareTelemetry,
} from '../utils/hardwareManager';
import { NativeBluetoothModal } from './NativeBluetoothModal';
import { exportSessionReportPdf } from '../utils/pdfReport';
import {
  computeProgramDifficulty,
  inferExerciseDifficulty,
} from '../utils/serviceCategories';
import { DifficultyStars } from './DifficultyStars';
import { VolumetricPulseHeart } from './VolumetricPulseHeart';
import { ExerciseFeedbackModal, type PendingExerciseStats } from './ExerciseFeedbackModal';
import { SessionReportModal } from './SessionReportModal';

export interface ActiveLiveSessionBannerState {
  active: boolean;
  clientName: string;
  programTitle: string;
  exerciseTitle: string;
  sessionElapsedSec: number;
  isRunning: boolean;
}

interface LiveSessionProps {
  currentUser: UserAccount;
  users?: UserAccount[];
  studios: Studio[];
  clients: ClientProfile[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  equipment: EquipmentDevice[];
  clientSubscriptions: ClientSubscription[];
  promos: PromoCode[];
  activeBooking: Booking | null;
  initialProgramId?: string | null;
  openFinishModalSignal?: number;
  onActiveSessionStateChange?: (state: ActiveLiveSessionBannerState) => void;
  onSessionSaved: (session: TrainingSessionRecord) => void;
  onClientUpdated?: (client: ClientProfile) => void;
  onDeviceUpdated: (device: EquipmentDevice) => void;
}

interface PinOffsets {
  rh: { x: number; y: number };
  lh: { x: number; y: number };
  rf: { x: number; y: number };
  lf: { x: number; y: number };
  heart: { x: number; y: number };
}

// Изображения фронтальные: правая сторона клиента находится слева на схеме, левая — справа
const DEFAULT_PINS: PinOffsets = {
  rh: { x: 22, y: 18 },
  lh: { x: 78, y: 18 },
  rf: { x: 26, y: 83 },
  lf: { x: 74, y: 83 },
  heart: { x: 52, y: 36 },
};

const PIN_LABELS: Record<keyof PinOffsets, string> = {
  rh: 'Пр. рук',
  lh: 'Лев. рук',
  rf: 'Пр. ног',
  lf: 'Лев. ног',
  heart: 'Сердце',
};

interface LiveSessionLayoutPrefs {
  leftWidthPx: number;
  rightWidthPx: number;
  lowerHeightPx: number;
  bottomLeftPct: number;
  fontScale: number;
}

const DEFAULT_LAYOUT_PREFS: LiveSessionLayoutPrefs = {
  leftWidthPx: 276,
  rightWidthPx: 288,
  lowerHeightPx: 230,
  bottomLeftPct: 58,
  fontScale: 1,
};

const clampNum = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const sanitizePins = (raw?: Partial<PinOffsets> | null): PinOffsets => {
  const fix = (key: keyof PinOffsets) => ({
    x: Number(clampNum(raw?.[key]?.x, 3, 97, DEFAULT_PINS[key].x).toFixed(1)),
    y: Number(clampNum(raw?.[key]?.y, 3, 97, DEFAULT_PINS[key].y).toFixed(1)),
  });
  return {
    rh: fix('rh'),
    lh: fix('lh'),
    rf: fix('rf'),
    lf: fix('lf'),
    heart: fix('heart'),
  };
};

const layoutStorageKey = (userId: string) => `etalon_live_session_layout_v1:${userId || 'default'}`;
const pinsStorageKey = (userId: string) => `etalon_live_session_pins_v1:${userId || 'default'}`;

function loadLayoutPrefs(userId: string): LiveSessionLayoutPrefs {
  try {
    const raw = localStorage.getItem(layoutStorageKey(userId));
    if (!raw) return DEFAULT_LAYOUT_PREFS;
    const parsed = JSON.parse(raw) as Partial<LiveSessionLayoutPrefs>;
    return {
      leftWidthPx: Math.round(clampNum(parsed.leftWidthPx, 210, 540, DEFAULT_LAYOUT_PREFS.leftWidthPx)),
      rightWidthPx: Math.round(clampNum(parsed.rightWidthPx, 210, 540, DEFAULT_LAYOUT_PREFS.rightWidthPx)),
      lowerHeightPx: Math.round(clampNum(parsed.lowerHeightPx, 155, 480, DEFAULT_LAYOUT_PREFS.lowerHeightPx)),
      bottomLeftPct: Number(clampNum(parsed.bottomLeftPct, 28, 74, DEFAULT_LAYOUT_PREFS.bottomLeftPct).toFixed(1)),
      fontScale: Number(clampNum(parsed.fontScale, 0.85, 1.5, DEFAULT_LAYOUT_PREFS.fontScale).toFixed(2)),
    };
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}

function saveLayoutPrefs(userId: string, prefs: LiveSessionLayoutPrefs) {
  try {
    localStorage.setItem(layoutStorageKey(userId), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota issues
  }
}

function loadPinPrefs(userId: string): { pins: PinOffsets; heartLocked: boolean } {
  try {
    const raw = localStorage.getItem(pinsStorageKey(userId));
    if (!raw) return { pins: DEFAULT_PINS, heartLocked: true };
    const parsed = JSON.parse(raw) as { pins?: Partial<PinOffsets>; heartLocked?: boolean };
    return {
      pins: sanitizePins(parsed.pins),
      heartLocked: typeof parsed.heartLocked === 'boolean' ? parsed.heartLocked : true,
    };
  } catch {
    return { pins: DEFAULT_PINS, heartLocked: true };
  }
}

function savePinPrefs(userId: string, pins: PinOffsets, heartLocked: boolean) {
  try {
    localStorage.setItem(pinsStorageKey(userId), JSON.stringify({ pins, heartLocked }));
  } catch {
    // Ignore storage quota issues
  }
}

function playCountdownDoneTone() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = offset === 0 ? 740 : 988;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.19);
    });
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Audio playback optional
  }
}

export const LiveTrainingSessionView: React.FC<LiveSessionProps> = ({
  currentUser,
  users = [],
  studios,
  clients,
  exercises,
  programs,
  equipment,
  clientSubscriptions,
  promos,
  activeBooking,
  initialProgramId,
  openFinishModalSignal,
  onActiveSessionStateChange,
  onSessionSaved,
  onClientUpdated,
  onDeviceUpdated,
}) => {
  const activeTrainers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === 'trainer' &&
          u.active !== false &&
          u.employmentStatus !== 'fired' &&
          u.ownerApproved !== false
      ),
    [users]
  );

  const [selectedClientId, setSelectedClientId] = useState(
    activeBooking?.clientId || clients[0]?.id || ''
  );
  const [sessionStudioId, setSessionStudioId] = useState(
    activeBooking?.studioId ||
      clients.find((c) => c.id === (activeBooking?.clientId || clients[0]?.id))?.studioId ||
      currentUser.studioId ||
      studios[0]?.id ||
      ''
  );
  const [sessionTrainerId, setSessionTrainerId] = useState(
    activeBooking?.trainerId ||
      (currentUser.role === 'trainer'
        ? currentUser.id
        : clients.find((c) => c.id === (activeBooking?.clientId || clients[0]?.id))
            ?.assignedTrainerId || currentUser.id)
  );
  const [assignTrainerAndStudio, setAssignTrainerAndStudio] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'program' | 'exercise'>('program');
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id || '');
  const [exerciseIndex, setExerciseIndex] = useState(0);

  // Live Transport & Session Lifecycle State (remains active across tab switches until "Окончить")
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartedAtIso, setSessionStartedAtIso] = useState<string>('');
  const [exerciseState, setExerciseState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [exerciseTargetSec, setExerciseTargetSec] = useState<number>(120);
  const [exerciseRemainingSec, setExerciseRemainingSec] = useState<number>(120);
  const [timerExpired, setTimerExpired] = useState(false);
  const [exerciseElapsedSec, setExerciseElapsedSec] = useState(0);
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);
  const [targetWinchKg, setTargetWinchKg] = useState(120);
  const [completedExercises, setCompletedExercises] = useState<CompletedExerciseLog[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');

  // Measurements start EMPTY (never pre-filled) so trainer/equipment records actual values
  const [bpBefore, setBpBefore] = useState('');
  const [bpAfter, setBpAfter] = useState('');
  const [heightBeforeCm, setHeightBeforeCm] = useState<string>('');
  const [heightAfterCm, setHeightAfterCm] = useState<string>('');
  const [weightBeforeKg, setWeightBeforeKg] = useState<string>('');
  const [weightAfterKg, setWeightAfterKg] = useState<string>('');
  const [postureBeforeSummary, setPostureBeforeSummary] = useState<string>('');
  const [postureAfterSummary, setPostureAfterSummary] = useState<string>('');

  const [bpMeasuringPhase, setBpMeasuringPhase] = useState<'before' | 'after' | null>(null);
  const [bpBleStatus, setBpBleStatus] = useState<{
    phase: 'before' | 'after';
    sys?: number;
    dia?: number;
    map?: number;
    pulse?: number;
    mode?: 'web_bluetooth' | 'native_bluetooth';
    deviceName?: string;
    measuredAt?: string;
    progressMsg?: string;
    error?: string;
  } | null>(null);
  const [sensorBusyId, setSensorBusyId] = useState<string | null>(null);
  const [sensorStatusMsg, setSensorStatusMsg] = useState<string>('');
  const [nativePickerTarget, setNativePickerTarget] = useState<{
    device: EquipmentDevice;
    bpPhase?: 'before' | 'after';
  } | null>(null);

  // Pin Alignment Calibration & Persistent Heart Position
  const [showPinTuner, setShowPinTuner] = useState(false);
  const [pins, setPins] = useState<PinOffsets>(() => loadPinPrefs(currentUser.id).pins);
  const [heartLocked, setHeartLocked] = useState<boolean>(
    () => loadPinPrefs(currentUser.id).heartLocked
  );
  const [isDraggingHeart, setIsDraggingHeart] = useState(false);

  // Resizable Windows & Proportional Font Scale Preferences (persisted per user)
  const [layoutPrefs, setLayoutPrefs] = useState<LiveSessionLayoutPrefs>(() =>
    loadLayoutPrefs(currentUser.id)
  );
  const [activeResize, setActiveResize] = useState<'left' | 'right' | 'lower' | 'bottomSplit' | null>(
    null
  );

  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const upperBandRef = useRef<HTMLDivElement | null>(null);
  const lowerBandRef = useRef<HTMLDivElement | null>(null);
  const silhouetteBoxRef = useRef<HTMLDivElement | null>(null);

  const loadedUserIdRef = useRef(currentUser.id);
  useEffect(() => {
    if (loadedUserIdRef.current !== currentUser.id) {
      loadedUserIdRef.current = currentUser.id;
      const pinData = loadPinPrefs(currentUser.id);
      setPins(pinData.pins);
      setHeartLocked(pinData.heartLocked);
      setLayoutPrefs(loadLayoutPrefs(currentUser.id));
    }
  }, [currentUser.id]);

  useEffect(() => {
    savePinPrefs(currentUser.id, pins, heartLocked);
  }, [currentUser.id, pins, heartLocked]);

  useEffect(() => {
    saveLayoutPrefs(currentUser.id, layoutPrefs);
  }, [currentUser.id, layoutPrefs]);

  const startPanelResize = (
    mode: 'left' | 'right' | 'lower' | 'bottomSplit',
    e: React.PointerEvent
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPrefs = layoutPrefs;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;

    setActiveResize(mode);
    document.body.style.cursor = mode === 'lower' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (mode === 'left') {
        const upperW = upperBandRef.current?.clientWidth || 1200;
        const maxLeft = Math.max(240, upperW - startPrefs.rightWidthPx - 260);
        const nextLeft = Math.round(clampNum(startPrefs.leftWidthPx + dx, 210, maxLeft, startPrefs.leftWidthPx));
        setLayoutPrefs((prev) => ({ ...prev, leftWidthPx: nextLeft }));
      } else if (mode === 'right') {
        const upperW = upperBandRef.current?.clientWidth || 1200;
        const maxRight = Math.max(240, upperW - startPrefs.leftWidthPx - 260);
        const nextRight = Math.round(clampNum(startPrefs.rightWidthPx - dx, 210, maxRight, startPrefs.rightWidthPx));
        setLayoutPrefs((prev) => ({ ...prev, rightWidthPx: nextRight }));
      } else if (mode === 'lower') {
        const rootH = rootContainerRef.current?.clientHeight || 820;
        const maxLower = Math.max(240, rootH - 250);
        const nextLower = Math.round(clampNum(startPrefs.lowerHeightPx - dy, 155, maxLower, startPrefs.lowerHeightPx));
        setLayoutPrefs((prev) => ({ ...prev, lowerHeightPx: nextLower }));
      } else if (mode === 'bottomSplit') {
        const lowerW = lowerBandRef.current?.clientWidth || 1000;
        const deltaPct = (dx / Math.max(320, lowerW)) * 100;
        const nextPct = Number(clampNum(startPrefs.bottomLeftPct + deltaPct, 28, 74, startPrefs.bottomLeftPct).toFixed(1));
        setLayoutPrefs((prev) => ({ ...prev, bottomLeftPct: nextPct }));
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      setActiveResize(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const startHeartDrag = (e: React.PointerEvent) => {
    if (heartLocked) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const box = silhouetteBoxRef.current;
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    setIsDraggingHeart(true);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const updateFromClientPos = (clientX: number, clientY: number) => {
      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Number(clampNum(((clientX - rect.left) / rect.width) * 100, 4, 96, 52).toFixed(1));
      const y = Number(clampNum(((clientY - rect.top) / rect.height) * 100, 5, 95, 36).toFixed(1));
      setPins((prev) => ({ ...prev, heart: { x, y } }));
    };

    const onMove = (moveEvent: PointerEvent) => {
      updateFromClientPos(moveEvent.clientX, moveEvent.clientY);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      setIsDraggingHeart(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  // Real Live Sensor Telemetry from connected physical hardware
  const liveSensors = useHardwareTelemetry();
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [sessionTelemetrySeries, setSessionTelemetrySeries] = useState<TelemetryPoint[]>([]);
  const tickRef = useRef(0);

  // Exercise Feedback & Report Modals
  const [pendingFeedback, setPendingFeedback] = useState<{
    stats: PendingExerciseStats;
    advanceNext?: boolean;
    finishSession?: boolean;
  } | null>(null);
  const [showSavedReportModal, setShowSavedReportModal] = useState(false);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentStatus>('paid_card');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [baseAmountRub, setBaseAmountRub] = useState(activeBooking?.finalAmountRub || 4200);
  const [savingSession, setSavingSession] = useState(false);
  const [lastSavedReport, setLastSavedReport] = useState<TrainingSessionRecord | null>(null);

  // Real-time Min/Max accumulators for current exercise & entire session
  const makeEmptyExAcc = () => ({
    hasLoad: false,
    minWinchKg: Infinity,
    maxWinchKg: 0,
    minLimbLoads: { lh: Infinity, rh: Infinity, lf: Infinity, rf: Infinity },
    maxLimbLoads: { lh: 0, rh: 0, lf: 0, rf: 0 },
    hasEmg: false,
    minEmg1: Infinity,
    maxEmg1: 0,
    emg1Sum: 0,
    minEmg2: Infinity,
    maxEmg2: 0,
    emg2Sum: 0,
    emgCount: 0,
  });

  const makeEmptySesAcc = () => ({
    hasLoad: false,
    minWinchKg: Infinity,
    maxWinchKg: 0,
    minLimbLoads: { lh: Infinity, rh: Infinity, lf: Infinity, rf: Infinity },
    maxLimbLoads: { lh: 0, rh: 0, lf: 0, rf: 0 },
    hasEmg: false,
    minEmg1: Infinity,
    maxEmg1: 0,
    emg1Sum: 0,
    minEmg2: Infinity,
    maxEmg2: 0,
    emg2Sum: 0,
    emgCount: 0,
    hasHr: false,
    minHr: Infinity,
    maxHr: 0,
    hrSum: 0,
    hrCount: 0,
    symSum: 0,
    symCount: 0,
  });

  const exAccRef = useRef(makeEmptyExAcc());
  const sesAccRef = useRef(makeEmptySesAcc());
  const previewAccRef = useRef(makeEmptySesAcc());
  const [, setStatsRenderTick] = useState(0);

  useEffect(() => {
    if (activeBooking && !sessionActive) {
      setSelectedClientId(activeBooking.clientId);
      setBaseAmountRub(activeBooking.finalAmountRub);
      if (activeBooking.studioId) setSessionStudioId(activeBooking.studioId);
      if (activeBooking.trainerId) {
        setSessionTrainerId(
          currentUser.role === 'trainer' ? currentUser.id : activeBooking.trainerId
        );
      }
      setAssignTrainerAndStudio(false);
    }
  }, [activeBooking, sessionActive, currentUser.role, currentUser.id]);

  useEffect(() => {
    if (initialProgramId && !sessionActive) {
      setSelectionMode('program');
      setSelectedProgramId(initialProgramId);
      setExerciseIndex(0);
    }
  }, [initialProgramId, sessionActive]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || clients[0],
    [clients, selectedClientId]
  );

  const sessionTrainer = useMemo(() => {
    if (currentUser.role === 'trainer') return currentUser;
    return (
      activeTrainers.find((t) => t.id === sessionTrainerId) ||
      users.find((u) => u.id === sessionTrainerId) ||
      currentUser
    );
  }, [currentUser, activeTrainers, users, sessionTrainerId]);

  const isCrossStudioOrNewTrainer = Boolean(
    activeClient &&
      ((sessionStudioId && sessionStudioId !== activeClient.studioId) ||
        (activeClient.assignedTrainerId && sessionTrainer.id !== activeClient.assignedTrainerId))
  );

  // Reset measurement fields when client switches (only when session isn't running) — never pre-fill BP!
  const prevClientIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!activeClient || activeClient.id === prevClientIdRef.current) return;
    prevClientIdRef.current = activeClient.id;
    if (!sessionActive) {
      setHeightBeforeCm('');
      setHeightAfterCm('');
      setWeightBeforeKg('');
      setWeightAfterKg('');
      setBpBefore('');
      setBpAfter('');
      setPostureBeforeSummary('');
      setPostureAfterSummary('');
      setBpBleStatus(null);
    }
  }, [activeClient, sessionActive]);

  const handleFillBaselineFromCard = () => {
    if (!activeClient) return;
    const latest = activeClient.anthropometry[activeClient.anthropometry.length - 1];
    if (latest) {
      const h = latest.heightAfterCm || latest.heightBeforeCm || latest.heightCm;
      if (h) setHeightBeforeCm(h.toFixed(1));
      if (latest.weightKg) setWeightBeforeKg(latest.weightKg.toFixed(1));
    }
    const latestPosture = activeClient.postureAssessments?.[activeClient.postureAssessments.length - 1];
    if (latestPosture && !postureBeforeSummary) {
      const summaryParts: string[] = [];
      if (latestPosture.kinesiologyReport?.summaryPattern) {
        summaryParts.push(latestPosture.kinesiologyReport.summaryPattern);
      } else if (latestPosture.beforeMeasurements.length > 0) {
        summaryParts.push(
          latestPosture.beforeMeasurements
            .slice(0, 3)
            .map((m) => `${m.label}: ${(m.deviationDeg ?? m.angleDeg).toFixed(1)}°`)
            .join(', ')
        );
      } else if (latestPosture.notes) {
        summaryParts.push(latestPosture.notes);
      }
      if (summaryParts.length > 0) {
        setPostureBeforeSummary(summaryParts.join(' · ').slice(0, 260));
      }
    }
  };

  const clientSubs = useMemo(
    () =>
      clientSubscriptions.filter(
        (s) => s.clientId === activeClient?.id && s.status === 'active' && s.remainingSessions > 0
      ),
    [clientSubscriptions, activeClient]
  );

  useEffect(() => {
    if (clientSubs.length > 0) {
      setSelectedSubId(clientSubs[0].id);
    } else {
      setSelectedSubId('');
    }
  }, [clientSubs]);

  const queueExercises = useMemo(() => {
    if (selectionMode === 'program') {
      const prog = programs.find((p) => p.id === selectedProgramId) || programs[0];
      if (!prog) return exercises.slice(0, 2);
      return prog.exerciseIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((x): x is Exercise => !!x);
    }
    const single = exercises.find((e) => e.id === selectedExerciseId) || exercises[0];
    return single ? [single] : [];
  }, [selectionMode, selectedProgramId, selectedExerciseId, programs, exercises]);

  const currentExercise = queueExercises[exerciseIndex] || queueExercises[0];

  const esp32Connected = liveSensors.esp32.streaming;
  const myoConnected = liveSensors.myoblue.streaming;
  const wahooConnected = liveSensors.wahoo.streaming;

  const telemetry: TelemetryPoint = useMemo(
    () => ({
      t: tickRef.current,
      leftHandKg: esp32Connected ? liveSensors.esp32.lh : 0,
      rightHandKg: esp32Connected ? liveSensors.esp32.rh : 0,
      leftFootKg: esp32Connected ? liveSensors.esp32.lf : 0,
      rightFootKg: esp32Connected ? liveSensors.esp32.rf : 0,
      totalWinchKg: esp32Connected ? liveSensors.esp32.totalKg : 0,
      heartRateBpm: wahooConnected ? liveSensors.wahoo.heartRateBpm : 0,
      emgCh1Mv: myoConnected ? liveSensors.myoblue.ch1Mv : 0,
      emgCh2Mv: myoConnected ? liveSensors.myoblue.ch2Mv : 0,
    }),
    [liveSensors, esp32Connected, myoConnected, wahooConnected]
  );

  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  // Real-Time Packet Accumulator: captures instantaneous min/max of every incoming tensometer, myo, and pulse sample
  useEffect(() => {
    const ex = exAccRef.current;
    const targetAcc = sessionActive ? sesAccRef.current : previewAccRef.current;
    let updatedAny = false;

    if (esp32Connected) {
      const { lh, rh, lf, rf, totalKg } = liveSensors.esp32;
      if (sessionActive && exerciseState === 'running') {
        ex.hasLoad = true;
        ex.minWinchKg = Math.min(ex.minWinchKg, totalKg);
        ex.maxWinchKg = Math.max(ex.maxWinchKg, totalKg);
        ex.minLimbLoads.lh = Math.min(ex.minLimbLoads.lh, lh);
        ex.minLimbLoads.rh = Math.min(ex.minLimbLoads.rh, rh);
        ex.minLimbLoads.lf = Math.min(ex.minLimbLoads.lf, lf);
        ex.minLimbLoads.rf = Math.min(ex.minLimbLoads.rf, rf);
        ex.maxLimbLoads.lh = Math.max(ex.maxLimbLoads.lh, lh);
        ex.maxLimbLoads.rh = Math.max(ex.maxLimbLoads.rh, rh);
        ex.maxLimbLoads.lf = Math.max(ex.maxLimbLoads.lf, lf);
        ex.maxLimbLoads.rf = Math.max(ex.maxLimbLoads.rf, rf);
      }
      targetAcc.hasLoad = true;
      targetAcc.minWinchKg = Math.min(targetAcc.minWinchKg, totalKg);
      targetAcc.maxWinchKg = Math.max(targetAcc.maxWinchKg, totalKg);
      targetAcc.minLimbLoads.lh = Math.min(targetAcc.minLimbLoads.lh, lh);
      targetAcc.minLimbLoads.rh = Math.min(targetAcc.minLimbLoads.rh, rh);
      targetAcc.minLimbLoads.lf = Math.min(targetAcc.minLimbLoads.lf, lf);
      targetAcc.minLimbLoads.rf = Math.min(targetAcc.minLimbLoads.rf, rf);
      targetAcc.maxLimbLoads.lh = Math.max(targetAcc.maxLimbLoads.lh, lh);
      targetAcc.maxLimbLoads.rh = Math.max(targetAcc.maxLimbLoads.rh, rh);
      targetAcc.maxLimbLoads.lf = Math.max(targetAcc.maxLimbLoads.lf, lf);
      targetAcc.maxLimbLoads.rf = Math.max(targetAcc.maxLimbLoads.rf, rf);
      if (sessionActive && totalKg > 0) {
        const left = lh + lf;
        const right = rh + rf;
        const sym = Math.max(0, Math.round((1 - Math.abs(left - right) / Math.max(left, right, 0.1)) * 100));
        targetAcc.symSum += sym;
        targetAcc.symCount += 1;
      }
      updatedAny = true;
    }

    if (myoConnected) {
      const { ch1Mv, ch2Mv } = liveSensors.myoblue;
      if (sessionActive && exerciseState === 'running') {
        ex.hasEmg = true;
        ex.minEmg1 = Math.min(ex.minEmg1, ch1Mv);
        ex.maxEmg1 = Math.max(ex.maxEmg1, ch1Mv);
        ex.emg1Sum += ch1Mv;
        ex.minEmg2 = Math.min(ex.minEmg2, ch2Mv);
        ex.maxEmg2 = Math.max(ex.maxEmg2, ch2Mv);
        ex.emg2Sum += ch2Mv;
        ex.emgCount += 1;
      }
      if (sessionActive) {
        targetAcc.hasEmg = true;
        targetAcc.minEmg1 = Math.min(targetAcc.minEmg1, ch1Mv);
        targetAcc.maxEmg1 = Math.max(targetAcc.maxEmg1, ch1Mv);
        targetAcc.emg1Sum += ch1Mv;
        targetAcc.minEmg2 = Math.min(targetAcc.minEmg2, ch2Mv);
        targetAcc.maxEmg2 = Math.max(targetAcc.maxEmg2, ch2Mv);
        targetAcc.emg2Sum += ch2Mv;
        targetAcc.emgCount += 1;
      }
      updatedAny = true;
    }

    if (wahooConnected && liveSensors.wahoo.heartRateBpm > 0) {
      const hr = liveSensors.wahoo.heartRateBpm;
      targetAcc.hasHr = true;
      targetAcc.minHr = Math.min(targetAcc.minHr, hr);
      targetAcc.maxHr = Math.max(targetAcc.maxHr, hr);
      targetAcc.hrSum += hr;
      targetAcc.hrCount += 1;
      updatedAny = true;
    }

    if (updatedAny) {
      setStatsRenderTick((n) => (n + 1) % 1000000);
    }
  }, [liveSensors, esp32Connected, myoConnected, wahooConnected, sessionActive, exerciseState]);

  // Sync countdown target duration when switching to a new exercise while idle
  const lastSyncedExerciseKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${currentExercise?.id || 'none'}-${exerciseIndex}`;
    if (key !== lastSyncedExerciseKeyRef.current && exerciseState === 'idle' && exerciseElapsedSec === 0) {
      lastSyncedExerciseKeyRef.current = key;
      const defSec = Math.max(10, currentExercise?.defaultDurationSec || 120);
      setExerciseTargetSec(defSec);
      setExerciseRemainingSec(defSec);
      setTimerExpired(false);
    }
  }, [currentExercise?.id, currentExercise?.defaultDurationSec, exerciseIndex, exerciseState, exerciseElapsedSec]);

  const applyTimerDuration = (nextTotalSec: number) => {
    const clamped = Math.max(10, Math.min(3600, Math.round(nextTotalSec)));
    setExerciseTargetSec(clamped);
    if (exerciseState === 'idle' && exerciseElapsedSec === 0) {
      setExerciseRemainingSec(clamped);
      setTimerExpired(false);
    } else {
      const rem = Math.max(0, clamped - exerciseElapsedSec);
      setExerciseRemainingSec(rem);
      setTimerExpired(rem === 0);
    }
  };

  // Session Timers (Countdown per exercise + Total Session Elapsed) + Real Sensor History Recorder
  useEffect(() => {
    const hasAnyLiveStream = esp32Connected || myoConnected || wahooConnected;
    const interval = setInterval(() => {
      tickRef.current += 1;

      if (exerciseState === 'running') {
        setExerciseElapsedSec((s) => s + 1);
        setSessionElapsedSec((s) => s + 1);
        setExerciseRemainingSec((rem) => {
          const next = Math.max(0, rem - 1);
          if (rem > 0 && next === 0) {
            setTimerExpired(true);
            playCountdownDoneTone();
          }
          return next;
        });
      }

      if (hasAnyLiveStream) {
        const point = { ...telemetryRef.current, t: tickRef.current };
        setHistory((prev) => [...prev.slice(-59), point]);
        if (sessionActive) {
          setSessionTelemetrySeries((prev) => [...prev.slice(-599), point]);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [exerciseState, sessionActive, esp32Connected, myoConnected, wahooConnected]);

  // Report active session status up to App.tsx for the top-right persistent floating dialog
  useEffect(() => {
    const prog = programs.find((p) => p.id === selectedProgramId);
    onActiveSessionStateChange?.({
      active: sessionActive,
      clientName: activeClient?.name || 'Клиент',
      programTitle:
        selectionMode === 'program'
          ? prog?.title || 'Плановая тренировка'
          : currentExercise?.title || 'Упражнение',
      exerciseTitle: currentExercise?.title || 'Упражнение',
      sessionElapsedSec,
      isRunning: exerciseState === 'running',
    });
  }, [
    sessionActive,
    activeClient?.name,
    programs,
    selectedProgramId,
    selectionMode,
    currentExercise?.title,
    sessionElapsedSec,
    exerciseState,
    onActiveSessionStateChange,
  ]);

  const safeTargetWinchKg = Math.max(10, targetWinchKg || 10);
  const loadRatio = telemetry.totalWinchKg / safeTargetWinchKg;
  const loadPct = Math.round(loadRatio * 100);
  const loadStatus: 'normal' | 'warning' | 'danger' =
    loadRatio >= 1 ? 'danger' : loadRatio >= 0.85 ? 'warning' : 'normal';

  const silhouetteSrc =
    activeClient?.gender === 'female'
      ? '/assets/aistudio/IMG_5190_59b2e751.jpeg'
      : '/assets/aistudio/IMG_5214_e2cd7709.jpeg';

  const sliderMaxKg = Math.max(2500, Math.ceil((safeTargetWinchKg * 1.15) / 50) * 50);

  const handleToggleClientGender = async (gender: 'male' | 'female') => {
    if (!activeClient || activeClient.gender === gender) return;
    const updated = await apiRequest<ClientProfile>(`/api/clients/${activeClient.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ gender }),
    });
    onClientUpdated?.(updated);
  };

  const symmetryPct = useMemo(() => {
    if (telemetry.totalWinchKg <= 0) {
      if (sesAccRef.current.symCount > 0) {
        return Math.round(sesAccRef.current.symSum / sesAccRef.current.symCount);
      }
      return 0;
    }
    const left = telemetry.leftHandKg + telemetry.leftFootKg;
    const right = telemetry.rightHandKg + telemetry.rightFootKg;
    const maxSide = Math.max(left, right, 0.1);
    const diff = Math.abs(left - right);
    return Math.max(0, Math.round((1 - diff / maxSide) * 100));
  }, [telemetry]);

  const peakWinchKg = useMemo(() => {
    return Math.max(sesAccRef.current.maxWinchKg, telemetry.totalWinchKg, ...history.map((h) => h.totalWinchKg));
  }, [telemetry, history]);

  const minWinchKg = useMemo(() => {
    if (sesAccRef.current.hasLoad && Number.isFinite(sesAccRef.current.minWinchKg)) {
      return Number(sesAccRef.current.minWinchKg.toFixed(1));
    }
    return Number(telemetry.totalWinchKg.toFixed(1));
  }, [telemetry]);

  const maxLimbLoads = useMemo(() => {
    const sMax = sesAccRef.current.maxLimbLoads;
    return {
      lh: Math.max(sMax.lh, telemetry.leftHandKg, ...history.map((h) => h.leftHandKg)),
      rh: Math.max(sMax.rh, telemetry.rightHandKg, ...history.map((h) => h.rightHandKg)),
      lf: Math.max(sMax.lf, telemetry.leftFootKg, ...history.map((h) => h.leftFootKg)),
      rf: Math.max(sMax.rf, telemetry.rightFootKg, ...history.map((h) => h.rightFootKg)),
    };
  }, [telemetry, history]);

  const minLimbLoads = useMemo(() => {
    const sMin = sesAccRef.current.minLimbLoads;
    return {
      lh: sesAccRef.current.hasLoad && Number.isFinite(sMin.lh) ? Number(sMin.lh.toFixed(1)) : 0,
      rh: sesAccRef.current.hasLoad && Number.isFinite(sMin.rh) ? Number(sMin.rh.toFixed(1)) : 0,
      lf: sesAccRef.current.hasLoad && Number.isFinite(sMin.lf) ? Number(sMin.lf.toFixed(1)) : 0,
      rf: sesAccRef.current.hasLoad && Number.isFinite(sMin.rf) ? Number(sMin.rf.toFixed(1)) : 0,
    };
  }, [telemetry]);

  const buildPendingExerciseStats = (): PendingExerciseStats | null => {
    if (!currentExercise) return null;
    const acc = exAccRef.current;
    const minW = acc.hasLoad && Number.isFinite(acc.minWinchKg) ? acc.minWinchKg : telemetry.totalWinchKg;
    const maxW = Math.max(acc.maxWinchKg, telemetry.totalWinchKg);
    const minLimb = acc.hasLoad
      ? {
          lh: Number.isFinite(acc.minLimbLoads.lh) ? acc.minLimbLoads.lh : 0,
          rh: Number.isFinite(acc.minLimbLoads.rh) ? acc.minLimbLoads.rh : 0,
          lf: Number.isFinite(acc.minLimbLoads.lf) ? acc.minLimbLoads.lf : 0,
          rf: Number.isFinite(acc.minLimbLoads.rf) ? acc.minLimbLoads.rf : 0,
        }
      : { lh: telemetry.leftHandKg, rh: telemetry.rightHandKg, lf: telemetry.leftFootKg, rf: telemetry.rightFootKg };
    const maxLimb = {
      lh: Math.max(acc.maxLimbLoads.lh, telemetry.leftHandKg),
      rh: Math.max(acc.maxLimbLoads.rh, telemetry.rightHandKg),
      lf: Math.max(acc.maxLimbLoads.lf, telemetry.leftFootKg),
      rf: Math.max(acc.maxLimbLoads.rf, telemetry.rightFootKg),
    };
    const minEmg1 = acc.hasEmg && Number.isFinite(acc.minEmg1) ? acc.minEmg1 : telemetry.emgCh1Mv;
    const avgEmg1 = acc.emgCount > 0 ? acc.emg1Sum / acc.emgCount : telemetry.emgCh1Mv;
    const maxEmg1 = Math.max(acc.maxEmg1, telemetry.emgCh1Mv);
    const minEmg2 = acc.hasEmg && Number.isFinite(acc.minEmg2) ? acc.minEmg2 : telemetry.emgCh2Mv;
    const avgEmg2 = acc.emgCount > 0 ? acc.emg2Sum / acc.emgCount : telemetry.emgCh2Mv;
    const maxEmg2 = Math.max(acc.maxEmg2, telemetry.emgCh2Mv);

    return {
      exerciseId: currentExercise.id,
      title: currentExercise.title,
      durationSec: Math.max(5, exerciseElapsedSec),
      minWinchKg: minW,
      maxWinchKg: maxW,
      minLimbLoads: minLimb,
      maxLimbLoads: maxLimb,
      minEmgMv: minEmg1,
      avgEmgMv: avgEmg1,
      maxEmgMv: maxEmg1,
      minEmgCh2Mv: minEmg2,
      avgEmgCh2Mv: avgEmg2,
      maxEmgCh2Mv: maxEmg2,
    };
  };

  const activeSilhouetteAcc = sessionActive ? sesAccRef.current : previewAccRef.current;

  const handleResetSilhouetteMinMax = () => {
    if (sessionActive) {
      sesAccRef.current = makeEmptySesAcc();
    } else {
      previewAccRef.current = makeEmptySesAcc();
    }
    setStatsRenderTick((n) => (n + 1) % 1000000);
  };

  const handleStartExercise = () => {
    if (!sessionActive) {
      setSessionActive(true);
      setSessionStartedAtIso(new Date().toISOString());
      sesAccRef.current = makeEmptySesAcc();
      previewAccRef.current = makeEmptySesAcc();
      setSessionTelemetrySeries([]);
      setCompletedExercises([]);
      setSessionElapsedSec(0);
    }
    exAccRef.current = makeEmptyExAcc();
    if (exerciseElapsedSec === 0) {
      setExerciseRemainingSec(exerciseTargetSec);
      setTimerExpired(false);
    }
    setExerciseState('running');
  };

  const handlePauseToggle = () => {
    setExerciseState((prev) => (prev === 'running' ? 'paused' : 'running'));
  };

  const handleCompleteExercise = () => {
    const stats = buildPendingExerciseStats();
    if (!stats) return;
    setExerciseState('paused');
    setPendingFeedback({ stats });
  };

  const resetForExerciseAtIndex = (nextIdx: number) => {
    const nextEx = queueExercises[nextIdx] || queueExercises[0];
    const nextSec = Math.max(10, nextEx?.defaultDurationSec || 120);
    setExerciseIndex(nextIdx);
    setExerciseElapsedSec(0);
    setExerciseTargetSec(nextSec);
    setExerciseRemainingSec(nextSec);
    setTimerExpired(false);
    exAccRef.current = makeEmptyExAcc();
  };

  const handleNextExercise = () => {
    if (exerciseElapsedSec > 0 && currentExercise) {
      const stats = buildPendingExerciseStats();
      if (stats) {
        setExerciseState('paused');
        setPendingFeedback({ stats, advanceNext: true });
        return;
      }
    }
    const nextIdx = exerciseIndex + 1 < queueExercises.length ? exerciseIndex + 1 : 0;
    resetForExerciseAtIndex(nextIdx);
    if (!sessionActive) {
      setSessionActive(true);
      setSessionStartedAtIso(new Date().toISOString());
      sesAccRef.current = makeEmptySesAcc();
      previewAccRef.current = makeEmptySesAcc();
    }
    setExerciseState('running');
  };

  const handleFinishSessionClick = () => {
    if (exerciseElapsedSec > 0 && currentExercise) {
      const stats = buildPendingExerciseStats();
      if (stats) {
        setExerciseState('paused');
        setPendingFeedback({ stats, finishSession: true });
        return;
      }
    }
    setExerciseState('idle');
    setShowPaymentModal(true);
  };

  // Allow floating top-right dialog button ("Окончить") in App.tsx to trigger finish flow
  const prevFinishSignalRef = useRef(openFinishModalSignal || 0);
  useEffect(() => {
    if (
      typeof openFinishModalSignal === 'number' &&
      openFinishModalSignal > prevFinishSignalRef.current
    ) {
      prevFinishSignalRef.current = openFinishModalSignal;
      if (sessionActive) {
        handleFinishSessionClick();
      }
    }
  }, [openFinishModalSignal, sessionActive]);

  const handleSaveExerciseFeedback = (log: CompletedExerciseLog) => {
    const advanceNext = pendingFeedback?.advanceNext;
    const finishSession = pendingFeedback?.finishSession;
    setCompletedExercises((prev) => [...prev, log]);
    setPendingFeedback(null);

    if (finishSession) {
      setExerciseElapsedSec(0);
      setTimerExpired(false);
      exAccRef.current = makeEmptyExAcc();
      setExerciseState('idle');
      setShowPaymentModal(true);
    } else if (advanceNext) {
      const nextIdx = exerciseIndex + 1 < queueExercises.length ? exerciseIndex + 1 : 0;
      resetForExerciseAtIndex(nextIdx);
      setExerciseState('running');
    } else {
      resetForExerciseAtIndex(exerciseIndex);
      setExerciseState('idle');
    }
  };

  const finalPayAmount = useMemo(() => {
    if (paymentMethod === 'paid_subscription' || paymentMethod === 'paid_certificate') {
      return 0;
    }
    const foundPromo = promos.find(
      (p) => p.code.toUpperCase() === promoCodeInput.trim().toUpperCase() && p.active
    );
    if (foundPromo) {
      return Math.round(baseAmountRub * (1 - foundPromo.discountPercent / 100));
    }
    return baseAmountRub;
  }, [paymentMethod, promos, promoCodeInput, baseAmountRub]);

  const buildSessionEmgStats = () => {
    const s = sesAccRef.current;
    if (s.hasEmg && s.emgCount > 0) {
      return {
        ch1MinMv: Number((Number.isFinite(s.minEmg1) ? s.minEmg1 : 0).toFixed(2)),
        ch1AvgMv: Number((s.emg1Sum / s.emgCount).toFixed(2)),
        ch1MaxMv: Number(s.maxEmg1.toFixed(2)),
        ch2MinMv: Number((Number.isFinite(s.minEmg2) ? s.minEmg2 : 0).toFixed(2)),
        ch2AvgMv: Number((s.emg2Sum / s.emgCount).toFixed(2)),
        ch2MaxMv: Number(s.maxEmg2.toFixed(2)),
      };
    }
    if (completedExercises.length > 0) {
      const mins1 = completedExercises.map((e) => e.minEmgMv ?? e.avgEmgMv);
      const maxs1 = completedExercises.map((e) => e.maxEmgMv ?? e.avgEmgMv);
      const avgs1 = completedExercises.map((e) => e.avgEmgMv);
      const mins2 = completedExercises.map((e) => e.minEmgCh2Mv ?? e.avgEmgCh2Mv ?? e.avgEmgMv);
      const maxs2 = completedExercises.map((e) => e.maxEmgCh2Mv ?? e.avgEmgCh2Mv ?? e.avgEmgMv);
      const avgs2 = completedExercises.map((e) => e.avgEmgCh2Mv ?? e.avgEmgMv);
      return {
        ch1MinMv: Number(Math.min(...mins1).toFixed(2)),
        ch1AvgMv: Number((avgs1.reduce((a, b) => a + b, 0) / avgs1.length).toFixed(2)),
        ch1MaxMv: Number(Math.max(...maxs1).toFixed(2)),
        ch2MinMv: Number(Math.min(...mins2).toFixed(2)),
        ch2AvgMv: Number((avgs2.reduce((a, b) => a + b, 0) / avgs2.length).toFixed(2)),
        ch2MaxMv: Number(Math.max(...maxs2).toFixed(2)),
      };
    }
    return undefined;
  };

  const handleConfirmPaymentAndSave = async () => {
    if (!activeClient) return;
    setSavingSession(true);
    try {
      const prog = programs.find((p) => p.id === selectedProgramId);
      const sesAcc = sesAccRef.current;
      const computedAvgSym =
        sesAcc.symCount > 0 ? Math.round(sesAcc.symSum / sesAcc.symCount) : symmetryPct;
      const computedAvgHr =
        sesAcc.hrCount > 0 ? Math.round(sesAcc.hrSum / sesAcc.hrCount) : telemetry.heartRateBpm;
      const computedMinHr =
        sesAcc.hasHr && Number.isFinite(sesAcc.minHr) ? Math.round(sesAcc.minHr) : undefined;
      const computedMaxHr = sesAcc.hasHr && sesAcc.maxHr > 0 ? Math.round(sesAcc.maxHr) : undefined;
      const emgStats = buildSessionEmgStats();

      const saved = await apiRequest<TrainingSessionRecord>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: activeBooking?.id,
          studioId: sessionStudioId || activeBooking?.studioId || activeClient.studioId,
          clientId: activeClient.id,
          trainerId: sessionTrainer.id,
          trainerName: sessionTrainer.name,
          assignTrainerAndStudio: assignTrainerAndStudio && isCrossStudioOrNewTrainer,
          programId: selectionMode === 'program' ? prog?.id : undefined,
          programTitle:
            selectionMode === 'program'
              ? prog?.title || 'Плановая тренировка'
              : currentExercise?.title || 'Свободное упражнение',
          startedAt: sessionStartedAtIso || new Date().toISOString(),
          durationSec: Math.max(60, sessionElapsedSec),
          completedExercises,
          minWinchKg,
          peakWinchKg,
          avgSymmetryPct: computedAvgSym,
          minLimbLoads,
          maxLimbLoads,
          emgStats,
          minHrBpm: computedMinHr,
          avgHrBpm: computedAvgHr,
          maxHrBpm: computedMaxHr,
          bpBefore: bpBefore.trim(),
          bpAfter: bpAfter.trim(),
          heightBeforeCm: Number(heightBeforeCm) || undefined,
          heightAfterCm: Number(heightAfterCm) || undefined,
          weightBeforeKg: Number(weightBeforeKg) || undefined,
          weightAfterKg: Number(weightAfterKg) || undefined,
          postureBeforeSummary: postureBeforeSummary.trim() || undefined,
          postureAfterSummary: postureAfterSummary.trim() || undefined,
          telemetrySeries: sessionTelemetrySeries.length > 0 ? sessionTelemetrySeries : history,
          notes: sessionNotes,
          paymentMethod,
          amountPaidRub: finalPayAmount,
          subscriptionId: selectedSubId || undefined,
        }),
      });
      onSessionSaved(saved);
      setLastSavedReport(saved);
      setShowPaymentModal(false);
      // Session ended strictly on "Окончить"
      setSessionActive(false);
      setExerciseState('idle');
      setAssignTrainerAndStudio(false);
      setShowSavedReportModal(true);
    } finally {
      setSavingSession(false);
    }
  };

  const handleExportPdf = () => {
    const resolvedStudioId =
      lastSavedReport?.studioId || sessionStudioId || activeClient?.studioId || studios[0]?.id;
    const studio = studios.find((s) => s.id === resolvedStudioId) || studios[0];
    const prog = programs.find((p) => p.id === selectedProgramId);
    const paymentLabels: Record<PaymentStatus, string> = {
      unpaid: 'Не оплачено',
      paid_card: 'Банковская карта',
      paid_cash: 'Наличные',
      paid_subscription: 'Списание с абонемента',
      paid_certificate: 'Подарочный сертификат',
    };
    const sesAcc = sesAccRef.current;
    exportSessionReportPdf({
      studioName: studio?.name || lastSavedReport?.studioName || 'ЭТАЛОН ПРАВИЛО',
      studioAddress: studio?.address || '',
      clientName: activeClient?.name || 'Клиент',
      trainerName: lastSavedReport?.trainerName || sessionTrainer.name,
      programTitle:
        lastSavedReport?.programTitle ||
        (selectionMode === 'program' ? prog?.title || 'Комплекс' : currentExercise?.title || 'Упражнение'),
      dateStr: new Date().toISOString().slice(0, 10),
      durationSec: lastSavedReport?.durationSec || Math.max(60, sessionElapsedSec),
      minWinchKg: lastSavedReport?.minWinchKg ?? minWinchKg,
      peakWinchKg: lastSavedReport?.peakWinchKg ?? peakWinchKg,
      avgSymmetryPct: lastSavedReport?.avgSymmetryPct ?? symmetryPct,
      minLimbLoads: lastSavedReport?.minLimbLoads ?? minLimbLoads,
      maxLimbLoads: lastSavedReport?.maxLimbLoads || maxLimbLoads,
      emgStats: lastSavedReport?.emgStats ?? buildSessionEmgStats(),
      minHrBpm:
        lastSavedReport?.minHrBpm ??
        (sesAcc.hasHr && Number.isFinite(sesAcc.minHr) ? Math.round(sesAcc.minHr) : undefined),
      avgHrBpm:
        lastSavedReport?.avgHrBpm ??
        (sesAcc.hrCount > 0 ? Math.round(sesAcc.hrSum / sesAcc.hrCount) : telemetry.heartRateBpm),
      maxHrBpm:
        lastSavedReport?.maxHrBpm ?? (sesAcc.hasHr && sesAcc.maxHr > 0 ? Math.round(sesAcc.maxHr) : undefined),
      bpBefore: lastSavedReport?.bpBefore ?? bpBefore,
      bpAfter: lastSavedReport?.bpAfter ?? bpAfter,
      heightBeforeCm: lastSavedReport?.heightBeforeCm ?? (Number(heightBeforeCm) || undefined),
      heightAfterCm: lastSavedReport?.heightAfterCm ?? (Number(heightAfterCm) || undefined),
      weightBeforeKg: lastSavedReport?.weightBeforeKg ?? (Number(weightBeforeKg) || undefined),
      weightAfterKg: lastSavedReport?.weightAfterKg ?? (Number(weightAfterKg) || undefined),
      postureBeforeSummary: lastSavedReport?.postureBeforeSummary ?? (postureBeforeSummary.trim() || undefined),
      postureAfterSummary: lastSavedReport?.postureAfterSummary ?? (postureAfterSummary.trim() || undefined),
      completedExercises: lastSavedReport?.completedExercises || completedExercises,
      telemetryHistory: lastSavedReport?.telemetrySeries || (sessionTelemetrySeries.length > 0 ? sessionTelemetrySeries : history),
      notes: lastSavedReport?.notes ?? sessionNotes,
      paymentLabel: paymentLabels[lastSavedReport?.paymentMethod || paymentMethod],
      amountPaidRub: lastSavedReport?.amountPaidRub ?? finalPayAmount,
    });
  };

  const toggleEquipmentConnect = async (
    dev: EquipmentDevice,
    transportOverride?: 'web_bluetooth' | 'native_bluetooth' | 'web_serial' | 'websocket_bridge',
    acceptAllDevices?: boolean,
    nativeSel?: {
      deviceId: string;
      deviceName: string;
      address: string;
      port?: string;
      protocol: 'auto' | 'gatt' | 'spp';
    }
  ) => {
    if (sensorBusyId) return;
    if (dev.connected && !transportOverride && !acceptAllDevices && !nativeSel) {
      setSensorBusyId(dev.id);
      setSensorStatusMsg('');
      try {
        await disconnectRealHardwareDevice({ device: dev, onDeviceUpdated });
        setSensorStatusMsg(`${dev.name} отключён.`);
      } finally {
        setSensorBusyId(null);
      }
      return;
    }

    const caps = getHardwareCapabilities();
    const effectiveTransport =
      transportOverride ||
      dev.hardwareConfig?.transport ||
      (caps.webBluetooth ? 'web_bluetooth' : 'native_bluetooth');

    if (effectiveTransport === 'native_bluetooth' && !nativeSel) {
      setNativePickerTarget({ device: dev });
      return;
    }

    setSensorBusyId(dev.id);
    setSensorStatusMsg('');
    try {
      const res = await connectRealHardwareDevice({
        device: dev,
        transportOverride: effectiveTransport,
        acceptAllDevices,
        nativeDeviceId: nativeSel?.deviceId,
        nativeDeviceName: nativeSel?.deviceName,
        nativeAddress: nativeSel?.address,
        nativePort: nativeSel?.port,
        nativeProtocol: nativeSel?.protocol,
        onDeviceUpdated,
        onDisconnectedNotice: (msg) => setSensorStatusMsg(msg),
      });
      setSensorStatusMsg(res.message);
    } finally {
      setSensorBusyId(null);
    }
  };

  const handleMeasureBpBle = async (
    phase: 'before' | 'after',
    acceptAllDevices?: boolean,
    nativeSel?: {
      deviceId: string;
      deviceName: string;
      address: string;
      port?: string;
      protocol: 'auto' | 'gatt' | 'spp';
    }
  ) => {
    if (bpMeasuringPhase) return;
    const caps = getHardwareCapabilities();
    const b05Dev = equipment.find((d) => d.type === 'bp_b05');
    if (!nativeSel && !caps.webBluetooth && b05Dev) {
      setNativePickerTarget({ device: b05Dev, bpPhase: phase });
      return;
    }
    setBpMeasuringPhase(phase);
    setBpBleStatus({
      phase,
      progressMsg: nativeSel
        ? 'Подключение тонометра по штатному Bluetooth...'
        : 'Поиск тонометра (BLE 0x1810)...',
    });
    try {
      let lastPatchAt = 0;

      const res = nativeSel
        ? await measureBloodPressureNative({
            deviceId: nativeSel.deviceId,
            deviceName: nativeSel.deviceName,
            address: nativeSel.address,
            port: nativeSel.port,
            protocol: nativeSel.protocol,
            onProgress: (msg) => {
              setBpBleStatus((prev) => ({ phase, deviceName: prev?.deviceName, progressMsg: msg }));
            },
          })
        : await measureBloodPressureBle({
        nameFilter: b05Dev?.hardwareConfig?.deviceNameFilter,
        acceptAllDevices,
        onConnected: ({ deviceName, batteryPct, services }) => {
          const svcList = services.length > 0 ? ` [${services.join(', ')}]` : '';
          const connMsg = `Подключён ${deviceName}${svcList} — запуск манжеты...`;
          setBpBleStatus({ phase, deviceName, progressMsg: connMsg });
          setSensorStatusMsg(connMsg);
          if (b05Dev) {
            apiRequest<EquipmentDevice>(`/api/equipment/${b05Dev.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                connected: true,
                streaming: true,
                connectionMode: 'web_bluetooth',
                ...(batteryPct !== undefined ? { batteryPct } : {}),
                lastReadingText: connMsg,
                lastError: '',
              }),
            })
              .then((up) => onDeviceUpdated(up))
              .catch(() =>
                onDeviceUpdated({
                  ...b05Dev,
                  connected: true,
                  streaming: true,
                  connectionMode: 'web_bluetooth',
                  ...(batteryPct !== undefined ? { batteryPct } : {}),
                  lastReadingText: connMsg,
                  lastError: '',
                })
              );
          }
        },
        onProgress: (msg) => {
          setBpBleStatus((prev) => ({ phase, deviceName: prev?.deviceName, progressMsg: msg }));
          const now = Date.now();
          if (b05Dev && now - lastPatchAt > 900) {
            lastPatchAt = now;
            apiRequest<EquipmentDevice>(`/api/equipment/${b05Dev.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                connected: true,
                streaming: true,
                lastReadingText: msg,
                lastError: '',
              }),
            })
              .then((up) => onDeviceUpdated(up))
              .catch(() => undefined);
          }
        },
      });

      if (!res.success) {
        setBpBleStatus({
          phase,
          error: res.message,
        });
        if (b05Dev && !res.cancelled) {
          apiRequest<EquipmentDevice>(`/api/equipment/${b05Dev.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              connected: false,
              streaming: false,
              connectionMode: 'disconnected',
              lastError: res.message,
            }),
          })
            .then((up) => onDeviceUpdated(up))
            .catch(() => undefined);
        }
        return;
      }

      const bpStr = `${res.sys}/${res.dia}`;
      if (phase === 'before') {
        setBpBefore(bpStr);
      } else {
        setBpAfter(bpStr);
      }

      setBpBleStatus({
        phase,
        sys: res.sys,
        dia: res.dia,
        map: res.map,
        pulse: res.pulse,
        mode: res.mode,
        deviceName: res.deviceName,
        measuredAt: res.measuredAt,
      });

      if (b05Dev) {
        try {
          const updated = await apiRequest<EquipmentDevice>(`/api/equipment/${b05Dev.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              connected: true,
              streaming: true,
              connectionMode: 'web_bluetooth',
              ...(res.batteryPct !== undefined ? { batteryPct: res.batteryPct } : {}),
              lastReadingText: `${bpStr} мм рт. ст.${res.pulse ? ` · ${res.pulse} уд/мин` : ''}`,
              lastError: '',
            }),
          });
          onDeviceUpdated(updated);
        } catch {
          // Non-fatal if offline; UI already captured real BP reading
        }
      }
    } finally {
      setBpMeasuringPhase(null);
    }
  };

  const parseBpPair = (val: string) => {
    const m = val.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null;
  };
  const bpBeforeParsed = parseBpPair(bpBefore);
  const bpAfterParsed = parseBpPair(bpAfter);
  const latestBpParsed = bpAfterParsed || bpBeforeParsed;
  const bpElevated =
    latestBpParsed !== null && (latestBpParsed.sys >= 140 || latestBpParsed.dia >= 90);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const deviceIcon = (type: EquipmentDevice['type']) => {
    switch (type) {
      case 'esp32_limbs':
        return <Cpu className="w-4 h-4" />;
      case 'myoblue_emg':
        return <Activity className="w-4 h-4" />;
      case 'wahoo_tickr':
        return <HeartPulse className="w-4 h-4" />;
      case 'xiaomi_scale':
        return <Scale className="w-4 h-4" />;
      case 'bp_b05':
        return <Gauge className="w-4 h-4" />;
    }
  };

  // Build SVG polyline points for EMG + Winch Chart
  const chartPoints = useMemo(() => {
    const pts = history.length > 1 ? history : [telemetry, telemetry];
    const w = 640;
    const h = 150;
    const maxW = Math.max(100, safeTargetWinchKg * 1.15, ...pts.map((p) => p.totalWinchKg));
    const targetY = h - 12 - Math.min(1, safeTargetWinchKg / maxW) * (h - 24);
    const winchPath = pts
      .map((p, i) => {
        const x = (i / Math.max(1, pts.length - 1)) * w;
        const y = h - 12 - (p.totalWinchKg / maxW) * (h - 24);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const emg1Path = pts
      .map((p, i) => {
        const x = (i / Math.max(1, pts.length - 1)) * w;
        const y = h - 12 - Math.min(1, p.emgCh1Mv / 1.1) * (h - 24);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const emg2Path = pts
      .map((p, i) => {
        const x = (i / Math.max(1, pts.length - 1)) * w;
        const y = h - 12 - Math.min(1, p.emgCh2Mv / 1.1) * (h - 24);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { winchPath, emg1Path, emg2Path, targetY };
  }, [history, telemetry, safeTargetWinchKg]);

  const layoutDirty =
    layoutPrefs.leftWidthPx !== DEFAULT_LAYOUT_PREFS.leftWidthPx ||
    layoutPrefs.rightWidthPx !== DEFAULT_LAYOUT_PREFS.rightWidthPx ||
    layoutPrefs.lowerHeightPx !== DEFAULT_LAYOUT_PREFS.lowerHeightPx ||
    layoutPrefs.bottomLeftPct !== DEFAULT_LAYOUT_PREFS.bottomLeftPct ||
    layoutPrefs.fontScale !== DEFAULT_LAYOUT_PREFS.fontScale;

  const sessionCssVars = {
    '--ls-left-w': `${layoutPrefs.leftWidthPx}px`,
    '--ls-right-w': `${layoutPrefs.rightWidthPx}px`,
    '--ls-lower-h': `${layoutPrefs.lowerHeightPx}px`,
    '--ls-bottom-left-w': `${layoutPrefs.bottomLeftPct}%`,
    '--ls-font-scale': String(layoutPrefs.fontScale),
  } as React.CSSProperties;

  return (
    <div
      ref={rootContainerRef}
      style={sessionCssVars}
      className="live-session-scalable lg:h-full flex flex-col gap-1.5 lg:overflow-hidden"
    >
      {/* Slim Workspace Customization Toolbar: Window Sizing, Font Scale & Heart Pin Lock */}
      <div className="ls-no-scale shrink-0 flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]">
        <div className="hidden lg:flex items-center gap-2 text-slate-500">
          <span>Тяните границы окон мышкой или трекпадом для изменения размера</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5">
            <Type className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 mr-0.5 hidden sm:inline">Шрифт:</span>
            <button
              type="button"
              disabled={layoutPrefs.fontScale <= 0.85}
              onClick={() =>
                setLayoutPrefs((prev) => ({
                  ...prev,
                  fontScale: Number(Math.max(0.85, prev.fontScale - 0.05).toFixed(2)),
                }))
              }
              title="Уменьшить шрифт"
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setLayoutPrefs((prev) => ({ ...prev, fontScale: 1 }))}
              title="Нажмите, чтобы вернуть масштаб шрифта 100%"
              className="min-w-[38px] text-center font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums cursor-pointer"
            >
              {Math.round(layoutPrefs.fontScale * 100)}%
            </button>
            <button
              type="button"
              disabled={layoutPrefs.fontScale >= 1.5}
              onClick={() =>
                setLayoutPrefs((prev) => ({
                  ...prev,
                  fontScale: Number(Math.min(1.5, prev.fontScale + 0.05).toFixed(2)),
                }))
              }
              title="Увеличить шрифт"
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHeartLocked((v) => !v)}
            title={
              heartLocked
                ? 'Разблокировать сердечко, чтобы перетащить его в удобное место на силуэте'
                : 'Зафиксировать сердечко на выбранном месте для всех новых сессий'
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-medium cursor-pointer whitespace-nowrap transition-colors ${
              heartLocked
                ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            }`}
          >
            {heartLocked ? (
              <>
                <Move className="w-3 h-3 text-rose-500" />
                <span>Переместить сердце</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                <span>Зафиксировать сердце</span>
              </>
            )}
          </button>

          {layoutDirty && (
            <button
              type="button"
              onClick={() => setLayoutPrefs(DEFAULT_LAYOUT_PREFS)}
              title="Сбросить размеры окон и масштаб шрифта по умолчанию"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить окна</span>
            </button>
          )}
        </div>
      </div>

      <div className="ls-scale-area flex-1 min-h-0 flex flex-col gap-2.5 lg:gap-0">
      {/* UPPER BAND: Left Session Controls · Center Upper Limb Load Silhouette · Right BLE & Winch */}
      <div
        ref={upperBandRef}
        className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2.5 lg:gap-0 items-stretch"
      >
        {/* LEFT COLUMN: Client, Program/Exercise & Active Timer/Transport */}
        <div className="w-full lg:w-[var(--ls-left-w)] lg:shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-y-auto">
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-slate-500">Клиент сессии</label>
                <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleToggleClientGender('male')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      activeClient?.gender !== 'female'
                        ? 'bg-slate-900 dark:bg-cyan-600 text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    Муж
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleClientGender('female')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      activeClient?.gender === 'female'
                        ? 'bg-slate-900 dark:bg-cyan-600 text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    Жен
                  </button>
                </div>
              </div>
              <select
                value={selectedClientId}
                disabled={sessionActive}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedClientId(nextId);
                  const cl = clients.find((c) => c.id === nextId);
                  if (cl) {
                    setSessionStudioId(cl.studioId || currentUser.studioId || studios[0]?.id || '');
                    if (currentUser.role !== 'trainer') {
                      setSessionTrainerId(
                        cl.assignedTrainerId ||
                          activeTrainers.find((t) => t.studioId === cl.studioId)?.id ||
                          currentUser.id
                      );
                    }
                  }
                  setAssignTrainerAndStudio(false);
                }}
                className="w-full px-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Studio & Trainer selectors for conducting sessions in another studio / with a new trainer */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Студия</label>
                <select
                  value={sessionStudioId}
                  disabled={sessionActive}
                  onChange={(e) => {
                    const nextStId = e.target.value;
                    setSessionStudioId(nextStId);
                    if (currentUser.role !== 'trainer') {
                      const curT = activeTrainers.find((t) => t.id === sessionTrainerId);
                      if (!curT || curT.studioId !== nextStId) {
                        const studioTrainer = activeTrainers.find((t) => t.studioId === nextStId);
                        if (studioTrainer) setSessionTrainerId(studioTrainer.id);
                      }
                    }
                  }}
                  className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Тренер</label>
                {currentUser.role === 'trainer' ? (
                  <div className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 truncate">
                    {currentUser.name}
                  </div>
                ) : (
                  <select
                    value={sessionTrainerId}
                    disabled={sessionActive}
                    onChange={(e) => setSessionTrainerId(e.target.value)}
                    className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  >
                    {!activeTrainers.some((t) => t.id === sessionTrainerId) && (
                      <option value={currentUser.id}>{currentUser.name}</option>
                    )}
                    {activeTrainers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {isCrossStudioOrNewTrainer && (
              <div className="p-2 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 text-[10px] space-y-1">
                <div className="font-semibold text-cyan-800 dark:text-cyan-200">
                  Занятие с новым тренером / в другой студии
                </div>
                {sessionTrainer.role === 'trainer' && (
                  <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={sessionActive}
                      checked={assignTrainerAndStudio}
                      onChange={(e) => setAssignTrainerAndStudio(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Закрепить клиента за тренером и студией</span>
                  </label>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setSelectionMode('program');
                  setExerciseIndex(0);
                }}
                className={`py-1 text-[11px] font-medium rounded-md cursor-pointer truncate px-1 ${
                  selectionMode === 'program'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Программа
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionMode('exercise');
                  setExerciseIndex(0);
                }}
                className={`py-1 text-[11px] font-medium rounded-md cursor-pointer truncate px-1 ${
                  selectionMode === 'exercise'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Упражнение
              </button>
            </div>

            {selectionMode === 'program' ? (
              <div className="space-y-1.5">
                <select
                  value={selectedProgramId}
                  onChange={(e) => {
                    setSelectedProgramId(e.target.value);
                    setExerciseIndex(0);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {programs.map((p) => {
                    const pExs = p.exerciseIds
                      .map((id) => exercises.find((ex) => ex.id === id))
                      .filter((ex): ex is Exercise => Boolean(ex));
                    const pDiff = computeProgramDifficulty(pExs);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.exerciseIds.length} упр. · {pDiff.avg.toFixed(1)}★)
                      </option>
                    );
                  })}
                </select>
                {queueExercises.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 px-1">
                    <DifficultyStars
                      value={computeProgramDifficulty(queueExercises).avg}
                      size="xs"
                      showNumeric
                      showLabel
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {queueExercises.map((ex, idx) => (
                        <button
                          key={`${ex.id}-${idx}`}
                          type="button"
                          onClick={() => {
                            resetForExerciseAtIndex(idx);
                            setExerciseState('idle');
                          }}
                          title={`${ex.title} · ${inferExerciseDifficulty(ex)}/5★`}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                            idx === exerciseIndex
                              ? 'border-cyan-500 bg-cyan-500/10 font-semibold text-cyan-700 dark:text-cyan-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:opacity-80'
                          }`}
                        >
                          <span>{idx + 1}</span>
                          <span>·</span>
                          <span>{inferExerciseDifficulty(ex)}★</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <select
                value={selectedExerciseId}
                onChange={(e) => {
                  setSelectedExerciseId(e.target.value);
                  setExerciseIndex(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} ({ex.category} · {inferExerciseDifficulty(ex)}★)
                  </option>
                ))}
              </select>
            )}
          </div>

          {currentExercise && (
            <div className="flex-1 min-h-0 flex flex-col justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 gap-2">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="truncate">
                        Упр. {exerciseIndex + 1}/{queueExercises.length} · {currentExercise.category}
                      </span>
                      <DifficultyStars
                        value={inferExerciseDifficulty(currentExercise)}
                        size="xs"
                      />
                    </div>
                    <div className="font-display text-sm font-semibold mt-0.5 leading-snug line-clamp-2">
                      {currentExercise.title}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono text-2xl font-bold tabular-nums leading-none ${
                        timerExpired
                          ? 'text-rose-600 dark:text-rose-400 animate-pulse'
                          : exerciseRemainingSec <= 10 && exerciseState === 'running'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-cyan-700 dark:text-cyan-400'
                      }`}
                    >
                      {formatTimer(exerciseRemainingSec)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5 tabular-nums">
                      Прошло: {formatTimer(exerciseElapsedSec)} · Цель: {formatTimer(exerciseTargetSec)}
                    </div>
                  </div>
                </div>

                {/* Countdown Timer Setup Controls */}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-medium text-slate-500">Таймер обратного отсчёта</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyTimerDuration(exerciseTargetSec - 15)}
                        className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Уменьшить время на 15 сек"
                      >
                        −15с
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTimerDuration(exerciseTargetSec + 15)}
                        className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Увеличить время на 15 сек"
                      >
                        +15с
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExerciseState('idle');
                          setExerciseElapsedSec(0);
                          setExerciseRemainingSec(exerciseTargetSec);
                          setTimerExpired(false);
                        }}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Сбросить отсчёт к выставленному времени"
                      >
                        <RotateCcw className="w-3 h-3 text-slate-500" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-mono">
                      <input
                        type="number"
                        aria-label="Минуты таймера"
                        min={0}
                        max={60}
                        value={Math.floor(exerciseTargetSec / 60)}
                        onChange={(e) => {
                          const mins = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                          const secs = exerciseTargetSec % 60;
                          applyTimerDuration(mins * 60 + secs);
                        }}
                        className="w-11 px-1.5 py-0.5 text-center rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold tabular-nums"
                      />
                      <span className="text-slate-400 font-bold">:</span>
                      <input
                        type="number"
                        aria-label="Секунды таймера"
                        min={0}
                        max={59}
                        value={exerciseTargetSec % 60}
                        onChange={(e) => {
                          const secs = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          const mins = Math.floor(exerciseTargetSec / 60);
                          applyTimerDuration(mins * 60 + secs);
                        }}
                        className="w-11 px-1.5 py-0.5 text-center rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {[60, 120, 180, 300].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => applyTimerDuration(sec)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                            exerciseTargetSec === sec
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {Math.floor(sec / 60)}:00
                        </button>
                      ))}
                    </div>
                  </div>

                  {timerExpired && (
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                      <span>Время вышло (00:00)</span>
                      <button
                        type="button"
                        onClick={() => applyTimerDuration(exerciseTargetSec + 30)}
                        className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono text-[10px] cursor-pointer"
                      >
                        +30с
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                  Углы: {currentExercise.limbAngles.wrists} · {currentExercise.limbAngles.ankles}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {exerciseState === 'idle' ? (
                    <button
                      type="button"
                      onClick={handleStartExercise}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 shrink-0" />
                      <span>Начать</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePauseToggle}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-medium hover:bg-amber-500 cursor-pointer whitespace-nowrap"
                    >
                      <Pause className="w-3.5 h-3.5 shrink-0" />
                      <span>{exerciseState === 'running' ? 'Пауза' : 'Продолжить'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleNextExercise}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <SkipForward className="w-3.5 h-3.5 shrink-0" />
                    <span>Следующее</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleCompleteExercise}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Завершить</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishSessionClick}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-[11px] font-medium hover:bg-slate-800 dark:hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                  >
                    <Flag className="w-3.5 h-3.5 shrink-0" />
                    <span>Окончить</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* VERTICAL RESIZE HANDLE: Left <-> Center */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Потяните границу, чтобы изменить ширину левой панели (двойной клик — сброс)"
          onPointerDown={(e) => startPanelResize('left', e)}
          onDoubleClick={() =>
            setLayoutPrefs((prev) => ({ ...prev, leftWidthPx: DEFAULT_LAYOUT_PREFS.leftWidthPx }))
          }
          className="hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center group select-none touch-none"
        >
          <div
            className={`w-1 h-14 rounded-full transition-colors ${
              activeResize === 'left'
                ? 'bg-cyan-500'
                : 'bg-slate-300/70 dark:bg-slate-700/80 group-hover:bg-cyan-500/80'
            }`}
          />
        </div>

        {/* CENTER UPPER STAGE: Anatomical Silhouette Centered in Upper Screen */}
        <div className="flex-1 min-w-0 lg:min-w-[260px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col justify-between min-h-0 relative">
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="font-display text-sm sm:text-base font-semibold">
                Тензодатчики конечностей
              </h3>
              <span className="text-xs text-slate-500">
                Симметрия: <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">{symmetryPct}%</span>
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Сессия: {formatTimer(sessionElapsedSec)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetSilhouetteMinMax}
                title="Сбросить минимальные и максимальные показания датчиков на силуэте"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сброс мин/макс</span>
              </button>
              <button
                type="button"
                onClick={() => setHeartLocked((v) => !v)}
                title={
                  heartLocked
                    ? 'Передвинуть сердечко на схеме'
                    : 'Зафиксировать позицию сердечка'
                }
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                  heartLocked
                    ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                }`}
              >
                {heartLocked ? <Unlock className="w-3 h-3 text-rose-500" /> : <Lock className="w-3 h-3" />}
                <span>{heartLocked ? 'Сердце' : 'Зафиксировать'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPinTuner((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Подровнять</span>
              </button>
            </div>
          </div>

          {showPinTuner && (
            <div className="lg:absolute lg:top-11 lg:right-3 lg:z-20 lg:w-76 my-2 lg:my-0 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Позиция меток (%) · сохраняется</span>
                <button
                  type="button"
                  onClick={() => setPins(DEFAULT_PINS)}
                  className="text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Сбросить
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['rh', 'lh', 'rf', 'lf', 'heart'] as const).map((k) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="font-mono w-14 text-slate-500 truncate">{PIN_LABELS[k]}</span>
                    <input
                      type="number"
                      min={3}
                      max={97}
                      value={pins[k].x}
                      onChange={(e) =>
                        setPins((p) => ({
                          ...p,
                          [k]: { ...p[k], x: Number(clampNum(e.target.value, 3, 97, p[k].x).toFixed(1)) },
                        }))
                      }
                      className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                    />
                    <input
                      type="number"
                      min={3}
                      max={97}
                      value={pins[k].y}
                      onChange={(e) =>
                        setPins((p) => ({
                          ...p,
                          [k]: { ...p[k], y: Number(clampNum(e.target.value, 3, 97, p[k].y).toFixed(1)) },
                        }))
                      }
                      className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Centered Anatomical Diagram Canvas (mirror-swapped limbs + Heart Pulse + Min/Max) */}
          <div className="flex-1 min-h-[260px] sm:min-h-[340px] lg:min-h-0 w-full flex items-center justify-center py-0.5 lg:[container-type:size]">
            <div
              ref={silhouetteBoxRef}
              className={`relative w-full aspect-[16/10] lg:w-[min(100cqw,calc(100cqh*1.6))] lg:h-[min(100cqh,calc(100cqw/1.6))] mx-auto rounded-lg overflow-hidden bg-white border transition-colors ${
                loadStatus === 'danger'
                  ? 'border-red-500 ring-2 ring-red-500/30'
                  : loadStatus === 'warning'
                  ? 'border-amber-400 ring-2 ring-amber-400/30'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <img
                src={silhouetteSrc}
                alt={
                  activeClient?.gender === 'female'
                    ? 'Женский силуэт распределения нагрузки по конечностям'
                    : 'Мужской силуэт распределения нагрузки по конечностям'
                }
                draggable={false}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain select-none pointer-events-none"
              />

              {/* Volumetric Beating Red Heart with Live BPM directly on the Silhouette (Draggable & Lockable) */}
              <div
                style={{ left: `${pins.heart.x}%`, top: `${pins.heart.y}%` }}
                onPointerDown={startHeartDrag}
                title={
                  heartLocked
                    ? 'Позиция зафиксирована. Нажмите иконку замка или «Переместить сердце», чтобы изменить.'
                    : 'Перетащите сердечко мышкой или трекпадом в нужное место и нажмите «Зафиксировать».'
                }
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 group rounded-xl transition-shadow ${
                  heartLocked
                    ? ''
                    : `ring-2 ring-dashed ring-rose-500 shadow-xl touch-none select-none ${
                        isDraggingHeart ? 'cursor-grabbing scale-[1.03]' : 'cursor-grab'
                      }`
                }`}
              >
                {!heartLocked && (
                  <div className="flex items-center justify-center gap-1 mb-0.5 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-semibold shadow whitespace-nowrap">
                    <Move className="w-2.5 h-2.5 shrink-0" />
                    <span>Перетащите</span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeartLocked(true);
                      }}
                      className="ml-1 px-1.5 py-0.5 rounded bg-white text-rose-700 font-bold hover:bg-rose-50 cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}
                {heartLocked && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setHeartLocked(false)}
                    title="Переместить сердечко на другое место"
                    className="absolute -top-1.5 -right-1.5 z-30 w-5 h-5 rounded-full bg-slate-900/90 border border-rose-400/70 text-rose-300 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shadow"
                  >
                    <Unlock className="w-2.5 h-2.5" />
                  </button>
                )}
                <VolumetricPulseHeart
                  bpm={telemetry.heartRateBpm}
                  connected={wahooConnected}
                  sensorContact={liveSensors.wahoo.sensorContact}
                  overlay
                  minBpm={
                    activeSilhouetteAcc.hasHr && Number.isFinite(activeSilhouetteAcc.minHr)
                      ? Math.round(activeSilhouetteAcc.minHr)
                      : undefined
                  }
                  maxBpm={
                    activeSilhouetteAcc.hasHr && activeSilhouetteAcc.maxHr > 0
                      ? Math.round(activeSilhouetteAcc.maxHr)
                      : undefined
                  }
                />
              </div>

              {/* Right Hand (Client's right side -> Left side of image) */}
              <div
                style={{ left: `${pins.rh.x}%`, top: `${pins.rh.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border shadow-md text-center transition-colors ${
                  loadStatus === 'danger'
                    ? 'bg-red-950/95 text-white border-red-500'
                    : loadStatus === 'warning'
                    ? 'bg-amber-950/95 text-white border-amber-400'
                    : 'bg-slate-900/90 text-white border-cyan-500/70'
                }`}
              >
                <div className="text-[10px] text-slate-200 leading-none whitespace-nowrap">Прав. рука</div>
                <div
                  className={`font-mono text-xs sm:text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                    loadStatus === 'danger'
                      ? 'text-red-300'
                      : loadStatus === 'warning'
                      ? 'text-amber-300'
                      : 'text-cyan-300'
                  }`}
                >
                  {telemetry.rightHandKg.toFixed(1)} кг
                </div>
                <div className="text-[9px] font-mono text-slate-300 tabular-nums mt-0.5 whitespace-nowrap">
                  {activeSilhouetteAcc.hasLoad && Number.isFinite(activeSilhouetteAcc.minLimbLoads.rh)
                    ? `мин ${activeSilhouetteAcc.minLimbLoads.rh.toFixed(1)} · макс ${activeSilhouetteAcc.maxLimbLoads.rh.toFixed(1)}`
                    : 'мин — · макс —'}
                </div>
              </div>

              {/* Left Hand (Client's left side -> Right side of image) */}
              <div
                style={{ left: `${pins.lh.x}%`, top: `${pins.lh.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border shadow-md text-center transition-colors ${
                  loadStatus === 'danger'
                    ? 'bg-red-950/95 text-white border-red-500'
                    : loadStatus === 'warning'
                    ? 'bg-amber-950/95 text-white border-amber-400'
                    : 'bg-slate-900/90 text-white border-cyan-500/70'
                }`}
              >
                <div className="text-[10px] text-slate-200 leading-none whitespace-nowrap">Лев. рука</div>
                <div
                  className={`font-mono text-xs sm:text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                    loadStatus === 'danger'
                      ? 'text-red-300'
                      : loadStatus === 'warning'
                      ? 'text-amber-300'
                      : 'text-cyan-300'
                  }`}
                >
                  {telemetry.leftHandKg.toFixed(1)} кг
                </div>
                <div className="text-[9px] font-mono text-slate-300 tabular-nums mt-0.5 whitespace-nowrap">
                  {activeSilhouetteAcc.hasLoad && Number.isFinite(activeSilhouetteAcc.minLimbLoads.lh)
                    ? `мин ${activeSilhouetteAcc.minLimbLoads.lh.toFixed(1)} · макс ${activeSilhouetteAcc.maxLimbLoads.lh.toFixed(1)}`
                    : 'мин — · макс —'}
                </div>
              </div>

              {/* Right Foot (Client's right side -> Left side of image) */}
              <div
                style={{ left: `${pins.rf.x}%`, top: `${pins.rf.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border shadow-md text-center transition-colors ${
                  loadStatus === 'danger'
                    ? 'bg-red-950/95 text-white border-red-500'
                    : loadStatus === 'warning'
                    ? 'bg-amber-950/95 text-white border-amber-400'
                    : 'bg-slate-900/90 text-white border-emerald-500/70'
                }`}
              >
                <div className="text-[10px] text-slate-200 leading-none whitespace-nowrap">Прав. нога</div>
                <div
                  className={`font-mono text-xs sm:text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                    loadStatus === 'danger'
                      ? 'text-red-300'
                      : loadStatus === 'warning'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {telemetry.rightFootKg.toFixed(1)} кг
                </div>
                <div className="text-[9px] font-mono text-slate-300 tabular-nums mt-0.5 whitespace-nowrap">
                  {activeSilhouetteAcc.hasLoad && Number.isFinite(activeSilhouetteAcc.minLimbLoads.rf)
                    ? `мин ${activeSilhouetteAcc.minLimbLoads.rf.toFixed(1)} · макс ${activeSilhouetteAcc.maxLimbLoads.rf.toFixed(1)}`
                    : 'мин — · макс —'}
                </div>
              </div>

              {/* Left Foot (Client's left side -> Right side of image) */}
              <div
                style={{ left: `${pins.lf.x}%`, top: `${pins.lf.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border shadow-md text-center transition-colors ${
                  loadStatus === 'danger'
                    ? 'bg-red-950/95 text-white border-red-500'
                    : loadStatus === 'warning'
                    ? 'bg-amber-950/95 text-white border-amber-400'
                    : 'bg-slate-900/90 text-white border-emerald-500/70'
                }`}
              >
                <div className="text-[10px] text-slate-200 leading-none whitespace-nowrap">Лев. нога</div>
                <div
                  className={`font-mono text-xs sm:text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                    loadStatus === 'danger'
                      ? 'text-red-300'
                      : loadStatus === 'warning'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {telemetry.leftFootKg.toFixed(1)} кг
                </div>
                <div className="text-[9px] font-mono text-slate-300 tabular-nums mt-0.5 whitespace-nowrap">
                  {activeSilhouetteAcc.hasLoad && Number.isFinite(activeSilhouetteAcc.minLimbLoads.lf)
                    ? `мин ${activeSilhouetteAcc.minLimbLoads.lf.toFixed(1)} · макс ${activeSilhouetteAcc.maxLimbLoads.lf.toFixed(1)}`
                    : 'мин — · макс —'}
                </div>
              </div>
            </div>
          </div>

          {/* Total Winch Readout Centered Below Silhouette */}
          <div
            className={`shrink-0 mt-1 p-2.5 rounded-lg border transition-colors ${
              loadStatus === 'danger'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-100'
                : loadStatus === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-950 dark:text-amber-100'
                : 'bg-slate-950 text-white border-slate-800'
            }`}
          >
            <div className="flex flex-col items-center justify-center text-center gap-1">
              <div className="flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-0.5">
                <span
                  className={`text-[10px] uppercase tracking-wider font-medium ${
                    loadStatus === 'danger'
                      ? 'text-red-700 dark:text-red-300'
                      : loadStatus === 'warning'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  Общий вес на лебёдке
                </span>
                <span
                  className={`font-mono text-xl sm:text-2xl font-bold tabular-nums ${
                    loadStatus === 'danger'
                      ? 'text-red-600 dark:text-red-400'
                      : loadStatus === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-white'
                  }`}
                >
                  {telemetry.totalWinchKg.toFixed(1)} кг
                </span>
                <span
                  className={`text-xs font-mono tabular-nums ${
                    loadStatus === 'normal' ? 'text-cyan-400' : 'opacity-85'
                  }`}
                >
                  / {safeTargetWinchKg} кг ({loadPct}%)
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono tabular-nums opacity-85">
                <span>
                  {activeSilhouetteAcc.hasLoad && Number.isFinite(activeSilhouetteAcc.minWinchKg)
                    ? `Мин: ${activeSilhouetteAcc.minWinchKg.toFixed(1)} кг · Макс: ${activeSilhouetteAcc.maxWinchKg.toFixed(1)} кг`
                    : 'Мин: — · Макс: —'}
                </span>
                {loadStatus !== 'normal' && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-sans text-[11px] font-semibold ${
                      loadStatus === 'danger'
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>
                      {loadStatus === 'danger'
                        ? 'Целевая тяга достигнута!'
                        : 'Приближение к целевой тяге'}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/15 dark:bg-white/10 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.max(0, loadPct))}%` }}
                className={`h-full transition-all duration-300 ${
                  loadStatus === 'danger'
                    ? 'bg-red-600'
                    : loadStatus === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-cyan-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* VERTICAL RESIZE HANDLE: Center <-> Right */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Потяните границу, чтобы изменить ширину правой панели (двойной клик — сброс)"
          onPointerDown={(e) => startPanelResize('right', e)}
          onDoubleClick={() =>
            setLayoutPrefs((prev) => ({ ...prev, rightWidthPx: DEFAULT_LAYOUT_PREFS.rightWidthPx }))
          }
          className="hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center group select-none touch-none"
        >
          <div
            className={`w-1 h-14 rounded-full transition-colors ${
              activeResize === 'right'
                ? 'bg-cyan-500'
                : 'bg-slate-300/70 dark:bg-slate-700/80 group-hover:bg-cyan-500/80'
            }`}
          />
        </div>

        {/* RIGHT COLUMN: Compact BLE Devices + Target/Live Winch Controls */}
        <div className="w-full lg:w-[var(--ls-right-w)] lg:shrink-0 flex flex-col gap-2 min-h-0 overflow-y-auto">
          {/* Real Hardware Sensors (BLE / USB Serial / Wi-Fi WS) */}
          <div className="shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Реальные датчики (Штатный BT / BLE / USB)
              </span>
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                {equipment[0] && (
                  <button
                    type="button"
                    disabled={sensorBusyId !== null}
                    onClick={() => {
                      const nextDisconnected = equipment.find((e) => !e.connected) || equipment[0];
                      setNativePickerTarget({ device: nextDisconnected });
                    }}
                    title="Подключить датчик через штатный Bluetooth ПК (Windows / macOS) или смартфона Android"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>Штатный BT</span>
                  </button>
                )}
                {!wahooConnected && equipment.some((e) => e.type === 'wahoo_tickr') && (
                  <button
                    type="button"
                    disabled={sensorBusyId !== null}
                    onClick={() => {
                      const wahoo = equipment.find((e) => e.type === 'wahoo_tickr');
                      if (wahoo) toggleEquipmentConnect(wahoo, 'web_bluetooth', true);
                    }}
                    title="Открыть полный список всех BLE-устройств для пульсометра"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <HeartPulse className="w-3 h-3 text-rose-500" />
                    <span>Пульсометр: все BLE</span>
                  </button>
                )}
                {equipment.some((e) => e.type === 'bp_b05') && (
                  <button
                    type="button"
                    disabled={sensorBusyId !== null}
                    onClick={() => {
                      const b05 = equipment.find((e) => e.type === 'bp_b05');
                      if (b05) toggleEquipmentConnect(b05, 'web_bluetooth', true);
                    }}
                    title="Открыть полный список всех BLE-устройств для тонометра"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Gauge className="w-3 h-3 text-cyan-600" />
                    <span>Тонометр: все BLE</span>
                  </button>
                )}
                {equipment.find((e) => e.type === 'esp32_limbs') && (
                  <button
                    type="button"
                    disabled={sensorBusyId !== null}
                    onClick={() => {
                      const esp = equipment.find((e) => e.type === 'esp32_limbs');
                      if (esp) toggleEquipmentConnect(esp, 'web_serial');
                    }}
                    title="Подключить тензодатчики конечностей по USB-кабелю (Web Serial)"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Usb className="w-3 h-3" />
                    <span>Тензодатчики USB</span>
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
              {equipment.map((dev, idx) => {
                const isBusy = sensorBusyId === dev.id;
                const isStreaming =
                  dev.type === 'esp32_limbs'
                    ? liveSensors.esp32.streaming
                    : dev.type === 'myoblue_emg'
                    ? liveSensors.myoblue.streaming
                    : dev.type === 'wahoo_tickr'
                    ? liveSensors.wahoo.streaming
                    : dev.type === 'xiaomi_scale'
                    ? liveSensors.scale.streaming
                    : liveSensors.bp.streaming;
                const active = dev.connected || isStreaming;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    disabled={isBusy}
                    title={dev.lastError || dev.lastReadingText}
                    onClick={() => toggleEquipmentConnect(dev)}
                    className={`text-left px-2 py-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
                      idx === equipment.length - 1 && equipment.length % 2 === 1
                        ? 'col-span-2 sm:col-span-1 lg:col-span-2'
                        : ''
                    } ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0 text-slate-900 dark:text-slate-100">
                        <span className={active ? 'text-emerald-600 dark:text-emerald-400 shrink-0' : 'text-slate-400 shrink-0'}>
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : deviceIcon(dev.type)}
                        </span>
                        <span className="text-[11px] font-semibold truncate">{dev.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono shrink-0 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {active ? '● LIVE' : 'Подкл.'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-slate-500 tabular-nums gap-2">
                      {active ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-0.5">
                            <BatteryCharging className="w-2.5 h-2.5" />
                            {dev.batteryPct ? `${dev.batteryPct}%` : '—'}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <Wifi className="w-2.5 h-2.5" />
                            {dev.connectionMode === 'native_bluetooth'
                              ? 'Штатн. BT'
                              : dev.connectionMode === 'web_serial'
                              ? 'USB'
                              : dev.connectionMode === 'websocket_bridge'
                              ? 'WS'
                              : 'BLE'}
                          </span>
                        </div>
                      ) : (
                        <span className={`text-[10px] truncate ${dev.lastError ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                          {dev.lastError || 'Нажмите для реального BLE'}
                        </span>
                      )}
                      {dev.type === 'bp_b05' && active && (
                        <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 truncate">
                          {liveSensors.bp.sys && liveSensors.bp.dia
                            ? `${liveSensors.bp.sys}/${liveSensors.bp.dia}`
                            : liveSensors.bp.lastStatus || dev.lastReadingText}
                        </span>
                      )}
                      {dev.type === 'wahoo_tickr' && active && (
                        <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 truncate">
                          {liveSensors.wahoo.heartRateBpm > 0
                            ? `${liveSensors.wahoo.heartRateBpm} уд/мин`
                            : liveSensors.wahoo.sensorContact === false
                            ? 'нет контакта'
                            : 'поиск...'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {sensorStatusMsg && (
              <div className="mt-1.5 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/70 text-[10px] text-slate-600 dark:text-slate-300 leading-snug">
                {sensorStatusMsg}
              </div>
            )}
          </div>

          {/* Target Winch Load Slider Card (Real load read strictly from ESP32) */}
          <div className="shrink-0 lg:flex-1 lg:min-h-[190px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1 truncate">
                  Целевая тяга, кг
                </label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  step={5}
                  value={targetWinchKg}
                  onChange={(e) =>
                    setTargetWinchKg(Math.max(10, Math.min(5000, Number(e.target.value) || 10)))
                  }
                  className="w-full px-2.5 py-1.5 text-sm font-mono font-semibold rounded-lg border border-cyan-500/70 dark:border-cyan-600 bg-white dark:bg-slate-950 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1 truncate">
                  Тензодатчики, кг
                </label>
                <div
                  className={`w-full px-2.5 py-1.5 text-sm font-mono font-semibold rounded-lg border bg-slate-50 dark:bg-slate-950/70 tabular-nums flex items-center justify-between ${
                    loadStatus === 'danger'
                      ? 'border-red-500 text-red-600 dark:text-red-400'
                      : loadStatus === 'warning'
                      ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{telemetry.totalWinchKg.toFixed(1)}</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {esp32Connected ? 'LIVE' : 'нет сигнала'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>Ползунок целевой тяги (порог предупреждения)</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {targetWinchKg} кг
                </span>
              </div>
              <input
                type="range"
                aria-label="Целевая тяга ползунок"
                min={10}
                max={sliderMaxKg}
                step={5}
                value={Math.min(sliderMaxKg, targetWinchKg)}
                onChange={(e) => setTargetWinchKg(Number(e.target.value))}
                className={`w-full cursor-pointer ${
                  loadStatus === 'danger'
                    ? 'accent-red-600'
                    : loadStatus === 'warning'
                    ? 'accent-amber-500'
                    : 'accent-cyan-600'
                }`}
              />
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 mr-0.5">Цель:</span>
                {[60, 120, 300, 600, 1000, 1500, 2000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTargetWinchKg(preset)}
                    className={`px-1.5 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                      targetWinchKg === preset
                        ? 'border-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-1.5 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  {!esp32Connected && <Unplug className="w-3 h-3 text-amber-500" />}
                  {esp32Connected
                    ? `Порог: жёлтый ≥ ${Math.round(safeTargetWinchKg * 0.85)} кг · красный ≥ ${safeTargetWinchKg} кг`
                    : 'Подключите тензодатчики конечностей (BLE / USB / Wi-Fi)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HORIZONTAL RESIZE HANDLE: Upper Band <-> Lower Band */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Потяните границу вверх или вниз, чтобы изменить высоту нижней панели (двойной клик — сброс)"
        onPointerDown={(e) => startPanelResize('lower', e)}
        onDoubleClick={() =>
          setLayoutPrefs((prev) => ({ ...prev, lowerHeightPx: DEFAULT_LAYOUT_PREFS.lowerHeightPx }))
        }
        className="hidden lg:flex h-2.5 shrink-0 cursor-row-resize items-center justify-center group select-none touch-none"
      >
        <div
          className={`h-1 w-20 rounded-full transition-colors ${
            activeResize === 'lower'
              ? 'bg-cyan-500'
              : 'bg-slate-300/70 dark:bg-slate-700/80 group-hover:bg-cyan-500/80'
          }`}
        />
      </div>

      {/* LOWER BAND: Real-Time EMG & Winch Chart + Pre/Post Height/BP & Diary Note */}
      <div
        ref={lowerBandRef}
        className="shrink-0 lg:h-[var(--ls-lower-h)] flex flex-col lg:flex-row gap-2.5 lg:gap-0 items-stretch min-h-0"
      >
        {/* Bottom-Left: EMG & Winch Chart + Volumetric Red Beating Heart */}
        <div className="w-full lg:w-[var(--ls-bottom-left-w)] lg:shrink-0 min-w-0 min-h-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
              <h3 className="font-display text-xs sm:text-sm font-semibold truncate">
                График миодатчиков, тяги и пульса
              </h3>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                CH1: <span className="font-semibold text-amber-600">{telemetry.emgCh1Mv.toFixed(2)}</span> · CH2:{' '}
                <span className="font-semibold text-cyan-600">{telemetry.emgCh2Mv.toFixed(2)}</span> мВ · Тяга{' '}
                {minWinchKg.toFixed(1)}–{peakWinchKg.toFixed(1)} кг
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {lastSavedReport && (
                <button
                  type="button"
                  onClick={() => setShowSavedReportModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                >
                  <span>Отчёт</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5 text-cyan-600" />
                <span>Экспорт PDF</span>
              </button>
            </div>
          </div>

          <div className="w-full flex-1 min-h-[86px] rounded-lg bg-slate-950 p-2 border border-slate-800">
            <svg viewBox="0 0 640 150" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <line x1="0" y1="37" x2="640" y2="37" stroke="#1e293b" strokeWidth="1" />
              <line x1="0" y1="75" x2="640" y2="75" stroke="#1e293b" strokeWidth="1" />
              <line x1="0" y1="112" x2="640" y2="112" stroke="#1e293b" strokeWidth="1" />
              <line
                x1="0"
                y1={chartPoints.targetY}
                x2="640"
                y2={chartPoints.targetY}
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeDasharray="6 4"
              />
              <polyline
                fill="none"
                stroke={
                  loadStatus === 'danger'
                    ? '#ef4444'
                    : loadStatus === 'warning'
                    ? '#f59e0b'
                    : '#06b6d4'
                }
                strokeWidth="2.4"
                points={chartPoints.winchPath}
              />
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.8"
                points={chartPoints.emg1Path}
              />
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                points={chartPoints.emg2Path}
              />
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-3 h-0.5 inline-block ${
                  loadStatus === 'danger'
                    ? 'bg-red-500'
                    : loadStatus === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
              />
              Тяга лебёдки (кг)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dashed border-amber-500 inline-block" /> Порог ({safeTargetWinchKg} кг)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block" /> Миодатчик CH1 (мВ)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Миодатчик CH2 (мВ)
            </span>
          </div>
        </div>

        {/* VERTICAL RESIZE HANDLE: Bottom-Left Chart <-> Bottom-Right Measurements */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Потяните границу, чтобы изменить соотношение ширины графика и замеров (двойной клик — сброс)"
          onPointerDown={(e) => startPanelResize('bottomSplit', e)}
          onDoubleClick={() =>
            setLayoutPrefs((prev) => ({
              ...prev,
              bottomLeftPct: DEFAULT_LAYOUT_PREFS.bottomLeftPct,
            }))
          }
          className="hidden lg:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center group select-none touch-none"
        >
          <div
            className={`w-1 h-14 rounded-full transition-colors ${
              activeResize === 'bottomSplit'
                ? 'bg-cyan-500'
                : 'bg-slate-300/70 dark:bg-slate-700/80 group-hover:bg-cyan-500/80'
            }`}
          />
        </div>

        {/* Bottom-Right: Measurements (Height, Weight, Empty-by-default BP, Posture Before/After, Notes) */}
        <div className="flex-1 min-w-0 min-h-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-1.5 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xs sm:text-sm font-semibold">
                Замеры (Рост / Вес / Тонометр / Осанка)
              </h3>
              <button
                type="button"
                onClick={handleFillBaselineFromCard}
                title="Подставить рост, вес и оценку осанки из карты клиента (АД всегда замеряется заново)"
                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Из карты
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {equipment.some((e) => e.type === 'bp_b05') && (
                <button
                  type="button"
                  disabled={bpMeasuringPhase !== null}
                  onClick={() => {
                    const b05 = equipment.find((e) => e.type === 'bp_b05');
                    if (b05) setNativePickerTarget({ device: b05, bpPhase: 'before' });
                  }}
                  title="Замер АД через штатный Bluetooth ПК или смартфона Android"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium hover:opacity-85 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Bluetooth className="w-3 h-3 text-emerald-600" />
                  <span>Штатн. BT</span>
                </button>
              )}
              <button
                type="button"
                disabled={bpMeasuringPhase !== null}
                onClick={() => handleMeasureBpBle('before')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-600/70 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 text-[11px] font-medium hover:bg-cyan-100/70 dark:hover:bg-cyan-900/50 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {bpMeasuringPhase === 'before' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bluetooth className="w-3 h-3" />
                )}
                <span>{bpMeasuringPhase === 'before' ? 'Замер...' : 'BLE АД до'}</span>
              </button>
              <button
                type="button"
                disabled={bpMeasuringPhase !== null}
                onClick={() => handleMeasureBpBle('after')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-600/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium hover:bg-emerald-100/70 dark:hover:bg-emerald-900/50 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {bpMeasuringPhase === 'after' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bluetooth className="w-3 h-3" />
                )}
                <span>{bpMeasuringPhase === 'after' ? 'Замер...' : 'BLE АД после'}</span>
              </button>
            </div>
          </div>

          {/* Live BLE Cuff Status / Last Reading Strip */}
          {(bpMeasuringPhase || bpBleStatus || bpElevated || (bpBeforeParsed && bpAfterParsed)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-[11px]">
              {bpMeasuringPhase ? (
                <span className="inline-flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span>
                    {bpBleStatus?.progressMsg ||
                      `Тонометр (0x1810): накачка манжеты (${bpMeasuringPhase === 'before' ? 'до' : 'после'})...`}
                  </span>
                </span>
              ) : bpBleStatus?.error ? (
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-amber-700 dark:text-amber-300 truncate" title={bpBleStatus.error}>
                    {bpBleStatus.error}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={bpMeasuringPhase !== null}
                      onClick={() => {
                        const b05 = equipment.find((e) => e.type === 'bp_b05');
                        if (b05) setNativePickerTarget({ device: b05, bpPhase: bpBleStatus.phase });
                      }}
                      className="px-2 py-0.5 rounded border border-emerald-500/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      Штатный BT
                    </button>
                    <button
                      type="button"
                      disabled={bpMeasuringPhase !== null}
                      onClick={() => handleMeasureBpBle(bpBleStatus.phase, true)}
                      className="px-2 py-0.5 rounded border border-cyan-500/70 text-cyan-700 dark:text-cyan-300 text-[10px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      Все BLE
                    </button>
                    <button
                      type="button"
                      onClick={() => setBpBleStatus(null)}
                      className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[10px] font-medium cursor-pointer whitespace-nowrap"
                    >
                      Скрыть
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between w-full gap-2">
                  <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums truncate">
                    {bpBleStatus?.sys
                      ? `Тонометр (${bpBleStatus.phase === 'before' ? 'До' : 'После'}): ${bpBleStatus.sys}/${bpBleStatus.dia} · Пульс ${bpBleStatus.pulse} · MAP ${bpBleStatus.map}`
                      : 'АД до/после зафиксировано'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {bpBeforeParsed && bpAfterParsed && (
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        Δ {bpAfterParsed.sys - bpBeforeParsed.sys >= 0 ? '+' : ''}
                        {bpAfterParsed.sys - bpBeforeParsed.sys}/
                        {bpAfterParsed.dia - bpBeforeParsed.dia >= 0 ? '+' : ''}
                        {bpAfterParsed.dia - bpBeforeParsed.dia}
                      </span>
                    )}
                    {bpElevated && (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Повышенное АД</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                Рост до (см)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="Замер до"
                value={heightBeforeCm}
                onChange={(e) => setHeightBeforeCm(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                Рост после
                {Number(heightBeforeCm) > 0 && Number(heightAfterCm) > 0 && (
                  <span className="ml-1 font-mono text-emerald-600 dark:text-emerald-400">
                    ({Number(heightAfterCm) - Number(heightBeforeCm) >= 0 ? '+' : ''}
                    {(Number(heightAfterCm) - Number(heightBeforeCm)).toFixed(1)})
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="После"
                value={heightAfterCm}
                onChange={(e) => setHeightAfterCm(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                Вес до (кг)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="Замер"
                value={weightBeforeKg}
                onChange={(e) => setWeightBeforeKg(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                Вес после
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="После"
                value={weightAfterKg}
                onChange={(e) => setWeightAfterKg(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                АД до (тоном.)
              </label>
              <input
                type="text"
                placeholder="Замерить"
                value={bpBefore}
                onChange={(e) => setBpBefore(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                АД после
              </label>
              <input
                type="text"
                placeholder="После"
                value={bpAfter}
                onChange={(e) => setBpAfter(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <input
              type="text"
              placeholder="Осанка до тренировки (наклон головы/плеч/таза)..."
              value={postureBeforeSummary}
              onChange={(e) => setPostureBeforeSummary(e.target.value)}
              className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              placeholder="Осанка после тренировки..."
              value={postureAfterSummary}
              onChange={(e) => setPostureAfterSummary(e.target.value)}
              className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
              Заметка тренера в отчёт ({completedExercises.length} упр. оценено)
            </label>
            <input
              type="text"
              placeholder="Самочувствие клиента, акценты по тяге..."
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>
      </div>
      </div>

      {/* Exercise Rating & Trainer Notes Modal */}
      {pendingFeedback && activeClient && (
        <ExerciseFeedbackModal
          stats={pendingFeedback.stats}
          clientName={activeClient.name}
          onSave={handleSaveExerciseFeedback}
          onCancel={() => setPendingFeedback(null)}
        />
      )}

      {/* Full Session Report Modal after finishing */}
      {showSavedReportModal && lastSavedReport && (
        <SessionReportModal
          session={lastSavedReport}
          studio={studios.find((s) => s.id === lastSavedReport.studioId) || studios[0]}
          onClose={() => setShowSavedReportModal(false)}
        />
      )}

      {/* Payment Modal on Finish Workout */}
      {showPaymentModal && activeClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-cyan-600" />
                <h3 className="font-display text-lg font-semibold">Завершение и оплата тренировки</h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {formatTimer(Math.max(60, sessionElapsedSec))}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-sm">{activeClient.name}</div>
              <div className="text-slate-500">
                Тяга: {minWinchKg.toFixed(1)}–{peakWinchKg.toFixed(1)} кг · Симметрия: {symmetryPct}% · Упражнений: {completedExercises.length}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Способ расчёта
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['paid_card', 'Банковская карта'],
                    ['paid_cash', 'Наличные'],
                    ['paid_subscription', 'Списать с абонемента'],
                    ['paid_certificate', 'Сертификат'],
                  ] as const
                ).map(([method, label]) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`p-2.5 text-left rounded-lg border text-xs font-medium cursor-pointer ${
                      paymentMethod === method
                        ? 'border-cyan-600 bg-cyan-50/70 dark:bg-cyan-950/30 text-cyan-800 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(paymentMethod === 'paid_subscription' || paymentMethod === 'paid_certificate') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Активные абонементы / сертификаты клиента
                </label>
                {clientSubs.length > 0 ? (
                  <select
                    value={selectedSubId}
                    onChange={(e) => setSelectedSubId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {clientSubs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.planName} ({s.code}) — осталось {s.remainingSessions} из {s.totalSessions}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-amber-600">
                    У клиента нет активных абонементов или сертификатов. Выберите оплату картой или наличными.
                  </div>
                )}
              </div>
            )}

            {(paymentMethod === 'paid_card' || paymentMethod === 'paid_cash') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Базовая стоимость (₽)
                  </label>
                  <input
                    type="number"
                    value={baseAmountRub}
                    onChange={(e) => setBaseAmountRub(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Промокод
                  </label>
                  <input
                    type="text"
                    placeholder="FIRST20"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Итого к оплате</div>
                <div className="font-mono text-xl font-bold tabular-nums">
                  {finalPayAmount.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Назад
                </button>
                <button
                  type="button"
                  disabled={savingSession}
                  onClick={handleConfirmPaymentAndSave}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-cyan-600 text-white hover:bg-slate-800 dark:hover:bg-cyan-500 cursor-pointer"
                >
                  {savingSession ? 'Сохранение...' : 'Провести оплату и сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {nativePickerTarget && (
        <NativeBluetoothModal
          device={nativePickerTarget.device}
          titleOverride={
            nativePickerTarget.bpPhase
              ? `Тонометр (${nativePickerTarget.bpPhase === 'before' ? 'до' : 'после'}) — Штатный Bluetooth`
              : undefined
          }
          onClose={() => setNativePickerTarget(null)}
          onSelectDevice={async (sel) => {
            const target = nativePickerTarget;
            setNativePickerTarget(null);
            if (target.bpPhase) {
              await handleMeasureBpBle(target.bpPhase, false, sel);
            } else {
              await toggleEquipmentConnect(target.device, 'native_bluetooth', false, sel);
            }
          }}
        />
      )}
    </div>
  );
};
