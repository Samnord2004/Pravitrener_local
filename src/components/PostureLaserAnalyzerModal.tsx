import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  Crosshair,
  RotateCcw,
  Trash2,
  Grid,
  CheckCircle2,
  ArrowRight,
  Sliders,
  Activity,
  Stethoscope,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';
import type {
  MmtMuscleRecommendation,
  MmtResultStatus,
  PostureAngleMeasurement,
  PostureAssessmentRecord,
  PostureBodyRegion,
  PosturePoint,
  PostureViewProjection,
} from '../types';
import {
  DEFAULT_LASER_HORIZONS,
  LASER_HORIZON_NAMES,
  POSTURE_MEASUREMENT_PRESETS,
  buildBeforeAfterComparison,
  computeMeasurementAngle,
  computeMeasurementDirection,
  normalizeLaserHorizons,
} from '../utils/postureGeometry';
import {
  MMT_RESULT_LABELS,
  POSTURE_REGION_LABELS,
  PROJECTION_ANALYSIS_GUIDES,
  SEVERITY_META,
  generateKinesiologyReport,
  inferMeasurementRegion,
} from '../utils/appliedKinesiology';
import { compressImageFile } from '../utils/trainerProfile';
import { apiRequest } from '../utils/api';
import { PostureSvgOverlay } from './PostureSvgOverlay';

interface PostureLaserAnalyzerModalProps {
  clientId: string;
  clientName: string;
  initialRecord?: PostureAssessmentRecord;
  defaultProjection?: PostureViewProjection;
  onSaved: (payload: { assessment: PostureAssessmentRecord; client?: unknown }) => void;
  onClose: () => void;
}

const REGION_TABS: Array<{ id: 'all' | PostureBodyRegion; label: string }> = [
  { id: 'all', label: 'Все зоны' },
  { id: 'head', label: 'Голова / Шея' },
  { id: 'shoulders', label: 'Плечи' },
  { id: 'pelvis', label: 'Таз' },
  { id: 'legs', label: 'Ноги' },
  { id: 'spine', label: 'Ось' },
];

const CORE_FOUR_REGIONS: Array<{ id: PostureBodyRegion; label: string }> = [
  { id: 'head', label: 'Голова/Шея' },
  { id: 'shoulders', label: 'Плечи' },
  { id: 'pelvis', label: 'Таз' },
  { id: 'legs', label: 'Ноги' },
];

const HORIZON_DOT_COLORS = ['#38bdf8', '#2dd4bf', '#4ade80', '#fbbf24', '#fb7185'];

export const PostureLaserAnalyzerModal: React.FC<PostureLaserAnalyzerModalProps> = ({
  clientId,
  clientName,
  initialRecord,
  defaultProjection,
  onSaved,
  onClose,
}) => {
  const [date, setDate] = useState(
    initialRecord?.date || new Date().toISOString().slice(0, 10)
  );
  const [projection, setProjection] = useState<PostureViewProjection>(
    initialRecord?.projection || defaultProjection || 'front'
  );
  const [beforePhotoUrl, setBeforePhotoUrl] = useState(
    initialRecord?.beforePhotoUrl || ''
  );
  const [afterPhotoUrl, setAfterPhotoUrl] = useState(
    initialRecord?.afterPhotoUrl || ''
  );
  const [beforeUrlInput, setBeforeUrlInput] = useState('');
  const [afterUrlInput, setAfterUrlInput] = useState('');

  const [laserEnabled, setLaserEnabled] = useState(
    initialRecord ? initialRecord.laserEnabled : true
  );
  const [laserPlumbXPct, setLaserPlumbXPct] = useState(
    initialRecord?.laserPlumbXPct ?? 50
  );
  const [laserHorizonsPct, setLaserHorizonsPct] = useState<number[]>(() =>
    normalizeLaserHorizons(initialRecord?.laserHorizonsPct)
  );
  const [laserTiltDeg, setLaserTiltDeg] = useState(
    initialRecord?.laserTiltDeg ?? 0
  );
  const [fineGrid, setFineGrid] = useState(Boolean(initialRecord?.fineGrid));

  const [beforeMeasurements, setBeforeMeasurements] = useState<
    PostureAngleMeasurement[]
  >(initialRecord?.beforeMeasurements || []);
  const [afterMeasurements, setAfterMeasurements] = useState<
    PostureAngleMeasurement[]
  >(initialRecord?.afterMeasurements || []);
  const [notes, setNotes] = useState(initialRecord?.notes || '');

  // Track trainer's MMT diagnostic results per muscle id
  const [mmtResults, setMmtResults] = useState<Record<string, MmtResultStatus>>(() => {
    const init: Record<string, MmtResultStatus> = {};
    for (const m of initialRecord?.kinesiologyReport?.mmtChecklist || []) {
      if (m.mmtResult) init[m.id] = m.mmtResult;
    }
    return init;
  });
  const [pkSourceSide, setPkSourceSide] = useState<'before' | 'after'>('before');

  // Active editor state
  const [activeSide, setActiveSide] = useState<'before' | 'after'>('before');
  const [activeRegionTab, setActiveRegionTab] = useState<'all' | PostureBodyRegion>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    POSTURE_MEASUREMENT_PRESETS[0].id
  );
  const [customLabel, setCustomLabel] = useState('');
  const [pendingPoints, setPendingPoints] = useState<PosturePoint[]>([]);
  const [beforeAspect, setBeforeAspect] = useState(1.333);
  const [afterAspect, setAfterAspect] = useState(1.333);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeDragTarget, setActiveDragTarget] = useState<{
    measurementId?: string;
    pending?: boolean;
    horizonIdx?: number;
    pointIdx: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const draggingPlumbRef = useRef(false);

  const projectionGuide =
    PROJECTION_ANALYSIS_GUIDES[projection] || PROJECTION_ANALYSIS_GUIDES.front;

  const selectedPreset =
    POSTURE_MEASUREMENT_PRESETS.find((p) => p.id === selectedPresetId) ||
    POSTURE_MEASUREMENT_PRESETS[0];

  const visiblePresets = useMemo(() => {
    const base =
      activeRegionTab === 'all'
        ? POSTURE_MEASUREMENT_PRESETS
        : POSTURE_MEASUREMENT_PRESETS.filter((p) => p.region === activeRegionTab);
    // Prioritize presets recommended for the current projection
    return [...base].sort((a, b) => {
      const aRec = a.recommendedViews?.includes(projection) ? 0 : 1;
      const bRec = b.recommendedViews?.includes(projection) ? 0 : 1;
      return aRec - bRec;
    });
  }, [activeRegionTab, projection]);

  const activePhotoUrl = activeSide === 'before' ? beforePhotoUrl : afterPhotoUrl;
  const activeMeasurements =
    activeSide === 'before' ? beforeMeasurements : afterMeasurements;
  const activeAspect = activeSide === 'before' ? beforeAspect : afterAspect;

  const regionCounts = useMemo(() => {
    const counts: Record<PostureBodyRegion, number> = {
      head: 0,
      shoulders: 0,
      pelvis: 0,
      legs: 0,
      spine: 0,
    };
    for (const m of activeMeasurements) {
      counts[inferMeasurementRegion(m)] += 1;
    }
    return counts;
  }, [activeMeasurements]);

  const setMeasurementsForSide = (
    side: 'before' | 'after',
    updater: (prev: PostureAngleMeasurement[]) => PostureAngleMeasurement[]
  ) => {
    if (side === 'before') {
      setBeforeMeasurements(updater);
    } else {
      setAfterMeasurements(updater);
    }
  };

  const comparisonRows = useMemo(
    () => buildBeforeAfterComparison(beforeMeasurements, afterMeasurements),
    [beforeMeasurements, afterMeasurements]
  );

  // Applied Kinesiology analysis computed in real time from placed points
  const pkMeasurementsSource = useMemo(() => {
    if (pkSourceSide === 'after' && afterMeasurements.length > 0) {
      return afterMeasurements;
    }
    return beforeMeasurements.length > 0 ? beforeMeasurements : afterMeasurements;
  }, [pkSourceSide, beforeMeasurements, afterMeasurements]);

  const liveKinesiologyReport = useMemo(() => {
    const seededChecklist: MmtMuscleRecommendation[] = Object.entries(mmtResults).map(
      ([id, mmtResult]) => ({
        id,
        muscleName: '',
        side: '',
        suspectedState: 'check_both',
        priority: 'primary',
        region: 'spine',
        clinicalRationale: '',
        testProcedure: '',
        mmtResult,
      })
    );
    return generateKinesiologyReport(pkMeasurementsSource, projection, seededChecklist);
  }, [pkMeasurementsSource, projection, mmtResults]);

  const handleSelectRegionTab = (regionId: 'all' | PostureBodyRegion) => {
    setActiveRegionTab(regionId);
    setPendingPoints([]);
    if (regionId !== 'all') {
      const inRegion = POSTURE_MEASUREMENT_PRESETS.filter((p) => p.region === regionId);
      const preferred =
        inRegion.find((p) => p.recommendedViews?.includes(projection)) || inRegion[0];
      if (preferred) {
        setSelectedPresetId(preferred.id);
      }
    }
  };

  const handleProjectionChange = (nextProj: PostureViewProjection) => {
    setProjection(nextProj);
    setPendingPoints([]);
    const recalcDirections = (list: PostureAngleMeasurement[]) =>
      list.map((m) => {
        const { direction, directionLabel } = computeMeasurementDirection(
          m.presetId,
          m.type,
          m.points,
          nextProj,
          laserPlumbXPct,
          m.angleDeg,
          m.deviationDeg ?? m.angleDeg
        );
        return { ...m, direction, directionLabel };
      });
    setBeforeMeasurements(recalcDirections);
    setAfterMeasurements(recalcDirections);
    const matchingPreset = POSTURE_MEASUREMENT_PRESETS.find(
      (p) =>
        (activeRegionTab === 'all' || p.region === activeRegionTab) &&
        p.recommendedViews?.includes(nextProj)
    );
    if (matchingPreset) {
      setSelectedPresetId(matchingPreset.id);
    }
  };

  const handleUploadPhoto = async (side: 'before' | 'after', file: File) => {
    setErrorMsg('');
    try {
      const compressed = await compressImageFile(file, 1400, 0.82);
      if (side === 'before') {
        setBeforePhotoUrl(compressed);
        setActiveSide('before');
      } else {
        setAfterPhotoUrl(compressed);
        setActiveSide('after');
      }
      setPendingPoints([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingPlumbRef.current || !activePhotoUrl || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPct = Number(
      Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)).toFixed(2)
    );
    const yPct = Number(
      Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)).toFixed(2)
    );
    const nextPoints = [...pendingPoints, { xPct, yPct }];
    const required = selectedPreset.type === 'joint' ? 3 : 2;

    if (nextPoints.length < required) {
      setPendingPoints(nextPoints);
      return;
    }

    const { angleDeg, deviationDeg } = computeMeasurementAngle(
      selectedPreset.type,
      nextPoints,
      activeAspect
    );
    const { direction, directionLabel } = computeMeasurementDirection(
      selectedPreset.id,
      selectedPreset.type,
      nextPoints,
      projection,
      laserPlumbXPct,
      angleDeg,
      deviationDeg
    );

    const newMeasurement: PostureAngleMeasurement = {
      id: `ang-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      presetId: selectedPreset.id,
      region: selectedPreset.region,
      label: customLabel.trim() || selectedPreset.label,
      type: selectedPreset.type,
      points: nextPoints,
      angleDeg,
      deviationDeg,
      direction,
      directionLabel,
      color: selectedPreset.color,
    };
    setMeasurementsForSide(activeSide, (prev) => [...prev, newMeasurement]);
    setPendingPoints([]);
  };

  const handlePlumbPointerDown = () => {
    draggingPlumbRef.current = true;
    const onMove = (ev: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const xPct = Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100));
      setLaserPlumbXPct(Number(xPct.toFixed(1)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setTimeout(() => {
        draggingPlumbRef.current = false;
      }, 40);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleStartDragHorizon = (horizonIdx: number) => {
    draggingPlumbRef.current = true;
    setActiveDragTarget({ horizonIdx, pointIdx: horizonIdx });

    const onMove = (ev: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (!rect.height) return;
      const yPct = Number(
        Math.max(4, Math.min(96, ((ev.clientY - rect.top) / rect.height) * 100)).toFixed(1)
      );
      setLaserHorizonsPct((prev) => {
        const next = [...normalizeLaserHorizons(prev)];
        if (horizonIdx >= 0 && horizonIdx < next.length) {
          next[horizonIdx] = yPct;
        }
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setActiveDragTarget(null);
      setTimeout(() => {
        draggingPlumbRef.current = false;
      }, 40);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleStartDragPoint = (measurementId: string, pointIdx: number) => {
    const dragSide = activeSide;
    const dragAspect = activeAspect;
    const dragProjection = projection;
    const dragPlumbX = laserPlumbXPct;

    draggingPlumbRef.current = true;
    setActiveDragTarget({ measurementId, pointIdx });

    const onMove = (ev: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xPct = Number(
        Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)).toFixed(2)
      );
      const yPct = Number(
        Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)).toFixed(2)
      );

      setMeasurementsForSide(dragSide, (prev) =>
        prev.map((m) => {
          if (m.id !== measurementId || !m.points[pointIdx]) return m;
          const updatedPoints = m.points.map((pt, idx) =>
            idx === pointIdx ? { xPct, yPct } : pt
          );
          const { angleDeg, deviationDeg } = computeMeasurementAngle(
            m.type,
            updatedPoints,
            dragAspect
          );
          const { direction, directionLabel } = computeMeasurementDirection(
            m.presetId,
            m.type,
            updatedPoints,
            dragProjection,
            dragPlumbX,
            angleDeg,
            deviationDeg
          );
          return {
            ...m,
            points: updatedPoints,
            angleDeg,
            deviationDeg,
            direction,
            directionLabel,
          };
        })
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setActiveDragTarget(null);
      setTimeout(() => {
        draggingPlumbRef.current = false;
      }, 40);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleStartDragPendingPoint = (pointIdx: number) => {
    draggingPlumbRef.current = true;
    setActiveDragTarget({ pending: true, pointIdx });

    const onMove = (ev: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xPct = Number(
        Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)).toFixed(2)
      );
      const yPct = Number(
        Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100)).toFixed(2)
      );
      setPendingPoints((prev) =>
        prev.map((pt, idx) => (idx === pointIdx ? { xPct, yPct } : pt))
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setActiveDragTarget(null);
      setTimeout(() => {
        draggingPlumbRef.current = false;
      }, 40);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleAppendPkSummaryToNotes = () => {
    if (!liveKinesiologyReport) return;
    const summaryLines: string[] = [];
    if (liveKinesiologyReport.primaryFallingRegion) {
      summaryLines.push(`Ведущий регион: ${liveKinesiologyReport.primaryFallingRegion}.`);
    }
    const deviationsText = liveKinesiologyReport.findings
      .filter((f) => f.severity !== 'normal')
      .map((f) => `${f.regionLabel}: ${f.deviationDeg.toFixed(1)}° (${f.directionLabel})`)
      .join('; ');
    if (deviationsText) {
      summaryLines.push(`Отклонения: ${deviationsText}.`);
    }
    const testedWeak = liveKinesiologyReport.mmtChecklist
      .filter((m) => m.mmtResult === 'hypotonic')
      .map((m) => m.muscleName);
    const primaryTests = liveKinesiologyReport.mmtChecklist
      .filter((m) => m.priority === 'primary')
      .slice(0, 5)
      .map((m) => m.muscleName);
    if (testedWeak.length > 0) {
      summaryLines.push(`ММТ подтверждена гипотония: ${testedWeak.join(', ')}.`);
    } else if (primaryTests.length > 0) {
      summaryLines.push(`План ММТ: ${primaryTests.join(', ')}.`);
    }
    const appended = summaryLines.join(' ');
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n${appended}` : appended));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!beforePhotoUrl.trim()) {
      setErrorMsg('Загрузите фото ДО коррекции перед сохранением.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        projection,
        beforePhotoUrl: beforePhotoUrl.trim(),
        afterPhotoUrl: afterPhotoUrl.trim() || undefined,
        laserEnabled,
        laserPlumbXPct,
        laserHorizonsPct,
        laserTiltDeg,
        fineGrid,
        beforeMeasurements,
        afterMeasurements,
        kinesiologyReport: liveKinesiologyReport,
        notes: notes.trim(),
      };
      const url = initialRecord
        ? `/api/clients/${clientId}/posture-assessments/${initialRecord.id}`
        : `/api/clients/${clientId}/posture-assessments`;
      const method = initialRecord ? 'PATCH' : 'POST';
      const res = await apiRequest<{ assessment: PostureAssessmentRecord; client?: unknown }>(
        url,
        {
          method,
          body: JSON.stringify(payload),
        }
      );
      onSaved(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сохранения оценки осанки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-6xl max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Визуальная диагностика осанки, лазерный уровень и ПК + ММТ
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold">
              Голова · Плечи · Таз · Ноги — анализ ДО / ПОСЛЕ · {clientName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Projection Tabs + Meta + Photo Loaders */}
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  Ракурс съёмки (анфас, вид сзади или профиль)
                </div>
                <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 gap-0.5">
                  {(
                    [
                      ['front', 'Анфас (спереди)'],
                      ['back', 'Вид сзади'],
                      ['side_left', 'Профиль слева'],
                      ['side_right', 'Профиль справа'],
                    ] as [PostureViewProjection, string][]
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleProjectionChange(k)}
                      className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
                        projection === k
                          ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-40">
                <label className="block text-[11px] text-slate-500 mb-1">Дата замера</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Photo ДО Uploader */}
              <div className="md:col-span-6 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    Фото ДО коррекции ({projectionGuide.shortLabel}) *
                  </span>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-[11px] font-medium cursor-pointer hover:opacity-90">
                    <Upload className="w-3 h-3" />
                    <span>{beforePhotoUrl ? 'Заменить' : 'Загрузить фото'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPhoto('before', f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={beforeUrlInput}
                    onChange={(e) => setBeforeUrlInput(e.target.value)}
                    placeholder="или вставьте URL фото ДО..."
                    className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (beforeUrlInput.trim()) {
                        setBeforePhotoUrl(beforeUrlInput.trim());
                        setBeforeUrlInput('');
                        setActiveSide('before');
                      }
                    }}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </div>

              {/* Photo ПОСЛЕ Uploader */}
              <div className="md:col-span-6 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Фото ПОСЛЕ коррекции ({projectionGuide.shortLabel})
                  </span>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium cursor-pointer hover:opacity-90">
                    <Upload className="w-3 h-3" />
                    <span>{afterPhotoUrl ? 'Заменить' : 'Загрузить фото'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPhoto('after', f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={afterUrlInput}
                    onChange={(e) => setAfterUrlInput(e.target.value)}
                    placeholder="или вставьте URL фото ПОСЛЕ..."
                    className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (afterUrlInput.trim()) {
                        setAfterPhotoUrl(afterUrlInput.trim());
                        setAfterUrlInput('');
                        setActiveSide('after');
                      }
                    }}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>

            {/* Projection Anatomical Guide */}
            <div className="p-3 rounded-xl bg-cyan-50/60 dark:bg-cyan-950/25 border border-cyan-200/80 dark:border-cyan-900/50 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-cyan-900 dark:text-cyan-200">
                  Ориентиры ракурса: {projectionGuide.title} ({projectionGuide.planeName})
                </span>
                <span className="text-[11px] text-cyan-800 dark:text-cyan-300">
                  {projectionGuide.laserFocus}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-700 dark:text-slate-300">
                {projectionGuide.landmarks.map((lm, i) => (
                  <div key={i}>• {lm}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Workspace: Interactive Canvas (Left) + Laser & 4-Zone Angle Controls (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Interactive Photo + Laser + Angle Canvas */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSide('before');
                      setPendingPoints([]);
                    }}
                    className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                      activeSide === 'before'
                        ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Фото ДО ({beforeMeasurements.length} зам.)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSide('after');
                      setPendingPoints([]);
                    }}
                    className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                      activeSide === 'after'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    Фото ПОСЛЕ ({afterMeasurements.length} зам.)
                  </button>
                </div>

                {/* 4-Zone Coverage Pills */}
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {CORE_FOUR_REGIONS.map((reg) => {
                    const cnt = regionCounts[reg.id];
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => handleSelectRegionTab(reg.id)}
                        className={`px-2 py-0.5 rounded-md border font-medium cursor-pointer transition-colors ${
                          cnt > 0
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                        title={`Выбрать замеры для зоны: ${reg.label}`}
                      >
                        {reg.label}: {cnt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {pendingPoints.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs">
                  <span className="font-mono text-cyan-800 dark:text-cyan-200">
                    {selectedPreset.label} · Точек поставлено: {pendingPoints.length} из{' '}
                    {selectedPreset.type === 'joint' ? 3 : 2}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingPoints((pts) => pts.slice(0, -1))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-cyan-300 dark:border-cyan-700 hover:opacity-80 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Отменить точку</span>
                  </button>
                </div>
              )}

              {activePhotoUrl ? (
                <div
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="relative w-full max-h-[540px] mx-auto rounded-xl overflow-hidden bg-slate-950 border border-slate-300 dark:border-slate-700 cursor-crosshair flex items-center justify-center"
                >
                  <img
                    src={activePhotoUrl}
                    alt={activeSide === 'before' ? 'Фото ДО коррекции' : 'Фото ПОСЛЕ коррекции'}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        const ratio = img.naturalHeight / img.naturalWidth;
                        if (activeSide === 'before') setBeforeAspect(ratio);
                        else setAfterAspect(ratio);
                      }
                    }}
                    className="w-full max-h-[540px] object-contain pointer-events-none select-none"
                  />
                  <PostureSvgOverlay
                    laserEnabled={laserEnabled}
                    laserPlumbXPct={laserPlumbXPct}
                    laserHorizonsPct={laserHorizonsPct}
                    laserTiltDeg={laserTiltDeg}
                    fineGrid={fineGrid}
                    measurements={activeMeasurements}
                    pendingPoints={pendingPoints}
                    pendingColor={selectedPreset.color}
                    interactive
                    activeDragTarget={activeDragTarget}
                    onStartDragPlumb={handlePlumbPointerDown}
                    onStartDragHorizon={(hIdx) => handleStartDragHorizon(hIdx)}
                    onStartDragPoint={(mId, pIdx) => handleStartDragPoint(mId, pIdx)}
                    onStartDragPendingPoint={(pIdx) => handleStartDragPendingPoint(pIdx)}
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <div className="text-xs text-slate-500 max-w-sm">
                    {activeSide === 'before'
                      ? 'Загрузите фотографию клиента ДО коррекции, чтобы выставить линии по голове, плечам, тазу и ногам и получить анализ кинезиологии.'
                      : 'Загрузите фотографию ПОСЛЕ коррекции для замера новых углов и автоматического расчёта динамики ДО → ПОСЛЕ.'}
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Выбрать фото с устройства</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPhoto(activeSide, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                Подсказка: кликайте по фото для расстановки точек; точки замеров, красный отвес и горизонтальные линии сетки (L1–L5: голова, шея, плечи, таз, ноги) можно перетаскивать прямо на фото.
              </div>
            </div>

            {/* Right Controls: Laser Level + 4-Zone Angle Preset + Measured List */}
            <div className="lg:col-span-5 space-y-4">
              {/* Laser Level Panel */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Sliders className="w-4 h-4 text-rose-500" />
                    <span>Сетка уровней (отвес и 5 горизонтов)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFineGrid((g) => !g)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer ${
                        fineGrid
                          ? 'bg-cyan-600 text-white border-transparent'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <Grid className="w-3 h-3" />
                      <span>Сетка 5%</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLaserEnabled((v) => !v)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        laserEnabled
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {laserEnabled ? 'Уровни ВКЛ' : 'Уровни ВЫКЛ'}
                    </button>
                  </div>
                </div>

                {laserEnabled && (
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-500">Вертикальный отвес (ось)</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{laserPlumbXPct.toFixed(1)}%</span>
                          <button
                            type="button"
                            onClick={() => setLaserPlumbXPct(50)}
                            className="text-[10px] text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            Центр 50%
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        step={0.5}
                        value={laserPlumbXPct}
                        onChange={(e) => setLaserPlumbXPct(Number(e.target.value))}
                        className="w-full accent-rose-600 cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                      {LASER_HORIZON_NAMES.map((lbl, idx) => (
                        <div key={lbl}>
                          <div className="flex justify-between mb-0.5 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate font-medium">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: HORIZON_DOT_COLORS[idx] || '#ef4444' }}
                              />
                              <span>{lbl}</span>
                            </span>
                            <span className="font-mono font-semibold">
                              {(laserHorizonsPct[idx] ?? DEFAULT_LASER_HORIZONS[idx]).toFixed(0)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={4}
                            max={96}
                            step={0.5}
                            value={laserHorizonsPct[idx] ?? DEFAULT_LASER_HORIZONS[idx]}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setLaserHorizonsPct((prev) => {
                                const copy = normalizeLaserHorizons(prev);
                                copy[idx] = val;
                                return copy;
                              });
                            }}
                            className="w-full accent-cyan-600 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex justify-between mb-0.5 text-[11px]">
                        <span className="text-slate-500">Калибровка завала камеры</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">
                            {laserTiltDeg > 0 ? '+' : ''}
                            {laserTiltDeg.toFixed(1)}°
                          </span>
                          {laserTiltDeg !== 0 && (
                            <button
                              type="button"
                              onClick={() => setLaserTiltDeg(0)}
                              className="text-[10px] text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                            >
                              Сброс 0°
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={-5}
                        max={5}
                        step={0.1}
                        value={laserTiltDeg}
                        onChange={(e) => setLaserTiltDeg(Number(e.target.value))}
                        className="w-full accent-cyan-600 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Angle Measurement Selector by Body Region */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-bold">
                  <Crosshair className="w-4 h-4 text-cyan-600" />
                  <span>Линии отклонения по зонам тела</span>
                </div>

                {/* Region Tabs */}
                <div className="flex flex-wrap gap-1">
                  {REGION_TABS.map((rt) => {
                    const isActive = activeRegionTab === rt.id;
                    const count =
                      rt.id === 'all' ? activeMeasurements.length : regionCounts[rt.id];
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => handleSelectRegionTab(rt.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-slate-900 dark:bg-cyan-600 text-white border-transparent'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {rt.label}
                        {count > 0 ? ` (${count})` : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Presets list for selected region */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {visiblePresets.map((pr) => {
                    const selected = pr.id === selectedPresetId;
                    const isRecommended = Boolean(pr.recommendedViews?.includes(projection));
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => {
                          setSelectedPresetId(pr.id);
                          setPendingPoints([]);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          selected
                            ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/35 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: pr.color }}
                          />
                          <span className="truncate font-medium">{pr.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isRecommended && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 text-[9px] font-semibold">
                              Для ракурса
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-slate-500">
                            {pr.type === 'joint' ? '3 т.' : '2 т.'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Своё название замера (опц.)"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />

                <div className="p-2 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-[11px] text-cyan-900 dark:text-cyan-200">
                  {selectedPreset.hint}
                </div>

                {/* Measurements List for Active Photo */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Замеры на фото {activeSide === 'before' ? 'ДО' : 'ПОСЛЕ'} (
                      {activeMeasurements.length})
                    </span>
                    {activeMeasurements.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMeasurementsForSide(activeSide, () => [])}
                        className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                      >
                        Очистить все
                      </button>
                    )}
                  </div>

                  {activeMeasurements.length === 0 ? (
                    <div className="text-[11px] text-slate-400 py-2">
                      Выберите зону (Голова / Плечи / Таз / Ноги) и кликните по фото слева.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {activeMeasurements.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: m.color || '#22d3ee' }}
                              />
                              <span className="truncate font-medium">{m.label}</span>
                            </div>
                            {m.directionLabel && (
                              <div className="text-[10px] text-slate-500 pl-4 truncate">
                                {m.directionLabel}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {m.angleDeg.toFixed(1)}°
                            </span>
                            {m.type === 'joint' && typeof m.deviationDeg === 'number' && (
                              <span className="font-mono text-[10px] text-slate-500">
                                (откл. {m.deviationDeg.toFixed(1)}°)
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setMeasurementsForSide(activeSide, (prev) =>
                                  prev.filter((item) => item.id !== m.id)
                                )
                              }
                              className="p-1 text-rose-600 hover:opacity-80 cursor-pointer"
                              title="Удалить замер"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Live ДО vs ПОСЛЕ Delta Comparison */}
              {comparisonRows.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/50 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Сравнение углов ДО → ПОСЛЕ</span>
                  </div>
                  <div className="space-y-1">
                    {comparisonRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="truncate">{row.label}</span>
                        <span className="font-mono font-semibold flex items-center gap-1 shrink-0">
                          <span>{row.beforeDeg.toFixed(1)}°</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span>{row.afterDeg.toFixed(1)}°</span>
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded ${
                              row.improved
                                ? 'bg-emerald-600 text-white'
                                : row.deltaDeg > 0.1
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {row.deltaDeg > 0 ? '+' : ''}
                            {row.deltaDeg.toFixed(1)}°
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Applied Kinesiology & MMT Diagnostic Panel */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Анализ отклонений (Прикладная кинезиология) и план ММТ
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Расчёт причин по концепции «падающих регионов» (Л.Ф. Васильева) и перекрёстных синдромов (В. Янда) + список мышц для ММТ
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {beforeMeasurements.length > 0 && afterMeasurements.length > 0 && (
                  <div className="inline-flex rounded-lg border border-indigo-200 dark:border-indigo-800 p-0.5 bg-white dark:bg-slate-900 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPkSourceSide('before')}
                      className={`px-2 py-1 rounded font-medium cursor-pointer ${
                        pkSourceSide === 'before'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      По фото ДО
                    </button>
                    <button
                      type="button"
                      onClick={() => setPkSourceSide('after')}
                      className={`px-2 py-1 rounded font-medium cursor-pointer ${
                        pkSourceSide === 'after'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500'
                      }`}
                    >
                      По фото ПОСЛЕ
                    </button>
                  </div>
                )}

                {liveKinesiologyReport && (
                  <button
                    type="button"
                    onClick={handleAppendPkSummaryToNotes}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:opacity-90 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Вставить разбор в заключение</span>
                  </button>
                )}
              </div>
            </div>

            {!liveKinesiologyReport ? (
              <div className="p-4 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-dashed border-indigo-200 dark:border-indigo-800 text-center text-slate-500">
                Поставьте контрольные точки на фото (Голова, Плечи, Таз, Ноги), чтобы автоматически рассчитать возможные причины дисфункций с точки зрения прикладной кинезиологии и сформировать чек-лист мышц для ММТ.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Systemic summary */}
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-800/60 space-y-1">
                  {liveKinesiologyReport.primaryFallingRegion && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-rose-700 dark:text-rose-400">
                        Ведущий «падающий» регион:
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {liveKinesiologyReport.primaryFallingRegion}
                      </span>
                    </div>
                  )}
                  {liveKinesiologyReport.summaryPattern && (
                    <div className="text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">Системный паттерн: </span>
                      {liveKinesiologyReport.summaryPattern}
                    </div>
                  )}
                </div>

                {/* Regional findings & PK causes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {liveKinesiologyReport.findings.map((f) => {
                    const sev = SEVERITY_META[f.severity];
                    return (
                      <div
                        key={f.id}
                        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                              {f.regionLabel}
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {f.measurementLabel}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-sm">
                              {f.deviationDeg.toFixed(1)}°
                            </span>
                            <div className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold ${sev.badgeClass}`}>
                              {sev.label}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          Направление: <span className="font-semibold">{f.directionLabel}</span>
                        </div>

                        {f.fallingRegionHint && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-md px-2.5 py-1.5">
                            {f.fallingRegionHint}
                          </div>
                        )}

                        <div>
                          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Возможные причины (Прикладная кинезиология):
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                            {f.possibleCauses.map((c, idx) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <div>
                            <div className="font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                              Гипотония (вероятная слабость):
                            </div>
                            <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
                              {f.likelyHypotonic.map((m, idx) => (
                                <li key={idx}>• {m}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold text-rose-700 dark:text-rose-400 mb-0.5">
                              Гипертонус (укорочение):
                            </div>
                            <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
                              {f.likelyHypertonic.map((m, idx) => (
                                <li key={idx}>• {m}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* MMT Diagnostic Muscle Checklist */}
                <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                      <span>
                        Мышцы для проведения ММТ ({liveKinesiologyReport.mmtChecklist.length})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Отметьте фактический результат ММТ — он сохранится в карте клиента
                    </span>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {liveKinesiologyReport.mmtChecklist.map((item) => {
                      const currentStatus = item.mmtResult || 'untested';
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  item.priority === 'primary'
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {item.priority === 'primary' ? 'Приоритет ММТ' : 'Доп. тест'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                                {POSTURE_REGION_LABELS[item.region]}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {item.muscleName}
                              </span>
                              <span className="text-[11px] text-cyan-700 dark:text-cyan-400 font-medium">
                                · {item.side}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Зачем:</span> {item.clinicalRationale}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                Тест ММТ:
                              </span>{' '}
                              {item.testProcedure}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <select
                              value={currentStatus}
                              onChange={(e) =>
                                setMmtResults((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value as MmtResultStatus,
                                }))
                              }
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                                currentStatus === 'hypotonic'
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                                  : currentStatus === 'hypertonic'
                                  ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
                                  : currentStatus === 'normotonic'
                                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {(Object.entries(MMT_RESULT_LABELS) as [MmtResultStatus, string][]).map(
                                ([k, lbl]) => (
                                  <option key={k} value={k}>
                                    {lbl}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="text-xs">
            <label className="flex items-center gap-1.5 text-slate-500 mb-1">
              <Activity className="w-3.5 h-3.5 text-cyan-600" />
              <span>Заключение тренера по осанке и результатам ММТ (сохраняется в карте)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: перекос таза слева ниже на 2.4°, ММТ выявило гипотонию левой средней ягодичной мышцы; после декомпрессии на ПравИло тонус восстановлен..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2 shrink-0 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {saving
              ? 'Сохранение протокола...'
              : initialRecord
              ? 'Сохранить изменения фотопротокола и ММТ'
              : 'Сохранить фотопротокол ДО / ПОСЛЕ и ММТ'}
          </button>
        </div>
      </form>
    </div>
  );
};
