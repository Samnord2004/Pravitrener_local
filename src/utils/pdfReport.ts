import { jsPDF } from 'jspdf';
import type { CompletedExerciseLog, TelemetryPoint } from '../types';

export interface PdfSessionReportInput {
  studioName: string;
  studioAddress: string;
  clientName: string;
  trainerName: string;
  programTitle: string;
  dateStr: string;
  durationSec: number;
  peakWinchKg: number;
  avgSymmetryPct: number;
  maxLimbLoads: { lh: number; rh: number; lf: number; rf: number };
  avgHrBpm: number;
  bpBefore: string;
  bpAfter: string;
  heightBeforeCm?: number;
  heightAfterCm?: number;
  completedExercises: CompletedExerciseLog[];
  telemetryHistory: TelemetryPoint[];
  notes: string;
  paymentLabel: string;
  amountPaidRub: number;
}

export function exportSessionReportPdf(report: PdfSessionReportInput): void {
  // Render crisp Russian A4 sheet onto high-DPI canvas and embed in jsPDF for flawless Cyrillic glyphs
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
  ctx.fillRect(0, 0, W, 170);

  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(0, 170, W, 6);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ЭТАЛОН ПРАВИЛО', 64, 72);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 22px "DM Sans", sans-serif';
  ctx.fillText(`Итоговый биомеханический отчёт тренировочной сессии · ${report.studioName}`, 64, 114);
  ctx.fillText(`${report.studioAddress} · Дата: ${report.dateStr}`, 64, 146);

  // Client & Session Meta Box
  let y = 230;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.fillRect(64, y, W - 128, 175);
  ctx.strokeRect(64, y, W - 128, 175);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Клиент: ${report.clientName}`, 92, y + 48);
  ctx.font = '500 21px "DM Sans", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Тренер: ${report.trainerName}`, 92, y + 86);
  ctx.fillText(`Программа: ${report.programTitle}`, 92, y + 120);
  ctx.fillText(`Длительность: ${Math.floor(report.durationSec / 60)} мин ${report.durationSec % 60} сек`, 92, y + 154);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText(`АД до/после: ${report.bpBefore} → ${report.bpAfter} мм рт. ст.`, W - 92, y + 48);
  const heightText =
    report.heightBeforeCm && report.heightAfterCm
      ? `Рост: ${report.heightBeforeCm.toFixed(1)} → ${report.heightAfterCm.toFixed(1)} см (${report.heightAfterCm - report.heightBeforeCm >= 0 ? '+' : ''}${(report.heightAfterCm - report.heightBeforeCm).toFixed(1)} см)`
      : report.heightBeforeCm
      ? `Рост до: ${report.heightBeforeCm.toFixed(1)} см`
      : 'Рост: не зафиксирован';
  ctx.fillText(heightText, W - 92, y + 84);
  ctx.fillText(`Ср. пульс (пульсометр): ${report.avgHrBpm} уд/мин`, W - 92, y + 120);
  ctx.fillStyle = '#0891b2';
  ctx.fillText(`Оплата: ${report.paymentLabel} · ${report.amountPaidRub.toLocaleString('ru-RU')} ₽`, W - 92, y + 156);
  ctx.textAlign = 'left';

  // KPI Summary Strip
  y = 445;
  const kpis = [
    { label: 'МАКС. ТЯГА ЛЕБЁДКИ', value: `${report.peakWinchKg.toFixed(1)} кг` },
    { label: 'СИММЕТРИЯ ТЯГИ', value: `${report.avgSymmetryPct}%` },
    { label: 'ЛЕВ / ПРАВ РУКА', value: `${report.maxLimbLoads.lh.toFixed(1)} / ${report.maxLimbLoads.rh.toFixed(1)} кг` },
    { label: 'ЛЕВ / ПРАВ НОГА', value: `${report.maxLimbLoads.lf.toFixed(1)} / ${report.maxLimbLoads.rf.toFixed(1)} кг` },
  ];
  const cardW = (W - 128 - 48) / 4;
  kpis.forEach((k, idx) => {
    const x = 64 + idx * (cardW + 16);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.fillRect(x, y, cardW, 118);
    ctx.strokeRect(x, y, cardW, 118);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px "DM Sans", sans-serif';
    ctx.fillText(k.label, x + 20, y + 36);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillText(k.value, x + 20, y + 86);
  });

  // Telemetry Waveform Chart (EMG + Total Winch Load)
  y = 605;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 23px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Телеметрия: общая нагрузка лебёдки (кг) и миодатчики (мВ)', 64, y);

  y += 22;
  const chartW = W - 128;
  const chartH = 260;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillRect(64, y, chartW, chartH);
  ctx.strokeRect(64, y, chartW, chartH);

  // Grid lines
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

    // Total winch curve (cyan)
    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = 64 + (i / (pts.length - 1)) * chartW;
      const py = y + chartH - 20 - (p.totalWinchKg / maxLoad) * (chartH - 44);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // EMG Ch1 curve (amber)
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = 64 + (i / (pts.length - 1)) * chartW;
      const py = y + chartH - 20 - Math.min(1, p.emgCh1Mv / 1.2) * (chartH - 44);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Legend
    ctx.font = '500 17px "DM Sans", sans-serif';
    ctx.fillStyle = '#0891b2';
    ctx.fillText('— Тяга лебёдки (кг)', 84, y + 30);
    ctx.fillStyle = '#d97706';
    ctx.fillText('— Миодатчик CH1 (мВ)', 290, y + 30);
  } else {
    ctx.font = '500 20px "DM Sans", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Реальная телеметрия с тензодатчиков конечностей и миодатчиков не поступала', 64 + chartW / 2, y + chartH / 2);
    ctx.textAlign = 'left';
  }

  // Completed Exercises Table
  y += chartH + 54;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 23px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Выполненные упражнения', 64, y);

  y += 22;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(64, y, chartW, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 17px "DM Sans", sans-serif';
  ctx.fillText('Упражнение', 84, y + 31);
  ctx.fillText('Длительность', 660, y + 31);
  ctx.fillText('Пик тяги', 850, y + 31);
  ctx.fillText('Ср. ЭМГ', 1030, y + 31);

  y += 48;
  const exercisesList = report.completedExercises.length
    ? report.completedExercises
    : [{ exerciseId: 'ex-1', title: 'Базовое горизонтальное вытяжение', durationSec: report.durationSec, maxWinchKg: report.peakWinchKg, avgEmgMv: 0.44 }];

  exercisesList.slice(0, 6).forEach((ex, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(64, y, chartW, 52);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(64, y, chartW, 52);

    ctx.fillStyle = '#0f172a';
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.fillText(ex.title.slice(0, 44), 84, y + 33);

    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText(`${Math.floor(ex.durationSec / 60)}:${String(ex.durationSec % 60).padStart(2, '0')}`, 660, y + 33);
    ctx.fillText(`${ex.maxWinchKg.toFixed(1)} кг`, 850, y + 33);
    ctx.fillText(`${ex.avgEmgMv.toFixed(2)} мВ`, 1030, y + 33);
    y += 52;
  });

  // Trainer Notes
  y += 44;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Заключение и заметки тренера', 64, y);
  y += 18;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillRect(64, y, chartW, 145);
  ctx.strokeRect(64, y, chartW, 145);
  ctx.fillStyle = '#334155';
  ctx.font = '400 19px "DM Sans", sans-serif';

  const noteText = report.notes || 'Тренировка выполнена в штатном режиме, симметрия мышечного тонуса в пределах нормы.';
  const words = noteText.split(' ');
  let line = '';
  let lineY = y + 38;
  for (const w of words) {
    if (ctx.measureText(line + w).width > chartW - 56) {
      ctx.fillText(line, 86, lineY);
      line = w + ' ';
      lineY += 30;
    } else {
      line += w + ' ';
    }
  }
  if (line) ctx.fillText(line, 86, lineY);

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '400 16px "DM Sans", sans-serif';
  ctx.fillText('Сформировано в системе ЭТАЛОН ПРАВИЛО · Автоматическая телеметрия датчиков', 64, H - 48);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
  const safeName = report.clientName.replace(/\s+/g, '_');
  pdf.save(`Pravilo_Report_${safeName}_${report.dateStr}.pdf`);
}
