import type {
  BrandAboutInfo,
  BrandApproachCard,
  MethodologyProgramBlock,
  MethodologySlideCard,
  ServiceCategory,
  StudioSocialLinks,
} from '../types';

export const STUDIO_SOCIAL_LABELS: Record<keyof StudioSocialLinks, string> = {
  website: 'Официальный сайт',
  telegram: 'Telegram',
  vk: 'ВКонтакте',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

export const DEFAULT_METHODOLOGY_BLOCKS: MethodologyProgramBlock[] = [
  {
    id: 'mb-sport',
    slug: 'sport',
    badge: 'Спорт',
    title: 'Спорт ZA ПравИло',
    subtitle: 'Тренажёр ПравИло в спорте — выведи показатели и восстановление на новый уровень',
    quoteOrMotto: 'Возьми за правило заниматься на ПравИло!',
    promoBadge: 'Запись на первое занятие со скидкой 50%',
    heroImageUrl: '/src/assets/images/exercise_twist_hang_1795103073130.jpg',
    accentTone: 'cyan',
    recommendedServiceCategory: 'sport',
    recommendedServiceHint: 'Глубокая декомпрессия / Силовое удержание',
    summary:
      'Осевое вытяжение и изометрическое напряжение глубоких мышц снимают спортивные перегрузки, восстанавливают симметрию тяги и позволяют преодолеть тренировочное плато без ударной нагрузки на суставы.',
    reasonsTitle: '10 причин для занятий на тренажёре ПравИло',
    reasons: [
      'Устранение функциональных блоков, снятие зажимов и спазмов в мышцах.',
      'Активное жиросжигание, ускорение лимфотока и метаболизма.',
      'Мягкое тракционное вытяжение с вовлечением глубоких мышц-стабилизаторов.',
      'Проработка спортивных травм и ускоренная реабилитация после нагрузок.',
      'Улучшение состояния нервной, эндокринной, сердечно-сосудистой, дыхательной и пищеварительной систем.',
      'Рост силовой и общей выносливости.',
      'Повышение координации и баланса левой/правой сторон по датчикам тяги.',
      'Вывод спортивных показателей на кардинально новый уровень, подготовка к соревнованиям.',
      'Мужские, женские и специализированные спортивные программы с подбором углов 0–6.',
      'Быстрое достижение измеримых результатов с телеметрическим контролем.',
    ],
    featureCards: [
      {
        id: 'sp-pain',
        heading: 'Жизнь без боли',
        text: 'Тренажёр помогает быстро избавиться от боли в спине, шее, плечах, конечностях и тазовой области.',
      },
      {
        id: 'sp-cal',
        heading: 'Калории за борт',
        text: 'Тренировки запускают активное жиросжигание, ускоряют лимфоток и обмен веществ в организме.',
      },
      {
        id: 'sp-limit',
        heading: 'Выйди за грань',
        text: 'Снятие патологического напряжения мышц и высвобождение нервных окончаний стабилизируют нервную систему, снижают тревожность и возвращают бодрость.',
      },
      {
        id: 'sp-ctrl',
        heading: 'Полный контроль',
        text: 'Регулярные тренировки помогают выстроить здоровый режим, спокойствие и устойчивость к стрессу без вредных привычек.',
      },
      {
        id: 'sp-self',
        heading: 'Загляни в себя',
        text: 'Преодоление сложных позиций даёт чувство удовлетворения, эмоциональный подъём и расширяет горизонт физических возможностей.',
      },
      {
        id: 'sp-top',
        heading: 'Запредельные возможности',
        text: 'Помогает преодолеть силовой барьер, повысить качество тренировочного процесса и симметрию тела.',
      },
    ],
    contraindicationsNote:
      'Перед стартом тренер проводит замер давления, пульса и подбирает стойки (1–7) и углы (0–6) под ваш вид спорта.',
    active: true,
  },
  {
    id: 'mb-office',
    slug: 'office',
    badge: 'Офис и Антистресс',
    title: 'Офис выбирает ПравИло',
    subtitle: 'Пять причин расслабиться, снять офисные зажимы и восстановить спину после рабочего дня',
    quoteOrMotto: 'Твой выбор — здоровье и ясная голова после работы за компьютером!',
    promoBadge: 'Запись на первое занятие',
    heroImageUrl: '/src/assets/images/exercise_shoulder_open_1795103072729.jpg',
    accentTone: 'violet',
    recommendedServiceCategory: 'relax',
    recommendedServiceHint: 'Релакс-вытяжение и дыхание / Снятие зажимов шеи и спины',
    summary:
      'Ступенчатое изотоническое растяжение на тренажёре ПравИло совместно с массажем, ЛФК и йогой благотворно воздействует на суставы и мышцы, возвращает гибкость позвоночника и применяется для мягкой механотерапии и кинезиотерапии.',
    reasonsTitle: 'Подготовь себя к работе: 6 эффектов для офисных сотрудников',
    reasons: [
      'Укрепление мышечного корсета, поддерживающего позвоночник, и коррекция сутулости от сидячей работы.',
      'Нормализация количества внутрисуставной синовиальной жидкости.',
      'Улучшение питания хрящевой ткани и повышение эластичности межпозвоночных дисков.',
      'Стимуляция собственных защитных сил организма и внутренних резервов.',
      'Активация и балансировка работы нервной системы.',
      'Нормализация психоэмоционального фона, борьба с бессонницей и полное расслабление.',
    ],
    featureCards: [
      {
        id: 'of-stretch',
        heading: 'Потянись',
        text: 'Система мягкой растяжки позвоночника, шеи, мышц и суставов для высвобождения психосоматического напряжения.',
      },
      {
        id: 'of-pain',
        heading: 'Забудь про боли',
        text: 'За счёт ступенчатого изотонического растяжения мышцы мягко удлиняются и расслабляются — проходят спазмы шеи, поясницы и плеч.',
      },
      {
        id: 'of-stress',
        heading: 'Скажи стрессу нет',
        text: 'Регулярные занятия помогают справиться с бессонницей, хронической усталостью и дистрессом за счёт самонастройки нервной и эндокринной систем.',
      },
      {
        id: 'of-slim',
        heading: 'Растянись и худей',
        text: 'Мягкая метаболическая нагрузка ускоряет лимфоток и помогает поддерживать форму даже при малоподвижном графике.',
      },
      {
        id: 'of-ready',
        heading: 'Всегда готов',
        text: 'Не требуется сложное снаряжение — достаточно принести только удобную сменную одежду и чистые носочки.',
      },
      {
        id: 'of-health',
        heading: 'Твой выбор — здоровье',
        text: 'Профилактика остеохондроза, межпозвоночной грыжи, сколиоза, кифоза и лордоза с высвобождением сосудов и нервных окончаний.',
      },
    ],
    contraindicationsNote:
      'Идеально после рабочего дня: мягкий вход в тягу под контролем пульсометра и тонометра до/после практики.',
    active: true,
  },
  {
    id: 'mb-age',
    slug: 'age',
    badge: 'Возраст 50+',
    title: 'Возраст ZA ПравИло',
    subtitle: 'Активное долголетие, подвижность суставов и лёгкость движений без ударной нагрузки',
    quoteOrMotto: 'Движение без боли и скованности в любом возрасте!',
    promoBadge: 'Бережный старт под контролем давления',
    heroImageUrl: '/src/assets/images/studio_hero_pravilo_1795103073467.jpg',
    accentTone: 'emerald',
    recommendedServiceCategory: 'wellness',
    recommendedServiceHint: 'Оздоровительное вытяжение с контролем АД и ЧСС',
    summary:
      'Деликатное дозированное вытяжение в комфортном положении без прыжков, осевого сжатия и резких рывков. Мягко разгружает тазобедренные и коленные суставы, улучшает питание межпозвоночных дисков и возвращает уверенность в каждом шаге.',
    reasonsTitle: 'Почему методика безопасна и полезна в зрелом возрасте',
    reasons: [
      'Отсутствие ударной и компрессионной нагрузки на позвоночник и суставы.',
      'Улучшение питания хрящей и стимуляция выработки синовиальной жидкости.',
      'Снятие возрастной скованности в плечевом поясе, пояснице и тазобедренных суставах.',
      'Мягкая профилактика остеохондроза и возрастных изменений осанки.',
      'Улучшение кровообращения, лимфотока, координации и равновесия.',
      'Обязательный контроль артериального давления и пульса перед началом и после сессии.',
    ],
    featureCards: [
      {
        id: 'age-joints',
        heading: 'Свобода суставов',
        text: 'Плавная разгрузка плеч, таза и коленей возвращает амплитуду движений в повседневных делах без хруста и скованности.',
      },
      {
        id: 'age-pressure',
        heading: 'Телеметрия безопасности',
        text: 'Каждая сессия начинается и заканчивается измерением АД и пульса, а тяга дозируется с точностью до 0.5 кг.',
      },
      {
        id: 'age-balance',
        heading: 'Уверенный баланс',
        text: 'Пробуждение глубоких мышц-стабилизаторов улучшает походку, устойчивость и профилактирует бытовые перегрузки.',
      },
      {
        id: 'age-sleep',
        heading: 'Глубокий сон и лёгкость',
        text: 'Снятие глубинных мышечных зажимов в шее и спине нормализует сон и утреннее самочувствие.',
      },
    ],
    contraindicationsNote:
      'Занятия проводятся индивидуально, с постепенной адаптацией нагрузки и мягкими анатомическими манжетами.',
    active: true,
  },
  {
    id: 'mb-kids',
    slug: 'kids',
    badge: 'Дети и подростки',
    title: 'Дети ZA ПравИло',
    subtitle: 'Формирование здоровой осанки, координации и снятие школьной нагрузки в период активного роста',
    quoteOrMotto: 'Ровная спина и крепкий мышечный корсет с детства!',
    promoBadge: 'Фото-диагностика осанки по лазерному уровню',
    heroImageUrl: '/src/assets/images/exercise_star_stretch_1795103073739.jpg',
    accentTone: 'amber',
    recommendedServiceCategory: 'fitness',
    recommendedServiceHint: 'Детская коррекция осанки и баланс-бревно',
    summary:
      'В период школьной нагрузки и быстрого скачка роста позвоночник особенно уязвим к сутулости и перекосам. Бережные игровые практики на ПравИло в сочетании с упражнениями на баланс-бревне помогают мягко выровнять плечи, таз и укрепить мышцы спины.',
    reasonsTitle: 'Польза занятий для детей и подростков',
    reasons: [
      'Мягкая коррекция сутулости, профилактика сколиоза, кифоза и гиперлордоза.',
      'Снятие статического напряжения от долгого сидения за партой и гаджетами.',
      'Симметричное укрепление глубокого мышечного корсета во время роста.',
      'Развитие ловкости, проприоцепции и координации движений (включая баланс-бревно).',
      'Безопасная нагрузка с учётом веса ребёнка — мягкие детские манжеты и деликатный угол.',
      'Наглядный фотопротокол осанки ДО и ПОСЛЕ с лазерным уровнем для родителей.',
    ],
    featureCards: [
      {
        id: 'kids-posture',
        heading: 'Осанка под контролем',
        text: 'Оцениваем симметрию плеч, лопаток и таза на фото с лазерным уровнем и отслеживаем реальный прогресс от занятия к занятию.',
      },
      {
        id: 'kids-growth',
        heading: 'Поддержка в период роста',
        text: 'Мягкое вытяжение снимает лишнее напряжение с растущих мышц и связок без тяжёлых весов.',
      },
      {
        id: 'kids-game',
        heading: 'Интересный формат',
        text: 'Занятия проходят в доброжелательной атмосфере с упражнениями на баланс, дыхание и внимательность.',
      },
      {
        id: 'kids-sport',
        heading: 'База для детских секций',
        text: 'Повышает гибкость, симметрию движений и выносливость юных спортсменов (плавание, единоборства, танцы, гимнастика).',
      },
    ],
    contraindicationsNote:
      'Программы проводятся по щадящему протоколу с минимальной начальной нагрузкой и присутствием родителей по желанию.',
    active: true,
  },
  {
    id: 'mb-moms',
    slug: 'moms',
    badge: 'Мамочки',
    title: 'Мамочки ZA ПравИло',
    subtitle: 'Бережное восстановление спины, шеи и осанки после беременности и забот о малыше',
    quoteOrMotto: 'Забота о себе — лёгкая спина и ресурс для всей семьи!',
    promoBadge: 'Деликатное восстановление спины и таза',
    heroImageUrl: '/src/assets/images/exercise_shoulder_open_1795103072729.jpg',
    accentTone: 'rose',
    recommendedServiceCategory: 'relax',
    recommendedServiceHint: 'Мягкое восстановление спины, шеи и дыхательная разгрузка',
    summary:
      'Постоянное ношение малыша на руках, кормление и недосып создают хроническую перегрузку поясницы, шеи, грудного отдела и тазовой области. Занятия на тренажёре ПравИло мягко возвращают позвоночнику ось, снимают спазмы и дарят время глубокого телесного отдыха.',
    reasonsTitle: 'Как методика помогает молодым и многодетным мамам',
    reasons: [
      'Быстрая разгрузка поясницы, грудного отдела и шеи от ношения ребёнка на руках.',
      'Мягкое выравнивание тазовой области и восстановление естественной осанки.',
      'Снятие хронического мышечного напряжения, головных болей напряжения и зажимов в плечах.',
      'Ускорение лимфотока, уменьшение отёчности и мягкая поддержка снижения веса.',
      'Глубокая перезагрузка нервной системы: снятие тревожности, усталости и улучшение сна.',
      'Деликатный подбор углов и индивидуальной нагрузки по самочувствию мамы.',
    ],
    featureCards: [
      {
        id: 'moms-back',
        heading: 'Спина без тяжести',
        text: 'Снятие компрессии с пояснично-крестцового отдела и раскрытие зажатых грудных мышц за одно занятие.',
      },
      {
        id: 'moms-lymph',
        heading: 'Лёгкость и лимфодренаж',
        text: 'Плавное растяжение и диафрагмальное дыхание запускают естественный лимфоток и возвращают тонус телу.',
      },
      {
        id: 'moms-relax',
        heading: 'Личное время тишины',
        text: '50 минут осознанного расслабления, где не нужно ни о ком заботиться — только дыхание, мягкая тяга и восстановление.',
      },
      {
        id: 'moms-scale',
        heading: 'Умный контроль формы',
        text: 'В личном кабинете можно отслеживать динамику веса, % мышц, воды и осанки ДО/ПОСЛЕ без стресса и гонки.',
      },
    ],
    contraindicationsNote:
      'Рекомендуется после завершения базового послеродового восстановления (или по согласованию с врачом при КС и особых показаниях).',
    active: true,
  },
];

export const DEFAULT_BRAND_ABOUT: BrandAboutInfo = {
  brandName: 'ЭТАЛОН ПРАВИЛО',
  tagline: 'Биомеханическая декомпрессия, восстановление осанки и телеметрический контроль здоровья',
  logoUrl: '/assets/aistudio/logo_full_etalon.png',
  logoIconUrl: '/assets/aistudio/logo_icon_etalon.png',
  homeBadge: 'Сеть студий биомеханической коррекции',
  homeTitle: 'Управление студией, запись и живая телеметрия тренировок',
  homeSubtitle:
    'Единая платформа для владельца сети, администраторов, тренеров и клиентов с поддержкой миодатчиков, пульсометра, тонометра, весов и тензодатчиков конечностей, позволяющих точно фиксировать нагрузку.',
  homeHeroImageUrl: '/assets/aistudio/IMG_6064_172a7fc2.JPG',
  homeHighlights: [
    { value: '3', label: 'Студии в сети' },
    { value: '5 BLE', label: 'Датчиков в реальном времени' },
    { value: 'PWA + ПК', label: 'Веб, десктоп и домен' },
  ],
  aboutNetwork:
    'Сеть студий «ЭТАЛОН ПРАВИЛО» объединяет бережные телесные практики на древнеславянском тренажёре ПравИло и современные технологии объективной диагностики. Мы работаем с осанкой, хроническим напряжением спины и шеи, восстановлением после нагрузок и повышением жизненного тонуса.',
  methodologyTitle: 'О методике ПравИло',
  methodologyDescription:
    'Методика основана на мягком симметричном осевом вытяжении тела в четырёх векторах (руки и ноги) с точным подбором стоек, углов и дозированной тяги. В отличие от грубых манипуляций, плавное горизонтальное вытяжение в сочетании с диафрагмальным дыханием снимает компрессию с межпозвонковых дисков, раскрывает грудной отдел, выравнивает фасциальные цепи и активирует глубокие мышцы-стабилизаторы.',
  whyUsTitle: 'Почему выбирают сеть «ЭТАЛОН ПРАВИЛО»',
  whyUsPoints: [
    'Точная телеметрия вместо тяги «на глаз»: тензодатчики конечностей позволяют точно фиксировать нагрузку в килограммах по каждой конечности в реальном времени.',
    'Фотопротокол осанки «ДО / ПОСЛЕ» с лазерным уровнем и замером углов перекоса плеч, таза и позвоночника.',
    'Контроль мышечного отклика (миография и миодатчики), пульса и давления (пульсометр и тонометр) перед выходом на раму и после сессии.',
    'Состав тела и динамика на весах с подробной расшифровкой каждого показателя в кабинете клиента.',
    'Индивидуальная матрица стоек (1–7) и углов (0–6) под антропометрию и задачи каждого гостя — от бережного релакса до спортивного восстановления.',
    'Сертифицированные специалисты со стажем от 6 до 9+ лет и открытыми публичными отзывами клиентов.',
  ],
  approaches: [
    {
      id: 'app-diag',
      title: '1. Диагностика до начала практики',
      description:
        'Измеряем рост, давление, состав тела (Mi Scale 2) и проводим визуальную оценку симметрии по лазерному уровню, чтобы зафиксировать исходную точку.',
    },
    {
      id: 'app-traction',
      title: '2. Плавное и безопасное вытяжение',
      description:
        'Мягкие манжеты, плавный набор нагрузки без рывков и точный подбор углов для левой и правой сторон под постоянным сопровождением тренера.',
    },
    {
      id: 'app-telemetry',
      title: '3. Контроль телеметрией в реальном времени',
      description:
        'Следим за балансом тяги левой/правой сторон, частотой пульса и мышечной активацией по датчикам — вы видите объективные цифры прогресса.',
    },
    {
      id: 'app-result',
      title: '4. Закрепление и домашняя динамика',
      description:
        'После сессии делаем повторный замер роста и фотопротокол ПОСЛЕ, а все результаты, графики и рекомендации сразу доступны в вашем личном кабинете.',
    },
  ],
  methodologyBlocks: DEFAULT_METHODOLOGY_BLOCKS,
  equipmentAndSafety:
    'Каждая студия оснащена сертифицированными рамами ПравИло из цельного дерева и усиленного профиля, мягкими анатомическими хватами, автоматическим контролем давления/ЧСС и стерильной обработкой инвентаря после каждого гостя. Перед первой сессией обязательно учитываются противопоказания.',
  networkPhone: '+7 (495) 120-88-00',
  networkEmail: 'care@etalon-pravilo.ru',
  socials: {
    website: 'https://etalon-pravilo.ru',
    telegram: 'https://t.me/etalon_pravilo',
    vk: 'https://vk.com/etalon_pravilo',
    youtube: 'https://youtube.com/@etalon_pravilo',
  },
};

export function normalizeStudioSocialUrl(
  key: keyof StudioSocialLinks,
  raw?: string
): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const lower = val.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return '';
  }

  if (key === 'whatsapp') {
    if (/^https?:\/\//i.test(val)) return val;
    const digits = val.replace(/[^\d]/g, '');
    if (digits.length >= 10) return `https://wa.me/${digits}`;
    return '';
  }

  if (val.startsWith('@')) {
    const handle = val.slice(1).trim();
    if (!handle) return '';
    if (key === 'telegram') return `https://t.me/${handle}`;
    if (key === 'vk') return `https://vk.com/${handle}`;
    if (key === 'instagram') return `https://instagram.com/${handle}`;
    if (key === 'youtube') return `https://youtube.com/@${handle}`;
  }

  if (/^https?:\/\//i.test(val)) return val;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(val)) return `https://${val}`;

  if (key === 'telegram') return `https://t.me/${val.replace(/^\/+/, '')}`;
  if (key === 'vk') return `https://vk.com/${val.replace(/^\/+/, '')}`;
  if (key === 'instagram') return `https://instagram.com/${val.replace(/^\/+/, '')}`;
  if (key === 'youtube') return `https://youtube.com/${val.replace(/^\/+/, '')}`;

  return '';
}

export function sanitizeStudioSocials(raw: unknown): StudioSocialLinks | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const out: StudioSocialLinks = {};
  const keys: (keyof StudioSocialLinks)[] = [
    'website',
    'telegram',
    'vk',
    'whatsapp',
    'instagram',
    'youtube',
  ];
  for (const k of keys) {
    const val = typeof obj[k] === 'string' ? normalizeStudioSocialUrl(k, obj[k] as string) : '';
    if (val) {
      out[k] = val.slice(0, 300);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeHeroImageUrl(raw: unknown): string {
  const val = typeof raw === 'string' ? raw.trim() : '';
  if (!val) return '';
  if ((val.startsWith('/assets/') || val.startsWith('/src/assets/')) && !val.includes('..')) {
    return val.slice(0, 400);
  }
  if (/^https?:\/\//i.test(val)) {
    return val.slice(0, 500);
  }
  if (/^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,/i.test(val) && val.length <= 2_500_000) {
    return val;
  }
  return '';
}

const VALID_ACCENT_TONES = new Set(['cyan', 'amber', 'emerald', 'violet', 'rose']);
const VALID_SERVICE_CATEGORIES = new Set<ServiceCategory>(['relax', 'fitness', 'sport', 'wellness']);

export function sanitizeMethodologyBlocks(
  raw: unknown,
  fallback: MethodologyProgramBlock[] = DEFAULT_METHODOLOGY_BLOCKS
): MethodologyProgramBlock[] {
  if (!Array.isArray(raw)) return fallback;

  const out: MethodologyProgramBlock[] = raw
    .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
    .map((b, idx): MethodologyProgramBlock => {
      const id =
        typeof b.id === 'string' && b.id.trim()
          ? b.id.trim().slice(0, 60)
          : `mb-${idx + 1}`;
      const slug =
        typeof b.slug === 'string' && b.slug.trim()
          ? b.slug.trim().slice(0, 40)
          : id;
      const badge =
        typeof b.badge === 'string' ? b.badge.trim().slice(0, 50) : 'Направление';
      const title =
        typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
      const subtitle =
        typeof b.subtitle === 'string' ? b.subtitle.trim().slice(0, 220) : '';
      const quoteOrMotto =
        typeof b.quoteOrMotto === 'string' ? b.quoteOrMotto.trim().slice(0, 200) : '';
      const promoBadge =
        typeof b.promoBadge === 'string' ? b.promoBadge.trim().slice(0, 120) : '';
      const heroImageUrl = sanitizeHeroImageUrl(b.heroImageUrl);
      const accentTone =
        typeof b.accentTone === 'string' && VALID_ACCENT_TONES.has(b.accentTone)
          ? (b.accentTone as MethodologyProgramBlock['accentTone'])
          : 'cyan';
      const recommendedServiceCategory =
        typeof b.recommendedServiceCategory === 'string' &&
        VALID_SERVICE_CATEGORIES.has(b.recommendedServiceCategory as ServiceCategory)
          ? (b.recommendedServiceCategory as ServiceCategory)
          : undefined;
      const recommendedServiceHint =
        typeof b.recommendedServiceHint === 'string'
          ? b.recommendedServiceHint.trim().slice(0, 140)
          : '';
      const summary =
        typeof b.summary === 'string' ? b.summary.trim().slice(0, 2000) : '';
      const reasonsTitle =
        typeof b.reasonsTitle === 'string' ? b.reasonsTitle.trim().slice(0, 160) : '';
      const reasons = Array.isArray(b.reasons)
        ? b.reasons
            .filter((r): r is string => typeof r === 'string')
            .map((r) => r.trim().slice(0, 320))
            .filter(Boolean)
            .slice(0, 15)
        : [];
      const featureCards: MethodologySlideCard[] = Array.isArray(b.featureCards)
        ? b.featureCards
            .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
            .map((c, cIdx) => ({
              id:
                typeof c.id === 'string' && c.id.trim()
                  ? c.id.trim().slice(0, 60)
                  : `${id}-card-${cIdx + 1}`,
              heading:
                typeof c.heading === 'string' ? c.heading.trim().slice(0, 120) : '',
              text: typeof c.text === 'string' ? c.text.trim().slice(0, 500) : '',
            }))
            .filter((c) => c.heading || c.text)
            .slice(0, 10)
        : [];
      const contraindicationsNote =
        typeof b.contraindicationsNote === 'string'
          ? b.contraindicationsNote.trim().slice(0, 600)
          : '';
      const active = b.active !== false;

      return {
        id,
        slug,
        badge: badge || 'Направление',
        title,
        subtitle,
        quoteOrMotto,
        promoBadge,
        heroImageUrl,
        accentTone,
        recommendedServiceCategory,
        recommendedServiceHint,
        summary,
        reasonsTitle,
        reasons,
        featureCards,
        contraindicationsNote,
        active,
      };
    })
    .filter((b) => b.title || b.summary)
    .slice(0, 12);

  return out;
}

export function sanitizeBrandAboutInput(
  raw: unknown,
  fallback: BrandAboutInfo = DEFAULT_BRAND_ABOUT
): BrandAboutInfo {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (key: keyof BrandAboutInfo, maxLen: number, defVal: string): string => {
    const v = src[key];
    return typeof v === 'string' ? v.trim().slice(0, maxLen) : defVal;
  };

  const rawPoints = Array.isArray(src.whyUsPoints) ? src.whyUsPoints : fallback.whyUsPoints;
  const whyUsPoints = rawPoints
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim().slice(0, 320))
    .filter(Boolean)
    .slice(0, 12);

  const rawApproaches = Array.isArray(src.approaches)
    ? src.approaches
    : fallback.approaches;
  const approaches: BrandApproachCard[] = rawApproaches
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a, idx) => ({
      id:
        typeof a.id === 'string' && a.id.trim()
          ? a.id.trim().slice(0, 60)
          : `app-${idx + 1}`,
      title: typeof a.title === 'string' ? a.title.trim().slice(0, 120) : '',
      description:
        typeof a.description === 'string' ? a.description.trim().slice(0, 500) : '',
    }))
    .filter((a) => a.title || a.description)
    .slice(0, 10);

  const fallbackBlocks = fallback.methodologyBlocks || DEFAULT_METHODOLOGY_BLOCKS;
  const methodologyBlocks =
    src.methodologyBlocks !== undefined
      ? sanitizeMethodologyBlocks(src.methodologyBlocks, fallbackBlocks)
      : fallbackBlocks;

  const fallbackHighlights = fallback.homeHighlights || DEFAULT_BRAND_ABOUT.homeHighlights || [];
  const rawHighlights = Array.isArray(src.homeHighlights) ? src.homeHighlights : fallbackHighlights;
  const homeHighlights = rawHighlights
    .filter((h): h is Record<string, unknown> => Boolean(h && typeof h === 'object'))
    .map((h) => ({
      value: typeof h.value === 'string' ? h.value.trim().slice(0, 40) : '',
      label: typeof h.label === 'string' ? h.label.trim().slice(0, 80) : '',
    }))
    .filter((h) => h.value || h.label)
    .slice(0, 4);

  const logoUrl =
    src.logoUrl !== undefined
      ? sanitizeHeroImageUrl(src.logoUrl) || DEFAULT_BRAND_ABOUT.logoUrl
      : fallback.logoUrl || DEFAULT_BRAND_ABOUT.logoUrl;
  const logoIconUrl =
    src.logoIconUrl !== undefined
      ? sanitizeHeroImageUrl(src.logoIconUrl) || DEFAULT_BRAND_ABOUT.logoIconUrl
      : fallback.logoIconUrl || DEFAULT_BRAND_ABOUT.logoIconUrl;
  const homeHeroImageUrl =
    src.homeHeroImageUrl !== undefined
      ? sanitizeHeroImageUrl(src.homeHeroImageUrl) || DEFAULT_BRAND_ABOUT.homeHeroImageUrl
      : fallback.homeHeroImageUrl || DEFAULT_BRAND_ABOUT.homeHeroImageUrl;

  return {
    brandName: str('brandName', 100, fallback.brandName) || fallback.brandName,
    tagline: str('tagline', 240, fallback.tagline),
    logoUrl,
    logoIconUrl,
    homeBadge:
      str('homeBadge', 140, fallback.homeBadge || DEFAULT_BRAND_ABOUT.homeBadge || '') ||
      DEFAULT_BRAND_ABOUT.homeBadge,
    homeTitle:
      str('homeTitle', 200, fallback.homeTitle || DEFAULT_BRAND_ABOUT.homeTitle || '') ||
      DEFAULT_BRAND_ABOUT.homeTitle,
    homeSubtitle: str(
      'homeSubtitle',
      600,
      fallback.homeSubtitle || DEFAULT_BRAND_ABOUT.homeSubtitle || ''
    ),
    homeHeroImageUrl,
    homeHighlights: homeHighlights.length > 0 ? homeHighlights : fallbackHighlights,
    aboutNetwork: str('aboutNetwork', 2500, fallback.aboutNetwork),
    methodologyTitle:
      str('methodologyTitle', 160, fallback.methodologyTitle) ||
      fallback.methodologyTitle,
    methodologyDescription: str(
      'methodologyDescription',
      3000,
      fallback.methodologyDescription
    ),
    whyUsTitle: str('whyUsTitle', 160, fallback.whyUsTitle) || fallback.whyUsTitle,
    whyUsPoints,
    approaches,
    methodologyBlocks,
    equipmentAndSafety: str(
      'equipmentAndSafety',
      2000,
      fallback.equipmentAndSafety
    ),
    networkPhone: str('networkPhone', 60, fallback.networkPhone || ''),
    networkEmail: str('networkEmail', 120, fallback.networkEmail || ''),
    socials:
      src.socials !== undefined
        ? sanitizeStudioSocials(src.socials)
        : fallback.socials,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}
