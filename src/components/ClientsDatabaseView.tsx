import React, { useMemo, useState } from 'react';
import {
  Plus,
  Ruler,
  MessageSquarePlus,
  Play,
  Scale,
  RefreshCw,
  ArrowUpRight,
  CheckCircle2,
  Cake,
  Bluetooth,
  BluetoothOff,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AnthropometryRecord,
  ClientActivityStatus,
  ClientProfile,
  ClientSubscription,
  EquipmentDevice,
  Studio,
  TrainingSessionRecord,
} from '../types';
import { apiRequest } from '../utils/api';
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
import { MiScale2Breakdown } from './MiScale2Breakdown';
import { PostureComparisonSection } from './PostureComparisonSection';

interface ClientsDatabaseProps {
  studios: Studio[];
  selectedStudioId: string;
  clients: ClientProfile[];
  sessions: TrainingSessionRecord[];
  clientSubscriptions: ClientSubscription[];
  scaleDevice?: EquipmentDevice;
  onDeviceUpdated?: (dev: EquipmentDevice) => void;
  onClientAdded: (c: ClientProfile) => void;
  onClientUpdated: (c: ClientProfile) => void;
  onAnthropometryAdded: (clientId: string, rec: AnthropometryRecord) => void;
  onAnthropometryUpdated: (clientId: string, rec: AnthropometryRecord) => void;
  onAnthropometryDeleted?: (clientId: string, recId: string) => void;
  onNoteAdded: (clientId: string, note: { id: string; date: string; authorName: string; text: string }) => void;
  onOpenInSession: (clientId: string) => void;
}

const BODY_TYPES = [
  'Стандартный',
  'Спортивный',
  'Мускулистый',
  'Плотное телосложение',
  'Худощавый',
  'Скрытая полнота',
  'Недостаток мышц',
  'Избыточный вес',
];

export const ClientsDatabaseView: React.FC<ClientsDatabaseProps> = ({
  studios,
  selectedStudioId,
  clients,
  sessions,
  clientSubscriptions,
  scaleDevice,
  onDeviceUpdated,
  onClientAdded,
  onClientUpdated,
  onAnthropometryAdded,
  onAnthropometryUpdated,
  onAnthropometryDeleted,
  onNoteAdded,
  onOpenInSession,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientActivityStatus>('all');
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || '');
  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [showAddAnthro, setShowAddAnthro] = useState(false);
  const [editingAnthroId, setEditingAnthroId] = useState<string | null>(null);
  const [confirmDeleteAnthroId, setConfirmDeleteAnthroId] = useState<string | null>(null);
  const [busyDeleteAnthroId, setBusyDeleteAnthroId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [postHeightInput, setPostHeightInput] = useState('');

  // Edit Client Personal Data Form
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female'>('male');
  const [editBirthDate, setEditBirthDate] = useState('1990-05-15');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTg, setEditTg] = useState('');
  const [editStudio, setEditStudio] = useState(studios[0]?.id || '');
  const [editGoal, setEditGoal] = useState('');
  const [editContra, setEditContra] = useState('');
  const [editStatus, setEditStatus] = useState<ClientActivityStatus>('active');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Live Mi Scale 2 BLE direct measurement state
  const liveSensors = useHardwareTelemetry();
  const hwCaps = useMemo(() => getHardwareCapabilities(), []);
  const [bleBusy, setBleBusy] = useState(false);
  const [bleStatusMsg, setBleStatusMsg] = useState('');
  const [bleStatusError, setBleStatusError] = useState(false);
  const [directHeightCm, setDirectHeightCm] = useState<string>('');
  const [savingLiveScale, setSavingLiveScale] = useState(false);

  // New Client Form
  const [cName, setCName] = useState('');
  const [cGender, setCGender] = useState<'male' | 'female'>('male');
  const [cBirthDate, setCBirthDate] = useState('1990-05-15');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cTg, setCTg] = useState('');
  const [cStudio, setCStudio] = useState(studios[0]?.id || '');
  const [cGoal, setCGoal] = useState('');
  const [cContra, setCContra] = useState('');

  // Anthropometry + Mi Body Composition Scale 2 Form
  const [anthroDate, setAnthroDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [phase, setPhase] = useState<'before' | 'paired'>('before');
  const [heightBeforeCm, setHeightBeforeCm] = useState<number>(176.0);
  const [heightAfterCm, setHeightAfterCm] = useState<string>('');
  const [weightKg, setWeightKg] = useState<number>(76.4);
  const [impedanceOhm, setImpedanceOhm] = useState<number>(465);
  const [bodyFatPct, setBodyFatPct] = useState<number>(18.5);
  const [muscleMassKg, setMuscleMassKg] = useState<number>(59.2);
  const [waterPct, setWaterPct] = useState<number>(58.4);
  const [proteinPct, setProteinPct] = useState<number>(17.6);
  const [visceralFatLevel, setVisceralFatLevel] = useState<number>(7);
  const [boneMassKg, setBoneMassKg] = useState<number>(2.9);
  const [bmrKcal, setBmrKcal] = useState<number>(1680);
  const [idealWeightKg, setIdealWeightKg] = useState<number>(68.1);
  const [bodyAgeYears, setBodyAgeYears] = useState<number>(35);
  const [bodyScore, setBodyScore] = useState<number>(86);
  const [bodyType, setBodyType] = useState<string>('Стандартный');
  const [balanceTestSec, setBalanceTestSec] = useState<number>(42);
  const [bpSys, setBpSys] = useState(122);
  const [bpDia, setBpDia] = useState(78);
  const [pulseRest, setPulseRest] = useState(66);
  const [flexibility, setFlexibility] = useState(74);
  const [painIndex, setPainIndex] = useState(2);
  const [anthroNotes, setAnthroNotes] = useState('');
  const [anthroSaving, setAnthroSaving] = useState(false);
  const [anthroError, setAnthroError] = useState('');

  const scaleCalibration = scaleDevice?.calibration || DEFAULT_MI_SCALE_CALIBRATION;

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const studioOk = selectedStudioId === 'all' || c.studioId === selectedStudioId;
      const clStatus: ClientActivityStatus = c.clientStatus === 'inactive' ? 'inactive' : 'active';
      const statusOk = statusFilter === 'all' || clStatus === statusFilter;
      const searchOk =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q);
      return studioOk && statusOk && searchOk;
    });
  }, [clients, selectedStudioId, statusFilter, search]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || filteredClients[0] || clients[0],
    [clients, filteredClients, selectedClientId]
  );

  const clientSessions = useMemo(
    () => sessions.filter((s) => s.clientId === activeClient?.id),
    [sessions, activeClient]
  );

  const clientSubs = useMemo(
    () => clientSubscriptions.filter((s) => s.clientId === activeClient?.id),
    [clientSubscriptions, activeClient]
  );

  const latestAnthro = activeClient?.anthropometry[activeClient.anthropometry.length - 1];
  const firstAnthro = activeClient?.anthropometry[0];

  const openAnthroModal = () => {
    setEditingAnthroId(null);
    setAnthroError('');
    setAnthroDate(new Date().toISOString().slice(0, 10));
    setAnthroNotes('');
    if (activeClient) {
      const last = activeClient.anthropometry[activeClient.anthropometry.length - 1];
      const h = last?.heightBeforeCm || last?.heightCm || (activeClient.gender === 'female' ? 168 : 179);
      const w = last?.weightKg || (activeClient.gender === 'female' ? 60.5 : 80.0);
      const imp = last?.impedanceOhm || (activeClient.gender === 'female' ? 525 : 460);
      const age = new Date().getFullYear() - (activeClient.birthYear || 1990);
      const calc = calculateMiScale2Metrics({
        rawWeightKg: w,
        heightCm: h,
        ageYears: age,
        gender: activeClient.gender || 'male',
        rawImpedanceOhm: imp,
        balanceTestSec: last?.balanceTestSec ?? 42,
        calibration: scaleCalibration,
      });

      setPhase('before');
      setHeightBeforeCm(h);
      setHeightAfterCm('');
      setWeightKg(last?.weightKg ?? calc.weightKg);
      setImpedanceOhm(last?.impedanceOhm ?? calc.impedanceOhm);
      setBodyFatPct(last?.bodyFatPct ?? calc.bodyFatPct);
      setMuscleMassKg(last?.muscleMassKg ?? calc.muscleMassKg);
      setWaterPct(last?.waterPct ?? calc.waterPct);
      setProteinPct(last?.proteinPct ?? calc.proteinPct);
      setVisceralFatLevel(last?.visceralFatLevel ?? calc.visceralFatLevel);
      setBoneMassKg(last?.boneMassKg ?? calc.boneMassKg);
      setBmrKcal(last?.bmrKcal ?? calc.bmrKcal);
      setIdealWeightKg(last?.idealWeightKg ?? calc.idealWeightKg);
      setBodyAgeYears(last?.bodyAgeYears ?? calc.bodyAgeYears);
      setBodyScore(last?.bodyScore ?? calc.bodyScore);
      setBodyType(last?.bodyType ?? calc.bodyType);
      setBalanceTestSec(last?.balanceTestSec ?? calc.balanceTestSec ?? 42);
      setBpSys(last?.bpSys ?? 120);
      setBpDia(last?.bpDia ?? 78);
      setPulseRest(last?.pulseRest ?? 66);
      setFlexibility(last?.flexibilityScore ?? 72);
      setPainIndex(last?.painIndex ?? 2);
    }
    setShowAddAnthro(true);
  };

  const openEditAnthroModal = (rec: AnthropometryRecord) => {
    setEditingAnthroId(rec.id);
    setAnthroError('');
    setAnthroDate(rec.date || new Date().toISOString().slice(0, 10));
    setPhase(rec.heightAfterCm ? 'paired' : 'before');
    setHeightBeforeCm(rec.heightBeforeCm || rec.heightCm || 175);
    setHeightAfterCm(rec.heightAfterCm !== undefined ? String(rec.heightAfterCm) : '');
    setWeightKg(rec.weightKg);
    setImpedanceOhm(rec.impedanceOhm);
    setBodyFatPct(rec.bodyFatPct);
    setMuscleMassKg(rec.muscleMassKg);
    setWaterPct(rec.waterPct);
    setProteinPct(rec.proteinPct);
    setVisceralFatLevel(rec.visceralFatLevel);
    setBoneMassKg(rec.boneMassKg);
    setBmrKcal(rec.bmrKcal);
    setIdealWeightKg(rec.idealWeightKg);
    setBodyAgeYears(rec.bodyAgeYears);
    setBodyScore(rec.bodyScore);
    setBodyType(rec.bodyType || 'Стандартный');
    setBalanceTestSec(rec.balanceTestSec ?? 42);
    setBpSys(rec.bpSys);
    setBpDia(rec.bpDia);
    setPulseRest(rec.pulseRest);
    setFlexibility(rec.flexibilityScore);
    setPainIndex(rec.painIndex);
    setAnthroNotes(rec.notes || '');
    setShowAddAnthro(true);
  };

  const handleRecalculateMiScale2 = () => {
    if (!activeClient) return;
    const age = new Date().getFullYear() - (activeClient.birthYear || 1990);
    const calc = calculateMiScale2Metrics({
      rawWeightKg: weightKg,
      heightCm: heightBeforeCm,
      ageYears: age,
      gender: activeClient.gender || 'male',
      rawImpedanceOhm: impedanceOhm,
      balanceTestSec,
      calibration: scaleCalibration,
    });
    setWeightKg(calc.weightKg);
    setBodyFatPct(calc.bodyFatPct);
    setMuscleMassKg(calc.muscleMassKg);
    setWaterPct(calc.waterPct);
    setProteinPct(calc.proteinPct);
    setVisceralFatLevel(calc.visceralFatLevel);
    setBoneMassKg(calc.boneMassKg);
    setBmrKcal(calc.bmrKcal);
    setIdealWeightKg(calc.idealWeightKg);
    setBodyAgeYears(calc.bodyAgeYears);
    setBodyScore(calc.bodyScore);
    setBodyType(calc.bodyType);
    setImpedanceOhm(calc.impedanceOhm);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await apiRequest<ClientProfile>('/api/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: cName,
        gender: cGender,
        birthDate: cBirthDate,
        phone: cPhone,
        email: cEmail,
        telegram: cTg,
        studioId: cStudio,
        goal: cGoal,
        contraindications: cContra,
      }),
    });
    onClientAdded(created);
    setSelectedClientId(created.id);
    setShowAddClient(false);
    setCName('');
    setCGender('male');
    setCBirthDate('1990-05-15');
    setCPhone('');
    setCEmail('');
    setCTg('');
  };

  const openEditClientModal = () => {
    if (!activeClient) return;
    setEditName(activeClient.name || '');
    setEditGender(activeClient.gender || 'male');
    setEditBirthDate(activeClient.birthDate || `${activeClient.birthYear || 1990}-05-14`);
    setEditPhone(activeClient.phone || '');
    setEditEmail(activeClient.email || '');
    setEditTg(activeClient.telegram || '');
    setEditStudio(activeClient.studioId || studios[0]?.id || '');
    setEditGoal(activeClient.goal || '');
    setEditContra(activeClient.contraindications || '');
    setEditStatus(activeClient.clientStatus === 'inactive' ? 'inactive' : 'active');
    setEditError('');
    setShowEditClient(true);
  };

  const handleSaveEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient) return;
    setEditError('');
    setEditSaving(true);
    try {
      const updated = await apiRequest<ClientProfile>(`/api/clients/${activeClient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          gender: editGender,
          birthDate: editBirthDate,
          phone: editPhone.trim(),
          email: editEmail.trim(),
          telegram: editTg.trim(),
          studioId: editStudio,
          goal: editGoal.trim(),
          contraindications: editContra.trim(),
          clientStatus: editStatus,
        }),
      });
      onClientUpdated(updated);
      setShowEditClient(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Не удалось сохранить данные клиента');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleGender = async (gender: 'male' | 'female') => {
    if (!activeClient || activeClient.gender === gender) return;
    const updated = await apiRequest<ClientProfile>(`/api/clients/${activeClient.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ gender }),
    });
    onClientUpdated(updated);
  };

  const handleToggleClientStatus = async (clientStatus: ClientActivityStatus) => {
    if (!activeClient) return;
    const currentStatus: ClientActivityStatus =
      activeClient.clientStatus === 'inactive' ? 'inactive' : 'active';
    if (currentStatus === clientStatus) return;
    const updated = await apiRequest<ClientProfile>(`/api/clients/${activeClient.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ clientStatus }),
    });
    onClientUpdated(updated);
  };

  const handleUpdateBirthDate = async (birthDate: string) => {
    if (!activeClient || !birthDate || birthDate === activeClient.birthDate) return;
    const updated = await apiRequest<ClientProfile>(`/api/clients/${activeClient.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ birthDate }),
    });
    onClientUpdated(updated);
  };

  const resolvedDirectHeightCm = useMemo(() => {
    const parsed = Number(directHeightCm);
    if (parsed > 90 && parsed < 240) return parsed;
    if (latestAnthro?.heightBeforeCm) return latestAnthro.heightBeforeCm;
    if (latestAnthro?.heightCm) return latestAnthro.heightCm;
    return activeClient?.gender === 'female' ? 168 : 178;
  }, [directHeightCm, latestAnthro, activeClient?.gender]);

  const liveScaleMetrics = useMemo(() => {
    if (!activeClient || liveSensors.scale.rawWeightKg === null) return null;
    const age = new Date().getFullYear() - (activeClient.birthYear || 1990);
    return calculateMiScale2Metrics({
      rawWeightKg: liveSensors.scale.rawWeightKg,
      heightCm: resolvedDirectHeightCm,
      ageYears: age,
      gender: activeClient.gender || 'male',
      rawImpedanceOhm: liveSensors.scale.rawImpedanceOhm ?? undefined,
      calibration: scaleCalibration,
    });
  }, [
    activeClient,
    liveSensors.scale.rawWeightKg,
    liveSensors.scale.rawImpedanceOhm,
    resolvedDirectHeightCm,
    scaleCalibration,
  ]);

  const handleConnectScaleBle = async () => {
    if (!scaleDevice) {
      setBleStatusError(true);
      setBleStatusMsg('Весы Mi Body Composition Scale 2 не настроены в оборудовании студии.');
      return;
    }
    setBleBusy(true);
    setBleStatusError(false);
    setBleStatusMsg('');
    try {
      const res = await connectRealHardwareDevice({
        device: scaleDevice,
        onDeviceUpdated: onDeviceUpdated || (() => undefined),
      });
      setBleStatusError(!res.success);
      setBleStatusMsg(res.message);
    } finally {
      setBleBusy(false);
    }
  };

  const handleDisconnectScaleBle = async () => {
    if (!scaleDevice) return;
    setBleBusy(true);
    try {
      await disconnectRealHardwareDevice({
        device: scaleDevice,
        onDeviceUpdated: onDeviceUpdated || (() => undefined),
      });
      setBleStatusError(false);
      setBleStatusMsg('Весы Mi Scale 2 отключены.');
    } finally {
      setBleBusy(false);
    }
  };

  const handleSaveLiveScaleReading = async () => {
    if (!activeClient || !liveScaleMetrics) return;
    setSavingLiveScale(true);
    setBleStatusError(false);
    try {
      const rec = await apiRequest<AnthropometryRecord>(
        `/api/clients/${activeClient.id}/anthropometry`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...liveScaleMetrics,
            phase: 'before',
            heightCm: resolvedDirectHeightCm,
            heightBeforeCm: resolvedDirectHeightCm,
            bpSys: latestAnthro?.bpSys ?? 120,
            bpDia: latestAnthro?.bpDia ?? 78,
            pulseRest: latestAnthro?.pulseRest ?? 68,
            flexibilityScore: latestAnthro?.flexibilityScore ?? 74,
            painIndex: latestAnthro?.painIndex ?? 2,
            calibratedScale: scaleCalibration.calibrated,
            notes: `Прямой замер BLE Mi Body Composition Scale 2: ${liveScaleMetrics.weightKg} кг, импеданс ${liveScaleMetrics.impedanceOhm} Ω, рост до ${resolvedDirectHeightCm.toFixed(1)} см`,
          }),
        }
      );
      onAnthropometryAdded(activeClient.id, rec);
      setBleStatusMsg(
        `Взвешивание (${liveScaleMetrics.weightKg} кг, жир ${liveScaleMetrics.bodyFatPct}%, мышцы ${liveScaleMetrics.muscleMassKg} кг) записано в карту клиента.`
      );
    } catch (err) {
      setBleStatusError(true);
      setBleStatusMsg(
        err instanceof Error ? err.message : 'Не удалось сохранить замер весов'
      );
    } finally {
      setSavingLiveScale(false);
    }
  };

  const handlePullLiveScaleToModal = () => {
    if (!activeClient || liveSensors.scale.rawWeightKg === null) return;
    const age = new Date().getFullYear() - (activeClient.birthYear || 1990);
    const calc = calculateMiScale2Metrics({
      rawWeightKg: liveSensors.scale.rawWeightKg,
      heightCm: heightBeforeCm,
      ageYears: age,
      gender: activeClient.gender || 'male',
      rawImpedanceOhm: liveSensors.scale.rawImpedanceOhm ?? undefined,
      balanceTestSec,
      calibration: scaleCalibration,
    });
    setWeightKg(calc.weightKg);
    setImpedanceOhm(calc.impedanceOhm);
    setBodyFatPct(calc.bodyFatPct);
    setMuscleMassKg(calc.muscleMassKg);
    setWaterPct(calc.waterPct);
    setProteinPct(calc.proteinPct);
    setVisceralFatLevel(calc.visceralFatLevel);
    setBoneMassKg(calc.boneMassKg);
    setBmrKcal(calc.bmrKcal);
    setIdealWeightKg(calc.idealWeightKg);
    setBodyAgeYears(calc.bodyAgeYears);
    setBodyScore(calc.bodyScore);
    setBodyType(calc.bodyType);
  };

  const handleSaveAnthro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient) return;
    setAnthroError('');
    setAnthroSaving(true);
    try {
      const parsedAfter =
        heightAfterCm.trim() && Number(heightAfterCm) > 0 ? Number(heightAfterCm) : undefined;
      const hCm = parsedAfter ?? heightBeforeCm;
      const bmi = Number((weightKg / Math.pow(hCm / 100, 2)).toFixed(1));
      const defaultNotes =
        parsedAfter !== undefined
          ? `Замер до/после + Mi Body Composition Scale 2 (рост ${heightBeforeCm.toFixed(1)} → ${parsedAfter.toFixed(1)} см)`
          : `Входной замер до тренировки: рост ${heightBeforeCm.toFixed(1)} см · Mi Body Composition Scale 2`;

      const payload = {
        date: anthroDate || new Date().toISOString().slice(0, 10),
        phase: parsedAfter !== undefined ? 'paired' : 'before',
        heightCm: hCm,
        heightBeforeCm,
        heightAfterCm: editingAnthroId ? (parsedAfter ?? null) : parsedAfter,
        weightKg,
        bmi,
        bodyFatPct,
        muscleMassKg,
        waterPct,
        proteinPct,
        visceralFatLevel,
        boneMassKg,
        bmrKcal,
        idealWeightKg,
        bodyAgeYears,
        bodyScore,
        bodyType,
        impedanceOhm,
        balanceTestSec,
        bpSys,
        bpDia,
        pulseRest,
        flexibilityScore: flexibility,
        painIndex,
        calibratedScale: scaleCalibration.calibrated,
        notes: anthroNotes.trim() || defaultNotes,
      };

      if (editingAnthroId) {
        const updated = await apiRequest<AnthropometryRecord>(
          `/api/clients/${activeClient.id}/anthropometry/${editingAnthroId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );
        onAnthropometryUpdated(activeClient.id, updated);
      } else {
        const rec = await apiRequest<AnthropometryRecord>(
          `/api/clients/${activeClient.id}/anthropometry`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        onAnthropometryAdded(activeClient.id, rec);
      }
      setShowAddAnthro(false);
      setEditingAnthroId(null);
    } catch (err) {
      setAnthroError(
        err instanceof Error ? err.message : 'Не удалось сохранить данные замера'
      );
    } finally {
      setAnthroSaving(false);
    }
  };

  const handleDeleteAnthro = async (recId: string) => {
    if (!activeClient) return;
    setBusyDeleteAnthroId(recId);
    try {
      await apiRequest(`/api/clients/${activeClient.id}/anthropometry/${recId}`, {
        method: 'DELETE',
      });
      setConfirmDeleteAnthroId(null);
      onAnthropometryDeleted?.(activeClient.id, recId);
    } finally {
      setBusyDeleteAnthroId(null);
    }
  };

  const handleRecordPostHeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !latestAnthro || !postHeightInput.trim()) return;
    const afterVal = Number(postHeightInput);
    if (!afterVal || afterVal < 100) return;
    const updated = await apiRequest<AnthropometryRecord>(
      `/api/clients/${activeClient.id}/anthropometry/${latestAnthro.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          heightAfterCm: afterVal,
          notes: `${latestAnthro.notes} · Рост после тренировки: ${afterVal.toFixed(1)} см`,
        }),
      }
    );
    onAnthropometryUpdated(activeClient.id, updated);
    setPostHeightInput('');
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !noteDraft.trim()) return;
    const note = await apiRequest<{ id: string; date: string; authorName: string; text: string }>(
      `/api/clients/${activeClient.id}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ text: noteDraft.trim() }),
      }
    );
    onNoteAdded(activeClient.id, note);
    setNoteDraft('');
  };

  const courseHeightDelta = useMemo(() => {
    if (!firstAnthro || !latestAnthro) return null;
    const startH = firstAnthro.heightBeforeCm || firstAnthro.heightCm;
    const currentH = latestAnthro.heightAfterCm ?? latestAnthro.heightBeforeCm ?? latestAnthro.heightCm;
    return Number((currentH - startH).toFixed(1));
  }, [firstAnthro, latestAnthro]);

  const modalHeightDelta =
    heightAfterCm.trim() && Number(heightAfterCm) > 0
      ? Number((Number(heightAfterCm) - heightBeforeCm).toFixed(1))
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Client List */}
      <div className="lg:col-span-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold">База клиентов ({filteredClients.length})</h3>
            <button
              type="button"
              onClick={() => setShowAddClient(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Новый</span>
            </button>
          </div>
          <input
            type="search"
            placeholder="Поиск по ФИО, телефону, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px]">
            {(
              [
                ['all', 'Все'],
                ['active', 'Активные'],
                ['inactive', 'Не ходят'],
              ] as const
            ).map(([sk, sl]) => (
              <button
                key={sk}
                type="button"
                onClick={() => setStatusFilter(sk)}
                className={`py-1 rounded font-medium cursor-pointer ${
                  statusFilter === sk
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                {sl}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[640px] overflow-y-auto">
          {filteredClients.map((cl) => {
            const isSelected = cl.id === activeClient?.id;
            const st = studios.find((s) => s.id === cl.studioId);
            const isInactive = cl.clientStatus === 'inactive';
            return (
              <button
                key={cl.id}
                type="button"
                onClick={() => {
                  setSelectedClientId(cl.id);
                  setPostHeightInput('');
                  setDirectHeightCm('');
                }}
                className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-50/70 dark:bg-cyan-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{cl.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-medium ${
                        isInactive
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isInactive ? 'Не ходит' : 'Активный'}
                    </span>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {cl.totalSessions} сес.
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {cl.phone} · {st?.name || 'Студия'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Client Profile Details */}
      {activeClient && (
        <div className="lg:col-span-8 space-y-5">
          {/* Header Card */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-bold">{activeClient.name}</h2>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded border ${
                      activeClient.clientStatus === 'inactive'
                        ? 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30'
                        : 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                    }`}
                  >
                    {activeClient.clientStatus === 'inactive' ? 'Не ходит' : 'Активный'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {activeClient.gender === 'female' ? 'Женский профиль' : 'Мужской профиль'} · {activeClient.phone} · {activeClient.email} · {activeClient.telegram || 'Telegram не указан'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggleClientStatus('active')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      activeClient.clientStatus !== 'inactive'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Активный
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleClientStatus('inactive')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      activeClient.clientStatus === 'inactive'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Не ходит
                  </button>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggleGender('male')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      activeClient.gender !== 'female'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Муж
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleGender('female')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      activeClient.gender === 'female'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Жен
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openEditClientModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Редактировать данные</span>
                </button>
                <button
                  type="button"
                  onClick={openAnthroModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Замер до/после + Mi Scale 2</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInSession(activeClient.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-cyan-500 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Начать тренировку</span>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-center">
              <div>
                <span className="text-slate-500">Цель тренировок: </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{activeClient.goal}</span>
              </div>
              <div>
                <span className="text-slate-500">Ограничения: </span>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {activeClient.contraindications}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <Cake className="w-3.5 h-3.5 text-cyan-600" />
                  Дата рождения:
                </span>
                <input
                  type="date"
                  value={activeClient.birthDate || `${activeClient.birthYear || 1990}-05-14`}
                  onChange={(e) => handleUpdateBirthDate(e.target.value)}
                  className="px-2 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                {(activeClient.birthDate || '').slice(5, 10) ===
                  `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    День рождения сегодня · Push отправлен
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Latest Anthropometry: Height Before/After + All Mi Body Composition Scale 2 Metrics */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-cyan-600" />
                <h3 className="font-display text-base font-semibold">
                  Антропометрия, замер роста и Mi Body Composition Scale 2
                </h3>
              </div>
              {latestAnthro && (
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-slate-500">
                  {latestAnthro.calibratedScale && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Калибровка OK
                    </span>
                  )}
                  <span>Замер: {latestAnthro.date}</span>
                  <button
                    type="button"
                    onClick={() => openEditAnthroModal(latestAnthro)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-sans font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Редактировать последний</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct Mi Body Composition Scale 2 BLE Capture Inside Anthropometry */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-cyan-600 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold">
                      Прямой замер с весов Mi Body Composition Scale 2 (BLE)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {liveSensors.scale.streaming
                        ? `Сигнал активен (${liveSensors.scale.lastPacketAt || 'live'}) · Встаньте на весы босиком`
                        : scaleDevice?.connected
                        ? 'Весы подключены — ожидание пакета взвешивания'
                        : 'Подключите реальные весы по Bluetooth и взвесьте клиента прямо в карте'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Рост (см):</span>
                    <input
                      type="number"
                      step="0.1"
                      min={100}
                      max={235}
                      value={directHeightCm || String(resolvedDirectHeightCm)}
                      onChange={(e) => setDirectHeightCm(e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </label>
                  {scaleDevice?.connected ? (
                    <button
                      type="button"
                      disabled={bleBusy}
                      onClick={handleDisconnectScaleBle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-white dark:hover:bg-slate-900 cursor-pointer disabled:opacity-50"
                    >
                      <BluetoothOff className="w-3.5 h-3.5" />
                      <span>Отключить</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={bleBusy}
                      onClick={handleConnectScaleBle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <Bluetooth className="w-3.5 h-3.5" />
                      <span>{bleBusy ? 'Поиск весов...' : 'Подключить весы BLE'}</span>
                    </button>
                  )}
                </div>
              </div>

              {(!hwCaps.webBluetooth || hwCaps.inIframe) && !bleStatusMsg && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300">
                  {hwCaps.inIframe
                    ? 'Примечание: при открытии в окне предпросмотра Web Bluetooth ограничен политикой iframe. Откройте приложение в отдельной вкладке или в Desktop-версии для прямого подключения весов.'
                    : 'Браузер не поддерживает Web Bluetooth — используйте Chrome/Edge или Desktop-приложение ЭТАЛОН ПРАВИЛО.'}
                </div>
              )}

              {bleStatusMsg && (
                <div
                  className={`p-2.5 rounded-lg text-xs border ${
                    bleStatusError
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {bleStatusMsg}
                </div>
              )}

              {liveScaleMetrics && (
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="font-bold text-sm text-cyan-700 dark:text-cyan-400">
                      {liveScaleMetrics.weightKg} кг
                    </span>
                    <span>Жир {liveScaleMetrics.bodyFatPct}%</span>
                    <span>Мышцы {liveScaleMetrics.muscleMassKg} кг</span>
                    <span>Вода {liveScaleMetrics.waterPct}%</span>
                    <span>Висц. {liveScaleMetrics.visceralFatLevel}</span>
                    <span>BIA {liveScaleMetrics.impedanceOhm} Ω</span>
                    <span>Оценка {liveScaleMetrics.bodyScore}/100</span>
                  </div>
                  <button
                    type="button"
                    disabled={savingLiveScale}
                    onClick={handleSaveLiveScaleReading}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    {savingLiveScale ? 'Запись...' : 'Записать взвешивание в карту'}
                  </button>
                </div>
              )}
            </div>

            {latestAnthro ? (
              <>
                {/* Height Before / After Decompression Dynamics */}
                <div className="p-4 rounded-xl bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200/80 dark:border-cyan-900/50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">
                      Динамика роста (декомпрессия позвоночника до и после тренировок)
                    </div>
                    {courseHeightDelta !== null && (
                      <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>
                          Общий сдвиг с 1-го замера: {courseHeightDelta >= 0 ? '+' : ''}
                          {courseHeightDelta.toFixed(1)} см
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-cyan-100 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Исходный рост (1-й замер)</div>
                      <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                        {(firstAnthro?.heightBeforeCm || firstAnthro?.heightCm || 0).toFixed(1)} см
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-cyan-100 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Рост до тренировки</div>
                      <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                        {latestAnthro.heightBeforeCm.toFixed(1)} см
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-cyan-100 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Рост после тренировки</div>
                      <div className="font-mono text-base font-bold tabular-nums mt-0.5 text-cyan-700 dark:text-cyan-400">
                        {latestAnthro.heightAfterCm ? `${latestAnthro.heightAfterCm.toFixed(1)} см` : 'Ожидает замера'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/80 border border-cyan-100 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500">Прирост за сессию (Δ)</div>
                      <div
                        className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                          typeof latestAnthro.heightDeltaCm === 'number' && latestAnthro.heightDeltaCm > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {typeof latestAnthro.heightDeltaCm === 'number'
                          ? `${latestAnthro.heightDeltaCm >= 0 ? '+' : ''}${latestAnthro.heightDeltaCm.toFixed(1)} см`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {latestAnthro.heightAfterCm === undefined && (
                    <form onSubmit={handleRecordPostHeight} className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        Ввести рост после тренировки для расчёта динамики:
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min={100}
                        max={235}
                        required
                        placeholder={String((latestAnthro.heightBeforeCm + 0.8).toFixed(1))}
                        value={postHeightInput}
                        onChange={(e) => setPostHeightInput(e.target.value)}
                        className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-cyan-500 cursor-pointer"
                      >
                        Зафиксировать рост после
                      </button>
                    </form>
                  )}
                </div>

                {/* All 13+ Mi Body Composition Scale 2 Metrics with Zepp Life Color Scales & Explanations */}
                <MiScale2Breakdown
                  metrics={latestAnthro}
                  gender={activeClient.gender || 'male'}
                  ageYears={new Date().getFullYear() - (activeClient.birthYear || 1990)}
                  heightCm={latestAnthro.heightAfterCm ?? latestAnthro.heightBeforeCm ?? latestAnthro.heightCm ?? 175}
                />

                {/* B05 + Functional Indices */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[11px] text-slate-500">Давление (тонометр)</div>
                    <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                      {latestAnthro.bpSys}/{latestAnthro.bpDia}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[11px] text-slate-500">Пульс покоя</div>
                    <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                      {latestAnthro.pulseRest} уд/мин
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[11px] text-slate-500">Гибкость</div>
                    <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                      {latestAnthro.flexibilityScore}/100
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[11px] text-slate-500">Индекс дискомфорта</div>
                    <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                      {latestAnthro.painIndex}/10
                    </div>
                  </div>
                </div>

                {/* History Table */}
                {activeClient.anthropometry.length > 0 && (
                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800 text-left">
                          <th className="py-1.5 pr-3 font-medium">Дата</th>
                          <th className="py-1.5 pr-3 font-medium">Рост до → после (Δ)</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Вес</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Жир</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Мышцы</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Вода</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Висц.</th>
                          <th className="py-1.5 pr-3 font-medium text-right">BMR</th>
                          <th className="py-1.5 pr-3 font-medium text-right">Оценка</th>
                          <th className="py-1.5 pr-3 font-medium text-right">АД / Пульс</th>
                          <th className="py-1.5 font-medium text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                        {activeClient.anthropometry
                          .slice()
                          .reverse()
                          .map((a) => {
                            const isConfirming = confirmDeleteAnthroId === a.id;
                            const isBusyDel = busyDeleteAnthroId === a.id;
                            return (
                              <tr key={a.id}>
                                <td className="py-1.5 pr-3">{a.date}</td>
                                <td className="py-1.5 pr-3">
                                  {a.heightBeforeCm.toFixed(1)}
                                  {a.heightAfterCm ? ` → ${a.heightAfterCm.toFixed(1)}` : ''} см
                                  {typeof a.heightDeltaCm === 'number' && (
                                    <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                                      ({a.heightDeltaCm >= 0 ? '+' : ''}
                                      {a.heightDeltaCm.toFixed(1)})
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-right">{a.weightKg} кг</td>
                                <td className="py-1.5 pr-3 text-right">{a.bodyFatPct}%</td>
                                <td className="py-1.5 pr-3 text-right">{a.muscleMassKg} кг</td>
                                <td className="py-1.5 pr-3 text-right">{a.waterPct}%</td>
                                <td className="py-1.5 pr-3 text-right">{a.visceralFatLevel}</td>
                                <td className="py-1.5 pr-3 text-right">{a.bmrKcal}</td>
                                <td className="py-1.5 pr-3 text-right">{a.bodyScore}/100</td>
                                <td className="py-1.5 pr-3 text-right">
                                  {a.bpSys}/{a.bpDia} · {a.pulseRest}
                                </td>
                                <td className="py-1.5 text-right font-sans">
                                  {isConfirming ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={isBusyDel}
                                        onClick={() => handleDeleteAnthro(a.id)}
                                        className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
                                      >
                                        {isBusyDel ? '...' : 'Удалить'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isBusyDel}
                                        onClick={() => setConfirmDeleteAnthroId(null)}
                                        className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-[11px] cursor-pointer"
                                      >
                                        Отмена
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openEditAnthroModal(a)}
                                        title="Редактировать замер"
                                        className="p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteAnthroId(a.id)}
                                        title="Удалить замер"
                                        className="p-1 rounded border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-500">Замеры ещё не добавлены.</div>
            )}
          </div>

          {/* Posture Laser Level & Photo Angle Before/After Assessment */}
          <PostureComparisonSection
            client={activeClient}
            editable
            onClientUpdated={onClientUpdated}
          />

          {/* Subscriptions & Session History */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="font-display text-base font-semibold">Дневник прогресса и заметки тренера</h3>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Добавить заметку о динамике..."
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>Записать</span>
                </button>
              </form>
              <div className="space-y-2.5 max-h-56 overflow-y-auto pt-1">
                {activeClient.notes.map((n) => (
                  <div key={n.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1">
                    <div className="text-slate-500 font-mono">
                      {n.date} · {n.authorName}
                    </div>
                    <div className="text-slate-800 dark:text-slate-200">{n.text}</div>
                  </div>
                ))}
                {!activeClient.notes.length && (
                  <div className="text-xs text-slate-500">Заметок пока нет.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="font-display text-base font-semibold">История тренировок и абонементы</h3>
              {clientSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="p-3 rounded-lg border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{sub.planName}</div>
                    <div className="text-slate-500 font-mono mt-0.5">
                      Код: {sub.code} · до {sub.expiresAt}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-cyan-700 dark:text-cyan-400">
                    {sub.remainingSessions}/{sub.totalSessions}
                  </div>
                </div>
              ))}
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                {clientSessions.map((ses) => (
                  <div key={ses.id} className="py-2.5 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{ses.programTitle}</div>
                      <div className="text-slate-500">
                        {ses.startedAt.slice(0, 10)} · {ses.trainerName} · Симметрия {ses.avgSymmetryPct}%
                        {ses.heightBeforeCm && ses.heightAfterCm
                          ? ` · Рост ${ses.heightBeforeCm.toFixed(1)}→${ses.heightAfterCm.toFixed(1)} см`
                          : ''}
                      </div>
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-right">
                      {ses.peakWinchKg.toFixed(1)} кг
                    </div>
                  </div>
                ))}
                {!clientSessions.length && (
                  <div className="text-xs text-slate-500 pt-2">История тренировок пока пуста.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Client */}
      {showAddClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreateClient}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3.5 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Новый клиент</h3>
            <input
              type="text"
              required
              placeholder="ФИО клиента"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Телефон"
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Telegram (@username)"
                value={cTg}
                onChange={(e) => setCTg(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <input
              type="email"
              placeholder="Email"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Пол</label>
                <select
                  value={cGender}
                  onChange={(e) => setCGender(e.target.value as 'male' | 'female')}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Дата рождения</label>
                <input
                  type="date"
                  value={cBirthDate}
                  onChange={(e) => setCBirthDate(e.target.value)}
                  className="w-full px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Студия</label>
                <select
                  value={cStudio}
                  onChange={(e) => setCStudio(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="text"
              placeholder="Цель тренировок"
              value={cGoal}
              onChange={(e) => setCGoal(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              placeholder="Противопоказания / особенности"
              value={cContra}
              onChange={(e) => setCContra(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddClient(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
              >
                Создать карту
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Client Personal Data */}
      {showEditClient && activeClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditClient}
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3.5 shadow-xl my-8"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">
                Редактировать личные данные клиента
              </h3>
              <button
                type="button"
                onClick={() => setShowEditClient(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">ФИО клиента</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Телефон</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Telegram</label>
                <input
                  type="text"
                  placeholder="@username"
                  value={editTg}
                  onChange={(e) => setEditTg(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">E-mail</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Пол</label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as 'male' | 'female')}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Дата рождения</label>
                <input
                  type="date"
                  value={editBirthDate}
                  onChange={(e) => setEditBirthDate(e.target.value)}
                  className="w-full px-2 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Студия</label>
                <select
                  value={editStudio}
                  onChange={(e) => setEditStudio(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Статус</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ClientActivityStatus)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="active">Активный</option>
                  <option value="inactive">Не ходит</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Цель тренировок</label>
              <input
                type="text"
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Противопоказания / особенности</label>
              <input
                type="text"
                value={editContra}
                onChange={(e) => setEditContra(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {editError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {editError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEditClient(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                {editSaving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Add / Edit Anthropometry (Height Before/After + Full Mi Body Composition Scale 2) */}
      {showAddAnthro && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
          onClick={() => {
            setShowAddAnthro(false);
            setEditingAnthroId(null);
          }}
        >
          <form
            onSubmit={handleSaveAnthro}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="font-display text-lg font-semibold">
                {editingAnthroId
                  ? 'Редактировать замер антропометрии'
                  : 'Замер роста, веса и давления (тонометр)'}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {liveSensors.scale.rawWeightKg !== null && (
                  <button
                    type="button"
                    onClick={handlePullLiveScaleToModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold cursor-pointer"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    <span>Взять с весов BLE ({liveSensors.scale.rawWeightKg.toFixed(1)} кг)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRecalculateMiScale2}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-xs font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Калибровка и пересчёт Mi Scale 2</span>
                </button>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={() => {
                    setShowAddAnthro(false);
                    setEditingAnthroId(null);
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {anthroError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {anthroError}
                </div>
              )}

              {/* Date + Height Before / After */}
              <div className="p-3.5 rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200/80 dark:border-cyan-900/50 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">Дата и замер роста (декомпрессия)</span>
                  <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        setPhase('before');
                        setHeightAfterCm('');
                      }}
                      className={`px-2.5 py-0.5 rounded font-medium cursor-pointer ${
                        phase === 'before' ? 'bg-slate-900 dark:bg-cyan-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      До начала тренировки
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhase('paired');
                        if (!heightAfterCm) setHeightAfterCm(String((heightBeforeCm + 0.9).toFixed(1)));
                      }}
                      className={`px-2.5 py-0.5 rounded font-medium cursor-pointer ${
                        phase === 'paired' ? 'bg-slate-900 dark:bg-cyan-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      До + После тренировки
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Дата замера</label>
                    <input
                      type="date"
                      required
                      value={anthroDate}
                      onChange={(e) => setAnthroDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Рост до тренировки (см)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={heightBeforeCm}
                      onChange={(e) => setHeightBeforeCm(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1">Рост после (см, опц.)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="После сессии"
                      value={heightAfterCm}
                      onChange={(e) => {
                        setHeightAfterCm(e.target.value);
                        if (e.target.value.trim()) setPhase('paired');
                      }}
                      className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-1">
                    <span className="text-[11px] text-slate-500">Динамика за сессию</span>
                    <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {modalHeightDelta !== null
                        ? `${modalHeightDelta >= 0 ? '+' : ''}${modalHeightDelta.toFixed(1)} см`
                        : 'Фиксируется после виса'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mi Body Composition Scale 2 Full Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Вес (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Жир (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bodyFatPct}
                    onChange={(e) => setBodyFatPct(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Мышцы (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={muscleMassKg}
                    onChange={(e) => setMuscleMassKg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Вода (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={waterPct}
                    onChange={(e) => setWaterPct(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Белок (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={proteinPct}
                    onChange={(e) => setProteinPct(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Висц. жир (ур.)</label>
                  <input
                    type="number"
                    min={1}
                    max={59}
                    value={visceralFatLevel}
                    onChange={(e) => setVisceralFatLevel(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Костная масса (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={boneMassKg}
                    onChange={(e) => setBoneMassKg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">BMR (ккал)</label>
                  <input
                    type="number"
                    value={bmrKcal}
                    onChange={(e) => setBmrKcal(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Идеальный вес (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={idealWeightKg}
                    onChange={(e) => setIdealWeightKg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Метаб. возраст</label>
                  <input
                    type="number"
                    value={bodyAgeYears}
                    onChange={(e) => setBodyAgeYears(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Оценка тела (/100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bodyScore}
                    onChange={(e) => setBodyScore(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Импеданс (Ω)</label>
                  <input
                    type="number"
                    value={impedanceOhm}
                    onChange={(e) => setImpedanceOhm(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium mb-1">Тип тела (Mi Scale 2)</label>
                  <select
                    value={bodyType}
                    onChange={(e) => setBodyType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {BODY_TYPES.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Баланс (сек)</label>
                  <input
                    type="number"
                    value={balanceTestSec}
                    onChange={(e) => setBalanceTestSec(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">АД Верх.</label>
                  <input
                    type="number"
                    value={bpSys}
                    onChange={(e) => setBpSys(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">АД Нижн.</label>
                  <input
                    type="number"
                    value={bpDia}
                    onChange={(e) => setBpDia(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Пульс</label>
                  <input
                    type="number"
                    value={pulseRest}
                    onChange={(e) => setPulseRest(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Индекс гибкости (0–100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={flexibility}
                    onChange={(e) => setFlexibility(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Уровень дискомфорта (0–10)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={painIndex}
                    onChange={(e) => setPainIndex(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1">Примечание / комментарий к замеру</label>
                <input
                  type="text"
                  value={anthroNotes}
                  onChange={(e) => setAnthroNotes(e.target.value)}
                  placeholder="Опционально — заполнится автоматически, если оставить пустым"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                disabled={anthroSaving}
                onClick={() => {
                  setShowAddAnthro(false);
                  setEditingAnthroId(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={anthroSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                {anthroSaving
                  ? 'Сохранение...'
                  : editingAnthroId
                  ? 'Сохранить изменения'
                  : 'Сохранить замер'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
