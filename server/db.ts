import fs from 'fs';
import path from 'path';
import type { StudioDatabase } from '../src/types.ts';
import { calculateMiScale2Metrics, DEFAULT_MI_SCALE_CALIBRATION } from '../src/utils/miScale2.ts';
import { DEFAULT_BRAND_ABOUT, DEFAULT_METHODOLOGY_BLOCKS } from '../src/utils/brandAbout.ts';
import { inferExerciseDifficulty } from '../src/utils/serviceCategories.ts';
import { createInitialDatabase } from './seed.ts';

const DATA_DIR = process.env.STUDIO_DATA_DIR
  ? path.resolve(process.env.STUDIO_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'studio-db.json');

let cachedDb: StudioDatabase | null = null;

function cleanLegacySensorBrands(text: string): string {
  return text
    .replace(/тензодатчики\s+конечностей\s+ESP32/gi, 'Тензодатчики конечностей')
    .replace(/Тензодатчики\s+ESP32/gi, 'Тензодатчики конечностей')
    .replace(/тензодатчиков\s+ESP32/gi, 'тензодатчиков конечностей')
    .replace(/по\s+датчикам\s+ESP32/gi, 'по тензодатчикам конечностей, позволяющим точно фиксировать нагрузку')
    .replace(/на\s+конечности\s+ESP32/gi, 'тензодатчиками конечностей, позволяющими точно фиксировать нагрузку')
    .replace(/\s*ESP32-S3\s*\+\s*4×HX711 Load Cell/gi, 'Тензодатчики конечностей, позволяющие точно фиксировать нагрузку (4 канала)')
    .replace(/\bESP32\b/gi, 'тензодатчики конечностей')
    .replace(/Мио-датчики\s+MYOblue/gi, 'Миодатчики')
    .replace(/Wireless\s+EMG\s+MYOblue\s*v?[\d.]*\s*\(2-ch\)/gi, 'Беспроводные миодатчики ЭМГ (2 канала)')
    .replace(/миографии\s+MYOblue\s*(?:EMG)?/gi, 'миодатчиков')
    .replace(/Миография\s*\(MYOblue\s*EMG\)/gi, 'Миография (миодатчики ЭМГ)')
    .replace(/BLE-датчиков\s+MYOblue,\s*Wahoo\s+TICKR\s+FIT,\s*тонометра\s+B05,\s*весов\s+Xiaomi\s+Mi\s+Scale\s+2\s+и\s+тензодатчиков\s+конечностей/gi, 'миодатчиков, пульсометра, тонометра, весов и тензодатчиков конечностей, позволяющих точно фиксировать нагрузку')
    .replace(/\bMYOblue(?:\s+EMG)?\b/gi, 'миодатчики')
    .replace(/Пульсометр\s+Wahoo\s+TICKR\s+FIT/gi, 'Пульсометр')
    .replace(/Wahoo\s+TICKR\s+FIT\s+Optical\s+Armband/gi, 'Оптический пульсометр на предплечье')
    .replace(/кардиоконтролем\s+Wahoo\s+TICKR\s+FIT/gi, 'контролем пульсометра')
    .replace(/\(\s*Wahoo\s+TICKR\s+FIT\s*\)/gi, '(пульсометр)')
    .replace(/ЧСС\s*\(Wahoo\s+TICKR\s+FIT\)/gi, 'пульсометра')
    .replace(/\bWahoo\s+TICKR\s+FIT\b/gi, 'пульсометр')
    .replace(/Тонометр\s+Bluetooth\s+B05/gi, 'Тонометр')
    .replace(/BPM-B05\s+Auto\s+BLE\s+Cuff/gi, 'Автоматический беспроводной тонометр')
    .replace(/тонометра\s+B05/gi, 'тонометра')
    .replace(/контроль\s+B05/gi, 'контроль тонометром')
    .replace(/\bи\s+B05\b/gi, 'и тонометром')
    .replace(/\bB05\b/gi, 'Тонометр');
}

const LEGACY_METHODOLOGY_TITLE_MAP: Record<string, string> = {
  'Спорт ZA ПравИло': 'ПравИло и спорт',
  'Офис выбирает ПравИло': 'ПравИло и офис',
  'Возраст ZA ПравИло': 'ПравИло и возраст',
  'Дети ZA ПравИло': 'ПравИло и дети',
  'Мамочки ZA ПравИло': 'ПравИло и мамочки',
};

function cleanLegacyMethodologyTitle(title: string): string {
  const trimmed = (title || '').trim();
  if (LEGACY_METHODOLOGY_TITLE_MAP[trimmed]) {
    return LEGACY_METHODOLOGY_TITLE_MAP[trimmed];
  }
  if (/\bza\b/i.test(trimmed)) {
    const cleaned = trimmed
      .replace(/\s*\bza\b\s*ПравИло/gi, '')
      .replace(/\bza\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned) {
      return `ПравИло и ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
    }
  }
  return title;
}

function normalizeLegacyHardwareLabels(db: StudioDatabase): boolean {
  let changed = false;

  if (Array.isArray(db.equipment)) {
    db.equipment = db.equipment.map((d) => {
      if (d.type === 'esp32_limbs' && (d.name.includes('ESP32') || d.model.includes('ESP32'))) {
        changed = true;
        return {
          ...d,
          name: 'Тензодатчики конечностей',
          model: 'Тензодатчики конечностей, позволяющие точно фиксировать нагрузку (4 канала)',
        };
      }
      if (d.type === 'myoblue_emg' && (d.name.includes('MYOblue') || d.model.includes('MYOblue'))) {
        changed = true;
        return {
          ...d,
          name: 'Миодатчики',
          model: 'Беспроводные миодатчики ЭМГ (2 канала)',
        };
      }
      if (d.type === 'wahoo_tickr' && (d.name.includes('Wahoo') || d.model.includes('Wahoo') || d.name.includes('TICKR'))) {
        changed = true;
        return {
          ...d,
          name: 'Пульсометр',
          model: 'Оптический пульсометр на предплечье',
        };
      }
      if (d.type === 'bp_b05' && (d.name.includes('B05') || d.model.includes('B05'))) {
        changed = true;
        return {
          ...d,
          name: 'Тонометр',
          model: 'Автоматический беспроводной тонометр',
        };
      }
      return d;
    });
  }

  if (db.brandAbout) {
    const ba = db.brandAbout;
    const nextSub = cleanLegacySensorBrands(ba.homeSubtitle || '');
    const nextPoints = (ba.whyUsPoints || []).map(cleanLegacySensorBrands);
    const nextBlocks = (ba.methodologyBlocks || []).map((b) => ({
      ...b,
      title: cleanLegacyMethodologyTitle(b.title || ''),
      contraindicationsNote: b.contraindicationsNote ? cleanLegacySensorBrands(b.contraindicationsNote) : b.contraindicationsNote,
    }));
    if (
      nextSub !== (ba.homeSubtitle || '') ||
      JSON.stringify(nextPoints) !== JSON.stringify(ba.whyUsPoints || []) ||
      JSON.stringify(nextBlocks) !== JSON.stringify(ba.methodologyBlocks || [])
    ) {
      changed = true;
      db.brandAbout = {
        ...ba,
        homeSubtitle: nextSub,
        whyUsPoints: nextPoints,
        methodologyBlocks: nextBlocks,
      };
    }
  }

  if (Array.isArray(db.services)) {
    db.services = db.services.map((s) => {
      const nextDesc = cleanLegacySensorBrands(s.description || '');
      if (nextDesc !== (s.description || '')) {
        changed = true;
        return { ...s, description: nextDesc };
      }
      return s;
    });
  }

  if (Array.isArray(db.users)) {
    db.users = db.users.map((u) => {
      if (!u.trainerProfile) return u;
      const tp = u.trainerProfile;
      const nextBio = cleanLegacySensorBrands(tp.bio || '');
      const nextStyle = cleanLegacySensorBrands(tp.workStyle || '');
      const nextSkills = (tp.skills || []).map(cleanLegacySensorBrands);
      if (
        nextBio !== (tp.bio || '') ||
        nextStyle !== (tp.workStyle || '') ||
        JSON.stringify(nextSkills) !== JSON.stringify(tp.skills || [])
      ) {
        changed = true;
        return {
          ...u,
          trainerProfile: {
            ...tp,
            bio: nextBio,
            workStyle: nextStyle,
            skills: nextSkills,
          },
        };
      }
      return u;
    });
  }

  if (Array.isArray(db.clients)) {
    db.clients = db.clients.map((c) => {
      const nextContra = cleanLegacySensorBrands(c.contraindications || '');
      let anthroChanged = false;
      const nextAnthro = (c.anthropometry || []).map((a) => {
        const nextNote = a.notes ? cleanLegacySensorBrands(a.notes) : a.notes;
        if (nextNote !== a.notes) {
          anthroChanged = true;
          return { ...a, notes: nextNote };
        }
        return a;
      });
      if (nextContra !== (c.contraindications || '') || anthroChanged) {
        changed = true;
        return { ...c, contraindications: nextContra, anthropometry: nextAnthro };
      }
      return c;
    });
  }

  return changed;
}

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
            ownerApproved: typeof u.ownerApproved === 'boolean' ? u.ownerApproved : true,
            tokenVersion: typeof u.tokenVersion === 'number' ? u.tokenVersion : 1,
            trainerProfile: u.trainerProfile ?? seedUser?.trainerProfile,
          };
        });
      }
      if (Array.isArray(parsed.sessions)) {
        const seedSessionsMap = new Map(createInitialDatabase().sessions.map((ss) => [ss.id, ss]));
        parsed.sessions = parsed.sessions.map((s) => {
          const seedSes = seedSessionsMap.get(s.id);
          if (!seedSes) return s;
          if (!Array.isArray(s.telemetrySeries) || s.telemetrySeries.length === 0) {
            return {
              ...seedSes,
              ...s,
              minWinchKg: s.minWinchKg ?? seedSes.minWinchKg,
              minLimbLoads: s.minLimbLoads ?? seedSes.minLimbLoads,
              emgStats: s.emgStats ?? seedSes.emgStats,
              minHrBpm: s.minHrBpm ?? seedSes.minHrBpm,
              maxHrBpm: s.maxHrBpm ?? seedSes.maxHrBpm,
              weightBeforeKg: s.weightBeforeKg ?? seedSes.weightBeforeKg,
              weightAfterKg: s.weightAfterKg ?? seedSes.weightAfterKg,
              postureBeforeSummary: s.postureBeforeSummary ?? seedSes.postureBeforeSummary,
              postureAfterSummary: s.postureAfterSummary ?? seedSes.postureAfterSummary,
              completedExercises:
                s.completedExercises?.some((ex) => typeof ex.clientRating === 'number')
                  ? s.completedExercises
                  : seedSes.completedExercises,
              telemetrySeries: seedSes.telemetrySeries,
            };
          }
          return s;
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
          const trainerUsers = (parsed.users || []).filter((u) => u.role === 'trainer');
          const trainerById = new Map(trainerUsers.map((u) => [u.id, u]));
          let assignedTrainerId = c.assignedTrainerId;
          let assignedTrainerName = c.assignedTrainerName;
          const revokedSet = new Set(Array.isArray(c.revokedTrainerIds) ? c.revokedTrainerIds : []);

          if (assignedTrainerId) {
            const tr = trainerById.get(assignedTrainerId);
            if (tr) assignedTrainerName = tr.name;
          } else {
            const latestSes = (parsed.sessions || []).find(
              (s) => s.clientId === c.id && trainerById.has(s.trainerId) && !revokedSet.has(s.trainerId)
            );
            const latestBk = (parsed.bookings || []).find(
              (b) => b.clientId === c.id && b.status !== 'cancelled' && trainerById.has(b.trainerId) && !revokedSet.has(b.trainerId)
            );
            const inferredTrainer =
              (latestSes ? trainerById.get(latestSes.trainerId) : undefined) ||
              (latestBk ? trainerById.get(latestBk.trainerId) : undefined);
            if (inferredTrainer) {
              assignedTrainerId = inferredTrainer.id;
              assignedTrainerName = inferredTrainer.name;
            }
          }

          return {
            ...c,
            gender,
            birthDate,
            clientStatus: c.clientStatus || 'active',
            assignedTrainerId,
            assignedTrainerName,
            guestTrainerIds: Array.isArray(c.guestTrainerIds) ? c.guestTrainerIds : undefined,
            revokedTrainerIds: Array.isArray(c.revokedTrainerIds) ? c.revokedTrainerIds : undefined,
            handoverHistory: Array.isArray(c.handoverHistory) ? c.handoverHistory : undefined,
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
            difficulty: inferExerciseDifficulty(ex),
            visibility: ex.visibility === 'hidden' ? 'hidden' : 'public',
          };
        });
      }
      if (!Array.isArray(parsed.legalAcceptances)) {
        parsed.legalAcceptances = [];
      }
      if (parsed.legalDocuments !== undefined && !Array.isArray(parsed.legalDocuments)) {
        parsed.legalDocuments = undefined;
      }
      if (parsed.legalBundleVersion !== undefined && typeof parsed.legalBundleVersion !== 'string') {
        parsed.legalBundleVersion = undefined;
      }
      if (normalizeLegacyHardwareLabels(parsed)) {
        saveDb(parsed);
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
