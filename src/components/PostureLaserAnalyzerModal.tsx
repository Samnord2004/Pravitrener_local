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
} from 'lucide-react';
import type {
  PostureAngleMeasurement,
  PostureAssessmentRecord,
  PosturePoint,
  PostureViewProjection,
} from '../types';
import {
  POSTURE_MEASUREMENT_PRESETS,
  POSTURE_PROJECTION_LABELS,
  buildBeforeAfterComparison,
  computeMeasurementAngle,
} from '../utils/postureGeometry';
import { compressImageFile } from '../utils/trainerProfile';
import { apiRequest } from '../utils/api';
import { PostureSvgOverlay } from './PostureSvgOverlay';

interface PostureLaserAnalyzerModalProps {
  clientId: string;
  clientName: string;
  initialRecord?: PostureAssessmentRecord;
  onSaved: (payload: { assessment: PostureAssessmentRecord; client?: unknown }) => void;
  onClose: () => void;
}

export const PostureLaserAnalyzerModal: React.FC<PostureLaserAnalyzerModalProps> = ({
  clientId,
  clientName,
  initialRecord,
  onSaved,
  onClose,
}) => {
  const [date, setDate] = useState(
    initialRecord?.date || new Date().toISOString().slice(0, 10)
  );
  const [projection, setProjection] = useState<PostureViewProjection>(
    initialRecord?.projection || 'front'
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
  const [laserHorizonsPct, setLaserHorizonsPct] = useState<number[]>(
    initialRecord?.laserHorizonsPct?.length
      ? initialRecord.laserHorizonsPct
      : [20, 38, 60]
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

  // Active editor state
  const [activeSide, setActiveSide] = useState<'before' | 'after'>('before');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    POSTURE_MEASUREMENT_PRESETS[0].id
  );
  const [customLabel, setCustomLabel] = useState('');
  const [pendingPoints, setPendingPoints] = useState<PosturePoint[]>([]);
  const [beforeAspect, setBeforeAspect] = useState(1.333);
  const [afterAspect, setAfterAspect] = useState(1.333);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const draggingPlumbRef = useRef(false);

  const selectedPreset =
    POSTURE_MEASUREMENT_PRESETS.find((p) => p.id === selectedPresetId) ||
    POSTURE_MEASUREMENT_PRESETS[0];

  const activePhotoUrl = activeSide === 'before' ? beforePhotoUrl : afterPhotoUrl;
  const activeMeasurements =
    activeSide === 'before' ? beforeMeasurements : afterMeasurements;
  const activeAspect = activeSide === 'before' ? beforeAspect : afterAspect;

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
    const newMeasurement: PostureAngleMeasurement = {
      id: `ang-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      label: customLabel.trim() || selectedPreset.label,
      type: selectedPreset.type,
      points: nextPoints,
      angleDeg,
      deviationDeg,
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
      setTimeout(() => {
        draggingPlumbRef.current = false;
      }, 40);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSave}
        className="w-full max-w-6xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 shadow-2xl my-4"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Визуальная диагностика осанки и биомеханики
            </div>
            <h3 className="font-display text-lg font-bold">
              Лазерный уровень и замер углов по фото ДО / ПОСЛЕ · {clientName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Meta + Photo Loaders */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div className="md:col-span-2">
            <label className="block text-slate-500 mb-1">Дата замера</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-2.5 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-slate-500 mb-1">Ракурс съёмки</label>
            <select
              value={projection}
              onChange={(e) => setProjection(e.target.value as PostureViewProjection)}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {(Object.entries(POSTURE_PROJECTION_LABELS) as [PostureViewProjection, string][]).map(
                ([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Photo ДО Uploader */}
          <div className="md:col-span-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                Фото ДО коррекции *
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
          <div className="md:col-span-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Фото ПОСЛЕ коррекции
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

        {/* Main Workspace: Interactive Canvas (Left) + Laser & Goniometer Controls (Right) */}
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

              {pendingPoints.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-cyan-700 dark:text-cyan-400">
                    Точек поставлено: {pendingPoints.length} из{' '}
                    {selectedPreset.type === 'joint' ? 3 : 2}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingPoints((pts) => pts.slice(0, -1))}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:opacity-80 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Отменить точку</span>
                  </button>
                </div>
              )}
            </div>

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
                  onStartDragPlumb={handlePlumbPointerDown}
                />
              </div>
            ) : (
              <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <Upload className="w-8 h-8 text-slate-400" />
                <div className="text-xs text-slate-500 max-w-sm">
                  {activeSide === 'before'
                    ? 'Загрузите фотографию клиента ДО коррекции, чтобы наложить лазерный уровень и измерить исходные углы перекоса.'
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

            <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Подсказка: кликайте по фото для расстановки контрольных точек угла; красную точку наверху отвеса можно перетаскивать.</span>
            </div>
          </div>

          {/* Right Controls: Laser Level + Angle Preset + Measured List */}
          <div className="lg:col-span-5 space-y-4">
            {/* Laser Level Panel */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Sliders className="w-4 h-4 text-rose-500" />
                  <span>Лазерный уровень (отвес и горизонты)</span>
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
                    {laserEnabled ? 'Лазер ВКЛ' : 'Лазер ВЫКЛ'}
                  </button>
                </div>
              </div>

              {laserEnabled && (
                <div className="space-y-2.5 text-xs">
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

                  {['L1 Голова / Уши', 'L2 Линия плеч', 'L3 Линия таза'].map((lbl, idx) => (
                    <div key={lbl}>
                      <div className="flex justify-between mb-0.5 text-[11px]">
                        <span className="text-slate-500">{lbl}</span>
                        <span className="font-mono font-semibold">
                          {(laserHorizonsPct[idx] ?? 50).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        step={1}
                        value={laserHorizonsPct[idx] ?? 50}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setLaserHorizonsPct((prev) => {
                            const copy = [...prev];
                            copy[idx] = val;
                            return copy;
                          });
                        }}
                        className="w-full accent-rose-500 cursor-pointer"
                      />
                    </div>
                  ))}

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

            {/* Angle Measurement Selector */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <Crosshair className="w-4 h-4 text-cyan-600" />
                <span>Инструмент измерения углов</span>
              </div>

              <div className="space-y-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    setPendingPoints([]);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-medium"
                >
                  {POSTURE_MEASUREMENT_PRESETS.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      [{pr.type === 'joint' ? '3 т.' : '2 т.'}] {pr.label}
                    </option>
                  ))}
                </select>
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
                    Кликните по фото слева, чтобы измерить угол.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {activeMeasurements.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: m.color || '#22d3ee' }}
                          />
                          <span className="truncate font-medium">{m.label}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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

            {/* Notes */}
            <div className="text-xs">
              <label className="block text-slate-500 mb-1">
                Заключение тренера по осанке ДО/ПОСЛЕ
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: после серии сессий уменьшился перекос правого плеча на 2.8°, выровнялась ось шеи относительно отвеса..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
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
              ? 'Сохранить изменения фотопротокола'
              : 'Сохранить фотопротокол ДО / ПОСЛЕ'}
          </button>
        </div>
      </form>
    </div>
  );
};
