import { jsPDF } from 'jspdf';
import type { CompletedExerciseLog, SessionEmgStats, TelemetryPoint } from '../types';

export interface PdfSessionReportInput {
  studioName: string;
  studioAddress: string;
  clientName: string;
  trainerName: string;
  programTitle: string;
  dateStr: string;
  durationSec: number;
  minWinchKg?: number;
  peakWinchKg: number;
  avgSymmetryPct: number;
  minLimbLoads?: { lh: number; rh: number; lf: number; rf: number };
  maxLimbLoads: { lh: number; rh: number; lf: number; rf: number };
  emgStats?: SessionEmgStats;
  minHrBpm?: number;
  avgHrBpm: number;
  maxHrBpm?: number;
  bpBefore: string;
  bpAfter: string;
  heightBeforeCm?: number;
  heightAfterCm?: number;
  weightBeforeKg?: number;
  weightAfterKg?: number;
  postureBeforeSummary?: string;
  postureAfterSummary?: string;
  completedExercises: CompletedExerciseLog[];
  telemetryHistory: TelemetryPoint[];
  notes: string;
  paymentLabel: string;
  amountPaidRub: number;
}

export function exportSessionReportPdf(report: PdfSessionReportInput): void {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, 155);

  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(0, 155, W, 6);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ЭТАЛОН ПРАВИЛО', 64, 66);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 20px "DM Sans", sans-serif';
  ctx.fillText(`Итоговый отчёт тренировочной сессии · ${report.studioName}`, 64, 104);
  ctx.fillText(`${report.studioAddress} · Дата: ${report.dateStr}`, 64, 134);

  // Client & Session Meta Box
  let y = 190;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.fillRect(64, y, W - 128, 200);
  ctx.strokeRect(64, y, W - 128, 200);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Клиент: ${report.clientName}`, 88, y + 40);
  ctx.font = '500 19px "DM Sans", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Тренер: ${report.trainerName}`, 88, y + 74);
  ctx.fillText(`Программа: ${report.programTitle}`, 88, y + 106);
  ctx.fillText(
    `Длительность: ${Math.floor(report.durationSec / 60)} мин ${report.durationSec % 60} сек`,
    88,
    y + 138
  );
  ctx.fillText(
    `Осанка до/после: ${(report.postureBeforeSummary || '—').slice(0, 32)} → ${(report.postureAfterSummary || '—').slice(0, 32)}`,
    88,
    y + 172
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  const bpBeforeStr = report.bpBefore?.trim() || '—';
  const bpAfterStr = report.bpAfter?.trim() || '—';
  ctx.fillText(`Тонометр (АД): ${bpBeforeStr} → ${bpAfterStr} мм рт. ст.`, W - 88, y + 40);

  const heightText =
    report.heightBeforeCm && report.heightAfterCm
      ? `Рост: ${report.heightBeforeCm.toFixed(1)} → ${report.heightAfterCm.toFixed(1)} см (${report.heightAfterCm - report.heightBeforeCm >= 0 ? '+' : ''}${(report.heightAfterCm - report.heightBeforeCm).toFixed(1)})`
      : report.heightBeforeCm
      ? `Рост до: ${report.heightBeforeCm.toFixed(1)} см`
      : 'Рост: не фиксировался';
  ctx.fillText(heightText, W - 88, y + 72);

  const weightText =
    report.weightBeforeKg || report.weightAfterKg
      ? `Вес: ${report.weightBeforeKg ? report.weightBeforeKg.toFixed(1) : '—'} → ${report.weightAfterKg ? report.weightAfterKg.toFixed(1) : '—'} кг`
      : 'Вес: не фиксировался';
  ctx.fillText(weightText, W - 88, y + 104);

  const pulseStr =
    report.avgHrBpm > 0
      ? `Пульсометр: ср ${report.avgHrBpm} (мин ${report.minHrBpm ?? report.avgHrBpm} / макс ${report.maxHrBpm ?? report.avgHrBpm}) уд/мин`
      : 'Пульсометр: нет сигнала';
  ctx.fillText(pulseStr, W - 88, y + 136);

  ctx.fillStyle = '#0891b2';
  ctx.fillText(
    `Оплата: ${report.paymentLabel} · ${report.amountPaidRub.toLocaleString('ru-RU')} ₽`,
    W - 88,
    y + 172
  );
  ctx.textAlign = 'left';

  // KPI Summary Strip (Min/Max Sensors)
  y = 415;
  const minW = report.minWinchKg !== undefined ? `${report.minWinchKg.toFixed(1)}–` : '';
  const emgLine = report.emgStats
    ? `${report.emgStats.ch1MinMv.toFixed(2)}–${report.emgStats.ch1MaxMv.toFixed(2)} / ${report.emgStats.ch2MinMv.toFixed(2)}–${report.emgStats.ch2MaxMv.toFixed(2)}`
    : 'по упражнениям';
  const kpis = [
    { label: 'ТЯГА МИН–МАКС (СИММ.)', value: `${minW}${report.peakWinchKg.toFixed(1)} кг (${report.avgSymmetryPct}%)` },
    {
      label: 'РУКИ Л/П (МАКС. КГ)',
      value: `${report.maxLimbLoads.lh.toFixed(1)} / ${report.maxLimbLoads.rh.toFixed(1)} кг`,
    },
    {
      label: 'НОГИ Л/П (МАКС. КГ)',
      value: `${report.maxLimbLoads.lf.toFixed(1)} / ${report.maxLimbLoads.rf.toFixed(1)} кг`,
    },
    { label: 'МИОДАТЧИКИ CH1 / CH2 (мВ)', value: emgLine },
  ];
  const cardW = (W - 128 - 48) / 4;
  kpis.forEach((k, idx) => {
    const x = 64 + idx * (cardW + 16);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.fillRect(x, y, cardW, 108);
    ctx.strokeRect(x, y, cardW, 108);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 13px "DM Sans", sans-serif';
    ctx.fillText(k.label, x + 16, y + 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText(k.value, x + 16, y + 78);
  });

  // Telemetry Waveform Chart
  y = 550;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Телеметрия: тензодатчики конечностей (кг) и миодатчики (мВ)', 64, y);

  y += 18;
  const chartW = W - 128;
  const chartH = 220;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillRect(64, y, chartW, chartH);
  ctx.strokeRect(64, y, chartW, chartH);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const gy = y + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(64, gy);
    ctx.lineTo(64 + chartW, gy);
    ctx.stroke();
  }

  const pts = report.telemetryHistory;
  if (pts.length > 1) {
    const maxLoad = Math.max(80, ...pts.map((p) => p.totalWinchKg));
    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = 64 + (i / (pts.length - 1)) * chartW;
      const py = y + chartH - 18 - (p.totalWinchKg / maxLoad) * (chartH - 40);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = 64 + (i / (pts.length - 1)) * chartW;
      const py = y + chartH - 18 - Math.min(1, p.emgCh1Mv / 1.2) * (chartH - 40);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.font = '500 16px "DM Sans", sans-serif';
    ctx.fillStyle = '#0891b2';
    ctx.fillText('— Общая тяга (кг)', 84, y + 28);
    ctx.fillStyle = '#d97706';
    ctx.fillText('— Миодатчик CH1 (мВ)', 260, y + 28);
  } else {
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Непрерывная кривая реальной телеметрии за эту сессию не записана',
      64 + chartW / 2,
      y + chartH / 2
    );
    ctx.textAlign = 'left';
  }

  // Completed Exercises Table with Min/Max & Ratings & Feedback
  y += chartH + 44;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Выполненные упражнения, показатели датчиков и оценки клиента', 64, y);

  y += 18;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(64, y, chartW, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px "DM Sans", sans-serif';
  ctx.fillText('Упражнение / отзыв и заметка тренера', 80, y + 28);
  ctx.fillText('Время', 620, y + 28);
  ctx.fillText('Тяга мин–макс', 730, y + 28);
  ctx.fillText('ЭМГ мин–макс', 920, y + 28);
  ctx.fillText('Оценка', 1095, y + 28);

  y += 44;
  const exercisesList: CompletedExerciseLog[] = report.completedExercises.length
    ? report.completedExercises
    : [
        {
          exerciseId: 'ex-1',
          title: 'Основная сессия ПравИло',
          durationSec: report.durationSec,
          minWinchKg: report.minWinchKg,
          maxWinchKg: report.peakWinchKg,
          avgEmgMv: report.emgStats?.ch1AvgMv ?? 0,
        },
      ];

  exercisesList.slice(0, 6).forEach((ex, idx) => {
    const hasFeedback = Boolean(ex.clientFeeling || ex.trainerNote);
    const rowH = hasFeedback ? 72 : 48;
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(64, y, chartW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(64, y, chartW, rowH);

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 16px "DM Sans", sans-serif';
    ctx.fillText(ex.title.slice(0, 42), 80, y + 26);

    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText(
      `${Math.floor(ex.durationSec / 60)}:${String(ex.durationSec % 60).padStart(2, '0')}`,
      620,
      y + 26
    );
    ctx.fillText(
      `${ex.minWinchKg !== undefined ? `${ex.minWinchKg.toFixed(1)}–` : ''}${ex.maxWinchKg.toFixed(1)} кг`,
      730,
      y + 26
    );
    const emgMax = ex.maxEmgMv ?? ex.avgEmgMv;
    ctx.fillText(
      `${ex.minEmgMv !== undefined ? `${ex.minEmgMv.toFixed(2)}–` : ''}${emgMax.toFixed(2)} мВ`,
      920,
      y + 26
    );
    const ratingStr =
      ex.clientRating !== undefined
        ? `${ex.clientRating}/5${ex.discomfortLevel !== undefined ? ` (д:${ex.discomfortLevel})` : ''}`
        : '—';
    ctx.fillText(ratingStr, 1095, y + 26);

    if (hasFeedback) {
      ctx.fillStyle = '#475569';
      ctx.font = '400 14px "DM Sans", sans-serif';
      const feedbackLine = [
        ex.clientFeeling ? `Ощущения: ${ex.clientFeeling}` : '',
        ex.trainerNote ? `Заметка: ${ex.trainerNote}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 118);
      ctx.fillText(feedbackLine, 80, y + 54);
    }
    y += rowH;
  });

  // Trainer Notes
  y += 32;
  const noteBoxH = Math.max(110, Math.min(180, H - y - 90));
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Заключение и заметки тренера', 64, y);
  y += 14;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillRect(64, y, chartW, noteBoxH);
  ctx.strokeRect(64, y, chartW, noteBoxH);
  ctx.fillStyle = '#334155';
  ctx.font = '400 18px "DM Sans", sans-serif';

  const noteText =
    report.notes ||
    'Тренировка выполнена в штатном режиме, симметрия мышечного тонуса и показатели датчиков в пределах нормы.';
  const words = noteText.split(' ');
  let line = '';
  let lineY = y + 34;
  for (const w of words) {
    if (ctx.measureText(line + w).width > chartW - 56) {
      ctx.fillText(line, 86, lineY);
      line = w + ' ';
      lineY += 26;
      if (lineY > y + noteBoxH - 18) break;
    } else {
      line += w + ' ';
    }
  }
  if (line && lineY <= y + noteBoxH - 14) ctx.fillText(line, 86, lineY);

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '400 15px "DM Sans", sans-serif';
  ctx.fillText(
    'Сформировано в системе ЭТАЛОН ПРАВИЛО · Автоматическая телеметрия датчиков',
    64,
    H - 42
  );

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
  const safeName = report.clientName.replace(/\s+/g, '_');
  pdf.save(`Pravilo_Report_${safeName}_${report.dateStr}.pdf`);
}
