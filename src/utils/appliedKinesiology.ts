import type {
  KinesiologyDeviationFinding,
  MmtMuscleRecommendation,
  MmtPriority,
  MmtResultStatus,
  MmtSuspectedState,
  PostureAngleMeasurement,
  PostureAssessmentRecord,
  PostureBodyRegion,
  PostureKinesiologyReport,
  PostureTiltDirection,
  PostureViewProjection,
} from '../types';

export const POSTURE_REGION_LABELS: Record<PostureBodyRegion, string> = {
  head: 'Голова и шея',
  shoulders: 'Плечи и лопатки',
  pelvis: 'Таз и поясница',
  legs: 'Ноги, колени и стопы',
  spine: 'Ось позвоночника',
};

export interface ProjectionAnalysisGuide {
  title: string;
  shortLabel: string;
  planeName: string;
  laserFocus: string;
  landmarks: string[];
}

export const PROJECTION_ANALYSIS_GUIDES: Record<PostureViewProjection, ProjectionAnalysisGuide> = {
  front: {
    title: 'Анфас (вид спереди)',
    shortLabel: 'Анфас (спереди)',
    planeName: 'Фронтальная плоскость спереди',
    laserFocus:
      'Отвес по переносице → грудине → пупку → середине между стопами; горизонты L1–L5: уши/глаза, шея, ключицы/акромионы, ПВПО таза, надколенники.',
    landmarks: [
      'Голова и шея: уровень зрачков и мочек ушей, контуры ГКСМ, центр подбородка относительно грудины.',
      'Плечи: акромионы, уровень ключиц и грудино-ключичных суставов (риск укорочения грудных мышц и ГКСМ).',
      'Таз: передне-верхние подвздошные ости (ПВПО), треугольники талии, отклонение пупка и белой линии живота.',
      'Ноги и стопы: высота надколенников, вальгус (X) или варус (O) коленей, пронация/разворот стоп.',
    ],
  },
  back: {
    title: 'Вид сзади (со спины)',
    shortLabel: 'Вид сзади',
    planeName: 'Фронтальная плоскость сзади',
    laserFocus:
      'Отвес по затылочному бугру → остистому отростку C7 → межъягодичной складке → середине между пятками.',
    landmarks: [
      'Голова и шея: затылочные бугры и сосцевидные отростки, наклон и сдвиг шейного отдела (C2–C7).',
      'Плечи и лопатки: высота акромионов, нижние и медиальные углы лопаток (крыловидность — тест передней зубчатой).',
      'Таз: задне-верхние подвздошные ости (ЗВПО), подъягодичные складки, ротация/скручивание КПС и квадратная мышца поясницы.',
      'Ноги и стопы: подколенные складки, отклонение ахилловых сухожилий и завал пяточной кости внутрь/наружу.',
    ],
  },
  side_left: {
    title: 'Профиль слева (сагиттальный анализ)',
    shortLabel: 'Профиль слева',
    planeName: 'Сагиттальная плоскость (левый бок к камере)',
    laserFocus:
      'Идеальный отвес проходит: козелок уха → центр плечевого сустава → большой вертел бедра → чуть кпереди от центра колена и латеральной лодыжки.',
    landmarks: [
      'Голова и шея: выдвижение козелка уха вперёд относительно C7 и отвеса (верхний перекрёстный синдром).',
      'Плечевой пояс и грудной отдел: протракция (заворот) плеча вперёд, глубина грудного кифоза.',
      'Таз и поясница: угол между ПВПО и ЗВПО (передний или задний наклон таза, гиперлордоз/сглаженность).',
      'Колени и опора тела: переразгибание колен (рекурвация) или смещение всей оси корпуса вперёд/назад от лодыжки.',
    ],
  },
  side_right: {
    title: 'Профиль справа (сагиттальный анализ)',
    shortLabel: 'Профиль справа',
    planeName: 'Сагиттальная плоскость (правый бок к камере)',
    laserFocus:
      'Идеальный отвес проходит: козелок уха → центр плечевого сустава → большой вертел бедра → чуть кпереди от центра колена и латеральной лодыжки.',
    landmarks: [
      'Голова и шея: смещение головы вперёд (FHP), перегрузка подзатылочной зоны и разгибателей шеи.',
      'Плечевой пояс и грудной отдел: смещение акромиона вперёд от линии отвеса (укорочение малой грудной мышцы).',
      'Таз и поясница: сагиттальный наклон таза (ПВПО–ЗВПО), баланс сгибателей и разгибателей таза.',
      'Колени и голеностоп: угол коленного сустава и отклонение оси тела вперёд/назад (сравнить с левым профилем на скручивание!).',
    ],
  },
};

export const SEVERITY_META: Record<
  KinesiologyDeviationFinding['severity'],
  { label: string; badgeClass: string }
> = {
  normal: {
    label: 'В пределах нормы',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  },
  mild: {
    label: 'Лёгкое отклонение',
    badgeClass: 'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300',
  },
  moderate: {
    label: 'Умеренный перекос',
    badgeClass: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
  },
  marked: {
    label: 'Выраженное отклонение',
    badgeClass: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300',
  },
};

export const MMT_RESULT_LABELS: Record<MmtResultStatus, string> = {
  untested: 'Не проверено',
  normotonic: 'Нормотония',
  hypotonic: 'Гипотония (слабость)',
  hypertonic: 'Гипертония (укорочение)',
};

export function inferMeasurementRegion(m: PostureAngleMeasurement): PostureBodyRegion {
  if (m.region) return m.region;
  const text = `${m.presetId || ''} ${m.label}`.toLowerCase();
  if (
    text.includes('голов') ||
    text.includes('уш') ||
    text.includes('глаз') ||
    text.includes('шейн') ||
    text.includes('шея') ||
    text.includes('fhp') ||
    text.includes('head') ||
    text.includes('cerv')
  ) {
    return 'head';
  }
  if (
    text.includes('плеч') ||
    text.includes('акромион') ||
    text.includes('лопат') ||
    text.includes('протрак') ||
    text.includes('shoulder') ||
    text.includes('scap')
  ) {
    return 'shoulders';
  }
  if (
    text.includes('таз') ||
    text.includes('гребн') ||
    text.includes('пвпо') ||
    text.includes('звпо') ||
    text.includes('pelv')
  ) {
    return 'pelvis';
  }
  if (
    text.includes('ног') ||
    text.includes('колен') ||
    text.includes('стоп') ||
    text.includes('вальг') ||
    text.includes('варус') ||
    text.includes('пятк') ||
    text.includes('ахилл') ||
    text.includes('бедр') ||
    text.includes('голен') ||
    text.includes('рекурв') ||
    text.includes('leg') ||
    text.includes('knee')
  ) {
    return 'legs';
  }
  return 'spine';
}

function classifySeverity(
  region: PostureBodyRegion,
  m: PostureAngleMeasurement
): KinesiologyDeviationFinding['severity'] {
  const dev = m.deviationDeg ?? m.angleDeg;
  if (m.presetId === 'cervical_fhp') {
    if (dev <= 12) return 'normal';
    if (dev <= 24) return 'mild';
    if (dev <= 36) return 'moderate';
    return 'marked';
  }
  if (m.presetId === 'legs_valgus' || m.presetId === 'knee_angle') {
    if (dev <= 3) return 'normal';
    if (dev <= 7) return 'mild';
    if (dev <= 12) return 'moderate';
    return 'marked';
  }
  if (m.presetId === 'pelvis_sagittal') {
    if (dev >= 4 && dev <= 12) return 'normal';
    if (dev < 4 || dev <= 18) return 'mild';
    if (dev <= 25) return 'moderate';
    return 'marked';
  }
  if (m.presetId === 'shoulder_protraction' || m.presetId === 'body_plumb_sagittal') {
    if (dev < 2.0) return 'normal';
    if (dev < 4.5) return 'mild';
    if (dev < 7.5) return 'moderate';
    return 'marked';
  }
  if (region === 'pelvis' || region === 'head' || region === 'shoulders') {
    if (dev < 1.3) return 'normal';
    if (dev < 2.8) return 'mild';
    if (dev < 5.0) return 'moderate';
    return 'marked';
  }
  if (dev < 1.8) return 'normal';
  if (dev < 4.0) return 'mild';
  if (dev < 7.0) return 'moderate';
  return 'marked';
}

function sideLabelsFromTilt(dir?: PostureTiltDirection): {
  highSide: string;
  lowSide: string;
  hasLateral: boolean;
} {
  if (dir === 'left_higher') {
    return { highSide: 'слева', lowSide: 'справа', hasLateral: true };
  }
  if (dir === 'right_higher') {
    return { highSide: 'справа', lowSide: 'слева', hasLateral: true };
  }
  return { highSide: 'со стороны подъёма', lowSide: 'со стороны опущения', hasLateral: false };
}

interface RawRuleResult {
  fallingRegionHint: string;
  possibleCauses: string[];
  likelyHypotonic: string[];
  likelyHypertonic: string[];
  muscles: Array<Omit<MmtMuscleRecommendation, 'mmtResult'>>;
}

function buildRuleForMeasurement(
  m: PostureAngleMeasurement,
  region: PostureBodyRegion,
  severity: KinesiologyDeviationFinding['severity'],
  projection: PostureViewProjection
): RawRuleResult {
  const dir = m.direction || 'neutral';
  const { highSide, lowSide, hasLateral } = sideLabelsFromTilt(dir);
  const dev = m.deviationDeg ?? m.angleDeg;
  const preset = m.presetId || '';
  const isSideView = projection === 'side_left' || projection === 'side_right';
  const isBackView = projection === 'back';

  // 1. HEAD & NECK
  if (region === 'head') {
    if (preset === 'cervical_fhp' || isSideView) {
      return {
        fallingRegionHint:
          'Профиль: краниоцервикальный «падающий регион» смещён вперёд (паттерн верхнего перекрёстного синдрома по В. Янде)',
        possibleCauses: [
          'Гипотония глубоких сгибателей шеи при перегрузке и укорочении подзатылочных мышц и ГКСМ.',
          'Дисфункция диафрагмальной цепи и краниовертебрального перехода (C0–C1–C2), рефлекторная связь с ВНЧС и прикусом.',
          'Компенсация усиленного грудного кифоза, протракции плеч или переднего наклона таза (смещение центра тяжести вперёд).',
        ],
        likelyHypotonic: [
          'Глубокие сгибатели шеи (Longus colli / Longus capitis)',
          'Нижняя и средняя порции трапециевидной мышцы',
          'Передняя зубчатая мышца',
        ],
        likelyHypertonic: [
          'Подзатылочные мышцы',
          'Грудино-ключично-сосцевидная мышца (ГКСМ)',
          'Малая и большая грудные мышцы',
        ],
        muscles: [
          {
            id: 'mmt-deep-neck-flexors',
            muscleName: 'Глубокие сгибатели шеи (длинные мышцы шеи и головы)',
            side: 'Двусторонне (вентральная стабилизация)',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'head',
            clinicalRationale:
              'Ключевой маркер выдвижения головы вперёд (FHP) и верхнего перекрёстного синдрома в профиль.',
            testProcedure:
              'Лёжа на спине: лёгкий кивок подбородка к груди без подъёма головы; давление на лоб в сторону разгибания.',
          },
          {
            id: 'mmt-scm-bilateral',
            muscleName: 'Грудино-ключично-сосцевидная мышца (ГКСМ)',
            side: 'Справа и слева раздельно',
            suspectedState: 'check_both',
            priority: 'primary',
            region: 'head',
            clinicalRationale:
              'Перегружается при слабости глубоких сгибателей шеи; асимметрия вызывает ротацию и наклон головы.',
            testProcedure:
              'Лёжа на спине: поворот головы в противоположную сторону + сгибание; давление в височную область.',
          },
          {
            id: 'mmt-pec-minor',
            muscleName: 'Малая грудная мышца (Pectoralis minor)',
            side: 'Справа и слева',
            suspectedState: 'hypertonic',
            priority: 'secondary',
            region: 'shoulders',
            clinicalRationale:
              'Протракция плеч вперёд механически усиливает падение головы и шеи вперёд.',
            testProcedure:
              'Лёжа на спине: рука вытянута вперёд под 30° от корпуса; давление на переднюю поверхность плеча к кушетке.',
          },
        ],
      };
    }

    if (preset === 'neck_tilt') {
      return {
        fallingRegionHint:
          severity === 'normal'
            ? 'Шейный отдел позвоночника центрирован относительно линии отвеса'
            : `Шейный регион (${isBackView ? 'вид сзади' : 'анфас'}): боковое отклонение оси шеи (${m.directionLabel || 'асимметрия'})`,
        possibleCauses: [
          'Дисфункция лестничных мышц и латеральных стабилизаторов шеи (C2–C7) с одной стороны.',
          isBackView
            ? 'Односторонний спазм ременной мышцы головы/шеи, верхней трапеции или мышцы, поднимающей лопатку.'
            : 'Односторонняя гипотония/укорочение ГКСМ, передних лестничных мышц или подъязычной мускулатуры.',
          'Вертеброгенная фиксация в шейном переходе (C7–Th1) или компенсация перекоса плечевого пояса.',
        ],
        likelyHypotonic: [
          `Лестничные мышцы и ГКСМ ${highSide}`,
          'Глубокие сгибатели и разгибатели шеи',
        ],
        likelyHypertonic: [
          `Лестничные мышцы и ременная мышца шеи ${lowSide}`,
          `Мышца, поднимающая лопатку ${lowSide}`,
        ],
        muscles: [
          {
            id: 'mmt-scalenes',
            muscleName: 'Лестничные мышцы (Scaleni anterior/medius)',
            side: hasLateral ? `${highSide} (гипотония?) и ${lowSide}` : 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'head',
            clinicalRationale:
              'Главные боковые стабилизаторы шейного столба C2–C7 и 1–2 ребра.',
            testProcedure:
              'Лёжа на спине: латерофлексия 15–20° + лёгкий поворот; сопротивление боковому давлению на висок.',
          },
          {
            id: 'mmt-scm-tilt',
            muscleName: 'Грудино-ключично-сосцевидная мышца (ГКСМ)',
            side: 'Справа и слева',
            suspectedState: 'check_both',
            priority: 'primary',
            region: 'head',
            clinicalRationale:
              'Регулирует поворот и боковой наклон головы/шеи в анфас и со спины.',
            testProcedure:
              'Лёжа на спине: ротация головы в противоположную сторону на 45°, сгибание; мягкое давление на висок.',
          },
          {
            id: 'mmt-neck-extensors',
            muscleName: 'Разгибатели шеи и ременная мышца (Splenius capitis/cervicis)',
            side: 'Справа и слева',
            suspectedState: 'check_both',
            priority: 'secondary',
            region: 'head',
            clinicalRationale:
              'При осмотре со спины асимметрия шейной складки и отклонение остистых отростков связаны с дисбалансом разгибателей.',
            testProcedure:
              'Лёжа на животе или сидя: разгибание и лёгкий поворот шеи; давление на затылочную кость вперёд.',
          },
        ],
      };
    }

    // Lateral head tilt (frontal / back)
    const tiltLow = hasLateral ? lowSide : 'на стороне наклона (низкого уха)';
    const tiltHigh = hasLateral ? highSide : 'на противоположной (высокой) стороне';
    return {
      fallingRegionHint:
        severity === 'normal'
          ? 'Краниоцервикальный регион близок к горизонтали'
          : `Голова наклонена ${tiltLow} (${isBackView ? 'вид сзади' : 'анфас'}); вероятна компенсация таза/плеч или ВНЧС`,
      possibleCauses: [
        `Укорочение и гипертонус ГКСМ, верхней трапеции и лестничных мышц ${tiltLow} (либо слабость антагонистов ${tiltHigh}).`,
        isBackView
          ? 'Односторонний спазм подзатылочных и затылочно-шейных мышц на фоне суставного блока C0–C1–C2.'
          : 'Асимметрия височно-нижнечелюстного сустава (ВНЧС / окклюзия) — в ПК проверяется провокацией сжатия зубов.',
        'Натяжение твёрдой мозговой оболочки (ТМО) или вестибуло-окулярная адаптация линии глаз при перекосе таза.',
      ],
      likelyHypotonic: [
        `Грудино-ключично-сосцевидная мышца (ГКСМ) ${tiltHigh}`,
        `Лестничные мышцы ${tiltHigh}`,
        'Глубокие сгибатели шеи',
      ],
      likelyHypertonic: [
        `Верхняя порция трапециевидной и мышца, поднимающая лопатку ${tiltLow}`,
        `ГКСМ и подзатылочные мышцы ${tiltLow}`,
      ],
      muscles: [
        {
          id: 'mmt-scm-tilt',
          muscleName: 'Грудино-ключично-сосцевидная мышца (ГКСМ)',
          side: hasLateral ? `Приоритет ${highSide} и ${lowSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'primary',
          region: 'head',
          clinicalRationale:
            'Выявляет одностороннюю неврологическую гипотонию при латерофлексии головы.',
          testProcedure:
            'Лёжа на спине: ротация головы в противоположную сторону на 45°, сгибание; мягкое давление на висок.',
        },
        {
          id: 'mmt-scalenes',
          muscleName: 'Лестничные мышцы (Scaleni anterior/medius)',
          side: hasLateral ? `${highSide} (гипотония?) / ${lowSide}` : 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'head',
          clinicalRationale:
            'Боковые стабилизаторы шейного отдела; реагируют на компрессию шейных корешков C3–C6.',
          testProcedure:
            'Лёжа на спине: латерофлексия 15–20° + лёгкий поворот; тестируется сопротивлением боковому давлению на висок.',
        },
        {
          id: 'mmt-upper-trap-head',
          muscleName: 'Верхняя порция трапециевидной мышцы',
          side: hasLateral ? `Укорочение ${lowSide} / проверка ${highSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'shoulders',
          clinicalRationale:
            'Соединяет основание черепа с акромионом и ключицей; участвует в компенсации наклона головы.',
          testProcedure:
            'Сидя: сближение уха и плеча (латерофлексия + подъём плеча); давление на плечо вниз и голову в сторону.',
        },
        {
          id: 'mmt-tmj-provocation',
          muscleName: 'Жевательные / височные мышцы (тест провокации ВНЧС)',
          side: 'Двусторонняя проверка с индикаторной мышцей',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'head',
          clinicalRationale:
            'По методу Л.Ф. Васильевой наклон головы часто поддерживается дисбалансом ВНЧС и стоматогнатической системы.',
          testProcedure:
            'Проверить нормотоничную индикаторную мышцу при лёгком смыкании зубов и при подкладывании валика.',
        },
      ],
    };
  }

  // 2. SHOULDERS & SCAPULAE
  if (region === 'shoulders') {
    if (preset === 'shoulder_protraction' || isSideView) {
      return {
        fallingRegionHint:
          severity === 'normal'
            ? 'Профиль: плечевой сустав согласован с вертикальной осью отвеса'
            : 'Профиль: протракция (заворот) плечевого сустава вперёд и усиление грудного кифоза',
        possibleCauses: [
          'Укорочение малой и большой грудных мышц, подлопаточной мышцы и передней дельты, уводящих плечо вперёд от линии отвеса.',
          'Неврологическая гипотония нижней и средней порций трапециевидной мышцы, ромбовидных мышц и передней зубчатой.',
          'Часть верхнего перекрёстного синдрома по В. Янде; часто сопровождается ограничением разгибания грудного отдела позвоночника.',
        ],
        likelyHypotonic: [
          'Средняя и нижняя порции трапециевидной мышцы',
          'Ромбовидные мышцы',
          'Передняя зубчатая мышца (Serratus anterior)',
        ],
        likelyHypertonic: [
          'Малая грудная мышца (Pectoralis minor)',
          'Большая грудная мышца (ключичная/грудинная порции)',
          'Подлопаточная мышца',
        ],
        muscles: [
          {
            id: 'mmt-lower-trapezius',
            muscleName: 'Нижняя и средняя порции трапециевидной мышцы',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'shoulders',
            clinicalRationale:
              'Удерживают лопатку в нейтральной ретракции; их слабость вызывает сутулость на профильном снимке.',
            testProcedure:
              'Лёжа на животе: рука отведена вверх под ~135° большим пальцем вверх; давление на предплечье к полу.',
          },
          {
            id: 'mmt-pec-minor',
            muscleName: 'Малая грудная мышца (Pectoralis minor)',
            side: 'Справа и слева',
            suspectedState: 'hypertonic',
            priority: 'primary',
            region: 'shoulders',
            clinicalRationale:
              'Прямой антагонист нижней трапеции; тянет клювовидный отросток лопатки вперёд и вниз.',
            testProcedure:
              'Лёжа на спине: плечо поднято от кушетки; оценка упругости при надавливании на передний край плеча назад.',
          },
          {
            id: 'mmt-serratus-anterior',
            muscleName: 'Передняя зубчатая мышца (Serratus anterior)',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'shoulders',
            clinicalRationale:
              'Стабилизирует лопатку к грудной клетке при протракции/разведении плеч.',
            testProcedure:
              'Сидя/лёжа: рука вытянута вперёд на 90°–120°; давление по оси руки к ретракции лопатки.',
          },
          {
            id: 'mmt-rhomboids',
            muscleName: 'Ромбовидные мышцы (Rhomboideus major/minor)',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'secondary',
            region: 'shoulders',
            clinicalRationale:
              'Приводят лопатку к позвоночнику и уравновешивают грудные мышцы.',
            testProcedure:
              'Сидя или лёжа на животе: рука приведена, локоть согнут под 90° и отведён назад; давление на отведение лопатки.',
          },
        ],
      };
    }

    return {
      fallingRegionHint:
        severity === 'normal'
          ? 'Плечевой пояс сбалансирован по горизонту'
          : `${isBackView ? 'Вид сзади' : 'Анфас'}: подъём плеча/лопатки ${highSide} и опущение ${lowSide}`,
      possibleCauses: [
        `Укорочение верхней порции трапециевидной и мышцы, поднимающей лопатку ${highSide}, либо слабость нижней трапеции и передней зубчатой.`,
        isBackView
          ? `Со спины оценивается симметрия углов лопаток: крыловидность или уход лопатки кнаружи сигнализирует о гипотонии передней зубчатой или ромбовидных мышц ${highSide}.`
          : `Спереди оценивается уровень ключиц: низкое плечо (${lowSide}) часто связано с укорочением малой/большой грудной или широчайшей мышцы спины.`,
        'Висцеро-моторные ассоциаты плечевого пояса (по ПК): подлопаточная, дельтовидная, ключичная/грудинная порции большой грудной мышцы.',
        'Компенсаторная дуга от перекоса таза (гомо- или контрлатеральная адаптация грудного отдела).',
      ],
      likelyHypotonic: [
        `Верхняя порция трапециевидной мышцы ${lowSide}`,
        `Нижняя порция трапециевидной и передняя зубчатая мышца ${highSide}`,
        'Ромбовидные мышцы (при отведении лопатки от позвоночника)',
      ],
      likelyHypertonic: [
        `Мышца, поднимающая лопатку и верхняя трапеция ${highSide}`,
        `Малая грудная и широчайшая мышца спины ${lowSide}`,
      ],
      muscles: [
        {
          id: 'mmt-upper-trapezius',
          muscleName: 'Верхняя порция трапециевидной мышцы',
          side: hasLateral ? `${lowSide} (возможная гипотония) и ${highSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'primary',
          region: 'shoulders',
          clinicalRationale:
            'Главный антигравитационный фиксатор уровня плеча в паре с мышцей, поднимающей лопатку.',
          testProcedure:
            'Сидя: плечо поднято к уху, голова наклонена в ту же сторону и слегка повернута в противоположную.',
        },
        {
          id: 'mmt-lower-trapezius',
          muscleName: 'Нижняя порция трапециевидной мышцы',
          side: hasLateral ? `Приоритет ${highSide}` : 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'shoulders',
          clinicalRationale:
            'При её гипотонии верхняя трапеция бесконтрольно тянет плечо вверх.',
          testProcedure:
            'Лёжа на животе: рука отведена вверх под ~135° большим пальцем вверх; давление на предплечье к полу.',
        },
        {
          id: 'mmt-serratus-anterior',
          muscleName: 'Передняя зубчатая мышца (Serratus anterior)',
          side: 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'shoulders',
          clinicalRationale:
            'Обеспечивает прижатие лопатки к грудной клетке; слабость вызывает крыловидную лопатку и перекос плеч.',
          testProcedure:
            'Сидя/лёжа: рука поднята вперёд на 90°–120° с протракцией плеча; давление по оси руки в сторону ретракции лопатки.',
        },
        {
          id: 'mmt-pec-major-clavicular',
          muscleName: 'Большая грудная мышца (ключичная и грудинная порции)',
          side: hasLateral ? `${lowSide} и ${highSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: isBackView ? 'secondary' : 'primary',
          region: 'shoulders',
          clinicalRationale:
            'В анфас перекос ключиц и плеч тесно связан с тонусом большой грудной мышцы и подлопаточной мышцы.',
          testProcedure:
            'Лёжа на спине: рука поднята вертикально на 90° во внутренней ротации; для ключичной порции давление вниз и кнаружи, для грудинной — к противоположному плечу.',
        },
        {
          id: 'mmt-levator-scapulae',
          muscleName: 'Мышца, поднимающая лопатку (Levator scapulae)',
          side: hasLateral ? `${highSide} (перегрузка) и ${lowSide}` : 'Справа и слева',
          suspectedState: 'hypertonic',
          priority: 'secondary',
          region: 'shoulders',
          clinicalRationale:
            'Часто формирует триггерные точки и приподнимает верхний угол лопатки на стороне высокого плеча.',
          testProcedure:
            'Оценка длины и болезненности у верхнемедиального угла лопатки + ММТ ромбовидных мышц.',
        },
        {
          id: 'mmt-latissimus-dorsi',
          muscleName: 'Широчайшая мышца спины (Latissimus dorsi)',
          side: hasLateral ? `Приоритет ${lowSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'shoulders',
          clinicalRationale:
            'Соединяет плечо с тазом через грудопоясничную фасцию; её укорочение опускает плечо и поднимает таз.',
          testProcedure:
            'Стоя/лёжа: прижатая к туловищу разогнутая рука во внутренней ротации; давление на отведение и сгибание плеча.',
        },
      ],
    };
  }

  // 3. PELVIS & LUMBAR
  if (region === 'pelvis') {
    if (preset === 'pelvis_sagittal' || isSideView) {
      const isPosterior = dir === 'backward';
      return {
        fallingRegionHint: isPosterior
          ? 'Профиль: задний наклон таза (сглаживание поясничного лордоза, смещение опоры назад)'
          : 'Профиль: передний наклон таза (паттерн нижнего перекрёстного синдрома по В. Янде)',
        possibleCauses: isPosterior
          ? [
              'Укорочение мышц задней поверхности бедра (хамстрингов) и прямой мышцы живота.',
              'Гипотония подвздошно-поясничной мышцы (Iliopsoas) и поясничных разгибателей позвоночника.',
            ]
          : [
              'Гипотония (торможение) больших ягодичных мышц и мышц передней брюшной стенки.',
              'Рефлекторное укорочение подвздошно-поясничной мышцы, прямой мышцы бедра и разгибателей поясницы.',
              'Перегрузка фасеточных суставов L4–L5–S1 и компрессия поясничного отдела.',
            ],
        likelyHypotonic: isPosterior
          ? ['Подвздошно-поясничная мышца (Iliopsoas)', 'Разгибатели поясницы']
          : ['Большая ягодичная мышца (Gluteus maximus)', 'Прямая и косые мышцы живота'],
        likelyHypertonic: isPosterior
          ? ['Экстензоры бедра (бицепс бедра, полусухожильная)', 'Прямая мышца живота']
          : ['Подвздошно-поясничная мышца', 'Прямая мышца бедра', 'Разгибатели поясницы'],
        muscles: [
          {
            id: 'mmt-gluteus-maximus',
            muscleName: 'Большая ягодичная мышца (Gluteus maximus)',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'pelvis',
            clinicalRationale:
              'Главный разгибатель тазобедренного сустава и стабилизатор таза от переднего наклона.',
            testProcedure:
              'Лёжа на животе: колено согнуто на 90°, бедро приподнято от кушетки; давление на заднюю поверхность бедра вниз.',
          },
          {
            id: 'mmt-iliopsoas-sag',
            muscleName: 'Подвздошно-поясничная мышца (Iliopsoas)',
            side: 'Справа и слева',
            suspectedState: isPosterior ? 'hypotonic' : 'hypertonic',
            priority: 'primary',
            region: 'pelvis',
            clinicalRationale:
              'При переднем наклоне таза часто укорочена (тест Томаса) или вовлечена в скрытую гипотонию с защитным спазмом.',
            testProcedure:
              'Лёжа на спине: нога приподнята на 30°, лёгкая наружная ротация и отведение на 15°; давление вниз.',
          },
          {
            id: 'mmt-rectus-abdominis',
            muscleName: 'Прямая и косые мышцы живота',
            side: 'Симметрично и по диагоналям',
            suspectedState: isPosterior ? 'hypertonic' : 'hypotonic',
            priority: 'primary',
            region: 'pelvis',
            clinicalRationale:
              'Удерживают переднюю полусферу таза вверх; при слабости таз «падает» вперёд.',
            testProcedure:
              'Лёжа на спине с согнутыми коленями: отрыв лопаток от кушетки, давление на грудную клетку назад.',
          },
          {
            id: 'mmt-hamstrings',
            muscleName: 'Мышцы задней поверхности бедра (Хамстринги)',
            side: 'Справа и слева',
            suspectedState: isPosterior ? 'hypertonic' : 'check_both',
            priority: 'secondary',
            region: 'legs',
            clinicalRationale:
              'Компенсируют слабость ягодичных мышц при разгибании бедра или тянут седалищные бугры вниз.',
            testProcedure:
              'Лёжа на животе: голень согнута на 60°–70°; давление на дистальную треть голени в сторону разгибания.',
          },
        ],
      };
    }

    // Frontal/Back pelvic obliquity
    return {
      fallingRegionHint:
        severity === 'normal'
          ? 'Тазовый регион стабилизирован горизонтально'
          : `${isBackView ? 'Вид сзади (ЗВПО)' : 'Анфас (ПВПО)'}: гребень выше ${highSide}, опущен ${lowSide}`,
      possibleCauses: [
        `По Л.Ф. Васильевой: на стороне опущения таза (${lowSide}) наиболее вероятна гипотония средней ягодичной мышцы (феномен Тренделенбурга).`,
        `На стороне поднятого гребня (${highSide}): укорочение квадратной мышцы поясницы (Quadratus lumborum), подвздошно-поясничной или косой мышцы живота.`,
        isBackView
          ? 'По ЗВПО и ягодичным складкам сзади часто выявляется «скрученный таз», блок КПС и асимметрия грушевидной мышцы.'
          : 'По ПВПО спереди и отклонению пупка проверяется асимметрия подвздошно-поясничной мышцы, прямой/косых мышц живота и приводящих бедра.',
        'Функциональное или анатомическое укорочение ноги (восходящее влияние уплощения свода/вальгуса стопы).',
      ],
      likelyHypotonic: [
        `Средняя ягодичная мышца (Gluteus medius) ${lowSide}`,
        `Большая ягодичная мышца ${lowSide}`,
        `Квадратная мышца поясницы (при скрытой слабости) ${lowSide}`,
      ],
      likelyHypertonic: [
        `Квадратная мышца поясницы (Quadratus lumborum) ${highSide}`,
        `Грушевидная и подвздошно-поясничная мышцы ${highSide}`,
        `Приводящие мышцы бедра ${lowSide}`,
      ],
      muscles: [
        {
          id: 'mmt-gluteus-medius',
          muscleName: 'Средняя ягодичная мышца (Gluteus medius)',
          side: hasLateral ? `Приоритет №1 ${lowSide} (и сравнить ${highSide})` : 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'pelvis',
          clinicalRationale:
            'Основной стабилизатор таза во фронтальной плоскости; её гипотония приводит к проседанию таза при опоре.',
          testProcedure:
            'Лёжа на боку или спине: отведение прямой ноги на 25°–30° с нейтральной/лёгкой внутренней ротацией; давление на приведение.',
        },
        {
          id: 'mmt-quadratus-lumborum',
          muscleName: 'Квадратная мышца поясницы (Quadratus lumborum)',
          side: hasLateral ? `${highSide} (гипертонус) и ${lowSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'primary',
          region: 'pelvis',
          clinicalRationale:
            'Непосредственно подтягивает гребень подвздошной кости к нижним рёбрам и провоцирует поясничный сколиоз.',
          testProcedure:
            'Лёжа на спине: корпус слегка наклонён в сторону теста, ноги смещены на 20–30° в ту же сторону; давление в противоположном направлении.',
        },
        {
          id: 'mmt-iliopsoas-front',
          muscleName: 'Подвздошно-поясничная мышца (Iliopsoas)',
          side: 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'primary',
          region: 'pelvis',
          clinicalRationale:
            'Односторонняя дисфункция формирует скрученный таз и ротацию поясничных позвонков L1–L4.',
          testProcedure:
            'Лёжа на спине: сгибание бедра 30°, отведение 15°, наружная ротация; давление вниз и внутрь.',
        },
        {
          id: 'mmt-piriformis',
          muscleName: 'Грушевидная мышца (Piriformis)',
          side: hasLateral ? `${highSide} и ${lowSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'pelvis',
          clinicalRationale:
            'Стабилизатор крестцово-подвздошного сустава (КПС); при скрученном тазе часто находится в защитном спазме или гипотонии.',
          testProcedure:
            'Лёжа на спине с согнутым коленом и тазобедренным суставом на 90° (или сидя): наружная ротация бедра против сопротивления.',
        },
        {
          id: 'mmt-adductors',
          muscleName: 'Приводящие мышцы бедра (Adductors)',
          side: hasLateral ? `${lowSide} и ${highSide}` : 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'legs',
          clinicalRationale:
            'Антагонисты средней ягодичной мышцы; их спазм тянет соответствующую половину таза вниз.',
          testProcedure:
            'Лёжа на спине: прямая нога отведена на 20°; давление в сторону отведения.',
        },
      ],
    };
  }

  // 4. LEGS, KNEES & FEET
  if (region === 'legs') {
    if (preset === 'knee_angle' || isSideView) {
      const isHyperext = m.angleDeg > 181 || dir === 'backward';
      return {
        fallingRegionHint:
          severity === 'normal'
            ? 'Профиль: сагиттальный угол коленного сустава в норме'
            : isHyperext
            ? 'Профиль: переразгибание колена (рекурвация — смещение колена назад от линии отвеса)'
            : 'Профиль: сгибательная установка колена (укорочение хамстрингов или перегрузка икроножной)',
        possibleCauses: [
          'Слабость подколенной мышцы (Popliteus) и икроножной мышцы, допускающая переразгибание колена назад.',
          'Адаптация к переднему смещению центра тяжести тела (или компенсация переднего наклона таза).',
          'Укорочение прямой мышцы бедра или камбаловидной мышцы, меняющее положение голени в голеностопе.',
        ],
        likelyHypotonic: [
          'Подколенная мышца (Popliteus)',
          'Передняя большеберцовая мышца',
        ],
        likelyHypertonic: [
          'Камбаловидная и икроножная мышцы',
          'Прямая мышца бедра / хамстринги',
        ],
        muscles: [
          {
            id: 'mmt-popliteus',
            muscleName: 'Подколенная мышца (Popliteus)',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              '«Замок» колена в профиль: при её гипотонии сустав «проваливается» в рекурвацию назад.',
            testProcedure:
              'Сидя: голень согнута на 90° и ротирована внутрь; фиксация бедра, давление на стопу в сторону наружной ротации голени.',
          },
          {
            id: 'mmt-soleus-gastroc',
            muscleName: 'Икроножная и камбаловидная мышцы',
            side: 'Справа и слева',
            suspectedState: 'check_both',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Управляют положением голени относительно стопы и влияют на удержание вертикального отвеса тела.',
            testProcedure:
              'Лёжа на животе: подошвенное сгибание стопы при прямом колене (икроножная) и согнутом на 90° (камбаловидная).',
          },
          {
            id: 'mmt-hamstrings',
            muscleName: 'Мышцы задней поверхности бедра (Хамстринги)',
            side: 'Справа и слева',
            suspectedState: 'check_both',
            priority: 'secondary',
            region: 'legs',
            clinicalRationale:
              'Определяют баланс сгибания-разгибания коленного сустава и наклон таза.',
            testProcedure:
              'Лёжа на животе: голень согнута на 60°–70°; давление в сторону разгибания.',
          },
        ],
      };
    }

    if (preset === 'legs_valgus' || dir === 'valgus' || dir === 'varus') {
      const isValgus = dir !== 'varus';
      return {
        fallingRegionHint: isValgus
          ? 'Медиальное смещение колена (вальгусная установка / X-ось нижней конечности)'
          : 'Латеральное смещение колена (варусная установка / O-ось нижней конечности)',
        possibleCauses: isValgus
          ? [
              'Гипотония средней и большой ягодичных мышц (потеря контроля наружной ротации бедра).',
              'Гиперпронация стопы на фоне слабости задней большеберцовой мышцы и мышц свода стопы.',
              'Укорочение приводящих мышц бедра, малоберцовых мышц и напрягателя широкой фасции бедра (НШФБ / TFL).',
            ]
          : [
              'Перегрузка и укорочение напрягателя широкой фасции бедра (TFL), грушевидной и бицепса бедра.',
              'Гипотония приводящих мышц бедра, малоберцовых мышц и латеральная нестабильность голеностопа.',
            ],
        likelyHypotonic: isValgus
          ? [
              'Средняя и большая ягодичные мышцы',
              'Медиальная широкая мышца бедра (VMO)',
              'Задняя большеберцовая мышца (Tibialis posterior)',
            ]
          : [
              'Приводящие мышцы бедра (Adductors)',
              'Длинная и короткая малоберцовые мышцы',
            ],
        likelyHypertonic: isValgus
          ? ['Приводящие мышцы бедра', 'Малоберцовые мышцы', 'НШФБ (TFL)']
          : ['Напрягатель широкой фасции бедра (TFL)', 'Грушевидная мышца', 'Двуглавая мышца бедра'],
        muscles: [
          {
            id: 'mmt-tfl',
            muscleName: 'Напрягатель широкой фасции бедра (TFL / НШФБ)',
            side: 'Сторона отклонения колена (справа/слева)',
            suspectedState: 'check_both',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'При слабости средней ягодичной мышцы НШФБ берёт на себя нагрузку и провоцирует перекос колена и таза.',
            testProcedure:
              'Лёжа на спине: нога поднята на 30°, отведена на 30° и максимально повернута внутрь; давление в приведение и разгибание.',
          },
          {
            id: 'mmt-tibialis-posterior',
            muscleName: 'Задняя большеберцовая мышца (Tibialis posterior)',
            side: 'Справа и слева',
            suspectedState: isValgus ? 'hypotonic' : 'check_both',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Главный динамический супинатор свода стопы; её слабость запускает завал стопы внутрь и вальгус колена.',
            testProcedure:
              'Лёжа на спине: подошвенное сгибание + инверсия стопы; давление на внутренний край стопы в эверсию и тыльное сгибание.',
          },
          {
            id: 'mmt-quadriceps-vmo',
            muscleName: 'Четырёхглавая мышца бедра (вкл. VMO)',
            side: 'Справа и слева',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Медиальная головка стабилизирует надколенник и препятствует вальгусному провалу колена.',
            testProcedure:
              'Сидя или лёжа на спине: колено почти разогнуто; давление на голень в сторону сгибания.',
          },
          {
            id: 'mmt-peroneals',
            muscleName: 'Малоберцовые мышцы (Peroneus longus/brevis)',
            side: 'Справа и слева',
            suspectedState: isValgus ? 'hypertonic' : 'hypotonic',
            priority: 'secondary',
            region: 'legs',
            clinicalRationale:
              'Удерживают поперечный свод стопы и латеральную стабильность голеностопного сустава.',
            testProcedure:
              'Лёжа на спине: эверсия и подошвенное сгибание стопы; давление на наружный край стопы в инверсию.',
          },
        ],
      };
    }

    if (preset === 'legs_feet') {
      return {
        fallingRegionHint:
          severity === 'normal'
            ? 'Голеностопный регион и пяточная кость центрированы'
            : 'Дисфункция стопы (нижний «фундамент» постуральной цепи — риск восходящей компенсации таза и шеи)',
        possibleCauses: [
          'Гипотония задней или передней большеберцовой мышцы при гиперпронации/плоскостопии.',
          'Недостаточность малоберцовых мышц при супинации/завале на наружный край стопы.',
          'Блок таранно-пяточного сустава или укорочение ахиллова сухожилия и камбаловидной мышцы.',
        ],
        likelyHypotonic: [
          'Задняя большеберцовая мышца (Tibialis posterior)',
          'Передняя большеберцовая мышца (Tibialis anterior)',
          'Длинная и короткая малоберцовые мышцы',
        ],
        likelyHypertonic: ['Икроножная и камбаловидная мышцы', 'Разгибатели пальцев стопы'],
        muscles: [
          {
            id: 'mmt-tibialis-posterior-foot',
            muscleName: 'Задняя большеберцовая мышца (Tibialis posterior)',
            side: 'Правая и левая стопа',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Поддерживает продольный свод; её выключение вызывает вальгус пятки и внутреннюю ротацию всей ноги.',
            testProcedure:
              'Лёжа на спине: подошвенное сгибание и инверсия стопы; сопротивление в направлении тыльного сгибания и эверсии.',
          },
          {
            id: 'mmt-tibialis-anterior',
            muscleName: 'Передняя большеберцовая мышца (Tibialis anterior)',
            side: 'Правая и левая стопа',
            suspectedState: 'hypotonic',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Обеспечивает тыльное сгибание и подъём внутреннего края стопы в фазе переноса шага.',
            testProcedure:
              'Лёжа на спине: стопа приведена в тыльное сгибание и супинацию; давление на тыл первого плюснефалангового сустава вниз и кнаружи.',
          },
          {
            id: 'mmt-peroneals-foot',
            muscleName: 'Длинная и короткая малоберцовые мышцы',
            side: 'Правая и левая стопа',
            suspectedState: 'check_both',
            priority: 'primary',
            region: 'legs',
            clinicalRationale:
              'Антагонисты задней большеберцовой; дисбаланс смещает пяточную кость вовнутрь или кнаружи.',
            testProcedure:
              'Стопа в эверсии и лёгком подошвенном сгибании; давление по наружному краю стопы внутрь.',
          },
        ],
      };
    }

    // Knees level asymmetry
    return {
      fallingRegionHint:
        severity === 'normal'
          ? 'Уровень коленных суставов симметричен'
          : `Асимметрия в коленном регионе (${hasLateral ? `ниже ${lowSide}` : `${dev.toFixed(1)}°`}) — вероятное восходящее влияние стопы или укорочение конечности`,
      possibleCauses: [
        'Функциональное укорочение одной ноги из-за одностороннего уплощения свода стопы или вальгуса колена.',
        'Дисбаланс четырёхглавой мышцы бедра, хамстрингов и подколенной мышцы (Popliteus — ключевой стабилизатор колена).',
        'Нисходящее влияние ротированного таза на ось бедренной кости.',
      ],
      likelyHypotonic: [
        `Подколенная мышца (Popliteus) ${lowSide}`,
        `Четырёхглавая мышца бедра ${lowSide}`,
        'Задняя большеберцовая мышца (на стороне завала свода)',
      ],
      likelyHypertonic: [
        'Мышцы задней поверхности бедра (хамстринги)',
        'Напрягатель широкой фасции бедра (TFL)',
      ],
      muscles: [
        {
          id: 'mmt-popliteus',
          muscleName: 'Подколенная мышца (Popliteus)',
          side: 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'legs',
          clinicalRationale:
            '«Замок» коленного сустава и регулятор внутренней ротации голени; слабость ведёт к рекурвации и перекосу колена.',
          testProcedure:
            'Сидя: голень согнута на 90° и ротирована внутрь; фиксация бедра, давление на стопу в сторону наружной ротации голени.',
        },
        {
          id: 'mmt-quadriceps',
          muscleName: 'Четырёхглавая мышца бедра (Quadriceps femoris)',
          side: 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'legs',
          clinicalRationale:
            'Разная высота надколенников часто коррелирует с односторонней гипотонией прямой или медиальной головки квадрицепса.',
          testProcedure:
            'Сидя: разгибание голени на 15° от прямого угла (либо полная фиксация); давление на нижнюю треть голени к сгибанию.',
        },
        {
          id: 'mmt-tfl-knee',
          muscleName: 'Напрягатель широкой фасции бедра (TFL) и илиотибиальный тракт',
          side: 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'legs',
          clinicalRationale:
            'Перегрузка наружного стабилизатора колена при слабости ягодичной группы.',
          testProcedure:
            'Лёжа на спине: бедро согнуто на 30°, отведено и ротировано внутрь; давление в приведение.',
        },
      ],
    };
  }

  // 5. SPINE / PLUMB AXIS (Sagittal & Frontal)
  if (preset === 'body_plumb_sagittal' || isSideView) {
    const isForwardFall = dir === 'forward';
    return {
      fallingRegionHint:
        severity === 'normal'
          ? 'Профиль: общая ось тела сбалансирована вдоль вертикали отвеса'
          : isForwardFall
          ? 'Профиль: падение гравитационной оси корпуса ВПЕРЁД (смещение веса на передний отдел стопы)'
          : 'Профиль: отклонение оси корпуса НАЗАД (смещение опоры на пятки, компенсаторное напряжение сгибателей)',
      possibleCauses: [
        isForwardFall
          ? 'Укорочение икроножно-камбаловидного комплекса и сгибателей бедра либо торможение экстензоров спины и ягодиц.'
          : 'Слабость подвздошно-поясничной мышцы, передней большеберцовой мышцы и глубокой вентральной линии (Myers).',
        'Нарушение сагиттальной интеграции между стопами, тазом и краниоцервикальным регионом.',
      ],
      likelyHypotonic: isForwardFall
        ? ['Передняя большеберцовая мышца', 'Большая ягодичная и разгибатели спины']
        : ['Подвздошно-поясничная мышца', 'Прямая и косые мышцы живота'],
      likelyHypertonic: isForwardFall
        ? ['Икроножная и камбаловидная мышцы', 'Подзатылочные и грудные мышцы']
        : ['Хамстринги', 'Поверхностная дорзальная линия'],
      muscles: [
        {
          id: 'mmt-tibialis-anterior',
          muscleName: 'Передняя большеберцовая мышца (Tibialis anterior)',
          side: 'Правая и левая стопа',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'legs',
          clinicalRationale:
            'При падении корпуса вперёд в профиль или завале голени обязательно проверяется на неврологическую гипотонию.',
          testProcedure:
            'Лёжа на спине: стопа приведена в тыльное сгибание и супинацию; давление на тыл 1-го пальца вниз и кнаружи.',
        },
        {
          id: 'mmt-gluteus-maximus',
          muscleName: 'Большая ягодичная мышца (Gluteus maximus)',
          side: 'Справа и слева',
          suspectedState: 'hypotonic',
          priority: 'primary',
          region: 'pelvis',
          clinicalRationale:
            'Главный сагиттальный стабилизатор таза и туловища от падения вперёд.',
          testProcedure:
            'Лёжа на животе: колено согнуто на 90°, бедро приподнято; давление вниз.',
        },
        {
          id: 'mmt-erector-spinae',
          muscleName: 'Мышца, выпрямляющая позвоночник (Erector spinae)',
          side: 'Справа и слева',
          suspectedState: 'check_both',
          priority: 'secondary',
          region: 'spine',
          clinicalRationale:
            'Оценка тонуса вдоль сагиттальных изгибов грудного и поясничного отделов.',
          testProcedure:
            'Лёжа на животе: разгибание корпуса с лёгкой ротацией при фиксации таза.',
        },
      ],
    };
  }

  return {
    fallingRegionHint:
      severity === 'normal'
        ? 'Вертикальная ось позвоночника согласована с отвесом'
        : 'Смещение общей гравитационной оси (компенсаторная сколиотическая дуга или падение корпуса)',
    possibleCauses: [
      'Сдвиг центра масс тела относительно вертикали отвеса из-за первичной дисфункции в тазу, стопах или краниоцервикальной зоне.',
      'Асимметрия тонуса мышц, выпрямляющих позвоночник (Erector spinae), квадратной мышцы поясницы и косых мышц живота.',
    ],
    likelyHypotonic: [
      'Глубокие стабилизаторы позвоночника (многораздельные мышцы)',
      'Косые мышцы живота',
    ],
    likelyHypertonic: [
      'Мышцы, выпрямляющие позвоночник (на выпуклой/перегруженной стороне)',
      'Квадратная мышца поясницы',
    ],
    muscles: [
      {
        id: 'mmt-erector-spinae',
        muscleName: 'Мышца, выпрямляющая позвоночник (Erector spinae)',
        side: 'Справа и слева раздельно',
        suspectedState: 'check_both',
        priority: 'primary',
        region: 'spine',
        clinicalRationale:
          'Оценка сегментарной устойчивости позвоночника вдоль вертикальной оси.',
        testProcedure:
          'Лёжа на животе: разгибание корпуса с лёгкой ротацией в тестируемую сторону при фиксации таза.',
      },
      {
        id: 'mmt-latissimus-spine',
        muscleName: 'Широчайшая мышца спины (Latissimus dorsi)',
        side: 'Справа и слева',
        suspectedState: 'check_both',
        priority: 'secondary',
        region: 'spine',
        clinicalRationale:
          'Передаёт тягу между тазовым и плечевым поясом, формируя S- или C-образный наклон оси.',
        testProcedure:
          'Лёжа/стоя: разогнутая рука прижата к туловищу во внутренней ротации; давление на отведение.',
      },
    ],
  };
}

export function generateKinesiologyReport(
  measurements: PostureAngleMeasurement[] = [],
  projection: PostureViewProjection = 'front',
  existingChecklist?: MmtMuscleRecommendation[]
): PostureKinesiologyReport | undefined {
  if (!measurements || measurements.length === 0) return undefined;

  const guide = PROJECTION_ANALYSIS_GUIDES[projection] || PROJECTION_ANALYSIS_GUIDES.front;
  const existingStatusMap = new Map<string, MmtResultStatus>();
  for (const item of existingChecklist || []) {
    if (item.mmtResult) existingStatusMap.set(item.id, item.mmtResult);
  }

  const findings: KinesiologyDeviationFinding[] = [];
  const mmtMap = new Map<string, MmtMuscleRecommendation>();

  for (const m of measurements) {
    const region = inferMeasurementRegion(m);
    const severity = classifySeverity(region, m);
    const rule = buildRuleForMeasurement(m, region, severity, projection);
    const dev = Number((m.deviationDeg ?? m.angleDeg).toFixed(1));

    findings.push({
      id: `kf-${m.id}`,
      region,
      regionLabel: POSTURE_REGION_LABELS[region],
      measurementLabel: m.label,
      angleDeg: Number(m.angleDeg.toFixed(1)),
      deviationDeg: dev,
      severity,
      directionLabel:
        m.directionLabel ||
        (severity === 'normal' ? 'Без значимой асимметрии' : 'Отклонение от эталонной оси'),
      fallingRegionHint: rule.fallingRegionHint,
      possibleCauses: rule.possibleCauses,
      likelyHypotonic: rule.likelyHypotonic,
      likelyHypertonic: rule.likelyHypertonic,
    });

    for (const muscle of rule.muscles) {
      const existing = mmtMap.get(muscle.id);
      if (!existing) {
        mmtMap.set(muscle.id, {
          ...muscle,
          priority:
            severity === 'marked' || severity === 'moderate' ? 'primary' : muscle.priority,
          mmtResult: existingStatusMap.get(muscle.id) || 'untested',
        });
      } else if (existing.priority === 'secondary' && muscle.priority === 'primary') {
        mmtMap.set(muscle.id, {
          ...existing,
          priority: 'primary',
        });
      }
    }
  }

  const sevWeight = { marked: 4, moderate: 3, mild: 2, normal: 1 };
  const sortedFindings = [...findings].sort(
    (a, b) => sevWeight[b.severity] - sevWeight[a.severity] || b.deviationDeg - a.deviationDeg
  );

  const nonNormal = sortedFindings.filter((f) => f.severity !== 'normal');
  const regionsAffected = new Set(nonNormal.map((f) => f.region));

  let summaryPattern = `${guide.title}: грубых перекосов не выявлено — рекомендовано профилактическое ММТ индикаторных мышц.`;
  if (nonNormal.length > 0) {
    const parts: string[] = [];
    if (projection === 'side_left' || projection === 'side_right') {
      if (regionsAffected.has('head') && regionsAffected.has('shoulders')) {
        parts.push('В профиль выражен Верхний перекрёстный синдром (Янда): голова и плечи смещены вперёд');
      }
      if (regionsAffected.has('pelvis')) {
        parts.push('Сагиттальный дисбаланс таза (риск Нижнего перекрёстного синдрома)');
      }
      if (regionsAffected.has('legs') || regionsAffected.has('spine')) {
        parts.push('Нарушение сагиттальной вертикали «ухо — плечо — бедро — лодыжка»');
      }
    } else {
      if (regionsAffected.has('head') && regionsAffected.has('shoulders')) {
        parts.push('Дисбаланс шейно-плечевого комплекса (риск верхнего перекрёстного синдрома и ВНЧС-зависимости)');
      }
      if (regionsAffected.has('pelvis') && regionsAffected.has('legs')) {
        parts.push(
          'Тазово-нижнеконечностная цепь: выполните провокацию клином под стопу и тест сидя/стоя (по Л.Ф. Васильевой)'
        );
      } else if (regionsAffected.has('pelvis') && regionsAffected.has('shoulders')) {
        parts.push('Межрегиональная компенсация «Таз ↔ Плечи» (сколиотическая дуга / скрученный таз)');
      }
    }
    if (parts.length === 0) {
      parts.push(
        `Преобладает отклонение в регионе «${sortedFindings[0].regionLabel}» — требуется ММТ мышц-ассоциатов и сравнение с ${projection === 'front' ? 'видом сзади и профилем' : projection === 'back' ? 'анфасом и профилем' : 'анфасом'}`
      );
    }
    summaryPattern = `${guide.title}: ${parts.join('. ')}.`;
  }

  const topFinding = sortedFindings[0];
  const primaryFallingRegion =
    topFinding && topFinding.severity !== 'normal'
      ? `${topFinding.regionLabel} (${topFinding.deviationDeg.toFixed(1)}° · ${topFinding.directionLabel})`
      : undefined;

  const mmtChecklist = Array.from(mmtMap.values()).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'primary' ? -1 : 1;
    return a.region.localeCompare(b.region);
  });

  return {
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    projection,
    projectionLabel: guide.title,
    visualLandmarks: guide.landmarks,
    summaryPattern,
    primaryFallingRegion,
    findings,
    mmtChecklist,
  };
}

export interface MultiViewPostureSynthesis {
  coveredViews: PostureViewProjection[];
  missingViews: PostureViewProjection[];
  frontalVsBackNote: string;
  sagittalNote: string;
  topFindingsAcrossViews: Array<{
    projection: PostureViewProjection;
    projectionLabel: string;
    regionLabel: string;
    deviationDeg: number;
    directionLabel: string;
    severity: KinesiologyDeviationFinding['severity'];
  }>;
  priorityMmtMuscles: MmtMuscleRecommendation[];
}

export function buildMultiViewSynthesis(
  assessments: PostureAssessmentRecord[] = []
): MultiViewPostureSynthesis | null {
  if (assessments.length === 0) return null;

  const allViews: PostureViewProjection[] = ['front', 'back', 'side_left', 'side_right'];
  const latestByView = new Map<PostureViewProjection, PostureAssessmentRecord>();

  // Assessments are assumed newest-first or arbitrary; pick newest date per projection
  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));
  for (const rec of sorted) {
    if (!latestByView.has(rec.projection)) {
      latestByView.set(rec.projection, rec);
    }
  }

  const coveredViews = allViews.filter((v) => latestByView.has(v));
  const missingViews = allViews.filter((v) => !latestByView.has(v));

  const topFindingsAcrossViews: MultiViewPostureSynthesis['topFindingsAcrossViews'] = [];
  const mmtAgg = new Map<string, MmtMuscleRecommendation>();

  for (const [proj, rec] of latestByView.entries()) {
    const report =
      rec.kinesiologyReport ||
      generateKinesiologyReport(
        rec.beforeMeasurements.length > 0 ? rec.beforeMeasurements : rec.afterMeasurements,
        proj
      );
    if (!report) continue;

    for (const f of report.findings) {
      if (f.severity !== 'normal') {
        topFindingsAcrossViews.push({
          projection: proj,
          projectionLabel: PROJECTION_ANALYSIS_GUIDES[proj].shortLabel,
          regionLabel: f.regionLabel,
          deviationDeg: f.deviationDeg,
          directionLabel: f.directionLabel,
          severity: f.severity,
        });
      }
    }

    for (const m of report.mmtChecklist) {
      const prev = mmtAgg.get(m.id);
      if (!prev) {
        mmtAgg.set(m.id, m);
      } else if (
        (m.mmtResult && m.mmtResult !== 'untested' && prev.mmtResult === 'untested') ||
        (m.priority === 'primary' && prev.priority !== 'primary')
      ) {
        mmtAgg.set(m.id, {
          ...prev,
          priority: m.priority === 'primary' ? 'primary' : prev.priority,
          mmtResult: m.mmtResult && m.mmtResult !== 'untested' ? m.mmtResult : prev.mmtResult,
        });
      }
    }
  }

  const hasFront = latestByView.has('front');
  const hasBack = latestByView.has('back');
  const hasSide = latestByView.has('side_left') || latestByView.has('side_right');

  const frontalVsBackNote =
    hasFront && hasBack
      ? 'Выполнены оба фронтальных ракурса (Анфас + Вид сзади): сопоставлены передние ориентиры (ключицы, ПВПО, надколенники) и задние (лопатки, ЗВПО, ахиллы).'
      : hasFront
      ? 'Есть съёмка Анфас (спереди). Рекомендуется дополнить Видом сзади для оценки лопаток, ЗВПО и пяточных костей.'
      : hasBack
      ? 'Есть съёмка Вид сзади. Рекомендуется дополнить съёмкой Анфас (спереди) для оценки линии глаз, ключиц и ПВПО.'
      : 'Фронтальные ракурсы (Анфас и Вид сзади) ещё не загружены.';

  const sagittalNote = hasSide
    ? 'Сагиттальная плоскость (Профиль) зафиксирована — учтены выдвижение головы (FHP), протракция плеч, наклон таза и ось колен.'
    : 'Профиль (вид сбоку) ещё не добавлен — добавьте фото в профиль для оценки переднего/заднего смещения головы, грудного кифоза и наклона таза.';

  const sevWeight = { marked: 4, moderate: 3, mild: 2, normal: 1 };
  topFindingsAcrossViews.sort(
    (a, b) => sevWeight[b.severity] - sevWeight[a.severity] || b.deviationDeg - a.deviationDeg
  );

  const priorityMmtMuscles = Array.from(mmtAgg.values())
    .filter((m) => m.priority === 'primary' || (m.mmtResult && m.mmtResult !== 'untested'))
    .slice(0, 8);

  return {
    coveredViews,
    missingViews,
    frontalVsBackNote,
    sagittalNote,
    topFindingsAcrossViews: topFindingsAcrossViews.slice(0, 8),
    priorityMmtMuscles,
  };
}

export function sanitizeKinesiologyReport(raw: unknown): PostureKinesiologyReport | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const validRegions = new Set<PostureBodyRegion>(['head', 'shoulders', 'pelvis', 'legs', 'spine']);
  const validProj = new Set<PostureViewProjection>(['front', 'back', 'side_left', 'side_right']);
  const validSev = new Set<KinesiologyDeviationFinding['severity']>([
    'normal',
    'mild',
    'moderate',
    'marked',
  ]);
  const validMmtState = new Set<MmtSuspectedState>(['hypotonic', 'hypertonic', 'check_both']);
  const validMmtResult = new Set<MmtResultStatus>([
    'untested',
    'normotonic',
    'hypotonic',
    'hypertonic',
  ]);

  const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: KinesiologyDeviationFinding[] = [];
  for (const item of rawFindings.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const region = validRegions.has(f.region as PostureBodyRegion)
      ? (f.region as PostureBodyRegion)
      : 'spine';
    const severity = validSev.has(f.severity as KinesiologyDeviationFinding['severity'])
      ? (f.severity as KinesiologyDeviationFinding['severity'])
      : 'mild';
    findings.push({
      id: typeof f.id === 'string' && f.id.trim() ? f.id.trim().slice(0, 64) : `kf-${findings.length + 1}`,
      region,
      regionLabel:
        typeof f.regionLabel === 'string' && f.regionLabel.trim()
          ? f.regionLabel.trim().slice(0, 80)
          : POSTURE_REGION_LABELS[region],
      measurementLabel:
        typeof f.measurementLabel === 'string'
          ? f.measurementLabel.trim().slice(0, 140)
          : 'Замер',
      angleDeg: Number.isFinite(Number(f.angleDeg)) ? Number(Number(f.angleDeg).toFixed(1)) : 0,
      deviationDeg: Number.isFinite(Number(f.deviationDeg))
        ? Number(Number(f.deviationDeg).toFixed(1))
        : 0,
      severity,
      directionLabel:
        typeof f.directionLabel === 'string' ? f.directionLabel.trim().slice(0, 140) : '',
      fallingRegionHint:
        typeof f.fallingRegionHint === 'string' ? f.fallingRegionHint.trim().slice(0, 240) : undefined,
      possibleCauses: Array.isArray(f.possibleCauses)
        ? f.possibleCauses.filter((x) => typeof x === 'string').slice(0, 6).map((s) => s.trim().slice(0, 320))
        : [],
      likelyHypotonic: Array.isArray(f.likelyHypotonic)
        ? f.likelyHypotonic.filter((x) => typeof x === 'string').slice(0, 6).map((s) => s.trim().slice(0, 160))
        : [],
      likelyHypertonic: Array.isArray(f.likelyHypertonic)
        ? f.likelyHypertonic.filter((x) => typeof x === 'string').slice(0, 6).map((s) => s.trim().slice(0, 160))
        : [],
    });
  }

  const rawChecklist = Array.isArray(obj.mmtChecklist) ? obj.mmtChecklist : [];
  const mmtChecklist: MmtMuscleRecommendation[] = [];
  for (const item of rawChecklist.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const region = validRegions.has(m.region as PostureBodyRegion)
      ? (m.region as PostureBodyRegion)
      : 'spine';
    const suspectedState = validMmtState.has(m.suspectedState as MmtSuspectedState)
      ? (m.suspectedState as MmtSuspectedState)
      : 'check_both';
    const priority: MmtPriority = m.priority === 'primary' ? 'primary' : 'secondary';
    const mmtResult = validMmtResult.has(m.mmtResult as MmtResultStatus)
      ? (m.mmtResult as MmtResultStatus)
      : 'untested';
    mmtChecklist.push({
      id: typeof m.id === 'string' && m.id.trim() ? m.id.trim().slice(0, 64) : `mmt-${mmtChecklist.length + 1}`,
      muscleName:
        typeof m.muscleName === 'string' && m.muscleName.trim()
          ? m.muscleName.trim().slice(0, 160)
          : 'Мышца для ММТ',
      side: typeof m.side === 'string' ? m.side.trim().slice(0, 100) : 'Справа и слева',
      suspectedState,
      priority,
      region,
      clinicalRationale:
        typeof m.clinicalRationale === 'string' ? m.clinicalRationale.trim().slice(0, 320) : '',
      testProcedure:
        typeof m.testProcedure === 'string' ? m.testProcedure.trim().slice(0, 320) : '',
      mmtResult,
    });
  }

  if (findings.length === 0 && mmtChecklist.length === 0) return undefined;

  const projection = validProj.has(obj.projection as PostureViewProjection)
    ? (obj.projection as PostureViewProjection)
    : undefined;

  return {
    generatedAt:
      typeof obj.generatedAt === 'string' && obj.generatedAt.trim()
        ? obj.generatedAt.trim().slice(0, 40)
        : new Date().toISOString().slice(0, 16).replace('T', ' '),
    projection,
    projectionLabel:
      typeof obj.projectionLabel === 'string' ? obj.projectionLabel.trim().slice(0, 120) : undefined,
    visualLandmarks: Array.isArray(obj.visualLandmarks)
      ? obj.visualLandmarks
          .filter((x) => typeof x === 'string')
          .slice(0, 6)
          .map((s) => s.trim().slice(0, 260))
      : undefined,
    summaryPattern:
      typeof obj.summaryPattern === 'string' ? obj.summaryPattern.trim().slice(0, 450) : undefined,
    primaryFallingRegion:
      typeof obj.primaryFallingRegion === 'string'
        ? obj.primaryFallingRegion.trim().slice(0, 200)
        : undefined,
    findings,
    mmtChecklist,
  };
}
