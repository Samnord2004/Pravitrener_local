import type {
  LegalAgreementCategory,
  LegalAgreementDoc,
  LegalAgreementSection,
  UserAccount,
  UserRole,
} from '../types.ts';

export type { LegalAgreementCategory, LegalAgreementDoc, LegalAgreementSection };

export const CURRENT_LEGAL_BUNDLE_VERSION = '2026.1';

export const LEGAL_AGREEMENT_CATEGORIES: LegalAgreementCategory[] = [
  'Конфиденциальность',
  'Персональные данные',
  'Оферта и правила',
  'Безопасность и здоровье',
  'Телеметрия и фото',
  'Уведомления',
  'Конфиденциальность сотрудника (NDA)',
];

const VALID_ROLES: UserRole[] = ['owner', 'admin', 'trainer', 'client'];
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export const LEGAL_AGREEMENTS: LegalAgreementDoc[] = [
  {
    id: 'privacy_policy',
    title: 'Политика конфиденциальности и защиты информации',
    shortTitle: 'Политика конфиденциальности',
    category: 'Конфиденциальность',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Определяет порядок сбора, хранения, защиты и неразглашения данных пользователей в веб-кабинете и мобильных приложениях сети студий.',
    sections: [
      {
        heading: '1. Общие положения',
        paragraphs: [
          'Настоящая Политика конфиденциальности действует в отношении всей информации, которую сеть студий биомеханической коррекции «ЭТАЛОН ПРАВИЛО» (далее — Оператор) получает о клиентах, тренерах и администраторах при использовании веб-платформы, локальных десктоп-версий и мобильных Android-приложений.',
          'Использование приложений и вход в учётную запись означает безоговорочное согласие пользователя с условиями настоящей Политики и указанными в ней целями обработки информации.',
        ],
      },
      {
        heading: '2. Состав обрабатываемой информации',
        paragraphs: [
          'К обрабатываемым сведениям относятся: идентификационные данные (ФИО, логин, телефон, E-mail, Telegram-контакт), сведения о записях и абонементах, антропометрические замеры (рост, вес, состав тела, артериальное давление, пульс), показатели тренировочной телеметрии и фотографии осанки, а также технические сведения об устройстве и времени подтверждения соглашений.',
        ],
      },
      {
        heading: '3. Меры защиты и ограничение доступа',
        paragraphs: [
          'Оператор обеспечивает разграничение ролевого доступа: тренеры видят только закреплённых за ними клиентов без прямых контактных данных (телефона и E-mail), клиенты видят исключительно собственные показатели и расписание, а администраторы не имеют доступа к закрытым функциям владельца.',
          'Пароли хранятся исключительно в криптографически хешированном виде, а передача сессионных токенов защищена проверкой версии токена и контролем доступа на сервере.',
        ],
      },
      {
        heading: '4. Сроки хранения и права пользователя',
        paragraphs: [
          'Данные хранятся на защищённом сервере студии в течение срока действия отношений и периода, необходимого для исполнения требований законодательства РФ. Пользователь вправе запросить уточнение, выгрузку или удаление своих данных через владельца студии.',
        ],
      },
    ],
  },
  {
    id: 'personal_data_consent',
    title: 'Согласие на обработку персональных и специальных данных (ФЗ-152)',
    shortTitle: 'Согласие на обработку ПДн',
    category: 'Персональные данные',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Письменное электронное согласие в соответствии с Федеральным законом № 152-ФЗ на обработку персональных данных и показателей физического состояния.',
    sections: [
      {
        heading: '1. Субъект и Оператор персональных данных',
        paragraphs: [
          'Действуя свободно, своей волей и в своём интересе, пользователь предоставляет Оператору — сети студий «ЭТАЛОН ПРАВИЛО» — согласие на обработку своих персональных данных, указанных при регистрации, заполнении анкеты, записи на сессию и прохождении замеров.',
        ],
      },
      {
        heading: '2. Перечень данных и действия с ними',
        paragraphs: [
          'Согласие распространяется на: фамилию, имя, отчество, дату рождения, пол, номер телефона, адрес электронной почты, идентификатор мессенджера, цель занятий, сведения об ограничениях и противопоказаниях, результаты антропометрии, измерений весами, тонометром, пульсометром, миодатчиками и тензодатчиками конечностей.',
          'Оператор вправе осуществлять сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, блокирование и удаление указанных данных с использованием средств автоматизации и без таковых.',
        ],
      },
      {
        heading: '3. Срок действия и отзыв согласия',
        paragraphs: [
          'Настоящее согласие действует бессрочно до момента его отзыва путём направления письменного уведомления Оператору. Факт подтверждения данного согласия в приложении фиксируется журналом подтверждений и направляется владельцу студии.',
        ],
      },
    ],
  },
  {
    id: 'user_agreement',
    title: 'Пользовательское соглашение и правила использования сервиса',
    shortTitle: 'Пользовательское соглашение',
    category: 'Оферта и правила',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Регулирует порядок работы в приложениях Администратора, Тренера и Клиента, правила онлайн-записи, переноса визитов и использования абонементов.',
    sections: [
      {
        heading: '1. Предмет соглашения',
        paragraphs: [
          'Оператор предоставляет пользователю доступ к функционалу цифровой платформы «ЭТАЛОН ПРАВИЛО» (веб-версия, десктоп и Android-приложения) в пределах назначенной роли: Клиент, Тренер или Администратор.',
        ],
      },
      {
        heading: '2. Правила учётной записи и безопасности',
        paragraphs: [
          'Пользователь обязуется не передавать свои логин и пароль третьим лицам, своевременно обновлять контактный E-mail и немедленно сообщать администратору или владельцу при подозрении на несанкционированный вход.',
        ],
      },
      {
        heading: '3. Правила записи, отмены и абонементов',
        paragraphs: [
          'Онлайн-запись считается подтверждённой после согласования времени студией. Перенос или отмена визита рекомендуется не позднее чем за 12 часов до начала сессии. Учёт остатка сессий и сроков действия абонементов ведётся в единой системе студии.',
        ],
      },
    ],
  },
  {
    id: 'health_safety_consent',
    title: 'Информированное согласие о здоровье и технике безопасности на тренажёре ПравИло',
    shortTitle: 'Согласие по здоровью и ТБ',
    category: 'Безопасность и здоровье',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Подтверждение достоверности сведений о самочувствии и противопоказаниях, а также соблюдения правил плавной дозированной нагрузки и техники безопасности.',
    sections: [
      {
        heading: '1. Оздоровительный характер практик',
        paragraphs: [
          'Занятия на тренажёре ПравИло носят оздоровительный и физкультурно-восстановительный характер и не являются медицинской услугой или заменой врачебного лечения.',
        ],
      },
      {
        heading: '2. Противопоказания и обязанность информирования',
        paragraphs: [
          'Клиент обязуется до начала каждой сессии достоверно сообщить тренеру и администратору об острых травмах, недавних операциях, гипертоническом кризе, обострении хронических заболеваний, беременности и иных ограничениях.',
          'Сотрудники студии (тренер и администратор) обязуются проверять анкету противопоказаний, замерять артериальное давление и пульс до начала тяги и немедленно прекращать нагрузку при появлении жалоб или дискомфорта.',
        ],
      },
      {
        heading: '3. Правила поведения в зале и на раме',
        paragraphs: [
          'Подъём и опускание выполняются исключительно плавно под контролем сертифицированного тренера с использованием проверенных манжет, страховочных карабинов и контроля симметрии тяги.',
        ],
      },
    ],
  },
  {
    id: 'telemetry_photo_consent',
    title: 'Согласие на телеметрический мониторинг и фотопротокол осанки «ДО / ПОСЛЕ»',
    shortTitle: 'Согласие на фото и телеметрию',
    category: 'Телеметрия и фото',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Разрешение на регистрацию параметров нагрузки, ЭМГ-отклика, пульса, давления и антропометрического фотоанализа осанки для контроля динамики.',
    sections: [
      {
        heading: '1. Состав телеметрических и диагностических данных',
        paragraphs: [
          'Для объективного контроля прогресса во время сессии могут применяться: тензодатчики конечностей, позволяющие точно фиксировать нагрузку по четырём векторам, миодатчики ЭМГ, пульсометр, тонометр, умные весы и визуальный фотоанализ осанки с разметкой уровней и гониометрией.',
        ],
      },
      {
        heading: '2. Использование фотографий и отчётов',
        paragraphs: [
          'Фотографии осанки в фас, профиль и со спины используются исключительно внутри карты клиента для оценки биомеханических изменений «ДО / ПОСЛЕ» и составления индивидуальных тренировочных программ. Публикация фотографий в открытых источниках без отдельного письменного разрешения клиента строго запрещена.',
        ],
      },
    ],
  },
  {
    id: 'notifications_consent',
    title: 'Согласие на получение сервисных и информационных уведомлений',
    shortTitle: 'Согласие на уведомления',
    category: 'Уведомления',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer', 'client'],
    summary:
      'Согласие на доставку Push-уведомлений, E-mail писем и сообщений в мессенджерах о записях, напоминаниях, изменениях расписания и отчётах.',
    sections: [
      {
        heading: '1. Каналы и цели уведомлений',
        paragraphs: [
          'Пользователь соглашается получать сервисные уведомления через браузерные/мобильные Push-сообщения, электронную почту и привязанные мессенджеры о подтверждении и переносе записей, приближении времени визита, статусе абонемента, поздравлениях и важных изменениях правил студии.',
        ],
      },
      {
        heading: '2. Управление уведомлениями',
        paragraphs: [
          'Пользователь может в любой момент изменить параметры Push-уведомлений в настройках устройства или обратиться к администратору для отключения информационных рассылок.',
        ],
      },
    ],
  },
  {
    id: 'staff_nda',
    title: 'Соглашение о неразглашении (NDA) и защите клиентской базы студии',
    shortTitle: 'NDA и защита клиентской базы',
    category: 'Конфиденциальность сотрудника (NDA)',
    version: '1.0',
    updatedAt: '2026-03-01',
    requiredFor: ['owner', 'admin', 'trainer'],
    summary:
      'Обязательство администратора и тренера о строгой конфиденциальности персональных данных клиентов, коммерческих методик и запрете копирования базы.',
    sections: [
      {
        heading: '1. Конфиденциальная информация',
        paragraphs: [
          'К конфиденциальной информации относятся: персональные и контактные данные клиентов, медицинские/оздоровительные анкеты, фотопротоколы осанки, финансовые показатели студий, внутренние скрипты работы и коммерческие условия.',
        ],
      },
      {
        heading: '2. Обязанности сотрудника',
        paragraphs: [
          'Администратор и тренер обязуются не копировать, не фотографировать с экрана, не выгружать и не передавать третьим лицам сведения о клиентах студии ни в период работы, ни после прекращения сотрудничества.',
          'При завершении работы доступ сотрудника к веб-платформе и мобильным приложениям незамедлительно блокируется, а активные сессии аннулируются.',
        ],
      },
      {
        heading: '3. Ответственность и уведомление владельца',
        paragraphs: [
          'Подтверждение ознакомления с настоящим NDA после первого входа фиксируется в защищённом журнале с указанием даты, времени и роли сотрудника и автоматически направляется владельцу сети студий.',
        ],
      },
    ],
  },
];

function cloneDoc(doc: LegalAgreementDoc): LegalAgreementDoc {
  return {
    ...doc,
    requiredFor: [...doc.requiredFor],
    sections: doc.sections.map((s) => ({
      heading: s.heading,
      paragraphs: [...s.paragraphs],
    })),
  };
}

export function mergeLegalAgreements(
  customDocs?: LegalAgreementDoc[] | null
): LegalAgreementDoc[] {
  if (!Array.isArray(customDocs) || customDocs.length === 0) {
    return LEGAL_AGREEMENTS.map(cloneDoc);
  }
  const byId = new Map<string, LegalAgreementDoc>();
  for (const doc of customDocs) {
    if (doc && typeof doc.id === 'string' && !FORBIDDEN_IDS.has(doc.id)) {
      byId.set(doc.id, cloneDoc(doc));
    }
  }
  const result: LegalAgreementDoc[] = [];
  const usedIds = new Set<string>();
  for (const def of LEGAL_AGREEMENTS) {
    const custom = byId.get(def.id);
    result.push(custom ? cloneDoc(custom) : cloneDoc(def));
    usedIds.add(def.id);
  }
  for (const doc of customDocs) {
    if (doc && typeof doc.id === 'string' && !usedIds.has(doc.id) && !FORBIDDEN_IDS.has(doc.id)) {
      result.push(cloneDoc(doc));
      usedIds.add(doc.id);
    }
  }
  return result;
}

export function sanitizeLegalDocumentsInput(
  rawDocs: unknown
): { ok: true; documents: LegalAgreementDoc[] } | { ok: false; error: string } {
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    return { ok: false, error: 'Передайте непустой список юридических документов.' };
  }
  if (rawDocs.length > 25) {
    return { ok: false, error: 'Превышено допустимое количество документов (максимум 25).' };
  }

  const sanitized: LegalAgreementDoc[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawDocs.length; i += 1) {
    const item = rawDocs[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Некорректная структура документа №${i + 1}.` };
    }
    const rawId = typeof item.id === 'string' ? item.id.trim().toLowerCase() : '';
    if (!/^[a-z0-9_-]{2,64}$/.test(rawId) || FORBIDDEN_IDS.has(rawId)) {
      return { ok: false, error: `Недопустимый идентификатор документа №${i + 1}.` };
    }
    if (seenIds.has(rawId)) {
      return { ok: false, error: `Дублируется идентификатор документа: ${rawId}.` };
    }
    seenIds.add(rawId);

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title || title.length > 220) {
      return {
        ok: false,
        error: `Укажите полное название документа №${i + 1} (от 1 до 220 символов).`,
      };
    }

    const shortTitle =
      typeof item.shortTitle === 'string' && item.shortTitle.trim()
        ? item.shortTitle.trim()
        : title.slice(0, 80);
    if (shortTitle.length > 100) {
      return {
        ok: false,
        error: `Краткое название документа «${shortTitle.slice(0, 30)}...» слишком длинное (макс. 100 символов).`,
      };
    }

    const rawCat = typeof item.category === 'string' ? item.category.trim() : '';
    const category: LegalAgreementCategory = LEGAL_AGREEMENT_CATEGORIES.includes(
      rawCat as LegalAgreementCategory
    )
      ? (rawCat as LegalAgreementCategory)
      : 'Конфиденциальность';

    const version =
      typeof item.version === 'string' && item.version.trim()
        ? item.version.trim().slice(0, 24)
        : '1.0';
    const updatedAt =
      typeof item.updatedAt === 'string' && item.updatedAt.trim()
        ? item.updatedAt.trim().slice(0, 24)
        : new Date().toISOString().slice(0, 10);

    const summary =
      typeof item.summary === 'string' ? item.summary.trim().slice(0, 600) : '';

    const rawRoles = Array.isArray(item.requiredFor) ? item.requiredFor : [];
    const roleSet = new Set<UserRole>(['owner']);
    for (const r of rawRoles) {
      if (typeof r === 'string' && VALID_ROLES.includes(r as UserRole)) {
        roleSet.add(r as UserRole);
      }
    }
    const requiredFor = VALID_ROLES.filter((r) => roleSet.has(r));

    const rawSections = Array.isArray(item.sections) ? item.sections : [];
    if (rawSections.length === 0 || rawSections.length > 30) {
      return {
        ok: false,
        error: `Документ «${shortTitle}» должен содержать от 1 до 30 разделов.`,
      };
    }

    const sections: LegalAgreementSection[] = [];
    for (let sIdx = 0; sIdx < rawSections.length; sIdx += 1) {
      const sec = rawSections[sIdx] as Record<string, unknown> | null;
      if (!sec || typeof sec !== 'object') {
        return {
          ok: false,
          error: `Некорректный раздел №${sIdx + 1} в документе «${shortTitle}».`,
        };
      }
      const heading =
        typeof sec.heading === 'string' ? sec.heading.trim().slice(0, 180) : '';
      if (!heading) {
        return {
          ok: false,
          error: `Заполните заголовок раздела №${sIdx + 1} в документе «${shortTitle}».`,
        };
      }
      const rawParagraphs = Array.isArray(sec.paragraphs) ? sec.paragraphs : [];
      const paragraphs = rawParagraphs
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim().slice(0, 4000))
        .filter((p) => p.length > 0)
        .slice(0, 40);
      if (paragraphs.length === 0) {
        return {
          ok: false,
          error: `Добавьте хотя бы один абзац текста в раздел «${heading}» документа «${shortTitle}».`,
        };
      }
      sections.push({ heading, paragraphs });
    }

    sanitized.push({
      id: rawId,
      title,
      shortTitle,
      category,
      version,
      updatedAt,
      requiredFor,
      summary,
      sections,
    });
  }

  return { ok: true, documents: sanitized };
}

export function incrementLegalBundleVersion(current?: string): string {
  const base = (current || CURRENT_LEGAL_BUNDLE_VERSION).trim();
  const match = base.match(/^(\d{4})\.(\d+)$/);
  if (match) {
    return `${match[1]}.${Number(match[2]) + 1}`;
  }
  const numMatch = base.match(/^(.+\.)(\d+)$/);
  if (numMatch) {
    return `${numMatch[1]}${Number(numMatch[2]) + 1}`;
  }
  return `${base}.1`;
}

// Client-side synchronized bundle state so every modal & panel reflects owner edits live
let activeDocsSnapshot: LegalAgreementDoc[] = LEGAL_AGREEMENTS.map(cloneDoc);
let activeBundleVersion: string = CURRENT_LEGAL_BUNDLE_VERSION;
const bundleListeners = new Set<() => void>();

export function setActiveLegalBundle(
  docs?: LegalAgreementDoc[] | null,
  bundleVersion?: string | null
): void {
  activeDocsSnapshot = mergeLegalAgreements(docs);
  if (typeof bundleVersion === 'string' && bundleVersion.trim()) {
    activeBundleVersion = bundleVersion.trim();
  }
  for (const listener of bundleListeners) {
    listener();
  }
}

export function getActiveLegalDocuments(): LegalAgreementDoc[] {
  return activeDocsSnapshot;
}

export function getActiveLegalBundleVersion(): string {
  return activeBundleVersion;
}

export function subscribeLegalDocuments(listener: () => void): () => void {
  bundleListeners.add(listener);
  return () => {
    bundleListeners.delete(listener);
  };
}

export function getLegalAgreementsForRole(
  role: UserRole,
  customDocs?: LegalAgreementDoc[] | null
): LegalAgreementDoc[] {
  const docs = customDocs
    ? mergeLegalAgreements(customDocs)
    : activeDocsSnapshot;
  return docs.filter((doc) => doc.requiredFor.includes(role));
}

export function userNeedsLegalAcceptance(
  user: UserAccount | null | undefined,
  bundleVersion?: string | null
): boolean {
  if (!user) return false;
  if (user.role === 'owner') return false;
  const expectedVersion = (bundleVersion || activeBundleVersion || CURRENT_LEGAL_BUNDLE_VERSION).trim();
  return (
    !user.legalAcceptedAt ||
    user.legalAgreementsVersion !== expectedVersion
  );
}

