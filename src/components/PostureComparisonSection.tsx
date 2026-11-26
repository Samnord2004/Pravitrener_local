import React, { useState } from 'react';
import {
  Crosshair,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Maximize2,
  X,
  CheckCircle2,
  Stethoscope,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Grid,
} from 'lucide-react';
import type { ClientProfile, PostureAssessmentRecord, PostureViewProjection } from '../types';
import {
  MAX_GRID_DENSITY,
  MIN_GRID_DENSITY,
  POSTURE_PROJECTION_LABELS,
  buildBeforeAfterComparison,
  formatGridStepLabel,
  normalizeGridDensity,
} from '../utils/postureGeometry';
import {
  MMT_RESULT_LABELS,
  POSTURE_REGION_LABELS,
  PROJECTION_ANALYSIS_GUIDES,
  SEVERITY_META,
  buildMultiViewSynthesis,
  generateKinesiologyReport,
} from '../utils/appliedKinesiology';
import { apiRequest } from '../utils/api';
import { PostureSvgOverlay } from './PostureSvgOverlay';
import { PostureLaserAnalyzerModal } from './PostureLaserAnalyzerModal';

interface PostureComparisonSectionProps {
  client: ClientProfile;
  editable?: boolean;
  onClientUpdated?: (updatedClient: ClientProfile) => void;
}

export const PostureComparisonSection: React.FC<PostureComparisonSectionProps> = ({
  client,
  editable = false,
  onClientUpdated,
}) => {
  const assessments = [...(client.postureAssessments || [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PostureAssessmentRecord | undefined>(
    undefined
  );
  const [defaultProjection, setDefaultProjection] = useState<PostureViewProjection | undefined>(
    undefined
  );
  const [zoomRecord, setZoomRecord] = useState<PostureAssessmentRecord | null>(null);
  const [zoomFineGrid, setZoomFineGrid] = useState(false);
  const [zoomGridDensity, setZoomGridDensity] = useState(20);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedPkIds, setExpandedPkIds] = useState<Record<string, boolean>>({});

  const allViews: PostureViewProjection[] = ['front', 'back', 'side_left', 'side_right'];
  const coveredSet = new Set(assessments.map((a) => a.projection));
  const synthesis = buildMultiViewSynthesis(assessments);

  const handleDelete = async (aid: string) => {
    setDeletingId(aid);
    try {
      const res = await apiRequest<{ ok: boolean; client?: ClientProfile }>(
        `/api/clients/${client.id}/posture-assessments/${aid}`,
        { method: 'DELETE' }
      );
      if (res.client && onClientUpdated) {
        onClientUpdated(res.client);
      } else if (onClientUpdated) {
        onClientUpdated({
          ...client,
          postureAssessments: (client.postureAssessments || []).filter((a) => a.id !== aid),
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-rose-500 shrink-0" />
          <div>
            <h3 className="font-display text-base font-semibold">
              Осанка по лазерному уровню: фото ДО / ПОСЛЕ и замер углов
            </h3>
            <p className="text-xs text-slate-500">
              Визуальная оценка положения тела в пространстве с вертикальным отвесом, горизонтами и углами перекоса
            </p>
          </div>
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => {
              setEditingRecord(undefined);
              setDefaultProjection(undefined);
              setAnalyzerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-semibold hover:opacity-90 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Фото ДО/ПОСЛЕ и замер углов</span>
          </button>
        )}
      </div>

      {/* 4-View Projection Coverage & Quick-Add Bar */}
      {(editable || assessments.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {allViews.map((proj) => {
            const hasProj = coveredSet.has(proj);
            const guide = PROJECTION_ANALYSIS_GUIDES[proj];
            const latestForView = assessments.find((a) => a.projection === proj);
            return (
              <div
                key={proj}
                className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${
                  hasProj
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/60'
                    : 'bg-slate-50/80 dark:bg-slate-800/40 border-dashed border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">
                    {guide.shortLabel}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      hasProj
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {hasProj ? 'Снято' : 'Нет фото'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 line-clamp-2">
                  {guide.planeName}
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (latestForView) {
                        setEditingRecord(latestForView);
                        setDefaultProjection(proj);
                      } else {
                        setEditingRecord(undefined);
                        setDefaultProjection(proj);
                      }
                      setAnalyzerOpen(true);
                    }}
                    className={`w-full py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                      hasProj
                        ? 'bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50'
                        : 'bg-slate-900 dark:bg-cyan-600 text-white hover:opacity-90'
                    }`}
                  >
                    {hasProj ? 'Открыть / дозамерить' : '+ Добавить ракурс'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-View Applied Kinesiology Synthesis Card */}
      {synthesis && (
        <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-900/60 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 font-semibold text-indigo-950 dark:text-indigo-200">
              <Stethoscope className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                Сводный анализ по ракурсам (Анфас · Вид сзади · Профиль)
              </span>
            </div>
            <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
              Покрыто ракурсов: {synthesis.coveredViews.length} из 4
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-white/85 dark:bg-slate-900/75 border border-indigo-100 dark:border-indigo-900/40 text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                Фронтальная плоскость:{' '}
              </span>
              {synthesis.frontalVsBackNote}
            </div>
            <div className="p-2 rounded-lg bg-white/85 dark:bg-slate-900/75 border border-indigo-100 dark:border-indigo-900/40 text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                Сагиттальная плоскость:{' '}
              </span>
              {synthesis.sagittalNote}
            </div>
          </div>

          {synthesis.topFindingsAcrossViews.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {synthesis.topFindingsAcrossViews.slice(0, 6).map((item, idx) => {
                const sev = SEVERITY_META[item.severity];
                return (
                  <span
                    key={`${item.projection}-${item.regionLabel}-${idx}`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${sev.badgeClass}`}
                  >
                    <span className="font-semibold">{item.projectionLabel}:</span>
                    <span>{item.regionLabel}</span>
                    <span className="font-mono font-bold">({item.deviationDeg.toFixed(1)}°)</span>
                  </span>
                );
              })}
            </div>
          )}

          {synthesis.priorityMmtMuscles.length > 0 && (
            <div className="text-[11px] text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                Приоритетные мышцы для ММТ по всем ракурсам:{' '}
              </span>
              {synthesis.priorityMmtMuscles.map((m) => m.muscleName).join(' · ')}
            </div>
          )}
        </div>
      )}

      {assessments.length === 0 ? (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
          <div className="text-xs text-slate-500">
            {editable
              ? 'Фотопротоколы осанки с лазерным уровнем пока не добавлены. Загрузите фото ДО (и ПОСЛЕ) в ракурсах Анфас, Вид сзади или Профиль, чтобы выставить горизонты (голова, шея, плечи, таз, ноги) и получить анализ прикладной кинезиологии с планом ММТ.'
              : 'Фотографии осанки, замеры углов ДО/ПОСЛЕ и кинезиологический разбор появятся здесь после диагностики у тренера.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {assessments.map((rec) => {
            const diffRows = buildBeforeAfterComparison(
              rec.beforeMeasurements,
              rec.afterMeasurements
            );
            return (
              <div
                key={rec.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {rec.date}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 font-medium">
                      {POSTURE_PROJECTION_LABELS[rec.projection]}
                    </span>
                    {rec.laserEnabled && (
                      <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-mono text-[11px]">
                        Лазер: отвес {Math.round(rec.laserPlumbXPct)}%
                      </span>
                    )}
                    {rec.recordedBy && (
                      <span className="text-slate-500">· {rec.recordedBy}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setZoomFineGrid(Boolean(rec.fineGrid));
                        setZoomGridDensity(normalizeGridDensity(rec.gridDensity));
                        setZoomRecord(rec);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs hover:opacity-85 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3 text-cyan-600" />
                      <span>Увеличить</span>
                    </button>
                    {editable && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecord(rec);
                            setAnalyzerOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs hover:opacity-85 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 text-cyan-600" />
                          <span>Лазер и углы</span>
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === rec.id}
                          onClick={() => handleDelete(rec.id)}
                          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-50"
                          title="Удалить фотопротокол"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* BEFORE / AFTER Side-by-Side Photo Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* BEFORE */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-amber-700 dark:text-amber-400">
                        ДО коррекции
                      </span>
                      <span className="font-mono text-slate-500">
                        Замеров: {rec.beforeMeasurements.length}
                      </span>
                    </div>
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                      <img
                        src={rec.beforePhotoUrl}
                        alt="Осанка ДО коррекции"
                        className="w-full h-full object-contain"
                      />
                      <PostureSvgOverlay
                        laserEnabled={rec.laserEnabled}
                        laserPlumbXPct={rec.laserPlumbXPct}
                        laserHorizonsPct={rec.laserHorizonsPct}
                        laserTiltDeg={rec.laserTiltDeg}
                        fineGrid={rec.fineGrid}
                        gridDensity={rec.gridDensity}
                        measurements={rec.beforeMeasurements}
                      />
                    </div>
                    {rec.beforeMeasurements.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rec.beforeMeasurements.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: m.color || '#22d3ee' }}
                            />
                            <span className="font-sans text-slate-600 dark:text-slate-300">
                              {m.label}:
                            </span>
                            <span className="font-bold">{m.angleDeg.toFixed(1)}°</span>
                            {m.type === 'joint' && (
                              <span className="text-[10px] text-slate-500">
                                (откл. {(m.deviationDeg ?? Math.abs(180 - m.angleDeg)).toFixed(1)}°)
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AFTER */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        ПОСЛЕ коррекции
                      </span>
                      <span className="font-mono text-slate-500">
                        {rec.afterPhotoUrl
                          ? `Замеров: ${rec.afterMeasurements.length}`
                          : 'Ожидает фото'}
                      </span>
                    </div>
                    {rec.afterPhotoUrl ? (
                      <>
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                          <img
                            src={rec.afterPhotoUrl}
                            alt="Осанка ПОСЛЕ коррекции"
                            className="w-full h-full object-contain"
                          />
                          <PostureSvgOverlay
                            laserEnabled={rec.laserEnabled}
                            laserPlumbXPct={rec.laserPlumbXPct}
                            laserHorizonsPct={rec.laserHorizonsPct}
                            laserTiltDeg={rec.laserTiltDeg}
                            fineGrid={rec.fineGrid}
                            gridDensity={rec.gridDensity}
                            measurements={rec.afterMeasurements}
                          />
                        </div>
                        {rec.afterMeasurements.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {rec.afterMeasurements.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: m.color || '#10b981' }}
                                />
                                <span className="font-sans text-slate-600 dark:text-slate-300">
                                  {m.label}:
                                </span>
                                <span className="font-bold">{m.angleDeg.toFixed(1)}°</span>
                                {m.type === 'joint' && (
                                  <span className="text-[10px] text-slate-500">
                                    (откл. {(m.deviationDeg ?? Math.abs(180 - m.angleDeg)).toFixed(1)}°)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="aspect-[4/3] rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 flex flex-col items-center justify-center p-4 text-center text-xs text-slate-500 gap-2">
                        <span>Фото ПОСЛЕ коррекции ещё не добавлено</span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecord(rec);
                              setAnalyzerOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium cursor-pointer"
                          >
                            Добавить фото ПОСЛЕ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comparison Summary Badges */}
                {diffRows.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/50 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Динамика коррекции:
                    </span>
                    {diffRows.map((row) => (
                      <span
                        key={row.label}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-mono text-[11px]"
                      >
                        <span className="font-sans text-slate-600 dark:text-slate-300">
                          {row.label}:
                        </span>
                        <span>{row.beforeDeg.toFixed(1)}°</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-bold">{row.afterDeg.toFixed(1)}°</span>
                        <span
                          className={`font-bold ${
                            row.improved
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.deltaDeg > 0.1
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          ({row.deltaDeg > 0 ? '+' : ''}
                          {row.deltaDeg.toFixed(1)}°)
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {rec.notes && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 italic">
                    «{rec.notes}»
                  </div>
                )}

                {/* Saved Applied Kinesiology & MMT Diagnostic Summary */}
                {(() => {
                  const pkReport =
                    rec.kinesiologyReport ||
                    generateKinesiologyReport(
                      rec.beforeMeasurements.length > 0
                        ? rec.beforeMeasurements
                        : rec.afterMeasurements,
                      rec.projection
                    );
                  if (!pkReport || pkReport.findings.length === 0) return null;
                  const isExpanded = expandedPkIds[rec.id] ?? true;
                  const testedCount = pkReport.mmtChecklist.filter(
                    (m) => m.mmtResult && m.mmtResult !== 'untested'
                  ).length;

                  return (
                    <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPkIds((prev) => ({ ...prev, [rec.id]: !isExpanded }))
                          }
                          className="inline-flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-200 cursor-pointer text-left"
                        >
                          <Stethoscope className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>
                            Прикладная кинезиология и список мышц для ММТ (
                            {pkReport.findings.length} зон · {pkReport.mmtChecklist.length} мышц
                            {testedCount > 0 ? ` · протестировано ${testedCount}` : ''})
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                        </button>

                        {pkReport.primaryFallingRegion && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-[11px] font-medium">
                            Ведущий регион: {pkReport.primaryFallingRegion}
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="space-y-2.5 pt-1">
                          {pkReport.summaryPattern && (
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/70 rounded-lg px-2.5 py-2 border border-indigo-100 dark:border-indigo-900/40">
                              <span className="font-semibold">Паттерн компенсации: </span>
                              {pkReport.summaryPattern}
                            </div>
                          )}

                          {/* Findings Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {pkReport.findings.map((f) => {
                              const sev = SEVERITY_META[f.severity];
                              return (
                                <div
                                  key={f.id}
                                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-900 dark:text-white text-[11px]">
                                      {f.regionLabel}: {f.measurementLabel}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${sev.badgeClass}`}>
                                      {f.deviationDeg.toFixed(1)}° · {sev.label}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                    {f.directionLabel}
                                  </div>
                                  {f.possibleCauses.length > 0 && (
                                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                      {f.possibleCauses.slice(0, 3).map((cause, idx) => (
                                        <li key={idx}>{cause}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* MMT Checklist Compact Cards */}
                          {pkReport.mmtChecklist.length > 0 && (
                            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Мышцы для проведения ММТ диагностики:</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {pkReport.mmtChecklist.map((m) => {
                                  const resStatus = m.mmtResult || 'untested';
                                  return (
                                    <div
                                      key={m.id}
                                      className="px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 text-[11px] flex items-start justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="font-medium text-slate-900 dark:text-white truncate">
                                          {m.muscleName}
                                        </div>
                                        <div className="text-[10px] text-slate-500 truncate">
                                          {POSTURE_REGION_LABELS[m.region]} · {m.side}
                                        </div>
                                      </div>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                          resStatus === 'hypotonic'
                                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                            : resStatus === 'hypertonic'
                                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                            : resStatus === 'normotonic'
                                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                            : m.priority === 'primary'
                                            ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                      >
                                        {resStatus !== 'untested'
                                          ? MMT_RESULT_LABELS[resStatus]
                                          : m.priority === 'primary'
                                          ? 'Приоритет'
                                          : 'Доп.'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Laser & Goniometer Analyzer Modal */}
      {analyzerOpen && (
        <PostureLaserAnalyzerModal
          clientId={client.id}
          clientName={client.name}
          initialRecord={editingRecord}
          defaultProjection={defaultProjection}
          onSaved={({ assessment, client: serverClient }) => {
            if (onClientUpdated) {
              if (serverClient && typeof serverClient === 'object' && 'id' in serverClient) {
                onClientUpdated(serverClient as ClientProfile);
              } else {
                const list = client.postureAssessments || [];
                const exists = list.some((a) => a.id === assessment.id);
                onClientUpdated({
                  ...client,
                  postureAssessments: exists
                    ? list.map((a) => (a.id === assessment.id ? assessment : a))
                    : [assessment, ...list],
                });
              }
            }
            setAnalyzerOpen(false);
            setEditingRecord(undefined);
            setDefaultProjection(undefined);
          }}
          onClose={() => {
            setAnalyzerOpen(false);
            setEditingRecord(undefined);
            setDefaultProjection(undefined);
          }}
        />
      )}

      {/* Full-Resolution Zoom Lightbox */}
      {zoomRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="font-display text-base font-bold">
                  Сравнение ДО / ПОСЛЕ · {POSTURE_PROJECTION_LABELS[zoomRecord.projection]}
                </div>
                <div className="text-xs text-slate-500 font-mono">{zoomRecord.date}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoomFineGrid((g) => !g)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                      zoomFineGrid
                        ? 'bg-cyan-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Grid className="w-3 h-3" />
                    <span>Сетка</span>
                  </button>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    Плотность:
                  </span>
                  <input
                    type="range"
                    min={MIN_GRID_DENSITY}
                    max={MAX_GRID_DENSITY}
                    step={1}
                    aria-label="Плотность сетки"
                    value={zoomGridDensity}
                    onChange={(e) => {
                      setZoomGridDensity(Number(e.target.value));
                      if (!zoomFineGrid) setZoomFineGrid(true);
                    }}
                    className="w-24 sm:w-28 accent-cyan-600 cursor-pointer"
                  />
                  <span className="font-mono text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 min-w-[44px]">
                    {formatGridStepLabel(zoomGridDensity)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomRecord(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  ДО коррекции
                </div>
                <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-700">
                  <img
                    src={zoomRecord.beforePhotoUrl}
                    alt="ДО коррекции"
                    className="w-full max-h-[65vh] object-contain"
                  />
                  <PostureSvgOverlay
                    laserEnabled={zoomRecord.laserEnabled}
                    laserPlumbXPct={zoomRecord.laserPlumbXPct}
                    laserHorizonsPct={zoomRecord.laserHorizonsPct}
                    laserTiltDeg={zoomRecord.laserTiltDeg}
                    fineGrid={zoomFineGrid}
                    gridDensity={zoomGridDensity}
                    measurements={zoomRecord.beforeMeasurements}
                  />
                </div>
              </div>
              {zoomRecord.afterPhotoUrl && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    ПОСЛЕ коррекции
                  </div>
                  <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-700">
                    <img
                      src={zoomRecord.afterPhotoUrl}
                      alt="ПОСЛЕ коррекции"
                      className="w-full max-h-[65vh] object-contain"
                    />
                    <PostureSvgOverlay
                      laserEnabled={zoomRecord.laserEnabled}
                      laserPlumbXPct={zoomRecord.laserPlumbXPct}
                      laserHorizonsPct={zoomRecord.laserHorizonsPct}
                      laserTiltDeg={zoomRecord.laserTiltDeg}
                      fineGrid={zoomFineGrid}
                      gridDensity={zoomGridDensity}
                      measurements={zoomRecord.afterMeasurements}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
