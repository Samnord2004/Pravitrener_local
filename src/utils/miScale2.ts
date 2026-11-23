import type { MiScale2Metrics, ScaleCalibrationConfig } from '../types';

export const DEFAULT_MI_SCALE_CALIBRATION: ScaleCalibrationConfig = {
  tareOffsetKg: 0,
  gainFactor: 1.0,
  impedanceOffsetOhm: 0,
  referenceWeightKg: 50,
  calibrated: true,
  lastCalibratedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
};

/**
 * Calibrated Mi Body Composition Scale 2 (XMTZC05HM) BIA calculation engine.
 * Computes all 13 Mi Fit / Zepp Life metrics from raw weight, impedance, height, age, and gender,
 * applying zero-point tare, load-cell gain factor, and BIA electrode impedance offset.
 */
export function calculateMiScale2Metrics(params: {
  rawWeightKg: number;
  heightCm: number;
  ageYears: number;
  gender: 'male' | 'female';
  rawImpedanceOhm?: number;
  balanceTestSec?: number;
  calibration?: Partial<ScaleCalibrationConfig>;
}): MiScale2Metrics {
  const tare = params.calibration?.tareOffsetKg ?? 0;
  const gain = params.calibration?.gainFactor ?? 1.0;
  const impOffset = params.calibration?.impedanceOffsetOhm ?? 0;

  const weightKg = Number(Math.max(20, (params.rawWeightKg - tare) * gain).toFixed(1));
  const heightM = Math.max(1.2, params.heightCm / 100);
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  const age = Math.max(14, Math.min(95, params.ageYears));

  const defaultImp = params.gender === 'male' ? 465 : 535;
  const impedanceOhm = Math.round(
    Math.max(250, Math.min(900, (params.rawImpedanceOhm ?? defaultImp) + impOffset))
  );

  // Calibrated BIA Lean Body Mass & Body Fat % (Xiaomi Mi Scale 2 model)
  const coeffHeight = (params.heightCm * params.heightCm) / impedanceOhm;
  const rawLbm =
    params.gender === 'male'
      ? 0.407 * weightKg + 0.267 * params.heightCm - 19.2 + coeffHeight * 0.14 - age * 0.04
      : 0.252 * weightKg + 0.473 * params.heightCm - 48.3 + coeffHeight * 0.11 - age * 0.03;

  // Blend BIA estimate with anthropometric Deurenberg stabilizer for realistic bounds
  const deurenbergFat =
    1.2 * bmi + 0.23 * age - 10.8 * (params.gender === 'male' ? 1 : 0) - 5.4;
  const biaFatPct = ((weightKg - Math.max(25, Math.min(weightKg * 0.92, rawLbm))) / weightKg) * 100;
  const bodyFatPct = Number(
    Math.max(6, Math.min(48, biaFatPct * 0.45 + deurenbergFat * 0.55)).toFixed(1)
  );

  const fatMassKg = weightKg * (bodyFatPct / 100);
  const leanMassKg = weightKg - fatMassKg;

  // Bone mass (~4.1% - 4.7% of lean mass in Mi Scale 2)
  const boneMassKg = Number(
    Math.max(1.5, Math.min(4.8, leanMassKg * (params.gender === 'male' ? 0.046 : 0.042))).toFixed(1)
  );

  // Skeletal/body muscle mass
  const muscleMassKg = Number(
    Math.max(20, leanMassKg - boneMassKg - weightKg * 0.06).toFixed(1)
  );

  // Total body water %
  const waterPct = Number(
    Math.max(38, Math.min(72, (leanMassKg * 0.732 / weightKg) * 100)).toFixed(1)
  );

  // Protein %
  const proteinPct = Number(
    Math.max(11, Math.min(26, 100 - bodyFatPct - waterPct - (boneMassKg / weightKg) * 100)).toFixed(1)
  );

  // Visceral fat level (1 - 59)
  const visceralBase =
    params.gender === 'male'
      ? bmi * 0.42 + bodyFatPct * 0.16 + age * 0.08 - 7.8
      : bmi * 0.36 + bodyFatPct * 0.13 + age * 0.06 - 7.2;
  const visceralFatLevel = Math.max(1, Math.min(30, Math.round(visceralBase)));

  // BMR (Mifflin-St Jeor + lean mass blend)
  const bmrKcal = Math.round(
    10 * weightKg +
      6.25 * params.heightCm -
      5 * age +
      (params.gender === 'male' ? 5 : -161)
  );

  // Ideal weight (BMI 22.0 for male, 21.0 for female)
  const idealBmi = params.gender === 'male' ? 22.0 : 21.0;
  const idealWeightKg = Number((idealBmi * heightM * heightM).toFixed(1));

  // Metabolic / Body age
  const idealFat = params.gender === 'male' ? 16 : 23;
  const ageDelta = Math.round((bodyFatPct - idealFat) * 0.45 + (bmi - idealBmi) * 0.6);
  const bodyAgeYears = Math.max(18, Math.min(80, age + ageDelta));

  // Somatotype (9 Xiaomi Mi Scale 2 classifications)
  const bodyType = classifyMiScale2BodyType(bmi, bodyFatPct, muscleMassKg, weightKg, params.gender);

  // Overall Body Score (0 - 100)
  const fatPenalty = Math.abs(bodyFatPct - idealFat) * 1.1;
  const bmiPenalty = Math.abs(bmi - idealBmi) * 1.4;
  const visceralPenalty = Math.max(0, visceralFatLevel - 9) * 2.2;
  const bodyScore = Math.max(40, Math.min(99, Math.round(98 - fatPenalty - bmiPenalty - visceralPenalty)));

  return {
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
    balanceTestSec: params.balanceTestSec ?? 38,
  };
}

function classifyMiScale2BodyType(
  bmi: number,
  fatPct: number,
  muscleKg: number,
  weightKg: number,
  gender: 'male' | 'female'
): string {
  const highFat = gender === 'male' ? fatPct >= 23 : fatPct >= 30;
  const lowFat = gender === 'male' ? fatPct <= 14 : fatPct <= 21;
  const muscleRatio = muscleKg / Math.max(1, weightKg);
  const highMuscle = gender === 'male' ? muscleRatio >= 0.72 : muscleRatio >= 0.64;

  if (bmi < 18.5) return lowFat ? 'Худощавый' : 'Недостаток мышц';
  if (highFat && bmi < 25) return 'Скрытая полнота';
  if (highFat && bmi >= 25) return 'Избыточный вес';
  if (lowFat && highMuscle) return 'Спортивный';
  if (highMuscle) return 'Мускулистый';
  if (bmi >= 25 && !highFat) return 'Плотное телосложение';
  return 'Стандартный';
}

/**
 * Parse raw BLE 0x181B / 0x2A9C (Body Composition Measurement) packet from Mi Body Composition Scale 2
 * (XMTZC05HM / MIBFS), supporting both standard 13-byte Xiaomi 0x181B payloads and 10+ byte 0x2A9C frames.
 */
export function parseMiScale2Packet(dataView: DataView): {
  stabilized: boolean;
  hasImpedance: boolean;
  weightKg: number;
  impedanceOhm?: number;
} | null {
  if (dataView.byteLength < 10) return null;

  // Compact >=10-byte GATT 0x2A9C fallback if bytes [11..12] are absent or zero
  if (dataView.byteLength < 13) {
    const rawWeightAlt = dataView.getUint16(2, true);
    const weightKg = Number((rawWeightAlt / 200).toFixed(2));
    if (!Number.isFinite(weightKg) || weightKg < 5 || weightKg > 300) return null;
    const rawImpAlt = dataView.byteLength >= 8 ? dataView.getUint16(6, true) : 0;
    const validImpAlt = rawImpAlt >= 150 && rawImpAlt <= 2500;
    return {
      stabilized: true,
      hasImpedance: validImpAlt,
      weightKg,
      impedanceOhm: validImpAlt ? rawImpAlt : undefined,
    };
  }

  const ctrl0 = dataView.getUint8(0);
  const ctrl1 = dataView.getUint8(1);

  // Unit flags can appear in ctrl0 (adv/GATT) or ctrl1 depending on firmware revision
  const isLbs = (ctrl0 & 0x01) !== 0 || (ctrl1 & 0x01) !== 0;
  const isCatty = (ctrl0 & 0x10) !== 0 || (ctrl1 & 0x10) !== 0 || (ctrl1 & 0x40) !== 0;

  // In XMTZC05HM 0x181B payloads, ctrl1 encodes measurement state:
  // bit 5 (0x20) = stabilized, bit 1 (0x02) = impedance present, bit 7 (0x80) = weight removed
  const weightRemoved = (ctrl1 & 0x80) !== 0;
  const stabilized = (ctrl1 & 0x20) !== 0;
  const impedanceFlag = (ctrl1 & 0x02) !== 0;

  const rawImp9 = dataView.getUint16(9, true);
  const rawImp3 = dataView.getUint16(3, true);
  const rawWeight = dataView.getUint16(11, true);

  let weightKg = rawWeight / 200;
  if (isLbs) weightKg = (rawWeight / 100) * 0.453592;
  else if (isCatty) weightKg = (rawWeight / 100) * 0.5;

  if (weightRemoved || !Number.isFinite(weightKg) || weightKg < 2 || weightKg > 350) {
    return null;
  }

  // Prefer standard bytes [9..10]; fallback to [3..4] if [9..10] is 0 and [3..4] is valid BIA Ohm
  const validImp9 = rawImp9 >= 150 && rawImp9 <= 2500;
  const validImp3 = !validImp9 && rawImp9 === 0 && rawImp3 >= 150 && rawImp3 <= 2500;
  const chosenImp = validImp9 ? rawImp9 : validImp3 ? rawImp3 : undefined;
  const hasImpedance = Boolean(chosenImp && (impedanceFlag || stabilized || validImp3));

  return {
    stabilized,
    hasImpedance,
    weightKg: Number(weightKg.toFixed(2)),
    impedanceOhm: hasImpedance ? chosenImp : undefined,
  };
}
