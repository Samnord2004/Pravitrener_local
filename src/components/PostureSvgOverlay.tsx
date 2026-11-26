import React from 'react';
import type { PostureAngleMeasurement, PosturePoint } from '../types';
import {
  DEFAULT_GRID_DENSITY,
  LASER_HORIZON_NAMES,
  normalizeGridDensity,
  normalizeLaserHorizons,
} from '../utils/postureGeometry';

interface PostureSvgOverlayProps {
  laserEnabled: boolean;
  laserPlumbXPct: number;
  laserHorizonsPct: number[];
  laserTiltDeg?: number;
  fineGrid?: boolean;
  gridDensity?: number;
  measurements: PostureAngleMeasurement[];
  pendingPoints?: PosturePoint[];
  pendingColor?: string;
  interactive?: boolean;
  activeDragTarget?: {
    measurementId?: string;
    pending?: boolean;
    horizonIdx?: number;
    pointIdx: number;
  } | null;
  onStartDragPlumb?: (e: React.PointerEvent<SVGElement>) => void;
  onStartDragHorizon?: (horizonIdx: number, e: React.PointerEvent<SVGElement>) => void;
  onStartDragPoint?: (
    measurementId: string,
    pointIdx: number,
    e: React.PointerEvent<SVGElement>
  ) => void;
  onStartDragPendingPoint?: (pointIdx: number, e: React.PointerEvent<SVGElement>) => void;
}

function buildJointArcPath(a: PosturePoint, b: PosturePoint, c: PosturePoint, radius = 6.5): string {
  const ang1 = Math.atan2(a.yPct - b.yPct, a.xPct - b.xPct);
  const ang2 = Math.atan2(c.yPct - b.yPct, c.xPct - b.xPct);
  let diff = ang2 - ang1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  const x1 = b.xPct + radius * Math.cos(ang1);
  const y1 = b.yPct + radius * Math.sin(ang1);
  const x2 = b.xPct + radius * Math.cos(ang1 + diff);
  const y2 = b.yPct + radius * Math.sin(ang1 + diff);
  const sweepFlag = diff >= 0 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 ${sweepFlag} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const HORIZON_COLORS = ['#38bdf8', '#2dd4bf', '#4ade80', '#fbbf24', '#fb7185'];

export const PostureSvgOverlay: React.FC<PostureSvgOverlayProps> = ({
  laserEnabled,
  laserPlumbXPct,
  laserHorizonsPct,
  laserTiltDeg = 0,
  fineGrid = false,
  gridDensity = DEFAULT_GRID_DENSITY,
  measurements,
  pendingPoints = [],
  pendingColor = '#22d3ee',
  interactive = false,
  activeDragTarget = null,
  onStartDragPlumb,
  onStartDragHorizon,
  onStartDragPoint,
  onStartDragPendingPoint,
}) => {
  const safePlumbX = Math.max(5, Math.min(95, laserPlumbXPct || 50));
  const tilt = Number.isFinite(laserTiltDeg) ? laserTiltDeg : 0;
  const horizons = normalizeLaserHorizons(laserHorizonsPct);
  const safeGridDensity = normalizeGridDensity(gridDensity);
  const gridStepPct = 100 / safeGridDensity;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden"
    >
      <defs>
        <filter id="laserGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.45" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Adjustable Density Laser Calibration Grid */}
      {fineGrid && (
        <g opacity="0.28">
          {Array.from({ length: safeGridDensity - 1 }, (_, idx) => idx + 1).map((lineIdx) => {
            const pos = Number((lineIdx * gridStepPct).toFixed(3));
            const isMajor =
              (safeGridDensity % 2 === 0 && lineIdx === safeGridDensity / 2) ||
              (safeGridDensity % 4 === 0 &&
                (lineIdx === safeGridDensity / 4 || lineIdx === (safeGridDensity * 3) / 4)) ||
              (safeGridDensity % 4 !== 0 &&
                lineIdx % Math.max(2, Math.round(safeGridDensity / 4)) === 0);
            return (
              <React.Fragment key={`g-${safeGridDensity}-${lineIdx}`}>
                <line
                  x1={pos}
                  y1={0}
                  x2={pos}
                  y2={100}
                  stroke={isMajor ? '#38bdf8' : '#e2e8f0'}
                  strokeWidth={isMajor ? 0.25 : 0.14}
                  strokeDasharray={isMajor ? undefined : '1 1'}
                />
                <line
                  x1={0}
                  y1={pos}
                  x2={100}
                  y2={pos}
                  stroke={isMajor ? '#38bdf8' : '#e2e8f0'}
                  strokeWidth={isMajor ? 0.25 : 0.14}
                  strokeDasharray={isMajor ? undefined : '1 1'}
                />
              </React.Fragment>
            );
          })}
        </g>
      )}

      {/* Laser Level Vertical Plumb & Horizontal Lines */}
      {laserEnabled && (
        <g transform={tilt !== 0 ? `rotate(${tilt} ${safePlumbX} 50)` : undefined}>
          {/* Horizontal laser reference rays (Голова, Шея, Плечи, Таз, Ноги) */}
          {horizons.map((hy, idx) => {
            const safeY = Math.max(4, Math.min(96, hy));
            const hColor = HORIZON_COLORS[idx] || '#ef4444';
            const hLabel = LASER_HORIZON_NAMES[idx] || `L${idx + 1}`;
            const isDraggingH = activeDragTarget?.horizonIdx === idx;
            return (
              <g key={`lh-${idx}`}>
                {/* Dark contrast backing so line stays crisp on bright or light backgrounds */}
                <line
                  x1={-10}
                  y1={safeY}
                  x2={110}
                  y2={safeY}
                  stroke="rgba(15, 23, 42, 0.58)"
                  strokeWidth={isDraggingH ? 1.4 : 1.05}
                />
                {/* Crisp horizontal level line */}
                <line
                  x1={-10}
                  y1={safeY}
                  x2={110}
                  y2={safeY}
                  stroke={hColor}
                  strokeWidth={isDraggingH ? 0.72 : 0.5}
                  strokeDasharray="2.4 1.1"
                  opacity={0.96}
                />
                {/* Left level label badge */}
                <rect
                  x={1.2}
                  y={Math.max(1, safeY - 3.3)}
                  width={18.5}
                  height={2.9}
                  rx={0.7}
                  fill="rgba(15, 23, 42, 0.88)"
                  stroke={hColor}
                  strokeWidth={0.25}
                />
                <text
                  x={2.1}
                  y={Math.max(3, safeY - 1.25)}
                  fill={hColor}
                  fontSize="2.1"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="700"
                >
                  {hLabel}
                </text>

                {/* Interactive vertical drag handles (left badge + right grip) */}
                {interactive && onStartDragHorizon && (
                  <>
                    <rect
                      x={1}
                      y={Math.max(0.5, safeY - 4)}
                      width={20}
                      height={5}
                      fill="transparent"
                      style={{ touchAction: 'none' }}
                      className="pointer-events-auto cursor-ns-resize"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onStartDragHorizon(idx, e);
                      }}
                    />
                    <rect
                      x={91.5}
                      y={safeY - 1.6}
                      width={7}
                      height={3.2}
                      rx={1.2}
                      fill="rgba(15, 23, 42, 0.9)"
                      stroke={hColor}
                      strokeWidth={0.4}
                      style={{ touchAction: 'none' }}
                      className="pointer-events-auto cursor-ns-resize"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onStartDragHorizon(idx, e);
                      }}
                    />
                    <line
                      x1={93.2}
                      y1={safeY - 0.5}
                      x2={96.8}
                      y2={safeY - 0.5}
                      stroke={hColor}
                      strokeWidth={0.35}
                    />
                    <line
                      x1={93.2}
                      y1={safeY + 0.5}
                      x2={96.8}
                      y2={safeY + 0.5}
                      stroke={hColor}
                      strokeWidth={0.35}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Vertical Plumb Laser Line */}
          <line
            x1={safePlumbX}
            y1={-10}
            x2={safePlumbX}
            y2={110}
            stroke="#ef4444"
            strokeWidth={0.62}
            filter="url(#laserGlow)"
          />
          <line
            x1={safePlumbX}
            y1={-10}
            x2={safePlumbX}
            y2={110}
            stroke="#fecaca"
            strokeWidth={0.18}
          />

          {/* Top plumb triangle & badge */}
          <polygon
            points={`${safePlumbX - 1.8},0.8 ${safePlumbX + 1.8},0.8 ${safePlumbX},3.4`}
            fill="#ef4444"
          />
          <rect
            x={Math.min(76, Math.max(2, safePlumbX + 1.5))}
            y={1.2}
            width={16.5}
            height={3.1}
            rx={0.8}
            fill="rgba(15, 23, 42, 0.85)"
          />
          <text
            x={Math.min(77, Math.max(3, safePlumbX + 2.5))}
            y={3.4}
            fill="#fecaca"
            fontSize="2.1"
            fontFamily="ui-monospace, monospace"
            fontWeight="700"
          >
            Отвес {Math.round(safePlumbX)}%
          </text>

          {/* Interactive plumb drag handle when editing */}
          {interactive && onStartDragPlumb && (
            <circle
              cx={safePlumbX}
              cy={8}
              r={2.8}
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth={0.5}
              style={{ touchAction: 'none' }}
              className="pointer-events-auto cursor-ew-resize"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStartDragPlumb(e);
              }}
            />
          )}
        </g>
      )}

      {/* Saved Angle Measurements */}
      {measurements.map((m) => {
        const col = m.color || '#22d3ee';
        if (m.type === 'tilt' && m.points.length >= 2) {
          const [p1, p2] = m.points;
          const midX = (p1.xPct + p2.xPct) / 2;
          const midY = (p1.yPct + p2.yPct) / 2;
          const isHorizontal = Math.abs(p2.xPct - p1.xPct) >= Math.abs(p2.yPct - p1.yPct);
          const badgeText = `${m.angleDeg.toFixed(1)}°`;
          const boxX = Math.max(1.5, Math.min(79, midX - 7));
          const boxY = Math.max(2, Math.min(93, midY - 4.8));

          return (
            <g key={m.id}>
              {/* Reference orthogonal guide from p1 */}
              <line
                x1={p1.xPct}
                y1={p1.yPct}
                x2={isHorizontal ? p2.xPct : p1.xPct}
                y2={isHorizontal ? p1.yPct : p2.yPct}
                stroke={col}
                strokeWidth={0.35}
                strokeDasharray="1.4 1.1"
                opacity={0.75}
              />
              {/* Measured line */}
              <line
                x1={p1.xPct}
                y1={p1.yPct}
                x2={p2.xPct}
                y2={p2.yPct}
                stroke={col}
                strokeWidth={0.68}
              />
              {[p1, p2].map((pt, idx) => {
                const isDragging =
                  activeDragTarget?.measurementId === m.id &&
                  activeDragTarget.pointIdx === idx;
                return (
                  <g key={`${m.id}-pt-${idx}`}>
                    {isDragging && (
                      <circle
                        cx={pt.xPct}
                        cy={pt.yPct}
                        r={3.0}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={0.45}
                        opacity={0.9}
                      />
                    )}
                    <circle
                      cx={pt.xPct}
                      cy={pt.yPct}
                      r={isDragging ? 1.85 : 1.45}
                      fill={col}
                      stroke={isDragging ? '#ffffff' : '#0f172a'}
                      strokeWidth={isDragging ? 0.5 : 0.35}
                    />
                    {interactive && onStartDragPoint && (
                      <circle
                        cx={pt.xPct}
                        cy={pt.yPct}
                        r={3.4}
                        fill="transparent"
                        style={{ touchAction: 'none' }}
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onStartDragPoint(m.id, idx, e);
                        }}
                      />
                    )}
                  </g>
                );
              })}
              <rect
                x={boxX}
                y={boxY}
                width={13.5}
                height={3.6}
                rx={0.9}
                fill="rgba(15, 23, 42, 0.88)"
                stroke={col}
                strokeWidth={0.32}
              />
              <text
                x={boxX + 6.75}
                y={boxY + 2.55}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="2.3"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
              >
                {badgeText}
              </text>
            </g>
          );
        }

        if (m.type === 'joint' && m.points.length >= 3) {
          const [a, b, c] = m.points;
          const arcD = buildJointArcPath(a, b, c, 5.5);
          const dev = Number((m.deviationDeg ?? Math.abs(180 - m.angleDeg)).toFixed(1));
          const jointLabel = `${m.angleDeg.toFixed(1)}° (±${dev.toFixed(1)}°)`;
          const boxW = 24.5;
          const boxX = Math.max(1.5, Math.min(98.5 - boxW, b.xPct + 2.2));
          const boxY = Math.max(2, Math.min(93, b.yPct - 3.8));
          return (
            <g key={m.id}>
              <line x1={a.xPct} y1={a.yPct} x2={b.xPct} y2={b.yPct} stroke={col} strokeWidth={0.65} />
              <line x1={b.xPct} y1={b.yPct} x2={c.xPct} y2={c.yPct} stroke={col} strokeWidth={0.65} />
              <path d={arcD} fill="none" stroke={col} strokeWidth={0.48} />
              {[a, b, c].map((pt, idx) => {
                const isVertex = idx === 1;
                const isDragging =
                  activeDragTarget?.measurementId === m.id &&
                  activeDragTarget.pointIdx === idx;
                return (
                  <g key={`${m.id}-jpt-${idx}`}>
                    {isDragging && (
                      <circle
                        cx={pt.xPct}
                        cy={pt.yPct}
                        r={3.0}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={0.45}
                        opacity={0.9}
                      />
                    )}
                    <circle
                      cx={pt.xPct}
                      cy={pt.yPct}
                      r={isDragging ? 1.9 : isVertex ? 1.6 : 1.3}
                      fill={isVertex ? '#ffffff' : col}
                      stroke={isVertex ? col : isDragging ? '#ffffff' : '#0f172a'}
                      strokeWidth={isVertex || isDragging ? 0.5 : 0.35}
                    />
                    {interactive && onStartDragPoint && (
                      <circle
                        cx={pt.xPct}
                        cy={pt.yPct}
                        r={3.4}
                        fill="transparent"
                        style={{ touchAction: 'none' }}
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onStartDragPoint(m.id, idx, e);
                        }}
                      />
                    )}
                  </g>
                );
              })}
              <rect
                x={boxX}
                y={boxY}
                width={boxW}
                height={3.6}
                rx={0.9}
                fill="rgba(15, 23, 42, 0.9)"
                stroke={col}
                strokeWidth={0.32}
              />
              <text
                x={boxX + boxW / 2}
                y={boxY + 2.5}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="2.05"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
              >
                {jointLabel}
              </text>
            </g>
          );
        }
        return null;
      })}

      {/* In-Progress Pending Points */}
      {pendingPoints.length > 0 && (
        <g>
          {pendingPoints.length >= 2 && (
            <line
              x1={pendingPoints[0].xPct}
              y1={pendingPoints[0].yPct}
              x2={pendingPoints[1].xPct}
              y2={pendingPoints[1].yPct}
              stroke={pendingColor}
              strokeWidth={0.6}
              strokeDasharray="1.2 0.8"
            />
          )}
          {pendingPoints.map((pt, idx) => {
            const isDragging =
              Boolean(activeDragTarget?.pending) && activeDragTarget?.pointIdx === idx;
            return (
              <g key={`pend-${idx}`}>
                {isDragging && (
                  <circle
                    cx={pt.xPct}
                    cy={pt.yPct}
                    r={3.1}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={0.45}
                  />
                )}
                <circle
                  cx={pt.xPct}
                  cy={pt.yPct}
                  r={isDragging ? 2.0 : 1.7}
                  fill={pendingColor}
                  stroke="#ffffff"
                  strokeWidth={0.45}
                />
                <text
                  x={pt.xPct + 2.2}
                  y={pt.yPct - 1.2}
                  fill="#ffffff"
                  fontSize="2.3"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="700"
                >
                  P{idx + 1}
                </text>
                {interactive && onStartDragPendingPoint && (
                  <circle
                    cx={pt.xPct}
                    cy={pt.yPct}
                    r={3.5}
                    fill="transparent"
                    style={{ touchAction: 'none' }}
                    className="pointer-events-auto cursor-grab active:cursor-grabbing"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onStartDragPendingPoint(idx, e);
                    }}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
};
