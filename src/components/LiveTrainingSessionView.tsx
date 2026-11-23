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
import { measureBloodPressureBle } from '../utils/bluetooth';
import {
  connectRealHardwareDevice,
  disconnectRealHardwareDevice,
  useHardwareTelemetry,
} from '../utils/hardwareManager';
import { exportSessionReportPdf } from '../utils/pdfReport';

interface LiveSessionProps {
  currentUser: UserAccount;
  studios: Studio[];
  clients: ClientProfile[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  equipment: EquipmentDevice[];
  clientSubscriptions: ClientSubscription[];
  promos: PromoCode[];
  activeBooking: Booking | null;
  initialProgramId?: string | null;
  onSessionSaved: (session: TrainingSessionRecord) => void;
  onClientUpdated?: (client: ClientProfile) => void;
  onDeviceUpdated: (device: EquipmentDevice) => void;
}

interface PinOffsets {
  rh: { x: number; y: number };
  lh: { x: number; y: number };
  rf: { x: number; y: number };
  lf: { x: number; y: number };
}

// Изображения фронтальные: правая сторона клиента находится слева на схеме, левая — справа
const DEFAULT_PINS: PinOffsets = {
  rh: { x: 22, y: 18 },
  lh: { x: 78, y: 18 },
  rf: { x: 26, y: 85 },
  lf: { x: 74, y: 85 },
};

const PIN_LABELS: Record<keyof PinOffsets, string> = {
  rh: 'Пр. рук',
  lh: 'Лев. рук',
  rf: 'Пр. ног',
  lf: 'Лев. ног',
};

export const LiveTrainingSessionView: React.FC<LiveSessionProps> = ({
  currentUser,
  studios,
  clients,
  exercises,
  programs,
  equipment,
  clientSubscriptions,
  promos,
  activeBooking,
  initialProgramId,
  onSessionSaved,
  onClientUpdated,
  onDeviceUpdated,
}) => {
  const [selectedClientId, setSelectedClientId] = useState(
    activeBooking?.clientId || clients[0]?.id || ''
  );
  const [selectionMode, setSelectionMode] = useState<'program' | 'exercise'>('program');
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id || '');
  const [exerciseIndex, setExerciseIndex] = useState(0);

  // Live Transport State
  const [exerciseState, setExerciseState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [exerciseElapsedSec, setExerciseElapsedSec] = useState(0);
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);
  const [targetWinchKg, setTargetWinchKg] = useState(120);
  const [completedExercises, setCompletedExercises] = useState<CompletedExerciseLog[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [bpBefore, setBpBefore] = useState('124/80');
  const [bpAfter, setBpAfter] = useState('');
  const [heightBeforeCm, setHeightBeforeCm] = useState<string>('181.0');
  const [heightAfterCm, setHeightAfterCm] = useState<string>('');
  const [bpMeasuringPhase, setBpMeasuringPhase] = useState<'before' | 'after' | null>(null);
  const [bpBleStatus, setBpBleStatus] = useState<{
    phase: 'before' | 'after';
    sys?: number;
    dia?: number;
    map?: number;
    pulse?: number;
    mode?: 'web_bluetooth';
    deviceName?: string;
    measuredAt?: string;
    progressMsg?: string;
    error?: string;
  } | null>(null);
  const [sensorBusyId, setSensorBusyId] = useState<string | null>(null);
  const [sensorStatusMsg, setSensorStatusMsg] = useState<string>('');

  // Pin Alignment Calibration
  const [showPinTuner, setShowPinTuner] = useState(false);
  const [pins, setPins] = useState<PinOffsets>(DEFAULT_PINS);

  // Real Live Sensor Telemetry from connected physical hardware
  const liveSensors = useHardwareTelemetry();
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const tickRef = useRef(0);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentStatus>('paid_card');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [baseAmountRub, setBaseAmountRub] = useState(activeBooking?.finalAmountRub || 4200);
  const [savingSession, setSavingSession] = useState(false);
  const [lastSavedReport, setLastSavedReport] = useState<TrainingSessionRecord | null>(null);

  useEffect(() => {
    if (activeBooking) {
      setSelectedClientId(activeBooking.clientId);
      setBaseAmountRub(activeBooking.finalAmountRub);
    }
  }, [activeBooking]);

  useEffect(() => {
    if (initialProgramId) {
      setSelectionMode('program');
      setSelectedProgramId(initialProgramId);
      setExerciseIndex(0);
    }
  }, [initialProgramId]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || clients[0],
    [clients, selectedClientId]
  );

  useEffect(() => {
    if (!activeClient) return;
    const latest = activeClient.anthropometry[activeClient.anthropometry.length - 1];
    if (latest) {
      setHeightBeforeCm(String((latest.heightBeforeCm || latest.heightCm || 175).toFixed(1)));
      setHeightAfterCm('');
      setBpBefore(`${latest.bpSys}/${latest.bpDia}`);
      setBpAfter('');
      setBpBleStatus(null);
    }
  }, [activeClient?.id]);

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

  // Session Timers + Real Sensor History Recorder (zero simulated waveforms)
  useEffect(() => {
    const hasAnyLiveStream = esp32Connected || myoConnected || wahooConnected;
    const interval = setInterval(() => {
      tickRef.current += 1;

      if (exerciseState === 'running') {
        setExerciseElapsedSec((s) => s + 1);
        setSessionElapsedSec((s) => s + 1);
      }

      if (hasAnyLiveStream) {
        const point = { ...telemetryRef.current, t: tickRef.current };
        setHistory((prev) => [...prev.slice(-59), point]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [exerciseState, esp32Connected, myoConnected, wahooConnected]);

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
    if (telemetry.totalWinchKg <= 0) return 0;
    const left = telemetry.leftHandKg + telemetry.leftFootKg;
    const right = telemetry.rightHandKg + telemetry.rightFootKg;
    const maxSide = Math.max(left, right, 0.1);
    const diff = Math.abs(left - right);
    return Math.max(0, Math.round((1 - diff / maxSide) * 100));
  }, [telemetry]);

  const peakWinchKg = useMemo(() => {
    return Math.max(telemetry.totalWinchKg, ...history.map((h) => h.totalWinchKg));
  }, [telemetry, history]);

  const maxLimbLoads = useMemo(() => {
    return {
      lh: Math.max(telemetry.leftHandKg, ...history.map((h) => h.leftHandKg)),
      rh: Math.max(telemetry.rightHandKg, ...history.map((h) => h.rightHandKg)),
      lf: Math.max(telemetry.leftFootKg, ...history.map((h) => h.leftFootKg)),
      rf: Math.max(telemetry.rightFootKg, ...history.map((h) => h.rightFootKg)),
    };
  }, [telemetry, history]);

  const handleStartExercise = () => {
    setExerciseState('running');
  };

  const handlePauseToggle = () => {
    setExerciseState((prev) => (prev === 'running' ? 'paused' : 'running'));
  };

  const recordCurrentExercise = () => {
    if (!currentExercise) return;
    const avgEmg =
      history.length > 0
        ? Number(
            (history.reduce((a, b) => a + b.emgCh1Mv, 0) / history.length).toFixed(2)
          )
        : telemetry.emgCh1Mv;
    setCompletedExercises((prev) => [
      ...prev,
      {
        exerciseId: currentExercise.id,
        title: currentExercise.title,
        durationSec: Math.max(15, exerciseElapsedSec),
        maxWinchKg: peakWinchKg,
        avgEmgMv: avgEmg,
      },
    ]);
    setExerciseElapsedSec(0);
    setExerciseState('idle');
  };

  const handleCompleteExercise = () => {
    recordCurrentExercise();
  };

  const handleNextExercise = () => {
    if (exerciseElapsedSec > 0) {
      recordCurrentExercise();
    }
    setExerciseIndex((idx) => (idx + 1 < queueExercises.length ? idx + 1 : 0));
    setExerciseElapsedSec(0);
    setExerciseState('running');
  };

  const handleFinishSessionClick = () => {
    if (exerciseState !== 'idle' && exerciseElapsedSec > 0) {
      recordCurrentExercise();
    }
    setExerciseState('idle');
    setShowPaymentModal(true);
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

  const handleConfirmPaymentAndSave = async () => {
    if (!activeClient) return;
    setSavingSession(true);
    try {
      const prog = programs.find((p) => p.id === selectedProgramId);
      const saved = await apiRequest<TrainingSessionRecord>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: activeBooking?.id,
          studioId: activeBooking?.studioId || activeClient.studioId,
          clientId: activeClient.id,
          trainerId: currentUser.id,
          trainerName: currentUser.name,
          programId: selectionMode === 'program' ? prog?.id : undefined,
          programTitle:
            selectionMode === 'program'
              ? prog?.title || 'Плановая тренировка'
              : currentExercise?.title || 'Свободное упражнение',
          durationSec: Math.max(60, sessionElapsedSec),
          completedExercises,
          peakWinchKg,
          avgSymmetryPct: symmetryPct,
          maxLimbLoads,
          avgHrBpm: telemetry.heartRateBpm,
          bpBefore,
          bpAfter,
          heightBeforeCm: Number(heightBeforeCm) || undefined,
          heightAfterCm: Number(heightAfterCm) || undefined,
          notes: sessionNotes,
          paymentMethod,
          amountPaidRub: finalPayAmount,
          subscriptionId: selectedSubId || undefined,
        }),
      });
      onSessionSaved(saved);
      setLastSavedReport(saved);
      setShowPaymentModal(false);
    } finally {
      setSavingSession(false);
    }
  };

  const handleExportPdf = () => {
    const studio = studios.find((s) => s.id === (activeClient?.studioId || studios[0]?.id)) || studios[0];
    const prog = programs.find((p) => p.id === selectedProgramId);
    const paymentLabels: Record<PaymentStatus, string> = {
      unpaid: 'Не оплачено',
      paid_card: 'Банковская карта',
      paid_cash: 'Наличные',
      paid_subscription: 'Списание с абонемента',
      paid_certificate: 'Подарочный сертификат',
    };
    exportSessionReportPdf({
      studioName: studio?.name || 'ЭТАЛОН ПРАВИЛО',
      studioAddress: studio?.address || '',
      clientName: activeClient?.name || 'Клиент',
      trainerName: currentUser.name,
      programTitle:
        lastSavedReport?.programTitle ||
        (selectionMode === 'program' ? prog?.title || 'Комплекс' : currentExercise?.title || 'Упражнение'),
      dateStr: new Date().toISOString().slice(0, 10),
      durationSec: lastSavedReport?.durationSec || Math.max(60, sessionElapsedSec),
      peakWinchKg: lastSavedReport?.peakWinchKg ?? peakWinchKg,
      avgSymmetryPct: lastSavedReport?.avgSymmetryPct ?? symmetryPct,
      maxLimbLoads: lastSavedReport?.maxLimbLoads || maxLimbLoads,
      avgHrBpm: lastSavedReport?.avgHrBpm ?? telemetry.heartRateBpm,
      bpBefore,
      bpAfter,
      heightBeforeCm: lastSavedReport?.heightBeforeCm ?? (Number(heightBeforeCm) || undefined),
      heightAfterCm: lastSavedReport?.heightAfterCm ?? (Number(heightAfterCm) || undefined),
      completedExercises: lastSavedReport?.completedExercises || completedExercises,
      telemetryHistory: history,
      notes: sessionNotes,
      paymentLabel: paymentLabels[lastSavedReport?.paymentMethod || paymentMethod],
      amountPaidRub: lastSavedReport?.amountPaidRub ?? finalPayAmount,
    });
  };

  const toggleEquipmentConnect = async (
    dev: EquipmentDevice,
    transportOverride?: 'web_bluetooth' | 'web_serial' | 'websocket_bridge',
    acceptAllDevices?: boolean
  ) => {
    if (sensorBusyId) return;
    setSensorBusyId(dev.id);
    setSensorStatusMsg('');
    try {
      if (dev.connected && !transportOverride && !acceptAllDevices) {
        await disconnectRealHardwareDevice({ device: dev, onDeviceUpdated });
        setSensorStatusMsg(`${dev.name} отключён.`);
      } else {
        const res = await connectRealHardwareDevice({
          device: dev,
          transportOverride,
          acceptAllDevices,
          onDeviceUpdated,
          onDisconnectedNotice: (msg) => setSensorStatusMsg(msg),
        });
        setSensorStatusMsg(res.message);
      }
    } finally {
      setSensorBusyId(null);
    }
  };

  const handleMeasureBpBle = async (phase: 'before' | 'after', acceptAllDevices?: boolean) => {
    if (bpMeasuringPhase) return;
    setBpMeasuringPhase(phase);
    setBpBleStatus({ phase, progressMsg: 'Поиск тонометра (BleModule / YK-IBPA1 / 0x1810)...' });
    try {
      const b05Dev = equipment.find((d) => d.type === 'bp_b05');
      let lastPatchAt = 0;

      const res = await measureBloodPressureBle({
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

  return (
    <div className="lg:h-full flex flex-col gap-2.5 lg:overflow-hidden">
      {/* UPPER BAND: Left Session Controls · Center Upper Limb Load Silhouette · Right BLE & Winch */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_258px] xl:grid-cols-[276px_minmax(0,1fr)_288px] gap-2.5 items-stretch">
        {/* LEFT COLUMN: Client, Program/Exercise & Active Timer/Transport */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 min-h-0 overflow-y-auto">
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
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

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
              <select
                value={selectedProgramId}
                onChange={(e) => {
                  setSelectedProgramId(e.target.value);
                  setExerciseIndex(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.exerciseIds.length} упр.)
                  </option>
                ))}
              </select>
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
                    {ex.title} ({ex.category})
                  </option>
                ))}
              </select>
            )}
          </div>

          {currentExercise && (
            <div className="flex-1 min-h-0 flex flex-col justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 gap-2">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 truncate">
                      Упр. {exerciseIndex + 1}/{queueExercises.length} · {currentExercise.category}
                    </div>
                    <div className="font-display text-sm font-semibold mt-0.5 leading-snug line-clamp-2">
                      {currentExercise.title}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xl font-bold tabular-nums text-cyan-700 dark:text-cyan-400 leading-none">
                      {formatTimer(exerciseElapsedSec)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                      Цель: {formatTimer(currentExercise.defaultDurationSec)}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 truncate">
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

        {/* CENTER UPPER STAGE: Anatomical Silhouette Centered in Upper Screen */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col justify-between min-h-0 relative">
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h3 className="font-display text-sm sm:text-base font-semibold">
                Нагрузка на конечности (ESP32)
              </h3>
              <span className="text-xs text-slate-500">
                Симметрия: <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">{symmetryPct}%</span>
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Сессия: {formatTimer(sessionElapsedSec)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPinTuner((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Подровнять</span>
            </button>
          </div>

          {showPinTuner && (
            <div className="lg:absolute lg:top-11 lg:right-3 lg:z-20 lg:w-72 my-2 lg:my-0 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium">Позиция меток на схеме (%)</span>
                <button
                  type="button"
                  onClick={() => setPins(DEFAULT_PINS)}
                  className="text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Сбросить
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['rh', 'lh', 'rf', 'lf'] as const).map((k) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="font-mono w-14 text-slate-500 truncate">{PIN_LABELS[k]}</span>
                    <input
                      type="number"
                      min={2}
                      max={98}
                      value={pins[k].x}
                      onChange={(e) =>
                        setPins((p) => ({ ...p, [k]: { ...p[k], x: Number(e.target.value) } }))
                      }
                      className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                    />
                    <input
                      type="number"
                      min={2}
                      max={98}
                      value={pins[k].y}
                      onChange={(e) =>
                        setPins((p) => ({ ...p, [k]: { ...p[k], y: Number(e.target.value) } }))
                      }
                      className="w-12 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Centered Anatomical Diagram Canvas (mirror-swapped limbs) */}
          <div className="flex-1 min-h-[260px] sm:min-h-[340px] lg:min-h-0 w-full flex items-center justify-center py-0.5 lg:[container-type:size]">
            <div
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
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />

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
              </div>
            </div>
          </div>

          {/* Total Winch Readout + Threshold Alert Strip */}
          <div
            className={`shrink-0 mt-1 p-2.5 rounded-lg border transition-colors ${
              loadStatus === 'danger'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-100'
                : loadStatus === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-950 dark:text-amber-100'
                : 'bg-slate-950 text-white border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2.5 flex-wrap">
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
                  className={`font-mono text-xl font-bold tabular-nums ${
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

              {loadStatus !== 'normal' && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold ${
                    loadStatus === 'danger'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {loadStatus === 'danger'
                      ? 'Целевая тяга достигнута!'
                      : 'Приближение к целевой тяге'}
                  </span>
                </div>
              )}
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

        {/* RIGHT COLUMN: Compact BLE Devices + Target/Live Winch Controls */}
        <div className="flex flex-col gap-2.5 min-h-0">
          {/* Real Hardware Sensors (BLE / USB Serial / Wi-Fi WS) */}
          <div className="shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Реальные датчики (BLE / USB)
              </span>
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                {!wahooConnected && equipment.some((e) => e.type === 'wahoo_tickr') && (
                  <button
                    type="button"
                    disabled={sensorBusyId !== null}
                    onClick={() => {
                      const wahoo = equipment.find((e) => e.type === 'wahoo_tickr');
                      if (wahoo) toggleEquipmentConnect(wahoo, 'web_bluetooth', true);
                    }}
                    title="Открыть полный список всех BLE-устройств для Wahoo TICKR FIT"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <HeartPulse className="w-3 h-3 text-rose-500" />
                    <span>Wahoo: все BLE</span>
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
                    title="Открыть полный список всех BLE-устройств для тонометра B05"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Gauge className="w-3 h-3 text-cyan-600" />
                    <span>B05: все BLE</span>
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
                    title="Подключить ESP32 по USB-кабелю (Web Serial)"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Usb className="w-3 h-3" />
                    <span>ESP32 USB</span>
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
                            {dev.connectionMode === 'web_serial'
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
          <div className="flex-1 min-h-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 overflow-y-auto">
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
                  С датчика ESP32, кг
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
                    : 'Подключите ESP32 (BLE / USB / Wi-Fi) для реальной тяги'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LOWER BAND: Real-Time EMG & Winch Chart + Pre/Post Height/BP & Diary Note */}
      <div className="shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
        {/* Bottom-Left: EMG & Winch Chart */}
        <div className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
              <h3 className="font-display text-xs sm:text-sm font-semibold truncate">
                График MYOblue v1.2 и тяги
              </h3>
              <span className="text-[11px] text-slate-500">
                Пульс:{' '}
                <span className="font-mono font-semibold text-rose-600 tabular-nums">
                  {wahooConnected && telemetry.heartRateBpm === 0
                    ? liveSensors.wahoo.sensorContact === false
                      ? 'нет контакта'
                      : 'поиск...'
                    : `${telemetry.heartRateBpm} уд/мин`}
                </span>{' '}
                · CH1: <span className="font-mono font-semibold text-amber-600 tabular-nums">{telemetry.emgCh1Mv.toFixed(2)} мВ</span> · CH2: <span className="font-mono font-semibold text-cyan-600 tabular-nums">{telemetry.emgCh2Mv.toFixed(2)} мВ</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan-600" />
              <span>Экспорт PDF</span>
            </button>
          </div>

          <div className="w-full h-[84px] xl:h-[98px] rounded-lg bg-slate-950 p-2 border border-slate-800">
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
              <span className="w-3 h-0.5 bg-amber-500 inline-block" /> MYOblue CH1 (мВ)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> MYOblue CH2 (мВ)
            </span>
          </div>
        </div>

        {/* Bottom-Right: Height Before/After, BLE Tonometer B05 BP & Notes */}
        <div className="lg:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="font-display text-xs sm:text-sm font-semibold">
              Замеры (Рост / BLE Тонометр B05)
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
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
              {lastSavedReport && (
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-medium cursor-pointer whitespace-nowrap"
                >
                  <FileDown className="w-3 h-3" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Live BLE B05 Cuff Status / Last Reading Strip */}
          {(bpMeasuringPhase || bpBleStatus || bpElevated || (bpBeforeParsed && bpAfterParsed)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-[11px]">
              {bpMeasuringPhase ? (
                <span className="inline-flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span>
                    {bpBleStatus?.progressMsg ||
                      `Тонометр B05 BLE (0x1810): накачка манжеты (${bpMeasuringPhase === 'before' ? 'до' : 'после'})...`}
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
                      ? `B05 (${bpBleStatus.phase === 'before' ? 'До' : 'После'}): ${bpBleStatus.sys}/${bpBleStatus.dia} · Пульс ${bpBleStatus.pulse} · MAP ${bpBleStatus.map}`
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                Рост до (см)
              </label>
              <input
                type="number"
                step="0.1"
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
                placeholder="После виса"
                value={heightAfterCm}
                onChange={(e) => setHeightAfterCm(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                АД до (B05)
              </label>
              <input
                type="text"
                value={bpBefore}
                onChange={(e) => setBpBefore(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5 truncate">
                АД после (B05)
              </label>
              <input
                type="text"
                placeholder="После сессии"
                value={bpAfter}
                onChange={(e) => setBpAfter(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
              Заметка тренера в дневник
            </label>
            <input
              type="text"
              placeholder="Самочувствие клиента, акценты по тяге..."
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>
      </div>

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
                Макс. тяга: {peakWinchKg.toFixed(1)} кг · Симметрия: {symmetryPct}% · Выполнено упражнений: {completedExercises.length}
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
    </div>
  );
};
