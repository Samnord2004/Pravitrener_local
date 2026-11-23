import type { MiScale2Metrics } from '../types';

export type ScaleZoneTone = 'low' | 'normal' | 'good' | 'elevated' | 'high';

export interface ScaleZone {
  label: string;
  tone: ScaleZoneTone;
  min: number;
  max: number;
}

export interface MiScaleMetricEvaluation {
  key: string;
  title: string;
  valueText: string;
  numericValue: number;
  unit: string;
  statusLabel: string;
  statusTone: ScaleZoneTone;
  zones: ScaleZone[];
  scaleMin: number;
  scaleMax: number;
  markerPct: number;
  normRangeText: string;
  meaning: string;
  advice: string;
}

export interface MiScaleAdditionalInsight {
  key: 'bodyType' | 'impedanceOhm' | 'balanceTestSec';
  title: string;
  valueText: string;
  statusLabel: string;
  statusTone: ScaleZoneTone;
  meaning: string;
  advice: string;
}

const BODY_TYPE_DESCRIPTIONS: Record<string, string> = {
  'Стандартный':
    'Сбалансированное соотношение жировой и мышечной массы при нормальном индексе массы тела.',
  'Спортивный':
    'Низкий процент жира в сочетании с развитой мышечной массой и высокой метаболической активностью.',
  'Мускулистый':
    'Повышенная доля скелетной мускулатуры — даже при высоком ИМТ композиция тела остаётся здоровой.',
  'Плотное телосложение':
    'Повышенная масса тела при достаточном объёме мышц. Рекомендуется мягкий дефицит калорий и регулярная тяга.',
  'Худощавый':
    'Низкий ИМТ и невысокий процент жира. Для укрепления опорно-двигательного аппарата полезен силовой тренинг.',
  'Скрытая полнота':
    'При внешне нормальном весе и ИМТ повышен процент жировой ткани при недостатке мышц («skinny fat»).',
  'Недостаток мышц':
    'Дефицит мышечной массы относительно роста и возраста — приоритет на белковое питание и упражнения с удержанием.',
  'Избыточный вес':
    'Повышенная жировая нагрузка на суставы и позвоночник. Декомпрессия на ПравИло и кардио-нагрузка помогут снизить нагрузку.',
};

function clampPct(v: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.max(2, Math.min(98, ((v - min) / (max - min)) * 100));
}

function resolveZone(value: number, zones: ScaleZone[]): ScaleZone {
  for (const z of zones) {
    if (value >= z.min && value <= z.max) return z;
  }
  return value < zones[0].min ? zones[0] : zones[zones.length - 1];
}

export function evaluateMiScale2Metrics(
  metrics: MiScale2Metrics,
  context: {
    gender: 'male' | 'female';
    ageYears: number;
    heightCm: number;
  }
): {
  items: MiScaleMetricEvaluation[];
  extras: MiScaleAdditionalInsight[];
} {
  const isMale = context.gender === 'male';
  const age = Math.max(14, Math.min(95, context.ageYears || 35));
  const idealW = Math.max(35, metrics.idealWeightKg || (isMale ? 70 : 58));

  // 1. BMI (ИМТ)
  const bmiZones: ScaleZone[] = [
    { label: 'Недостаток', tone: 'low', min: 14, max: 18.49 },
    { label: 'Норма', tone: 'normal', min: 18.5, max: 24.99 },
    { label: 'Избыточный вес', tone: 'elevated', min: 25.0, max: 29.99 },
    { label: 'Ожирение', tone: 'high', min: 30.0, max: 40 },
  ];
  const bmiZone = resolveZone(metrics.bmi, bmiZones);
  const bmiAdvice =
    bmiZone.tone === 'normal'
      ? `Ваш ИМТ (${metrics.bmi}) находится в здоровом диапазоне 18.5–24.9. Вес гармонирует с ростом.`
      : bmiZone.tone === 'low'
      ? `ИМТ (${metrics.bmi}) ниже нормы 18.5. Стоит проверить процент мышц и добавить силовые практики + полноценное питание.`
      : bmiZone.tone === 'elevated'
      ? `ИМТ ${metrics.bmi} выше порога нормы 24.9 (зона «Избыточный вес» 25.0–29.9). Сравните его с процентом жира и мышечной массой: у людей с развитой мускулатурой умеренно повышенный ИМТ может быть связан с мышцами, а не с жиром.`
      : `ИМТ ${metrics.bmi} заметно превышает норму (≥ 30.0). Это создаёт дополнительную компрессионную нагрузку на позвоночник и суставы — важны плавное снижение жира и декомпрессия.`;

  // 2. Weight (Вес) relative to ideal weight
  const wLow = Number((idealW * 0.85).toFixed(1));
  const wNormHigh = Number((idealW * 1.1).toFixed(1));
  const wElevHigh = Number((idealW * 1.25).toFixed(1));
  const wMax = Number(Math.max(wElevHigh + 15, metrics.weightKg + 5).toFixed(1));
  const wMin = Number(Math.min(Math.max(35, wLow - 12), metrics.weightKg - 4).toFixed(1));
  const weightZones: ScaleZone[] = [
    { label: 'Недостаточный', tone: 'low', min: wMin, max: wLow - 0.01 },
    { label: 'Норма', tone: 'normal', min: wLow, max: wNormHigh },
    { label: 'Выше нормы', tone: 'elevated', min: wNormHigh + 0.01, max: wElevHigh },
    { label: 'Высокий', tone: 'high', min: wElevHigh + 0.01, max: wMax },
  ];
  const weightZone = resolveZone(metrics.weightKg, weightZones);
  const wDiff = Number((metrics.weightKg - idealW).toFixed(1));

  // 3. Body Fat % (Процент жира)
  const fatZones: ScaleZone[] = isMale
    ? [
        { label: 'Низкий', tone: 'low', min: 5, max: 10.99 },
        { label: 'Норма', tone: 'normal', min: 11, max: 20.99 },
        { label: 'Повышенный', tone: 'elevated', min: 21, max: 25.99 },
        { label: 'Высокий', tone: 'high', min: 26, max: 45 },
      ]
    : [
        { label: 'Низкий', tone: 'low', min: 10, max: 20.99 },
        { label: 'Норма', tone: 'normal', min: 21, max: 30.99 },
        { label: 'Повышенный', tone: 'elevated', min: 31, max: 35.99 },
        { label: 'Высокий', tone: 'high', min: 36, max: 50 },
      ];
  const fatZone = resolveZone(metrics.bodyFatPct, fatZones);

  // 4. Muscle Mass (Мышечная масса)
  const mNormLow = Number((idealW * (isMale ? 0.7 : 0.6)).toFixed(1));
  const mNormHigh = Number((idealW * (isMale ? 0.88 : 0.76)).toFixed(1));
  const mMin = Number(Math.min(mNormLow - 10, metrics.muscleMassKg - 3).toFixed(1));
  const mMax = Number(Math.max(mNormHigh + 12, metrics.muscleMassKg + 4).toFixed(1));
  const muscleZones: ScaleZone[] = [
    { label: 'Недостаток', tone: 'low', min: mMin, max: mNormLow - 0.01 },
    { label: 'Норма', tone: 'normal', min: mNormLow, max: mNormHigh },
    { label: 'Отлично', tone: 'good', min: mNormHigh + 0.01, max: mMax },
  ];
  const muscleZone = resolveZone(metrics.muscleMassKg, muscleZones);

  // 5. Water % (Вода в организме)
  const waterZones: ScaleZone[] = isMale
    ? [
        { label: 'Недостаток', tone: 'low', min: 38, max: 54.99 },
        { label: 'Норма', tone: 'normal', min: 55, max: 65.0 },
        { label: 'Высокий', tone: 'good', min: 65.01, max: 75 },
      ]
    : [
        { label: 'Недостаток', tone: 'low', min: 35, max: 44.99 },
        { label: 'Норма', tone: 'normal', min: 45, max: 60.0 },
        { label: 'Высокий', tone: 'good', min: 60.01, max: 72 },
      ];
  const waterZone = resolveZone(metrics.waterPct, waterZones);

  // 6. Protein % (Белок)
  const proteinZones: ScaleZone[] = [
    { label: 'Недостаток', tone: 'low', min: 10, max: 15.99 },
    { label: 'Норма', tone: 'normal', min: 16, max: 20.0 },
    { label: 'Отлично', tone: 'good', min: 20.01, max: 28 },
  ];
  const proteinZone = resolveZone(metrics.proteinPct, proteinZones);

  // 7. Visceral Fat (Висцеральный жир)
  const viscZones: ScaleZone[] = [
    { label: 'Норма', tone: 'normal', min: 1, max: 9.4 },
    { label: 'Повышенный', tone: 'elevated', min: 9.5, max: 14.4 },
    { label: 'Высокий', tone: 'high', min: 14.5, max: 25 },
  ];
  const viscZone = resolveZone(metrics.visceralFatLevel, viscZones);

  // 8. Bone Mass (Костная масса)
  const [boneLow, boneHigh] = isMale
    ? metrics.weightKg < 60
      ? [2.2, 2.8]
      : metrics.weightKg <= 75
      ? [2.5, 3.3]
      : [2.8, 3.8]
    : metrics.weightKg < 45
    ? [1.5, 2.0]
    : metrics.weightKg <= 60
    ? [1.9, 2.5]
    : [2.2, 2.9];
  const boneZones: ScaleZone[] = [
    { label: 'Недостаток', tone: 'low', min: 1.2, max: boneLow - 0.01 },
    { label: 'Норма', tone: 'normal', min: boneLow, max: boneHigh },
    { label: 'Выше нормы', tone: 'good', min: boneHigh + 0.01, max: 4.8 },
  ];
  const boneZone = resolveZone(metrics.boneMassKg, boneZones);

  // 9. BMR (Базальный метаболизм)
  const expectedBmr = Math.round(
    10 * idealW + 6.25 * context.heightCm - 5 * age + (isMale ? 5 : -161)
  );
  const bmrLow = Math.round(expectedBmr * 0.9);
  const bmrHigh = Math.round(expectedBmr * 1.12);
  const bmrMin = Math.min(bmrLow - 250, metrics.bmrKcal - 80);
  const bmrMax = Math.max(bmrHigh + 300, metrics.bmrKcal + 80);
  const bmrZones: ScaleZone[] = [
    { label: 'Замедленный', tone: 'low', min: bmrMin, max: bmrLow - 1 },
    { label: 'Норма', tone: 'normal', min: bmrLow, max: bmrHigh },
    { label: 'Активный', tone: 'good', min: bmrHigh + 1, max: bmrMax },
  ];
  const bmrZone = resolveZone(metrics.bmrKcal, bmrZones);

  // 10. Ideal Weight (Идеальный вес)
  const idealDeltaPct = Math.abs((metrics.weightKg - idealW) / idealW) * 100;
  const idealZones: ScaleZone[] = [
    { label: 'В идеале', tone: 'good', min: 0, max: 5.0 },
    { label: 'Близко к норме', tone: 'normal', min: 5.01, max: 12.0 },
    { label: 'Отклонение', tone: 'elevated', min: 12.01, max: 35.0 },
  ];
  const idealZone = resolveZone(idealDeltaPct, idealZones);

  // 11. Body Age (Метаболический возраст)
  const bodyAgeMin = Math.max(18, age - 12);
  const bodyAgeMax = Math.min(80, age + 15);
  const bodyAgeZones: ScaleZone[] = [
    { label: 'Моложе возраста', tone: 'good', min: bodyAgeMin, max: Math.max(bodyAgeMin, age - 2) },
    {
      label: 'Норма',
      tone: 'normal',
      min: Math.max(bodyAgeMin, age - 1),
      max: age + 2,
    },
    { label: 'Старше возраста', tone: 'elevated', min: age + 3, max: bodyAgeMax },
  ];
  const bodyAgeZone = resolveZone(metrics.bodyAgeYears, bodyAgeZones);

  // 12. Body Score (Общая оценка тела)
  const scoreZones: ScaleZone[] = [
    { label: 'Требует внимания', tone: 'high', min: 30, max: 59 },
    { label: 'Удовлетворительно', tone: 'elevated', min: 60, max: 79 },
    { label: 'Хорошо', tone: 'normal', min: 80, max: 89 },
    { label: 'Отлично', tone: 'good', min: 90, max: 100 },
  ];
  const scoreZone = resolveZone(metrics.bodyScore, scoreZones);

  const items: MiScaleMetricEvaluation[] = [
    {
      key: 'bmi',
      title: 'ИМТ (Индекс массы тела)',
      valueText: `${metrics.bmi}`,
      numericValue: metrics.bmi,
      unit: '',
      statusLabel: bmiZone.label,
      statusTone: bmiZone.tone,
      zones: bmiZones,
      scaleMin: 14,
      scaleMax: 40,
      markerPct: clampPct(metrics.bmi, 14, 40),
      normRangeText: 'Норма: 18.5 – 24.9',
      meaning:
        'Соотношение массы тела к квадрату роста (кг/м²). Базовый индикатор весового баланса, не различающий жир и мышцы.',
      advice: bmiAdvice,
    },
    {
      key: 'weightKg',
      title: 'Вес тела',
      valueText: `${metrics.weightKg} кг`,
      numericValue: metrics.weightKg,
      unit: 'кг',
      statusLabel: weightZone.label,
      statusTone: weightZone.tone,
      zones: weightZones,
      scaleMin: wMin,
      scaleMax: wMax,
      markerPct: clampPct(metrics.weightKg, wMin, wMax),
      normRangeText: `Норма: ${wLow} – ${wNormHigh} кг`,
      meaning:
        'Общая масса тела, фиксируемая тензодатчиками Mi Scale 2. Оценивается в связке с идеальным весом под ваш рост.',
      advice:
        wDiff === 0
          ? `Вес точно соответствует расчётному идеалу (${idealW} кг).`
          : `Отклонение от расчётного идеального веса (${idealW} кг): ${wDiff > 0 ? '+' : ''}${wDiff} кг. Важно ориентироваться не только на килограммы, но и на долю мышц.`,
    },
    {
      key: 'bodyFatPct',
      title: 'Процент жира тела',
      valueText: `${metrics.bodyFatPct}%`,
      numericValue: metrics.bodyFatPct,
      unit: '%',
      statusLabel: fatZone.label,
      statusTone: fatZone.tone,
      zones: fatZones,
      scaleMin: fatZones[0].min,
      scaleMax: fatZones[fatZones.length - 1].max,
      markerPct: clampPct(
        metrics.bodyFatPct,
        fatZones[0].min,
        fatZones[fatZones.length - 1].max
      ),
      normRangeText: isMale ? 'Норма (муж): 11 – 21%' : 'Норма (жен): 21 – 31%',
      meaning:
        'Доля подкожного и внутреннего жира от общей массы тела, определяемая методом биоимпедансного анализа (BIA).',
      advice:
        fatZone.tone === 'normal'
          ? `Процент жира (${metrics.bodyFatPct}%) в здоровом диапазоне — поддерживает гормональный фон и защиту органов.`
          : fatZone.tone === 'low'
          ? `Процент жира (${metrics.bodyFatPct}%) ниже среднего. Следите за уровнем энергии и восстановлением.`
          : `Процент жира (${metrics.bodyFatPct}%) выше нормы. Сочетание тренировок ПравИло, умеренного кардио и профицита белка плавно снизит жировую долю.`,
    },
    {
      key: 'muscleMassKg',
      title: 'Мышечная масса',
      valueText: `${metrics.muscleMassKg} кг`,
      numericValue: metrics.muscleMassKg,
      unit: 'кг',
      statusLabel: muscleZone.label,
      statusTone: muscleZone.tone,
      zones: muscleZones,
      scaleMin: mMin,
      scaleMax: mMax,
      markerPct: clampPct(metrics.muscleMassKg, mMin, mMax),
      normRangeText: `Норма: ${mNormLow} – ${mNormHigh} кг`,
      meaning:
        'Масса скелетных и гладких мышц организма. Чем выше мышечный каркас, тем быстрее базовый обмен веществ и устойчивее позвоночник.',
      advice:
        muscleZone.tone === 'low'
          ? `Мышечная масса (${metrics.muscleMassKg} кг) ниже целевого ориентира ${mNormLow} кг. Регулярные силовые удержания на ПравИло и белок помогут укрепить корсет.`
          : muscleZone.tone === 'good'
          ? `Отличный мышечный каркас (${metrics.muscleMassKg} кг, выше ${mNormHigh} кг)! Отличная поддержка суставов и высокий метаболизм.`
          : `Мышечная масса (${metrics.muscleMassKg} кг) в уверенной норме для вашего роста (${context.heightCm} см).`,
    },
    {
      key: 'waterPct',
      title: 'Вода в организме',
      valueText: `${metrics.waterPct}%`,
      numericValue: metrics.waterPct,
      unit: '%',
      statusLabel: waterZone.label,
      statusTone: waterZone.tone,
      zones: waterZones,
      scaleMin: waterZones[0].min,
      scaleMax: waterZones[waterZones.length - 1].max,
      markerPct: clampPct(
        metrics.waterPct,
        waterZones[0].min,
        waterZones[waterZones.length - 1].max
      ),
      normRangeText: isMale ? 'Норма (муж): 55 – 65%' : 'Норма (жен): 45 – 60%',
      meaning:
        'Общее содержание внутриклеточной и внеклеточной жидкости. Напрямую влияет на эластичность фасций, межпозвоночных дисков и восстановление.',
      advice:
        waterZone.tone === 'low'
          ? `Водный баланс (${metrics.waterPct}%) снижен. До и после декомпрессии на ПравИло важно пить чистую воду для питания хрящевой ткани.`
          : `Уровень гидратации (${metrics.waterPct}%) в норме — оптимальные условия для метаболизма и эластичности мышц.`,
    },
    {
      key: 'proteinPct',
      title: 'Белок',
      valueText: `${metrics.proteinPct}%`,
      numericValue: metrics.proteinPct,
      unit: '%',
      statusLabel: proteinZone.label,
      statusTone: proteinZone.tone,
      zones: proteinZones,
      scaleMin: 10,
      scaleMax: 28,
      markerPct: clampPct(metrics.proteinPct, 10, 28),
      normRangeText: 'Норма: 16 – 20%',
      meaning:
        'Доля белковых структур в теле — главный строительный материал для мышц, связок, коллагена и иммунных клеток.',
      advice:
        proteinZone.tone === 'low'
          ? `Показатель белка (${metrics.proteinPct}%) ниже 16%. Добавьте в рацион качественный белок (1.4–1.8 г/кг веса) для восстановления после тренировок.`
          : `Содержание белка (${metrics.proteinPct}%) достаточное для активной регенерации тканей и роста силовых показателей.`,
    },
    {
      key: 'visceralFatLevel',
      title: 'Висцеральный жир',
      valueText: `Ур. ${metrics.visceralFatLevel}`,
      numericValue: metrics.visceralFatLevel,
      unit: 'ур.',
      statusLabel: viscZone.label,
      statusTone: viscZone.tone,
      zones: viscZones,
      scaleMin: 1,
      scaleMax: 25,
      markerPct: clampPct(metrics.visceralFatLevel, 1, 25),
      normRangeText: 'Норма: 1 – 9',
      meaning:
        'Индекс внутреннего жира, окружающего органы брюшной полости. В отличие от подкожного жира, избыток висцерального повышает метаболические риски.',
      advice:
        viscZone.tone === 'normal'
          ? `Уровень ${metrics.visceralFatLevel} в безопасной норме (1–9). Внутренние органы не перегружены жировой прослойкой.`
          : viscZone.tone === 'elevated'
          ? `Уровень ${metrics.visceralFatLevel} повышен (10–14). Уделите внимание регулярному сну, контролю сахара в рационе и аэробной активности.`
          : `Высокий уровень (${metrics.visceralFatLevel} ≥ 15). Рекомендуется коррекция питания и постепенное увеличение повседневной активности.`,
    },
    {
      key: 'boneMassKg',
      title: 'Костная масса',
      valueText: `${metrics.boneMassKg} кг`,
      numericValue: metrics.boneMassKg,
      unit: 'кг',
      statusLabel: boneZone.label,
      statusTone: boneZone.tone,
      zones: boneZones,
      scaleMin: 1.2,
      scaleMax: 4.8,
      markerPct: clampPct(metrics.boneMassKg, 1.2, 4.8),
      normRangeText: `Норма: ${boneLow} – ${boneHigh} кг`,
      meaning:
        'Оценочная масса минеральной составляющей костной ткани (кальций, фосфор), определяющая прочность скелета.',
      advice:
        boneZone.tone === 'low'
          ? `Костная масса (${metrics.boneMassKg} кг) ниже ориентира ${boneLow} кг. Полезна осевая и тяговая тренировка + контроль витамина D и кальция.`
          : `Костная ткань (${metrics.boneMassKg} кг) соответствует возрастной и весовой норме.`,
    },
    {
      key: 'bmrKcal',
      title: 'Базальный метаболизм (BMR)',
      valueText: `${metrics.bmrKcal} ккал`,
      numericValue: metrics.bmrKcal,
      unit: 'ккал',
      statusLabel: bmrZone.label,
      statusTone: bmrZone.tone,
      zones: bmrZones,
      scaleMin: bmrMin,
      scaleMax: bmrMax,
      markerPct: clampPct(metrics.bmrKcal, bmrMin, bmrMax),
      normRangeText: `Ориентир: ${bmrLow} – ${bmrHigh} ккал/сут`,
      meaning:
        'Количество калорий, которое организм тратит в полном покое за сутки на дыхание, кровообращение и работу органов.',
      advice:
        bmrZone.tone === 'low'
          ? `Базовый расход (${metrics.bmrKcal} ккал) ниже среднего для вашего роста (${bmrLow}+ ккал). Рост мышечной массы ускорит обмен веществ.`
          : `Ваш базовый обмен ${metrics.bmrKcal} ккал/сут — хороший фундамент. Не опускайте калорийность рациона ниже этого порога.`,
    },
    {
      key: 'idealWeightKg',
      title: 'Идеальный вес',
      valueText: `${metrics.idealWeightKg} кг`,
      numericValue: idealDeltaPct,
      unit: 'кг',
      statusLabel: idealZone.label,
      statusTone: idealZone.tone,
      zones: idealZones,
      scaleMin: 0,
      scaleMax: 35,
      markerPct: clampPct(idealDeltaPct, 0, 35),
      normRangeText: `Целевой вес: ${idealW} кг (±5%)`,
      meaning:
        'Расчётный оптимальный вес для вашего роста и пола (на базе ИМТ 22.0 для мужчин и 21.0 для женщин).',
      advice:
        idealDeltaPct <= 5
          ? `Текущий вес (${metrics.weightKg} кг) практически совпадает с идеальным (${idealW} кг, отклонение ${idealDeltaPct.toFixed(1)}%).`
          : `Отклонение текущего веса (${metrics.weightKg} кг) от идеального (${idealW} кг) составляет ${wDiff > 0 ? '+' : ''}${wDiff} кг (${idealDeltaPct.toFixed(1)}%).`,
    },
    {
      key: 'bodyAgeYears',
      title: 'Метаболический возраст',
      valueText: `${metrics.bodyAgeYears} лет`,
      numericValue: metrics.bodyAgeYears,
      unit: 'лет',
      statusLabel: bodyAgeZone.label,
      statusTone: bodyAgeZone.tone,
      zones: bodyAgeZones,
      scaleMin: bodyAgeMin,
      scaleMax: bodyAgeMax,
      markerPct: clampPct(metrics.bodyAgeYears, bodyAgeMin, bodyAgeMax),
      normRangeText: `Паспортный возраст: ${age} лет`,
      meaning:
        'Условный возраст обмена веществ по сравнению со средними показателями BMR, процента жира и мышечной массы.',
      advice:
        metrics.bodyAgeYears <= age - 2
          ? `Отлично! Биологический возраст тела (${metrics.bodyAgeYears} лет) моложе вашего паспортного (${age} лет) на ${age - metrics.bodyAgeYears} г.`
          : metrics.bodyAgeYears <= age + 2
          ? `Метаболический возраст (${metrics.bodyAgeYears} лет) соответствует вашему паспортному возрасту (${age} лет).`
          : `Метаболический возраст (${metrics.bodyAgeYears} лет) выше паспортного (${age} лет). Снижение жира и рост мышц омолодят показатель.`,
    },
    {
      key: 'bodyScore',
      title: 'Общая оценка тела',
      valueText: `${metrics.bodyScore}/100`,
      numericValue: metrics.bodyScore,
      unit: '/100',
      statusLabel: scoreZone.label,
      statusTone: scoreZone.tone,
      zones: scoreZones,
      scaleMin: 30,
      scaleMax: 100,
      markerPct: clampPct(metrics.bodyScore, 30, 100),
      normRangeText: 'Отлично: 80 – 100 баллов',
      meaning:
        'Комплексный индекс Zepp Life / Mi Fit, объединяющий вес, ИМТ, процент жира, мышцы, воду, висцеральный жир и костную массу.',
      advice:
        metrics.bodyScore >= 85
          ? `Высокий общий балл (${metrics.bodyScore}/100)! Тело сбалансировано, продолжайте поддерживающие практики.`
          : metrics.bodyScore >= 70
          ? `Хорошая база (${metrics.bodyScore}/100). Подтяните параметры с отметкой «Повышенный» или «Недостаток» для выхода на 85+.`
          : `Индекс ${metrics.bodyScore}/100 указывает на зоны для улучшения (жировой баланс и мышцы). Регулярные тренировки дадут быстрый рост балла.`,
    },
  ];

  const balSec = metrics.balanceTestSec ?? 38;
  const imp = metrics.impedanceOhm || 480;

  const extras: MiScaleAdditionalInsight[] = [
    {
      key: 'bodyType',
      title: 'Тип телосложения',
      valueText: metrics.bodyType || 'Стандартный',
      statusLabel:
        metrics.bodyType === 'Спортивный' || metrics.bodyType === 'Мускулистый'
          ? 'Атлетичный'
          : metrics.bodyType === 'Стандартный'
          ? 'Баланс'
          : 'Профиль',
      statusTone:
        metrics.bodyType === 'Спортивный' || metrics.bodyType === 'Мускулистый'
          ? 'good'
          : metrics.bodyType === 'Стандартный'
          ? 'normal'
          : 'elevated',
      meaning: 'Классификация соматотипа Mi Scale 2 по матрице «Жир × Мышцы».',
      advice:
        BODY_TYPE_DESCRIPTIONS[metrics.bodyType] ||
        'Определяется по соотношению доли жировой и мышечной массы относительно роста.',
    },
    {
      key: 'impedanceOhm',
      title: 'Биоимпеданс (BIA)',
      valueText: `${imp} Ω`,
      statusLabel: imp >= 320 && imp <= 680 ? 'Валидный' : 'Отклонение',
      statusTone: imp >= 320 && imp <= 680 ? 'normal' : 'elevated',
      meaning:
        'Электрическое сопротивление тканей слабому безопасному току (50 кГц). Мышцы и вода проводят ток хорошо, жир — хуже.',
      advice:
        'Для стабильной динамики взвешивайтесь в одно и то же время суток босиком на сухих электродах весов.',
    },
    {
      key: 'balanceTestSec',
      title: 'Тест баланса',
      valueText: `${balSec} сек`,
      statusLabel: balSec >= 40 ? 'Отлично' : balSec >= 20 ? 'Норма' : 'Тренировать',
      statusTone: balSec >= 40 ? 'good' : balSec >= 20 ? 'normal' : 'low',
      meaning:
        'Время устойчивого равновесия на одной ноге с закрытыми глазами — маркер проприоцепции и нейромышечного контроля.',
      advice:
        balSec >= 40
          ? 'Отличная вестибулярная устойчивость и глубокая стабилизация.'
          : 'Занятия на тренажёре ПравИло и «Баланс бревно» быстро укрепляют нейромышечный контроль и стабилизаторы.',
    },
  ];

  return { items, extras };
}
