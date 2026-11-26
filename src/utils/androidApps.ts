export type AndroidAppFlavor = 'admin' | 'trainer' | 'client';

export interface AndroidAppDefinition {
  flavor: AndroidAppFlavor;
  title: string;
  shortTitle: string;
  packageId: string;
  startUrl: string;
  manifestUrl: string;
  iconUrl: string;
  roleLabel: string;
  accentClass: string;
  description: string;
  capabilities: string[];
}

export const ANDROID_APPS_CATALOG: AndroidAppDefinition[] = [
  {
    flavor: 'admin',
    title: 'Приложение администратора',
    shortTitle: 'Администратор',
    packageId: 'ru.etalonpravilo.admin',
    startUrl: '/?app=admin',
    manifestUrl: '/manifest-admin.webmanifest',
    iconUrl: '/android-admin-192.png',
    roleLabel: 'Администратор / Владелец',
    accentClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    description:
      'Отдельное Android-приложение для администратора студии: управление расписанием, записями, базой клиентов, абонементами и рассылками без тренерского и клиентского порталов.',
    capabilities: [
      'Расписание залов и подтверждение записей',
      'База клиентов, антропометрия и абонементы',
      'Услуги, промокоды, чаты и Push-уведомления',
    ],
  },
  {
    flavor: 'trainer',
    title: 'Приложение тренера',
    shortTitle: 'Тренер',
    packageId: 'ru.etalonpravilo.trainer',
    startUrl: '/?app=trainer',
    manifestUrl: '/manifest-trainer.webmanifest',
    iconUrl: '/android-trainer-192.png',
    roleLabel: 'Тренер студии',
    accentClass: 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800',
    description:
      'Отдельное Android-приложение тренера с прямым подключением датчиков по Bluetooth на Android (тензодатчики конечностей, миодатчики, пульсометр, тонометр, весы), оценкой осанки и программами.',
    capabilities: [
      'Кабинет тренера и личное расписание смен',
      'Телеметрия датчиков и тренировочные сессии',
      'Фото-анализ осанки, гониометр, база упражнений',
    ],
  },
  {
    flavor: 'client',
    title: 'Приложение клиента',
    shortTitle: 'Клиент',
    packageId: 'ru.etalonpravilo.client',
    startUrl: '/?app=client',
    manifestUrl: '/manifest-client.webmanifest',
    iconUrl: '/android-client-192.png',
    roleLabel: 'Клиент студии',
    accentClass: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    description:
      'Отдельное клиентское Android-приложение для самостоятельной записи, контроля абонементов, динамики осанки/состава тела, чтения методических блоков и чата со студией.',
    capabilities: [
      'Онлайн-запись к тренерам и календарь визитов',
      'Абонементы, история сессий и динамика тела',
      'Методические блоки и чат со студией (без базы упражнений)',
    ],
  },
];

export function getActiveAndroidAppFlavor(): AndroidAppFlavor | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('app');
  if (raw === 'admin' || raw === 'trainer' || raw === 'client') {
    return raw;
  }
  return null;
}

export function getAndroidAppDefinition(
  flavor: AndroidAppFlavor | null
): AndroidAppDefinition | null {
  if (!flavor) return null;
  return ANDROID_APPS_CATALOG.find((item) => item.flavor === flavor) || null;
}

export function applyAndroidAppManifestToDocument(
  flavor: AndroidAppFlavor | null,
  brandName?: string
): void {
  if (typeof document === 'undefined') return;
  const def = getAndroidAppDefinition(flavor);
  const titleBase = brandName?.trim() || 'ЭТАЛОН ПРАВИЛО';
  const manifestLink = document.querySelector('link[rel="manifest"]');
  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');

  if (!def) {
    document.title = `${titleBase} · Студия`;
    if (manifestLink) {
      manifestLink.setAttribute('href', '/manifest.webmanifest');
    }
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute('content', titleBase);
    }
    return;
  }

  document.title = `${titleBase} — ${def.shortTitle}`;
  if (manifestLink) {
    manifestLink.setAttribute('href', def.manifestUrl);
  } else {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = def.manifestUrl;
    document.head.appendChild(link);
  }
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', def.shortTitle);
  }
}
