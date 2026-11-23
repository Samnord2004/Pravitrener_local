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
} from 'lucide-react';
import type { ClientProfile, PostureAssessmentRecord } from '../types';
import {
  POSTURE_PROJECTION_LABELS,
  buildBeforeAfterComparison,
} from '../utils/postureGeometry';
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
  const [zoomRecord, setZoomRecord] = useState<PostureAssessmentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
              setAnalyzerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-semibold hover:opacity-90 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Фото ДО/ПОСЛЕ и замер углов</span>
          </button>
        )}
      </div>

      {assessments.length === 0 ? (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
          <div className="text-xs text-slate-500">
            {editable
              ? 'Фотопротоколы осанки с лазерным уровнем пока не добавлены. Загрузите фото ДО (и ПОСЛЕ) коррекции, чтобы измерить перекос плеч, таза или шейный угол.'
              : 'Фотографии осанки и замеры углов ДО/ПОСЛЕ появятся здесь после диагностики у тренера.'}
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
                      onClick={() => setZoomRecord(rec)}
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
          }}
          onClose={() => {
            setAnalyzerOpen(false);
            setEditingRecord(undefined);
          }}
        />
      )}

      {/* Full-Resolution Zoom Lightbox */}
      {zoomRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="font-display text-base font-bold">
                  Сравнение ДО / ПОСЛЕ · {POSTURE_PROJECTION_LABELS[zoomRecord.projection]}
                </div>
                <div className="text-xs text-slate-500 font-mono">{zoomRecord.date}</div>
              </div>
              <button
                type="button"
                onClick={() => setZoomRecord(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
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
                    fineGrid={zoomRecord.fineGrid}
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
                      fineGrid={zoomRecord.fineGrid}
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
