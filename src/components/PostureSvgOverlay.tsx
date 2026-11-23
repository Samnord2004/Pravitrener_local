import React from 'react';
import type { PostureAngleMeasurement, PosturePoint } from '../types';

interface PostureSvgOverlayProps {
  laserEnabled: boolean;
  laserPlumbXPct: number;
  laserHorizonsPct: number[];
  laserTiltDeg?: number;
  fineGrid?: boolean;
  measurements: PostureAngleMeasurement[];
  pendingPoints?: PosturePoint[];
  pendingColor?: string;
  interactive?: boolean;
  onStartDragPlumb?: (e: React.PointerEvent<SVGElement>) => void;
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

const HORIZON_LABELS = ['L1 Голова', 'L2 Плечи', 'L3 Таз', 'L4 Колени'];

export const PostureSvgOverlay: React.FC<PostureSvgOverlayProps> = ({
  laserEnabled,
  laserPlumbXPct,
  laserHorizonsPct,
  laserTiltDeg = 0,
  fineGrid = false,
  measurements,
  pendingPoints = [],
  pendingColor = '#22d3ee',
  interactive = false,
  onStartDragPlumb,
}) => {
  const safePlumbX = Math.max(5, Math.min(95, laserPlumbXPct || 50));
  const tilt = Number.isFinite(laserTiltDeg) ? laserTiltDeg : 0;

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

      {/* Optional 5% Laser Calibration Grid */}
      {fineGrid && (
        <g opacity="0.24">
          {Array.from({ length: 19 }, (_, idx) => (idx + 1) * 5).map((pos) => (
            <React.Fragment key={`g-${pos}`}>
              <line
                x1={pos}
                y1={0}
                x2={pos}
                y2={100}
                stroke={pos % 25 === 0 ? '#38bdf8' : '#e2e8f0'}
                strokeWidth={pos % 25 === 0 ? 0.25 : 0.14}
                strokeDasharray={pos % 25 === 0 ? undefined : '1 1'}
              />
              <line
                x1={0}
                y1={pos}
                x2={100}
                y2={pos}
                stroke={pos % 25 === 0 ? '#38bdf8' : '#e2e8f0'}
                strokeWidth={pos % 25 === 0 ? 0.25 : 0.14}
                strokeDasharray={pos % 25 === 0 ? undefined : '1 1'}
              />
            </React.Fragment>
          ))}
        </g>
      )}

      {/* Laser Level Vertical Plumb & Horizontal Lines */}
      {laserEnabled && (
        <g transform={tilt !== 0 ? `rotate(${tilt} ${safePlumbX} 50)` : undefined}>
          {/* Horizontal laser reference rays */}
          {laserHorizonsPct.map((hy, idx) => {
            const safeY = Math.max(4, Math.min(96, hy));
            return (
              <g key={`lh-${idx}`}>
                <line
                  x1={-10}
                  y1={safeY}
                  x2={110}
                  y2={safeY}
                  stroke="#ef4444"
                  strokeWidth={0.42}
                  strokeDasharray="2.2 1.2"
                  opacity={0.9}
                  filter="url(#laserGlow)"
                />
                <rect
                  x={1.2}
                  y={Math.max(1, safeY - 3.3)}
                  width={18.5}
                  height={2.8}
                  rx={0.7}
                  fill="rgba(15, 23, 42, 0.78)"
                />
                <text
                  x={2.1}
                  y={Math.max(3, safeY - 1.3)}
                  fill="#fca5a5"
                  fontSize="2.1"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="600"
                >
                  {HORIZON_LABELS[idx] || `L${idx + 1}`}
                </text>
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
              className="pointer-events-auto cursor-ew-resize"
              onPointerDown={(e) => {
                e.stopPropagation();
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
              <circle cx={p1.xPct} cy={p1.yPct} r={1.35} fill={col} stroke="#0f172a" strokeWidth={0.35} />
              <circle cx={p2.xPct} cy={p2.yPct} r={1.35} fill={col} stroke="#0f172a" strokeWidth={0.35} />
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
          const boxX = Math.max(1.5, Math.min(78, b.xPct + 2.2));
          const boxY = Math.max(2, Math.min(93, b.yPct - 3.8));
          return (
            <g key={m.id}>
              <line x1={a.xPct} y1={a.yPct} x2={b.xPct} y2={b.yPct} stroke={col} strokeWidth={0.65} />
              <line x1={b.xPct} y1={b.yPct} x2={c.xPct} y2={c.yPct} stroke={col} strokeWidth={0.65} />
              <path d={arcD} fill="none" stroke={col} strokeWidth={0.48} />
              <circle cx={a.xPct} cy={a.yPct} r={1.25} fill={col} stroke="#0f172a" strokeWidth={0.35} />
              <circle cx={b.xPct} cy={b.yPct} r={1.55} fill="#ffffff" stroke={col} strokeWidth={0.5} />
              <circle cx={c.xPct} cy={c.yPct} r={1.25} fill={col} stroke="#0f172a" strokeWidth={0.35} />
              <rect
                x={boxX}
                y={boxY}
                width={15.5}
                height={3.6}
                rx={0.9}
                fill="rgba(15, 23, 42, 0.88)"
                stroke={col}
                strokeWidth={0.32}
              />
              <text
                x={boxX + 7.75}
                y={boxY + 2.55}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="2.2"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
              >
                {m.angleDeg.toFixed(1)}°
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
          {pendingPoints.map((pt, idx) => (
            <g key={`pend-${idx}`}>
              <circle
                cx={pt.xPct}
                cy={pt.yPct}
                r={1.7}
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
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};
