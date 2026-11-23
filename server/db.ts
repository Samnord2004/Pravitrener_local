import fs from 'fs';
import path from 'path';
import type { StudioDatabase } from '../src/types.ts';
import { calculateMiScale2Metrics, DEFAULT_MI_SCALE_CALIBRATION } from '../src/utils/miScale2.ts';
import { DEFAULT_BRAND_ABOUT, DEFAULT_METHODOLOGY_BLOCKS } from '../src/utils/brandAbout.ts';
import { createInitialDatabase } from './seed.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'studio-db.json');

let cachedDb: StudioDatabase | null = null;

export function getDb(): StudioDatabase {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StudioDatabase;
      const curYear = new Date().getFullYear();
      if (Array.isArray(parsed.users)) {
        const seedUsersMap = new Map(createInitialDatabase().users.map((su) => [su.id, su]));
        parsed.users = parsed.users.map((u) => {
          const seedUser = seedUsersMap.get(u.id);
          return {
            ...u,
            email: u.email || `${u.login}@etalon-pravilo.ru`,
            emailVerified: u.emailVerified ?? true,
            employmentStatus: u.employmentStatus || (u.active === false ? 'fired' : 'working'),
            tokenVersion: typeof u.tokenVersion === 'number' ? u.tokenVersion : 1,
            trainerProfile: u.trainerProfile ?? seedUser?.trainerProfile,
          };
        });
      }
      if (Array.isArray(parsed.services)) {
        parsed.services = parsed.services.map((s, idx) => {
          const text = `${s.id || ''} ${s.name || ''} ${s.description || ''}`.toLowerCase();
          const inferred =
            s.category ||
            (/релакс|дыха|мягк|расслаб/.test(text)
              ? 'relax'
              : /фитнес|нейро|баланс|бревно/.test(text)
              ? 'fitness'
              : /спорт|силов|глубокая декомпрессия/.test(text)
              ? 'sport'
              : 'wellness');
          return {
            ...s,
            category: inferred,
            sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : idx + 1,
          };
        });
        if (!parsed.services.some((s) => s.category === 'fitness')) {
          parsed.services.push({
            id: 'srv-fitness',
            studioId: 'all',
            name: 'Нейро-мышечный фитнес + баланс бревно',
            category: 'fitness',
            description:
              'Комплекс на координацию, глубокие стабилизаторы и баланс-бревно с телеметрическим контролем симметрии.',
            durationMin: 60,
            priceRub: 3800,
            sortOrder: parsed.services.length + 1,
            active: true,
          });
        }
      }
      if (Array.isArray(parsed.clients)) {
        parsed.clients = parsed.clients.map((c) => {
          const lower = (c.name || '').toLowerCase();
          const isFemale = /(^|\s)(ольга|виктория|анна|мария|елена|наталья|светлана|татьяна|ирина|екатерина|юлия|дарья|анастасия|алина|полина|ксения)(\s|$)/.test(lower);
          const gender = c.gender === 'male' || c.gender === 'female' ? c.gender : isFemale ? 'female' : 'male';
          const age = curYear - (c.birthYear || 1990);
          const anthropometry = (c.anthropometry || []).map((a) => {
            if (typeof a.muscleMassKg === 'number' && typeof a.heightBeforeCm === 'number') {
              return a;
            }
            const hBefore = a.heightBeforeCm || a.heightCm || 175;
            const computed = calculateMiScale2Metrics({
              rawWeightKg: a.weightKg || 75,
              heightCm: hBefore,
              ageYears: age,
              gender,
            });
            return {
              ...computed,
              ...a,
              phase: a.phase || (a.heightAfterCm ? 'paired' : 'before'),
              heightCm: a.heightCm || hBefore,
              heightBeforeCm: hBefore,
              heightDeltaCm:
                typeof a.heightAfterCm === 'number'
                  ? Number((a.heightAfterCm - hBefore).toFixed(1))
                  : a.heightDeltaCm,
              calibratedScale: a.calibratedScale ?? true,
            };
          });
          const birthDate =
            c.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)
              ? c.birthDate
              : `${c.birthYear || 1990}-05-14`;
          return {
            ...c,
            gender,
            birthDate,
            clientStatus: c.clientStatus || 'active',
            anthropometry,
            postureAssessments: Array.isArray(c.postureAssessments) ? c.postureAssessments : [],
          };
        });
      }
      if (!parsed.hardwareRealModeInitialized) {
        const seed = createInitialDatabase();
        const seedMap = new Map(seed.equipment.map((item) => [item.type, item]));
        parsed.equipment = (parsed.equipment || seed.equipment).map((d) => {
          const def = seedMap.get(d.type);
          return {
            ...(def || d),
            ...d,
            connected: false,
            streaming: false,
            connectionMode: 'disconnected',
            batteryPct: 0,
            signalQualityPct: 0,
            lastReadingText: 'Ожидает подключения реального датчика',
            lastSyncAt: '',
            calibration: d.calibration || def?.calibration || (d.type === 'xiaomi_scale' ? { ...DEFAULT_MI_SCALE_CALIBRATION } : undefined),
            hardwareConfig: d.hardwareConfig || def?.hardwareConfig,
          };
        });
        parsed.hardwareRealModeInitialized = true;
        saveDb(parsed);
      } else if (Array.isArray(parsed.equipment)) {
        parsed.equipment = parsed.equipment.map((d) =>
          d.type === 'xiaomi_scale' && !d.calibration
            ? { ...d, calibration: { ...DEFAULT_MI_SCALE_CALIBRATION } }
            : d
        );
      }
      if (Array.isArray(parsed.templates) && !parsed.templates.some((t) => t.trigger === 'birthday')) {
        parsed.templates.push({
          id: 'tpl-birthday-push',
          name: 'Поздравление с Днём рождения (авто-Push)',
          channel: 'push',
          trigger: 'birthday',
          subject: 'С Днём рождения от ЭТАЛОН ПРАВИЛО!',
          body: 'Дорогой клиент {{client_name}}, поздравляем с Днём рождения! Желаем лёгкости в теле, крепкой осанки и новых вершин. В честь праздника дарим −20% на следующую сессию в студии ({{studio_address}}). Ваш кабинет: {{cabinet_link}}',
        });
      }
      if (parsed.birthdayAutomationEnabled === undefined) {
        parsed.birthdayAutomationEnabled = true;
      }
      if (!parsed.messagingSettings || !parsed.messengerMessages || !parsed.trainerPosts || !parsed.reviews) {
        const seed = createInitialDatabase();
        if (!parsed.messagingSettings) parsed.messagingSettings = seed.messagingSettings;
        if (!parsed.messengerMessages) parsed.messengerMessages = seed.messengerMessages;
        if (!parsed.trainerPosts) parsed.trainerPosts = seed.trainerPosts;
        if (!parsed.reviews) parsed.reviews = seed.reviews;
      }
      if (Array.isArray(parsed.studios)) {
        const seedStudiosMap = new Map(createInitialDatabase().studios.map((s) => [s.id, s]));
        parsed.studios = parsed.studios.map((st) => {
          const seedSt = seedStudiosMap.get(st.id);
          return {
            ...st,
            description: st.description !== undefined ? st.description : (seedSt?.description || ''),
            photos: Array.isArray(st.photos) ? st.photos : (seedSt?.photos || []),
            email: st.email !== undefined ? st.email : (seedSt?.email || ''),
            routeHint: st.routeHint !== undefined ? st.routeHint : (seedSt?.routeHint || ''),
            socials: st.socials !== undefined ? st.socials : seedSt?.socials,
          };
        });
      }
      if (!parsed.brandAbout) {
        parsed.brandAbout = DEFAULT_BRAND_ABOUT;
      } else if (!Array.isArray(parsed.brandAbout.methodologyBlocks) || parsed.brandAbout.methodologyBlocks.length === 0) {
        parsed.brandAbout = {
          ...parsed.brandAbout,
          methodologyBlocks: DEFAULT_METHODOLOGY_BLOCKS,
        };
      }
      if (!parsed.systemSettings) {
        parsed.systemSettings = {
          requireEmailVerificationOnLogin: false,
          publicDomainUrl: '',
          tunnelMode: 'cloudflare',
          appVersion: '1.2.0',
        };
      }
      if (Array.isArray(parsed.exercises)) {
        parsed.exercises = parsed.exercises.map((ex) => {
          const text = `${ex.category || ''} ${ex.title || ''}`.toLowerCase();
          const exType =
            ex.exerciseType ||
            (/бревн|баланс/.test(text)
              ? 'Баланс бревно'
              : /нейро|фитнес/.test(text)
              ? 'Нейро-мышечный фитнес'
              : /силов/.test(text)
              ? 'Силовое удержание'
              : /релакс|дыхан|раскрыт/.test(text)
              ? 'Релакс и дыхание'
              : /восстанов|ротац/.test(text)
              ? 'Оздоровительная практика'
              : 'Декомпрессия');
          return {
            ...ex,
            exerciseType: exType,
            visibility: ex.visibility === 'hidden' ? 'hidden' : 'public',
          };
        });
      }
      cachedDb = parsed;
      return cachedDb;
    } catch {
      // Fall back to fresh seed if file corrupted
    }
  }
  cachedDb = createInitialDatabase();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: StudioDatabase): void {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = path.join(DATA_DIR, `studio-db.tmp.${process.pid}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}
