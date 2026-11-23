import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { getDb, saveDb } from './server/db.ts';
import type {
  UserAccount,
  UserRole,
  Studio,
  TrainerSchedule,
  ServiceItem,
  PromoCode,
  SubscriptionPlan,
  ClientSubscription,
  Booking,
  Exercise,
  ExerciseLimbAngleMatrix,
  WorkoutProgram,
  ClientProfile,
  TrainingSessionRecord,
  NotificationTemplate,
  NotificationLog,
  AnthropometryRecord,
  MessagingSettings,
  MessengerChannel,
  MessengerMessage,
  LiveHardwarePacket,
  TrainerBlogPost,
  TrainerBlogPlatform,
  RatingReview,
  ReviewTargetType,
  StudioDatabase,
  SystemSecuritySettings,
} from './src/types.ts';
import { calculateMiScale2Metrics } from './src/utils/miScale2.ts';
import { isValidStudioPhotoSrc } from './src/utils/reviews.ts';
import {
  formatStudioOpenHours,
  getStudioHoursForDate,
  isTimeWithinOpenHours,
  isWeekendDate,
  parseStudioScheduleHours,
} from './src/utils/studioHours.ts';
import {
  inferExerciseType,
  inferServiceCategory,
} from './src/utils/serviceCategories.ts';
import { sanitizeTrainerProfile } from './src/utils/trainerProfile.ts';
import { sanitizePostureAssessmentInput } from './src/utils/postureGeometry.ts';
import {
  DEFAULT_BRAND_ABOUT,
  sanitizeBrandAboutInput,
  sanitizeStudioSocials,
} from './src/utils/brandAbout.ts';

const execFileAsync = promisify(execFile);

const PORT = 3000;
const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface AuthTokenPayload {
  userId: string;
  role: UserRole;
  tokenVersion?: number;
  exp: number;
}

interface EmailCodeRecord {
  userId: string;
  email: string;
  purpose: 'verify_email' | 'reset_password' | 'login_2fa';
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

const emailCodeStore = new Map<string, EmailCodeRecord>();

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function maskEmail(email: string): string {
  const trimmed = (email || '').trim();
  const at = trimmed.indexOf('@');
  if (at <= 1) return trimmed ? '***' : '';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

async function sendEmailCode(params: {
  db: StudioDatabase;
  user: UserAccount;
  email: string;
  purpose: 'verify_email' | 'reset_password' | 'login_2fa';
}): Promise<{ sentViaSmtp: boolean; maskedEmail: string; smtpConfigured: boolean; error?: string }> {
  const { db, user, email, purpose } = params;
  const code = String(crypto.randomInt(100000, 1000000));
  const key = `${purpose}:${user.id}`;
  emailCodeStore.set(key, {
    userId: user.id,
    email: email.trim().toLowerCase(),
    purpose,
    codeHash: hashCode(code),
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0,
  });

  const cfg = db.messagingSettings?.email;
  const smtpConfigured = Boolean(cfg?.enabled && cfg?.host && cfg?.user && cfg?.password);
  const masked = maskEmail(email);

  if (!smtpConfigured || !cfg) {
    return { sentViaSmtp: false, maskedEmail: masked, smtpConfigured: false };
  }

  const subjectMap: Record<EmailCodeRecord['purpose'], string> = {
    verify_email: 'Подтверждение E-mail · ЭТАЛОН ПРАВИЛО',
    reset_password: 'Код сброса пароля · ЭТАЛОН ПРАВИЛО',
    login_2fa: 'Код подтверждения входа · ЭТАЛОН ПРАВИЛО',
  };
  const bodyMap: Record<EmailCodeRecord['purpose'], string> = {
    verify_email: `Здравствуйте, ${user.name}!\n\nВаш код подтверждения E-mail: ${code}\nКод действует 15 минут.`,
    reset_password: `Здравствуйте, ${user.name}!\n\nКод для сброса пароля учётной записи (${user.login}): ${code}\nКод действует 15 минут. Если вы не запрашивали сброс, проигнорируйте это письмо.`,
    login_2fa: `Код подтверждения входа для ${user.login}: ${code}\nКод действует 15 минут.`,
  };

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port) || 465,
      secure: Boolean(cfg.secure),
      auth: { user: cfg.user, pass: cfg.password },
    });
    await transporter.sendMail({
      from: `"${cfg.fromName || 'ЭТАЛОН ПРАВИЛО'}" <${cfg.fromEmail || cfg.user}>`,
      to: email.trim(),
      subject: subjectMap[purpose],
      text: bodyMap[purpose],
    });
    return { sentViaSmtp: true, maskedEmail: masked, smtpConfigured: true };
  } catch (err) {
    return {
      sentViaSmtp: false,
      maskedEmail: masked,
      smtpConfigured: true,
      error: err instanceof Error ? err.message : 'Ошибка SMTP',
    };
  }
}

function verifyEmailCode(params: {
  userId: string;
  purpose: EmailCodeRecord['purpose'];
  code: string;
  consume?: boolean;
}): { ok: boolean; error?: string } {
  const key = `${params.purpose}:${params.userId}`;
  const rec = emailCodeStore.get(key);
  if (!rec) {
    return { ok: false, error: 'Код не запрашивался или устарел. Запросите новый код.' };
  }
  if (Date.now() > rec.expiresAt) {
    emailCodeStore.delete(key);
    return { ok: false, error: 'Срок действия кода истёк. Запросите новый код.' };
  }
  if (rec.attempts >= 5) {
    emailCodeStore.delete(key);
    return { ok: false, error: 'Превышено число попыток. Запросите новый код.' };
  }
  if (hashCode(params.code.trim()) !== rec.codeHash) {
    rec.attempts += 1;
    return { ok: false, error: 'Неверный код подтверждения.' };
  }
  if (params.consume !== false) {
    emailCodeStore.delete(key);
  }
  return { ok: true };
}

function signToken(payload: AuthTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as AuthTokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function stripPassword(user: UserAccount & { passwordHash?: string }): UserAccount {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function redactClientForTrainer(client: ClientProfile): ClientProfile {
  return {
    ...client,
    userId: undefined,
    phone: 'Скрыто (защита базы)',
    email: 'Скрыто',
    telegram: 'Скрыто',
    telegramChatId: undefined,
  };
}

function getTrainerAssignedClientIds(db: StudioDatabase, trainerId: string, trainerName: string): Set<string> {
  const ids = new Set<string>();
  db.bookings.forEach((b) => {
    if (b.trainerId === trainerId && b.clientId) ids.add(b.clientId);
  });
  db.sessions.forEach((s) => {
    if (s.trainerId === trainerId && s.clientId) ids.add(s.clientId);
  });
  db.programs.forEach((p) => {
    if ((p.createdByUserId === trainerId || p.createdBy === trainerName) && p.clientId) {
      ids.add(p.clientId);
    }
  });
  return ids;
}

function canUserViewExercise(ex: Exercise, user: UserAccount): boolean {
  const vis = ex.visibility || 'public';
  if (vis === 'public') return true;
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (user.role === 'trainer') {
    return (
      ex.createdByUserId === user.id ||
      (!ex.createdByUserId && ex.createdBy === user.name)
    );
  }
  return false;
}

function sanitizeMessagingSettings(settings?: MessagingSettings): MessagingSettings | undefined {
  if (!settings) return undefined;
  return {
    email: {
      ...settings.email,
      password: settings.email.password ? '••••••••' : '',
      hasPassword: Boolean(settings.email.password),
    },
    telegram: {
      ...settings.telegram,
      botToken: settings.telegram.botToken ? '••••••••' : '',
      hasBotToken: Boolean(settings.telegram.botToken),
    },
    whatsapp: {
      ...settings.whatsapp,
      accessToken: settings.whatsapp.accessToken ? '••••••••' : '',
      hasAccessToken: Boolean(settings.whatsapp.accessToken),
    },
  };
}

async function deliverExternalNotification(params: {
  settings?: MessagingSettings;
  channel: 'email' | 'telegram' | 'whatsapp' | 'push' | 'web_chat';
  client?: ClientProfile;
  subject: string;
  text: string;
}): Promise<{ deliveryStatus: 'delivered' | 'sent' | 'queued' | 'failed'; deliveryNote: string }> {
  const { settings, channel, client, subject, text } = params;
  if (channel === 'push' || channel === 'web_chat') {
    return { deliveryStatus: 'delivered', deliveryNote: 'Доставлено по WebSocket / PWA' };
  }

  if (channel === 'email') {
    const cfg = settings?.email;
    if (!cfg?.enabled || !cfg.host || !cfg.user || !cfg.password) {
      return {
        deliveryStatus: 'queued',
        deliveryNote: 'Журнал рассылки (укажите и включите SMTP в «Настройка Email и ботов»)',
      };
    }
    if (!client?.email) {
      return { deliveryStatus: 'failed', deliveryNote: 'У клиента не указан Email' };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port) || 465,
        secure: Boolean(cfg.secure),
        auth: { user: cfg.user, pass: cfg.password },
      });
      await transporter.sendMail({
        from: `"${cfg.fromName || 'ЭТАЛОН ПРАВИЛО'}" <${cfg.fromEmail || cfg.user}>`,
        to: client.email,
        subject: subject || 'Уведомление от ЭТАЛОН ПРАВИЛО',
        text,
      });
      return { deliveryStatus: 'delivered', deliveryNote: `Отправлено через SMTP (${cfg.host})` };
    } catch (err) {
      return {
        deliveryStatus: 'failed',
        deliveryNote: `SMTP ошибка: ${err instanceof Error ? err.message : 'не удалось отправить'}`,
      };
    }
  }

  if (channel === 'telegram') {
    const tg = settings?.telegram;
    if (!tg?.enabled || !tg.botToken) {
      return {
        deliveryStatus: 'queued',
        deliveryNote: 'Сохранено в диалоге (подключите Telegram Bot Token в настройках)',
      };
    }
    if (!client?.telegramChatId) {
      return {
        deliveryStatus: 'sent',
        deliveryNote: 'Бот активен; ожидает первого /start от клиента для привязки chat_id',
      };
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: client.telegramChatId,
          text,
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return { deliveryStatus: 'failed', deliveryNote: `Telegram API: ${errBody.slice(0, 120)}` };
      }
      return { deliveryStatus: 'delivered', deliveryNote: `Доставлено через ${tg.botUsername || 'Telegram Bot'}` };
    } catch (err) {
      return {
        deliveryStatus: 'failed',
        deliveryNote: `Ошибка сети Telegram: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (channel === 'whatsapp') {
    const wa = settings?.whatsapp;
    if (!wa?.enabled || (!wa.accessToken && !wa.webhookUrl)) {
      return {
        deliveryStatus: 'queued',
        deliveryNote: 'Сохранено в диалоге (настройте WhatsApp API / Webhook)',
      };
    }
    try {
      if (wa.provider === 'cloud_api' && wa.phoneNumberId && wa.accessToken && client?.phone) {
        const cleanPhone = client.phone.replace(/\D/g, '');
        const resp = await fetch(`https://graph.facebook.com/v20.0/${wa.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${wa.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'text',
            text: { body: text },
          }),
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          return { deliveryStatus: 'failed', deliveryNote: `WhatsApp Cloud API: ${errBody.slice(0, 120)}` };
        }
        return { deliveryStatus: 'delivered', deliveryNote: 'Отправлено через WhatsApp Cloud API' };
      }
      if (wa.webhookUrl) {
        const resp = await fetch(wa.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(wa.accessToken ? { Authorization: `Bearer ${wa.accessToken}` } : {}),
          },
          body: JSON.stringify({
            phone: client?.phone || '',
            clientName: client?.name || '',
            message: text,
          }),
        });
        return resp.ok
          ? { deliveryStatus: 'delivered', deliveryNote: 'Отправлено через шлюз WhatsApp' }
          : { deliveryStatus: 'failed', deliveryNote: `HTTP ${resp.status} от шлюза WhatsApp` };
      }
      return { deliveryStatus: 'queued', deliveryNote: 'Укажите Phone ID или Webhook URL' };
    } catch (err) {
      return {
        deliveryStatus: 'failed',
        deliveryNote: `Ошибка WhatsApp шлюза: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return { deliveryStatus: 'sent', deliveryNote: 'Обработано' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcast(event: string, payload: unknown) {
    const msg = JSON.stringify({ event, payload, ts: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  function getLocalDateParts(): { dateStr: string; monthDay: string; year: number } {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, monthDay: `${m}-${d}`, year: y };
  }

  function runBirthdayPushDispatch(options?: { force?: boolean; clientIds?: string[] }): NotificationLog[] {
    const db = getDb();
    if (!options?.force && db.birthdayAutomationEnabled === false) {
      return [];
    }
    const { monthDay, year } = getLocalDateParts();
    const birthdayTpl = db.templates.find((t) => t.trigger === 'birthday') || {
      id: 'tpl-birthday-push',
      name: 'Поздравление с Днём рождения (авто-Push)',
      channel: 'push' as const,
      trigger: 'birthday' as const,
      subject: 'С Днём рождения от ЭТАЛОН ПРАВИЛО!',
      body: 'Дорогой клиент {{client_name}}, поздравляем с Днём рождения! Желаем лёгкости в теле и крепкой осанки. Дарим −20% на следующую сессию в студии ({{studio_address}}). Ваш кабинет: {{cabinet_link}}',
    };

    const createdLogs: NotificationLog[] = [];
    let dirty = false;

    for (const cl of db.clients) {
      if (options?.clientIds && !options.clientIds.includes(cl.id)) continue;
      const clMd = (cl.birthDate || '').slice(5, 10);
      const isBirthdayToday = clMd === monthDay;
      if (!isBirthdayToday && !options?.force) continue;
      if (!options?.force && cl.lastBirthdayGreetingYear === year) continue;

      const studio = db.studios.find((s) => s.id === cl.studioId) || db.studios[0];
      const activeSub = db.clientSubscriptions.find((s) => s.clientId === cl.id && s.status === 'active');
      const cabinetLink = `/?cabinet=client&clientId=${cl.id}`;

      const rendered = birthdayTpl.body
        .replace(/\{\{client_name\}\}/g, cl.name)
        .replace(/\{\{session_date\}\}/g, new Date().toISOString().slice(0, 10))
        .replace(/\{\{session_time\}\}/g, '12:00')
        .replace(/\{\{trainer_name\}\}/g, 'команда студии')
        .replace(/\{\{service_name\}\}/g, 'Праздничная сессия ПравИло')
        .replace(/\{\{studio_address\}\}/g, studio?.address || '')
        .replace(/\{\{amount\}\}/g, '3360')
        .replace(/\{\{remaining_sessions\}\}/g, String(activeSub?.remainingSessions ?? 0))
        .replace(/\{\{cabinet_link\}\}/g, cabinetLink);

      const log: NotificationLog = {
        id: uid('nlog'),
        templateId: birthdayTpl.id,
        channel: 'push',
        recipientName: cl.name,
        recipientContact: cl.telegram || cl.email || cl.phone,
        clientId: cl.id,
        subject: birthdayTpl.subject,
        messagePreview: rendered,
        cabinetLink,
        status: 'delivered',
        sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };

      db.notificationLogs.unshift(log);
      cl.lastBirthdayGreetingYear = year;
      createdLogs.push(log);
      dirty = true;
      broadcast('notification:push', log);
    }

    if (dirty) {
      saveDb(db);
    }
    return createdLogs;
  }

  // Run automatic birthday check at server boot and hourly
  runBirthdayPushDispatch();
  const birthdayTimer = setInterval(() => {
    runBirthdayPushDispatch();
  }, 60 * 60 * 1000);
  birthdayTimer.unref();

  wss.on('connection', (ws) => {
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    ws.send(JSON.stringify({ event: 'ws:connected', payload: { ok: true }, ts: Date.now() }));
    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed?.event === 'telemetry:live') {
          broadcast('telemetry:live', parsed.payload);
        }
      } catch {
        // Ignore malformed frame
      }
    });
    const pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(pingTimer);
        return;
      }
      if (!alive) {
        ws.terminate();
        clearInterval(pingTimer);
        return;
      }
      alive = false;
      try {
        ws.ping();
      } catch {
        clearInterval(pingTimer);
      }
    }, 25_000);
    pingTimer.unref();
    ws.on('close', () => clearInterval(pingTimer));
  });

  // Auth middleware
  function requireAuth(roles?: UserRole[]) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Требуется авторизация' });
      }
      const db = getDb();
      const user = db.users.find((u) => u.id === payload.userId);
      if (!user || !user.active || user.employmentStatus === 'fired') {
        return res.status(401).json({ error: 'Доступ к приложению закрыт или аккаунт отключён' });
      }
      if ((payload.tokenVersion ?? 1) !== (user.tokenVersion ?? 1)) {
        return res.status(401).json({ error: 'Сессия аннулирована после сброса пароля. Войдите заново.' });
      }
      if (roles && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав доступа для этой операции' });
      }
      (req as express.Request & { currentUser: UserAccount }).currentUser = stripPassword(user);
      next();
    };
  }

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Login (supports login or email, enforces employmentStatus and optional E-mail 2FA)
  app.post('/api/auth/login', async (req, res) => {
    const { login, password, emailCode } = req.body as {
      login?: string;
      password?: string;
      emailCode?: string;
    };
    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин (или E-mail) и пароль' });
    }
    const db = getDb();
    const q = login.trim().toLowerCase();
    const found = db.users.find(
      (u) => u.login.toLowerCase() === q || (u.email && u.email.toLowerCase() === q)
    );
    if (!found) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    if (!found.active || found.employmentStatus === 'fired') {
      return res.status(403).json({
        error: 'Доступ к приложению закрыт (сотрудник уволен или аккаунт заблокирован). Обратитесь к владельцу.',
      });
    }
    const valid = bcrypt.compareSync(password, found.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (db.systemSettings?.requireEmailVerificationOnLogin && found.email) {
      if (!emailCode || !emailCode.trim()) {
        const sendRes = await sendEmailCode({
          db,
          user: found,
          email: found.email,
          purpose: 'login_2fa',
        });
        return res.status(403).json({
          requiresEmailCode: true,
          maskedEmail: sendRes.maskedEmail,
          sentViaSmtp: sendRes.sentViaSmtp,
          error: sendRes.sentViaSmtp
            ? `Код подтверждения отправлен на ${sendRes.maskedEmail}`
            : 'Включена проверка по E-mail, но SMTP не настроен. Отключите требование 2FA у владельца или настройте SMTP.',
        });
      }
      const check = verifyEmailCode({
        userId: found.id,
        purpose: 'login_2fa',
        code: emailCode,
        consume: true,
      });
      if (!check.ok) {
        return res.status(401).json({ requiresEmailCode: true, error: check.error });
      }
      found.emailVerified = true;
    }

    found.lastLoginAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    saveDb(db);

    const token = signToken({
      userId: found.id,
      role: found.role,
      tokenVersion: found.tokenVersion ?? 1,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ token, user: stripPassword(found) });
  });

  app.get('/api/auth/me', requireAuth(), (req, res) => {
    const user = (req as express.Request & { currentUser: UserAccount }).currentUser;
    res.json({ user });
  });

  function makeAvatarInitials(fullName: string): string {
    const letters = fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
    return letters || 'ПП';
  }

  app.patch('/api/auth/profile', requireAuth(), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const user = db.users.find((u) => u.id === currentUser.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const {
      name,
      phone,
      email,
      telegramHandle,
      studioId,
      gender,
      birthDate,
      goal,
      contraindications,
      trainerProfile,
    } = (req.body || {}) as {
      name?: string;
      phone?: string;
      email?: string;
      telegramHandle?: string;
      studioId?: string | null;
      gender?: 'male' | 'female';
      birthDate?: string;
      goal?: string;
      contraindications?: string;
      trainerProfile?: unknown;
    };

    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'ФИО не может быть пустым' });
      }
      user.name = trimmed;
      user.avatarInitials = makeAvatarInitials(trimmed);
    }
    if (typeof phone === 'string') user.phone = phone.trim();
    if (typeof telegramHandle === 'string') user.telegramHandle = telegramHandle.trim();
    if (typeof studioId === 'string' && db.studios.some((s) => s.id === studioId)) {
      user.studioId = studioId;
    }
    if (typeof email === 'string') {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== (user.email || '').toLowerCase()) {
        user.email = nextEmail;
        user.emailVerified = false;
      }
    }
    if (
      trainerProfile !== undefined &&
      (user.role === 'trainer' || user.role === 'owner' || user.role === 'admin')
    ) {
      user.trainerProfile = sanitizeTrainerProfile(trainerProfile);
    }

    const linkedClient = db.clients.find((c) => c.userId === user.id);
    if (linkedClient) {
      linkedClient.name = user.name;
      linkedClient.phone = user.phone;
      linkedClient.email = user.email;
      linkedClient.telegram = user.telegramHandle;
      if (user.studioId && db.studios.some((s) => s.id === user.studioId)) {
        linkedClient.studioId = user.studioId;
      }
      if (gender === 'male' || gender === 'female') {
        linkedClient.gender = gender;
      }
      if (typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        if (birthDate !== linkedClient.birthDate) {
          linkedClient.lastBirthdayGreetingYear = undefined;
        }
        linkedClient.birthDate = birthDate;
        linkedClient.birthYear = Number(birthDate.slice(0, 4)) || linkedClient.birthYear;
      }
      if (typeof goal === 'string') linkedClient.goal = goal.trim();
      if (typeof contraindications === 'string') {
        linkedClient.contraindications = contraindications.trim();
      }
    }

    saveDb(db);
    const safeUser = stripPassword(user);
    broadcast('user:updated', safeUser);
    if (linkedClient) {
      broadcast('client:updated', linkedClient);
    }
    res.json({ user: safeUser, client: linkedClient || null });
  });

  app.post('/api/auth/request-email-code', async (req, res) => {
    const db = getDb();
    const { loginOrEmail, email, purpose } = (req.body || {}) as {
      loginOrEmail?: string;
      email?: string;
      purpose?: 'verify_email' | 'reset_password';
    };

    const targetPurpose: 'verify_email' | 'reset_password' =
      purpose === 'verify_email' ? 'verify_email' : 'reset_password';

    let user: (UserAccount & { passwordHash: string }) | undefined;
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload) {
        user = db.users.find((u) => u.id === payload.userId && u.active);
      }
    }

    if (!user && loginOrEmail) {
      const q = loginOrEmail.trim().toLowerCase();
      user = db.users.find(
        (u) => u.login.toLowerCase() === q || (u.email && u.email.toLowerCase() === q)
      );
    }

    if (!user || !user.active || user.employmentStatus === 'fired') {
      return res.status(404).json({ error: 'Активная учётная запись с таким логином или E-mail не найдена' });
    }

    const targetEmail = (email || user.email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Для этой учётной записи не указан корректный E-mail' });
    }
    if (email && user.email !== targetEmail && targetPurpose === 'verify_email') {
      user.email = targetEmail.toLowerCase();
      user.emailVerified = false;
      saveDb(db);
    }

    const result = await sendEmailCode({
      db,
      user,
      email: targetEmail,
      purpose: targetPurpose,
    });

    if (result.error) {
      return res.status(400).json({ error: `Ошибка отправки письма: ${result.error}` });
    }

    res.json({
      ok: true,
      maskedEmail: result.maskedEmail,
      sentViaSmtp: result.sentViaSmtp,
      smtpConfigured: result.smtpConfigured,
      message: result.sentViaSmtp
        ? `Код подтверждения отправлен на ${result.maskedEmail}`
        : `SMTP-сервер рассылки не включён. Настройте E-mail SMTP в «Рассылки и чаты» или обратитесь к администратору для сброса пароля.`,
    });
  });

  app.post('/api/auth/confirm-email', requireAuth(), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const { code } = req.body as { code?: string };
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Введите код из письма' });
    }
    const check = verifyEmailCode({
      userId: currentUser.id,
      purpose: 'verify_email',
      code,
      consume: true,
    });
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    const db = getDb();
    const user = db.users.find((u) => u.id === currentUser.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    user.emailVerified = true;
    saveDb(db);
    broadcast('user:updated', { user: stripPassword(user) });
    res.json({ ok: true, user: stripPassword(user) });
  });

  app.post('/api/auth/reset-password-by-email', (req, res) => {
    const { loginOrEmail, code, newPassword } = req.body as {
      loginOrEmail?: string;
      code?: string;
      newPassword?: string;
    };
    if (!loginOrEmail || !code || !newPassword) {
      return res.status(400).json({ error: 'Заполните логин/E-mail, код и новый пароль' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    }
    const db = getDb();
    const q = loginOrEmail.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.login.toLowerCase() === q || (u.email && u.email.toLowerCase() === q)
    );
    if (!user || !user.active || user.employmentStatus === 'fired') {
      return res.status(404).json({ error: 'Учётная запись не найдена или заблокирована' });
    }
    const check = verifyEmailCode({
      userId: user.id,
      purpose: 'reset_password',
      code,
      consume: true,
    });
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 8);
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    user.emailVerified = true;
    saveDb(db);
    broadcast('user:access-revoked', { userId: user.id, reason: 'Пароль обновлён' });
    res.json({ ok: true, message: 'Пароль успешно изменён. Теперь можно войти с новым паролем.' });
  });

  app.post('/api/auth/change-password', requireAuth(), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    }
    const db = getDb();
    const user = db.users.find((u) => u.id === currentUser.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Текущий пароль указан неверно' });
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 8);
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    saveDb(db);
    const freshToken = signToken({
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ ok: true, token: freshToken });
  });

  // Full / Role-Scoped State
  app.get('/api/state', requireAuth(), (req, res) => {
    const user = (req as express.Request & { currentUser: UserAccount }).currentUser;
    // Check if any client's birthday is today and auto-push hasn't fired yet this year
    runBirthdayPushDispatch();
    const db = getDb();
    const safeUsers = db.users.map(stripPassword);

    if (user.role === 'client') {
      const clientProfile = db.clients.find((c) => c.userId === user.id) || db.clients[0];
      const clientId = clientProfile?.id;
      return res.json({
        studios: db.studios,
        users: safeUsers.filter((u) => u.role === 'trainer' || u.id === user.id),
        schedules: db.schedules,
        services: db.services.filter((s) => s.active),
        promos: db.promos.filter((p) => p.active),
        subscriptionPlans: db.subscriptionPlans.filter((p) => p.active),
        clientSubscriptions: db.clientSubscriptions.filter((s) => s.clientId === clientId && s.status !== 'archived'),
        subscriptionUsages: db.subscriptionUsages.filter((u) => u.clientId === clientId),
        exercises: db.exercises.filter((ex) => canUserViewExercise(ex, user)),
        programs: db.programs.filter((p) => !p.clientId || p.clientId === clientId),
        clients: clientProfile ? [clientProfile] : [],
        bookings: db.bookings.filter((b) => b.clientId === clientId),
        equipment: [],
        sessions: db.sessions.filter((s) => s.clientId === clientId),
        templates: [],
        notificationLogs: db.notificationLogs.filter((n) => n.clientId === clientId),
        birthdayAutomationEnabled: db.birthdayAutomationEnabled ?? true,
        messagingSettings: undefined,
        messengerMessages: (db.messengerMessages || []).filter((m) => m.clientId === clientId),
        trainerPosts: (db.trainerPosts || []).filter((p) => p.status === 'published'),
        reviews: db.reviews || [],
        brandAbout: db.brandAbout || DEFAULT_BRAND_ABOUT,
      });
    }

    if (user.role === 'trainer') {
      const assignedClientIds = getTrainerAssignedClientIds(db, user.id, user.name);
      const trainerClients = db.clients
        .filter((c) => assignedClientIds.has(c.id))
        .map(redactClientForTrainer);
      const trainerBookings = db.bookings.filter((b) => b.trainerId === user.id);
      const trainerSessions = db.sessions.filter((s) => s.trainerId === user.id);
      const trainerSchedules = db.schedules.filter((s) => s.trainerId === user.id);
      const trainerClientSubscriptions = db.clientSubscriptions.filter((s) =>
        assignedClientIds.has(s.clientId)
      );
      const trainerUsers = safeUsers
        .filter((u) => u.id === user.id || u.role === 'trainer')
        .map((u) =>
          u.id === user.id
            ? u
            : { ...u, phone: '', email: '', telegramHandle: '' }
        );

      return res.json({
        studios: db.studios,
        users: trainerUsers,
        schedules: trainerSchedules,
        services: db.services.filter((s) => s.active),
        promos: db.promos.filter((p) => p.active),
        subscriptionPlans: db.subscriptionPlans.filter((p) => p.active),
        clientSubscriptions: trainerClientSubscriptions,
        subscriptionUsages: [],
        exercises: db.exercises.filter((ex) => canUserViewExercise(ex, user)),
        programs: db.programs,
        clients: trainerClients,
        bookings: trainerBookings,
        equipment: db.equipment,
        sessions: trainerSessions,
        templates: [],
        notificationLogs: [],
        birthdayAutomationEnabled: db.birthdayAutomationEnabled ?? true,
        messagingSettings: undefined,
        messengerMessages: [],
        trainerPosts: (db.trainerPosts || []).filter(
          (p) => p.trainerId === user.id || p.status === 'published'
        ),
        reviews: db.reviews || [],
        brandAbout: db.brandAbout || DEFAULT_BRAND_ABOUT,
      });
    }

    res.json({
      studios: db.studios,
      users: safeUsers,
      schedules: db.schedules,
      services: db.services,
      promos: db.promos,
      subscriptionPlans: db.subscriptionPlans,
      clientSubscriptions: db.clientSubscriptions,
      subscriptionUsages: db.subscriptionUsages,
      exercises: db.exercises.filter((ex) => canUserViewExercise(ex, user)),
      programs: db.programs,
      clients: db.clients,
      bookings: db.bookings,
      equipment: db.equipment,
      sessions: db.sessions,
      templates: db.templates,
      notificationLogs: db.notificationLogs,
      birthdayAutomationEnabled: db.birthdayAutomationEnabled ?? true,
      messagingSettings: sanitizeMessagingSettings(db.messagingSettings),
      messengerMessages: db.messengerMessages || [],
      trainerPosts: db.trainerPosts || [],
      reviews: db.reviews || [],
      brandAbout: db.brandAbout || DEFAULT_BRAND_ABOUT,
    });
  });

  // Studios
  function sanitizeStudioPhotos(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!isValidStudioPhotoSrc(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
      if (result.length >= 10) break;
    }
    return result;
  }

  app.post('/api/studios', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<Studio>;
    if (!body.name?.trim() || !body.address?.trim()) {
      return res.status(400).json({ error: 'Укажите название и адрес студии' });
    }
    const schedule = parseStudioScheduleHours({
      openHours: body.openHours,
      weekdayOpenHours: body.weekdayOpenHours,
      weekendOpenHours: body.weekendOpenHours,
    });
    if (schedule.weekday.end <= schedule.weekday.start) {
      return res.status(400).json({ error: 'В будни время закрытия должно быть позже открытия' });
    }
    if (schedule.weekend.end <= schedule.weekend.start) {
      return res.status(400).json({ error: 'В выходные время закрытия должно быть позже открытия' });
    }
    const formatted = formatStudioOpenHours(schedule.weekday, schedule.weekend);
    const studio: Studio = {
      id: uid('st'),
      name: body.name.trim(),
      city: body.city?.trim() || 'Москва',
      address: body.address.trim(),
      phone: body.phone?.trim() || '+7 (495) 000-00-00',
      email: typeof body.email === 'string' ? body.email.trim().slice(0, 120) : '',
      routeHint: typeof body.routeHint === 'string' ? body.routeHint.trim().slice(0, 240) : '',
      socials: sanitizeStudioSocials(body.socials),
      openHours: formatted.openHours,
      weekdayOpenHours: formatted.weekdayOpenHours,
      weekendOpenHours: formatted.weekendOpenHours,
      framesCount: Math.max(1, Math.min(20, Number(body.framesCount) || 1)),
      active: body.active !== undefined ? Boolean(body.active) : true,
      monthlyTargetRevenue: Math.max(0, Number(body.monthlyTargetRevenue) || 450000),
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '',
      photos: sanitizeStudioPhotos(body.photos),
    };
    db.studios.push(studio);
    saveDb(db);
    broadcast('studio:updated', studio);
    res.json(studio);
  });

  app.patch('/api/studios/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const studio = db.studios.find((s) => s.id === req.params.id);
    if (!studio) return res.status(404).json({ error: 'Студия не найдена' });
    const body = req.body as Partial<Studio>;
    if (body.name !== undefined && !String(body.name).trim()) {
      return res.status(400).json({ error: 'Название студии не может быть пустым' });
    }
    if (body.address !== undefined && !String(body.address).trim()) {
      return res.status(400).json({ error: 'Адрес студии не может быть пустым' });
    }
    if (
      typeof body.openHours === 'string' ||
      typeof body.weekdayOpenHours === 'string' ||
      typeof body.weekendOpenHours === 'string'
    ) {
      const base = parseStudioScheduleHours(studio);
      const incoming = parseStudioScheduleHours({
        openHours: body.openHours,
        weekdayOpenHours: body.weekdayOpenHours,
        weekendOpenHours: body.weekendOpenHours,
      });
      const weekday =
        typeof body.weekdayOpenHours === 'string' || typeof body.openHours === 'string'
          ? incoming.weekday
          : base.weekday;
      const weekend =
        typeof body.weekendOpenHours === 'string' || typeof body.openHours === 'string'
          ? incoming.weekend
          : base.weekend;

      if (weekday.end <= weekday.start) {
        return res.status(400).json({ error: 'В будни время закрытия должно быть позже открытия' });
      }
      if (weekend.end <= weekend.start) {
        return res.status(400).json({ error: 'В выходные время закрытия должно быть позже открытия' });
      }
      const formatted = formatStudioOpenHours(weekday, weekend);
      studio.openHours = formatted.openHours;
      studio.weekdayOpenHours = formatted.weekdayOpenHours;
      studio.weekendOpenHours = formatted.weekendOpenHours;
    }
    if (typeof body.name === 'string') studio.name = body.name.trim();
    if (typeof body.city === 'string') studio.city = body.city.trim() || 'Москва';
    if (typeof body.address === 'string') studio.address = body.address.trim();
    if (typeof body.phone === 'string') studio.phone = body.phone.trim();
    if (typeof body.email === 'string') studio.email = body.email.trim().slice(0, 120);
    if (typeof body.routeHint === 'string') {
      studio.routeHint = body.routeHint.trim().slice(0, 240);
    }
    if (body.socials !== undefined) {
      studio.socials = sanitizeStudioSocials(body.socials);
    }
    if (body.framesCount !== undefined) {
      studio.framesCount = Math.max(1, Math.min(20, Number(body.framesCount) || 1));
    }
    if (body.active !== undefined) studio.active = Boolean(body.active);
    if (body.monthlyTargetRevenue !== undefined) {
      studio.monthlyTargetRevenue = Math.max(0, Number(body.monthlyTargetRevenue) || 0);
    }
    if (typeof body.description === 'string') {
      studio.description = body.description.trim().slice(0, 2000);
    }
    if (body.photos !== undefined) {
      studio.photos = sanitizeStudioPhotos(body.photos);
    }
    saveDb(db);
    broadcast('studio:updated', studio);
    res.json(studio);
  });

  app.put('/api/brand-about', requireAuth(['owner']), (req, res) => {
    const db = getDb();
    const updated = sanitizeBrandAboutInput(
      req.body,
      db.brandAbout || DEFAULT_BRAND_ABOUT
    );
    db.brandAbout = updated;
    saveDb(db);
    broadcast('brand-about:updated', updated);
    res.json(updated);
  });

  app.delete('/api/studios/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const idx = db.studios.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Студия не найдена' });
    if (db.studios.length <= 1) {
      return res.status(400).json({ error: 'В сети должна оставаться хотя бы одна студия' });
    }
    const deletedId = db.studios[idx].id;
    db.studios.splice(idx, 1);
    const fallbackStudioId = db.studios[0]?.id || null;
    db.users.forEach((u) => {
      if (u.studioId === deletedId) {
        u.studioId = fallbackStudioId;
      }
    });
    db.schedules = db.schedules.filter((sch) => sch.studioId !== deletedId);
    if (Array.isArray(db.reviews)) {
      db.reviews = db.reviews.filter(
        (r) => !(r.targetType === 'studio' && r.targetId === deletedId)
      );
    }
    saveDb(db);
    broadcast('studio:deleted', { id: deletedId });
    res.json({ ok: true, id: deletedId });
  });

  // Reviews / Ratings for Studios & Trainers
  app.get('/api/reviews', requireAuth(), (_req, res) => {
    const db = getDb();
    res.json(db.reviews || []);
  });

  app.post('/api/reviews', requireAuth(['client']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.reviews) db.reviews = [];

    const body = req.body as {
      targetType?: ReviewTargetType;
      targetId?: string;
      rating?: number;
      comment?: string;
    };
    const targetType = body.targetType;
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
    const rating = Math.round(Number(body.rating));
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';

    if (targetType !== 'studio' && targetType !== 'trainer') {
      return res.status(400).json({ error: 'Некорректный тип оценки' });
    }
    if (!targetId) {
      return res.status(400).json({ error: 'Укажите объект оценки' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }

    if (targetType === 'studio') {
      const studio = db.studios.find((s) => s.id === targetId);
      if (!studio) return res.status(404).json({ error: 'Студия не найдена' });
    } else {
      const trainer = db.users.find((u) => u.id === targetId && u.role === 'trainer');
      if (!trainer) return res.status(404).json({ error: 'Тренер не найден' });
    }

    const clientProfile =
      db.clients.find((c) => c.userId === currentUser.id) || db.clients[0];
    const clientKey = clientProfile?.id || currentUser.id;
    const authorName = clientProfile?.name || currentUser.name;
    const todayStr = new Date().toISOString().slice(0, 10);

    const existing = db.reviews.find(
      (r) =>
        r.targetType === targetType &&
        r.targetId === targetId &&
        (r.clientId === clientKey || r.clientId === currentUser.id)
    );

    if (existing) {
      existing.rating = rating;
      existing.comment = comment;
      existing.authorName = authorName;
      existing.updatedAt = todayStr;
      saveDb(db);
      broadcast('review:updated', existing);
      return res.json(existing);
    }

    const review: RatingReview = {
      id: uid('rev'),
      targetType,
      targetId,
      clientId: clientKey,
      authorName,
      rating,
      comment,
      createdAt: todayStr,
    };
    db.reviews.unshift(review);
    saveDb(db);
    broadcast('review:updated', review);
    res.json(review);
  });

  app.delete('/api/reviews/:id', requireAuth(['owner', 'admin', 'client']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.reviews) db.reviews = [];
    const idx = db.reviews.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Отзыв не найден' });
    const rev = db.reviews[idx];
    if (currentUser.role === 'client') {
      const clientProfile =
        db.clients.find((c) => c.userId === currentUser.id) || db.clients[0];
      const clientKey = clientProfile?.id || currentUser.id;
      if (rev.clientId !== clientKey && rev.clientId !== currentUser.id) {
        return res.status(403).json({ error: 'Можно удалять только собственный отзыв' });
      }
    }
    db.reviews.splice(idx, 1);
    saveDb(db);
    broadcast('review:deleted', { id: rev.id });
    res.json({ ok: true, id: rev.id });
  });

  // Users / Staff Accounts
  app.post('/api/users', requireAuth(['owner', 'admin']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const { login, password, name, role, studioId, phone, email, telegramHandle } = req.body as {
      login?: string;
      password?: string;
      name?: string;
      role?: UserRole;
      studioId?: string | null;
      phone?: string;
      email?: string;
      telegramHandle?: string;
    };
    if (!login || !password || !name || !role) {
      return res.status(400).json({ error: 'Заполните логин, пароль, ФИО и роль' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    if (currentUser.role === 'admin' && (role === 'owner' || role === 'admin')) {
      return res.status(403).json({ error: 'Администратор может создавать только тренеров и клиентов' });
    }
    if (db.users.some((u) => u.login.toLowerCase() === login.trim().toLowerCase())) {
      return res.status(409).json({ error: 'Такой логин уже занят' });
    }
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
    const newUser = {
      id: uid('u'),
      login: login.trim(),
      passwordHash: bcrypt.hashSync(password, 8),
      name: name.trim(),
      role,
      studioId: studioId ?? db.studios[0]?.id ?? null,
      phone: phone?.trim() || '',
      email: email?.trim().toLowerCase() || '',
      emailVerified: false,
      employmentStatus: 'working' as const,
      tokenVersion: 1,
      telegramHandle: telegramHandle?.trim() || '',
      avatarInitials: initials || 'ПП',
      active: true,
    };
    db.users.push(newUser);
    saveDb(db);
    const safeUser = stripPassword(newUser);
    broadcast('user:updated', { user: safeUser });
    res.json(safeUser);
  });

  app.patch('/api/users/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (currentUser.role === 'admin' && (user.role === 'owner' || user.role === 'admin')) {
      return res.status(403).json({ error: 'Администратор может управлять только аккаунтами тренеров и клиентов' });
    }

    const {
      password,
      role,
      employmentStatus,
      active,
      email,
      name,
      phone,
      studioId,
      telegramHandle,
      trainerProfile,
    } = req.body as {
      password?: string;
      role?: UserRole;
      employmentStatus?: 'working' | 'fired';
      active?: boolean;
      email?: string;
      name?: string;
      phone?: string;
      studioId?: string | null;
      telegramHandle?: string;
      trainerProfile?: unknown;
    };

    if (role && currentUser.role === 'admin' && (role === 'owner' || role === 'admin')) {
      return res.status(403).json({ error: 'Администратор не может назначать роль администратора или владельца' });
    }

    if (user.id === currentUser.id && (employmentStatus === 'fired' || active === false)) {
      return res.status(400).json({ error: 'Нельзя уволить или заблокировать собственный аккаунт' });
    }

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim();
      user.avatarInitials = makeAvatarInitials(user.name);
    }
    if (typeof phone === 'string') user.phone = phone.trim();
    if (typeof telegramHandle === 'string') user.telegramHandle = telegramHandle.trim();
    if (studioId !== undefined) user.studioId = studioId;
    if (role && currentUser.role === 'owner') user.role = role;
    if (trainerProfile !== undefined) {
      user.trainerProfile = sanitizeTrainerProfile(trainerProfile);
    }

    if (typeof email === 'string') {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== (user.email || '').toLowerCase()) {
        user.email = nextEmail;
        user.emailVerified = false;
      }
    }

    let revoked = false;
    if (employmentStatus === 'fired') {
      user.employmentStatus = 'fired';
      user.active = false;
      user.tokenVersion = (user.tokenVersion ?? 1) + 1;
      revoked = true;
    } else if (employmentStatus === 'working') {
      user.employmentStatus = 'working';
      user.active = true;
    } else if (typeof active === 'boolean') {
      user.active = active;
      user.employmentStatus = active ? 'working' : 'fired';
      if (!active) {
        user.tokenVersion = (user.tokenVersion ?? 1) + 1;
        revoked = true;
      }
    }

    if (password && password.length >= 6) {
      user.passwordHash = bcrypt.hashSync(password, 8);
      user.tokenVersion = (user.tokenVersion ?? 1) + 1;
      revoked = true;
    }

    const linkedClient = db.clients.find((c) => c.userId === user.id);
    if (linkedClient) {
      linkedClient.name = user.name;
      linkedClient.phone = user.phone;
      linkedClient.email = user.email;
      linkedClient.telegram = user.telegramHandle;
      if (user.studioId && db.studios.some((s) => s.id === user.studioId)) {
        linkedClient.studioId = user.studioId;
      }
    }

    saveDb(db);
    const safeUser = stripPassword(user);
    broadcast('user:updated', safeUser);
    if (linkedClient) {
      broadcast('client:updated', linkedClient);
    }
    if (revoked) {
      broadcast('user:access-revoked', {
        userId: user.id,
        reason: user.employmentStatus === 'fired' ? 'Доступ к приложению закрыт (статус: уволен)' : 'Учётные данные обновлены',
      });
    }
    res.json(safeUser);
  });

  app.post('/api/users/:id/reset-password', requireAuth(['owner', 'admin']), async (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (currentUser.role === 'admin' && (user.role === 'owner' || user.role === 'admin')) {
      return res.status(403).json({ error: 'Администратор может сбрасывать пароль только тренерам и клиентам' });
    }

    const { newPassword, sendEmail } = (req.body || {}) as {
      newPassword?: string;
      sendEmail?: boolean;
    };

    const generated = !newPassword || !newPassword.trim();
    const finalPassword = generated
      ? crypto.randomBytes(6).toString('base64url').slice(0, 8)
      : newPassword!.trim();

    if (finalPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    }

    user.passwordHash = bcrypt.hashSync(finalPassword, 8);
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    saveDb(db);

    let emailed = false;
    const cfg = db.messagingSettings?.email;
    if (sendEmail && user.email && cfg?.enabled && cfg.host && cfg.user && cfg.password) {
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.host,
          port: Number(cfg.port) || 465,
          secure: Boolean(cfg.secure),
          auth: { user: cfg.user, pass: cfg.password },
        });
        await transporter.sendMail({
          from: `"${cfg.fromName || 'ЭТАЛОН ПРАВИЛО'}" <${cfg.fromEmail || cfg.user}>`,
          to: user.email,
          subject: 'Сброс пароля учётной записи · ЭТАЛОН ПРАВИЛО',
          text: `Здравствуйте, ${user.name}!\n\nАдминистратор (${currentUser.name}) сбросил пароль для вашего логина ${user.login}.\nНовый временный пароль: ${finalPassword}\nРекомендуем сменить его после входа в настройках профиля.`,
        });
        emailed = true;
      } catch {
        emailed = false;
      }
    }

    broadcast('user:access-revoked', {
      userId: user.id,
      reason: 'Пароль сброшен администратором. Войдите с новым паролем.',
    });
    res.json({
      ok: true,
      user: stripPassword(user),
      emailed,
      ...(generated ? { generatedPassword: finalPassword } : {}),
    });
  });

  // Trainer Schedules (Real-time!)
  app.post('/api/schedules', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<TrainerSchedule>;
    const startTime = body.startTime || '09:00';
    const endTime = body.endTime || '18:00';
    if (!body.trainerId) {
      return res.status(400).json({ error: 'Выберите тренера для смены' });
    }
    if (endTime <= startTime) {
      return res.status(400).json({ error: 'Время окончания смены должно быть позже начала' });
    }
    const day = Math.max(0, Math.min(6, Math.round(Number(body.dayOfWeek ?? 0))));
    const sch: TrainerSchedule = {
      id: uid('sch'),
      trainerId: body.trainerId,
      studioId: body.studioId || db.studios[0].id,
      dayOfWeek: Number.isFinite(day) ? day : 0,
      startTime,
      endTime,
      active: body.active !== false,
    };
    db.schedules.push(sch);
    saveDb(db);
    broadcast('schedule:created', sch);
    res.json(sch);
  });

  app.patch('/api/schedules/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const sch = db.schedules.find((s) => s.id === req.params.id);
    if (!sch) return res.status(404).json({ error: 'Смена в графике не найдена' });

    const body = req.body as Partial<TrainerSchedule>;
    const nextStart = typeof body.startTime === 'string' && body.startTime ? body.startTime : sch.startTime;
    const nextEnd = typeof body.endTime === 'string' && body.endTime ? body.endTime : sch.endTime;
    if (nextEnd <= nextStart) {
      return res.status(400).json({ error: 'Время окончания смены должно быть позже начала' });
    }

    if (typeof body.trainerId === 'string' && body.trainerId) sch.trainerId = body.trainerId;
    if (typeof body.studioId === 'string' && body.studioId) sch.studioId = body.studioId;
    if (typeof body.dayOfWeek === 'number' && Number.isFinite(body.dayOfWeek)) {
      sch.dayOfWeek = Math.max(0, Math.min(6, Math.round(body.dayOfWeek)));
    }
    sch.startTime = nextStart;
    sch.endTime = nextEnd;
    if (typeof body.active === 'boolean') sch.active = body.active;

    saveDb(db);
    broadcast('schedule:updated', sch);
    res.json(sch);
  });

  app.delete('/api/schedules/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const exists = db.schedules.some((s) => s.id === req.params.id);
    if (!exists) return res.status(404).json({ error: 'Смена в графике не найдена' });
    db.schedules = db.schedules.filter((s) => s.id !== req.params.id);
    saveDb(db);
    broadcast('schedule:deleted', { id: req.params.id });
    res.json({ ok: true, id: req.params.id });
  });

  // Services (with 4-direction categorization, sorting & edit/delete)
  app.post('/api/services', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<ServiceItem>;
    if (!body.name?.trim()) {
      return res.status(400).json({ error: 'Укажите название услуги' });
    }
    const srv: ServiceItem = {
      id: uid('srv'),
      studioId: body.studioId || 'all',
      name: body.name.trim(),
      category: inferServiceCategory(body),
      description: body.description?.trim() || '',
      durationMin: Number(body.durationMin) || 60,
      priceRub: Number(body.priceRub) || 4000,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : (db.services.length + 1) * 10,
      active: body.active !== undefined ? Boolean(body.active) : true,
    };
    db.services.push(srv);
    saveDb(db);
    broadcast('service:updated', srv);
    res.json(srv);
  });

  app.patch('/api/services/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const srv = db.services.find((s) => s.id === req.params.id);
    if (!srv) return res.status(404).json({ error: 'Услуга не найдена' });
    const body = req.body as Partial<ServiceItem>;
    if (typeof body.name === 'string' && body.name.trim()) srv.name = body.name.trim();
    if (typeof body.description === 'string') srv.description = body.description.trim();
    if (body.category) srv.category = body.category;
    if (typeof body.durationMin === 'number' && body.durationMin > 0) srv.durationMin = Number(body.durationMin);
    if (typeof body.priceRub === 'number' && body.priceRub >= 0) srv.priceRub = Number(body.priceRub);
    if (typeof body.sortOrder === 'number') srv.sortOrder = body.sortOrder;
    if (typeof body.studioId === 'string') srv.studioId = body.studioId;
    if (typeof body.active === 'boolean') srv.active = body.active;
    saveDb(db);
    broadcast('service:updated', srv);
    res.json(srv);
  });

  app.delete('/api/services/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const srv = db.services.find((s) => s.id === req.params.id);
    if (!srv) return res.status(404).json({ error: 'Услуга не найдена' });
    db.services = db.services.filter((s) => s.id !== srv.id);
    saveDb(db);
    broadcast('service:deleted', { id: srv.id });
    res.json({ ok: true, id: srv.id });
  });

  // Promos
  app.post('/api/promos', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<PromoCode>;
    const promo: PromoCode = {
      id: uid('pr'),
      code: (body.code || 'PROMO10').toUpperCase().trim(),
      title: body.title || 'Специальное предложение',
      discountPercent: Number(body.discountPercent) || 10,
      validUntil: body.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      studioId: body.studioId || 'all',
      active: true,
      usageCount: 0,
    };
    db.promos.push(promo);
    saveDb(db);
    res.json(promo);
  });

  app.patch('/api/promos/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const promo = db.promos.find((p) => p.id === req.params.id);
    if (!promo) return res.status(404).json({ error: 'Акция не найдена' });
    Object.assign(promo, req.body);
    saveDb(db);
    res.json(promo);
  });

  // Subscription & Certificate Plans (Catalog CRUD + Archive + Delete)
  app.post('/api/subscription-plans', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<SubscriptionPlan>;
    const name = (body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Укажите название абонемента или сертификата' });
    }
    const plan: SubscriptionPlan = {
      id: uid('plan'),
      name,
      type: body.type === 'certificate' ? 'certificate' : 'subscription',
      sessionsCount: Math.max(1, Math.round(Number(body.sessionsCount) || 1)),
      priceRub: Math.max(0, Math.round(Number(body.priceRub) || 0)),
      validityDays: Math.max(1, Math.round(Number(body.validityDays) || 90)),
      description: (body.description || '').trim(),
      active: body.active !== false,
    };
    db.subscriptionPlans.push(plan);
    saveDb(db);
    res.json(plan);
  });

  app.patch('/api/subscription-plans/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const plan = db.subscriptionPlans.find((p) => p.id === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Тариф или сертификат не найден' });
    const body = req.body as Partial<SubscriptionPlan>;
    if (typeof body.name === 'string' && body.name.trim()) plan.name = body.name.trim();
    if (body.type === 'subscription' || body.type === 'certificate') plan.type = body.type;
    if (typeof body.sessionsCount === 'number' && Number.isFinite(body.sessionsCount) && body.sessionsCount >= 1) {
      plan.sessionsCount = Math.round(body.sessionsCount);
    }
    if (typeof body.priceRub === 'number' && Number.isFinite(body.priceRub) && body.priceRub >= 0) {
      plan.priceRub = Math.round(body.priceRub);
    }
    if (typeof body.validityDays === 'number' && Number.isFinite(body.validityDays) && body.validityDays >= 1) {
      plan.validityDays = Math.round(body.validityDays);
    }
    if (typeof body.description === 'string') plan.description = body.description.trim();
    if (typeof body.active === 'boolean') plan.active = body.active;
    saveDb(db);
    res.json(plan);
  });

  app.delete('/api/subscription-plans/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const plan = db.subscriptionPlans.find((p) => p.id === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Тариф или сертификат не найден' });
    db.subscriptionPlans = db.subscriptionPlans.filter((p) => p.id !== plan.id);
    saveDb(db);
    res.json({ ok: true, id: plan.id });
  });

  // Issued Client Subscriptions & Certificates
  app.post('/api/client-subscriptions', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const {
      clientId,
      planId,
      studioId,
      validityDays,
      purchasedAt,
      expiresAt,
      sessionsCount,
    } = req.body as {
      clientId: string;
      planId: string;
      studioId?: string;
      validityDays?: number;
      purchasedAt?: string;
      expiresAt?: string;
      sessionsCount?: number;
    };
    const client = db.clients.find((c) => c.id === clientId);
    const plan = db.subscriptionPlans.find((p) => p.id === planId);
    if (!client || !plan) return res.status(404).json({ error: 'Клиент или тариф не найден' });
    const startDateStr =
      typeof purchasedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(purchasedAt)
        ? purchasedAt
        : new Date().toISOString().slice(0, 10);
    const startDate = new Date(`${startDateStr}T00:00:00Z`);
    const daysToUse =
      typeof validityDays === 'number' && Number.isFinite(validityDays) && validityDays >= 1
        ? Math.round(validityDays)
        : plan.validityDays;
    const computedExpires = new Date(startDate.getTime() + daysToUse * 86400000).toISOString().slice(0, 10);
    const endDateStr =
      typeof expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? expiresAt : computedExpires;
    const totalSessions =
      typeof sessionsCount === 'number' && Number.isFinite(sessionsCount) && sessionsCount >= 1
        ? Math.round(sessionsCount)
        : plan.sessionsCount;
    const prefix = plan.type === 'certificate' ? 'GIFT' : 'AB';
    const sub: ClientSubscription = {
      id: uid('csub'),
      clientId: client.id,
      clientName: client.name,
      planId: plan.id,
      planName: plan.name,
      type: plan.type,
      code: `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`,
      totalSessions,
      remainingSessions: totalSessions,
      purchasedAt: startDateStr,
      expiresAt: endDateStr,
      studioId: studioId || client.studioId,
      status: 'active',
    };
    db.clientSubscriptions.unshift(sub);
    db.subscriptionUsages.unshift({
      id: uid('su'),
      clientSubscriptionId: sub.id,
      clientId: client.id,
      clientName: client.name,
      planName: plan.name,
      usedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      delta: totalSessions,
      note: `Оформление (${sub.code}) · до ${sub.expiresAt}`,
      studioId: sub.studioId,
    });
    saveDb(db);
    res.json(sub);
  });

  app.patch('/api/client-subscriptions/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const sub = db.clientSubscriptions.find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Абонемент или сертификат не найден' });
    const body = req.body as Partial<ClientSubscription> & { validityDays?: number };

    if (typeof body.planName === 'string' && body.planName.trim()) {
      sub.planName = body.planName.trim();
    }
    if (body.type === 'subscription' || body.type === 'certificate') {
      sub.type = body.type;
    }
    if (typeof body.code === 'string' && body.code.trim()) {
      sub.code = body.code.trim().toUpperCase();
    }
    if (typeof body.studioId === 'string' && body.studioId) {
      sub.studioId = body.studioId;
    }
    if (typeof body.purchasedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.purchasedAt)) {
      sub.purchasedAt = body.purchasedAt;
    }
    if (typeof body.validityDays === 'number' && Number.isFinite(body.validityDays) && body.validityDays >= 1) {
      const base = new Date(`${sub.purchasedAt}T00:00:00Z`);
      sub.expiresAt = new Date(base.getTime() + Math.round(body.validityDays) * 86400000).toISOString().slice(0, 10);
    }
    if (typeof body.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) {
      sub.expiresAt = body.expiresAt;
    }
    if (typeof body.totalSessions === 'number' && Number.isFinite(body.totalSessions) && body.totalSessions >= 1) {
      sub.totalSessions = Math.round(body.totalSessions);
    }

    const prevRemaining = sub.remainingSessions;
    if (typeof body.remainingSessions === 'number' && Number.isFinite(body.remainingSessions) && body.remainingSessions >= 0) {
      sub.remainingSessions = Math.round(body.remainingSessions);
      if (sub.remainingSessions > sub.totalSessions) {
        sub.totalSessions = sub.remainingSessions;
      }
      if (sub.remainingSessions !== prevRemaining) {
        db.subscriptionUsages.unshift({
          id: uid('su'),
          clientSubscriptionId: sub.id,
          clientId: sub.clientId,
          clientName: sub.clientName,
          planName: sub.planName,
          usedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          delta: sub.remainingSessions - prevRemaining,
          note: `Корректировка остатка (${sub.code})`,
          studioId: sub.studioId,
        });
      }
    }

    if (
      body.status === 'active' ||
      body.status === 'used' ||
      body.status === 'expired' ||
      body.status === 'archived'
    ) {
      sub.status = body.status;
      if (body.status === 'archived') {
        sub.archivedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      } else {
        delete sub.archivedAt;
      }
    } else if (sub.status !== 'archived') {
      if (sub.remainingSessions <= 0) sub.status = 'used';
    }

    saveDb(db);
    res.json(sub);
  });

  app.post('/api/client-subscriptions/cleanup-used', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const { action } = req.body as { action?: 'archive' | 'delete' };
    const isWorkedOut = (s: ClientSubscription) =>
      s.status === 'used' || s.status === 'expired' || s.remainingSessions <= 0;

    if (action === 'delete') {
      const targetIds = new Set(
        db.clientSubscriptions.filter((s) => isWorkedOut(s) || s.status === 'archived').map((s) => s.id)
      );
      const removedCount = targetIds.size;
      db.clientSubscriptions = db.clientSubscriptions.filter((s) => !targetIds.has(s.id));
      db.subscriptionUsages = db.subscriptionUsages.filter((u) => !targetIds.has(u.clientSubscriptionId));
      saveDb(db);
      return res.json({ ok: true, count: removedCount });
    }

    // Default: archive worked-out subscriptions/certificates that are not archived yet
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let archivedCount = 0;
    for (const s of db.clientSubscriptions) {
      if (isWorkedOut(s) && s.status !== 'archived') {
        s.status = 'archived';
        s.archivedAt = nowStr;
        archivedCount += 1;
      }
    }
    saveDb(db);
    res.json({ ok: true, count: archivedCount });
  });

  app.delete('/api/client-subscriptions/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const sub = db.clientSubscriptions.find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Абонемент или сертификат не найден' });
    db.clientSubscriptions = db.clientSubscriptions.filter((s) => s.id !== sub.id);
    db.subscriptionUsages = db.subscriptionUsages.filter((u) => u.clientSubscriptionId !== sub.id);
    saveDb(db);
    res.json({ ok: true, id: sub.id });
  });

  // Bookings (Real-time!)
  app.post('/api/bookings', requireAuth(), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const body = req.body as Partial<Booking>;
    const client = db.clients.find((c) => c.id === body.clientId) || db.clients[0];
    const trainer = db.users.find((u) => u.id === body.trainerId) || db.users.find((u) => u.role === 'trainer');
    const service = db.services.find((s) => s.id === body.serviceId) || db.services[0];
    if (!client || !trainer || !service) {
      return res.status(400).json({ error: 'Неверные данные бронирования' });
    }
    const targetStudioId = body.studioId || client.studioId;
    const studio = db.studios.find((s) => s.id === targetStudioId);
    const bookingDate = body.date || new Date().toISOString().slice(0, 10);
    const bookingTime = body.time || '12:00';
    if (studio && !isTimeWithinOpenHours(bookingTime, studio, bookingDate)) {
      const range = getStudioHoursForDate(studio, bookingDate);
      const dayTypeLabel = isWeekendDate(bookingDate) ? 'выходные' : 'будни';
      return res.status(400).json({
        error: `Время записи (${bookingTime}) выходит за часы приёма студии (${dayTypeLabel}: ${range.start} – ${range.end})`,
      });
    }
    let finalAmount = service.priceRub;
    if (body.promoCode) {
      const promo = db.promos.find((p) => p.code.toUpperCase() === body.promoCode?.toUpperCase() && p.active);
      if (promo) {
        finalAmount = Math.round(service.priceRub * (1 - promo.discountPercent / 100));
        promo.usageCount += 1;
      }
    }
    const booking: Booking = {
      id: uid('bk'),
      studioId: targetStudioId,
      clientId: client.id,
      clientName: client.name,
      trainerId: trainer.id,
      trainerName: trainer.name,
      serviceId: service.id,
      serviceName: service.name,
      priceRub: service.priceRub,
      date: body.date || new Date().toISOString().slice(0, 10),
      time: bookingTime,
      durationMin: service.durationMin,
      status: body.status || 'pending',
      paymentStatus: body.paymentStatus || 'unpaid',
      promoCode: body.promoCode,
      finalAmountRub: finalAmount,
      createdAt: new Date().toISOString().slice(0, 10),
      createdByUserId: currentUser.id,
    };
    db.bookings.unshift(booking);
    saveDb(db);
    broadcast('booking:created', booking);
    res.json(booking);
  });

  app.patch('/api/bookings/:id', requireAuth(), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Запись не найдена' });

    const body = req.body as Partial<Booking>;

    if (currentUser.role === 'client') {
      const cl = db.clients.find((c) => c.userId === currentUser.id);
      if (!cl || booking.clientId !== cl.id) {
        return res.status(403).json({ error: 'Недостаточно прав для изменения чужой записи' });
      }
      if (body.status && body.status !== 'cancelled') {
        return res.status(403).json({ error: 'Клиент может только отменить запись' });
      }
    }

    const nextStudioId =
      typeof body.studioId === 'string' && body.studioId ? body.studioId : booking.studioId;
    const nextDate =
      typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : booking.date;
    const nextTime = typeof body.time === 'string' && body.time ? body.time : booking.time;
    const nextStatus = body.status || booking.status;

    if (
      nextStatus !== 'cancelled' &&
      (body.time !== undefined || body.studioId !== undefined || body.date !== undefined)
    ) {
      const studio = db.studios.find((s) => s.id === nextStudioId);
      if (studio && !isTimeWithinOpenHours(nextTime, studio, nextDate)) {
        const range = getStudioHoursForDate(studio, nextDate);
        const dayTypeLabel = isWeekendDate(nextDate) ? 'выходные' : 'будни';
        return res.status(400).json({
          error: `Время записи (${nextTime}) выходит за часы приёма студии (${dayTypeLabel}: ${range.start} – ${range.end})`,
        });
      }
    }

    if (typeof body.studioId === 'string' && body.studioId) {
      booking.studioId = body.studioId;
    }
    if (typeof body.clientId === 'string' && body.clientId && body.clientId !== booking.clientId) {
      const cl = db.clients.find((c) => c.id === body.clientId);
      if (cl) {
        booking.clientId = cl.id;
        booking.clientName = cl.name;
      }
    }
    if (typeof body.trainerId === 'string' && body.trainerId && body.trainerId !== booking.trainerId) {
      const tr = db.users.find((u) => u.id === body.trainerId);
      if (tr) {
        booking.trainerId = tr.id;
        booking.trainerName = tr.name;
      }
    }
    let serviceOrPromoChanged = false;
    if (typeof body.serviceId === 'string' && body.serviceId && body.serviceId !== booking.serviceId) {
      const srv = db.services.find((s) => s.id === body.serviceId);
      if (srv) {
        booking.serviceId = srv.id;
        booking.serviceName = srv.name;
        booking.priceRub = srv.priceRub;
        if (typeof body.durationMin !== 'number') {
          booking.durationMin = srv.durationMin;
        }
        serviceOrPromoChanged = true;
      }
    }
    if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      booking.date = body.date;
    }
    if (typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)) {
      booking.time = body.time;
    }
    if (typeof body.durationMin === 'number' && Number.isFinite(body.durationMin) && body.durationMin >= 15) {
      booking.durationMin = Math.round(body.durationMin);
    }
    if (body.status) booking.status = body.status;
    if (body.paymentStatus) booking.paymentStatus = body.paymentStatus;
    if (body.promoCode !== undefined && body.promoCode !== booking.promoCode) {
      booking.promoCode = body.promoCode?.trim() ? body.promoCode.trim().toUpperCase() : undefined;
      serviceOrPromoChanged = true;
    }
    if (typeof body.finalAmountRub === 'number' && Number.isFinite(body.finalAmountRub) && body.finalAmountRub >= 0) {
      booking.finalAmountRub = Math.round(body.finalAmountRub);
    } else if (serviceOrPromoChanged) {
      let nextAmount = booking.priceRub;
      if (booking.promoCode) {
        const promo = db.promos.find(
          (p) => p.code.toUpperCase() === booking.promoCode?.toUpperCase() && p.active
        );
        if (promo) {
          nextAmount = Math.round(booking.priceRub * (1 - promo.discountPercent / 100));
        }
      }
      booking.finalAmountRub = nextAmount;
    }

    saveDb(db);
    broadcast('booking:updated', booking);
    res.json(booking);
  });

  app.delete('/api/bookings/:id', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const exists = db.bookings.some((b) => b.id === req.params.id);
    if (!exists) return res.status(404).json({ error: 'Запись не найдена' });
    db.bookings = db.bookings.filter((b) => b.id !== req.params.id);
    saveDb(db);
    broadcast('booking:deleted', { id: req.params.id });
    res.json({ ok: true, id: req.params.id });
  });

  function sanitizeLimbAngleMatrix(raw: unknown): ExerciseLimbAngleMatrix {
    const keys = ['ln', 'pn', 'lr', 'pr', 'sh'] as const;
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const res = {} as ExerciseLimbAngleMatrix;
    for (const k of keys) {
      const entry = (obj[k] && typeof obj[k] === 'object' ? obj[k] : {}) as Record<string, unknown>;
      const s = Math.round(Number(entry.stand));
      const a = Math.round(Number(entry.angle));
      res[k] = {
        stand: Number.isFinite(s) ? Math.max(1, Math.min(7, s)) : 1,
        angle: Number.isFinite(a) ? Math.max(0, Math.min(6, a)) : 0,
      };
    }
    return res;
  }

  // Exercises & Complex Programs
  app.post('/api/exercises', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const body = req.body as Partial<Exercise>;
    const limbAngleMatrix = sanitizeLimbAngleMatrix(body.limbAngleMatrix);
    const ex: Exercise = {
      id: uid('ex'),
      title: body.title?.trim() || 'Новое упражнение',
      category: body.category || 'Базовое вытяжение',
      exerciseType: inferExerciseType(body),
      imageUrl: body.imageUrl || '/src/assets/images/exercise_star_stretch_1795103073739.jpg',
      instructions: body.instructions || '',
      targetMuscles: body.targetMuscles || ['Мышцы спины'],
      limbAngles: body.limbAngles || {
        wrists: `ЛР ${limbAngleMatrix.lr.stand}/${limbAngleMatrix.lr.angle} · ПР ${limbAngleMatrix.pr.stand}/${limbAngleMatrix.pr.angle}`,
        ankles: `ЛН ${limbAngleMatrix.ln.stand}/${limbAngleMatrix.ln.angle} · ПН ${limbAngleMatrix.pn.stand}/${limbAngleMatrix.pn.angle}`,
        torsoAngle: `Ш ${limbAngleMatrix.sh.stand}/${limbAngleMatrix.sh.angle}`,
      },
      limbAngleMatrix,
      safetyNotes: body.safetyNotes || 'Контроль дыхания и плавный набор тяги.',
      defaultDurationSec: Number(body.defaultDurationSec) || 120,
      recommendedLoadPct: Number(body.recommendedLoadPct) || 70,
      visibility: body.visibility === 'hidden' ? 'hidden' : 'public',
      createdByUserId: currentUser.id,
      createdBy: currentUser.name,
      studioId: currentUser.studioId || undefined,
    };
    db.exercises.unshift(ex);
    saveDb(db);
    if (ex.visibility === 'public') {
      broadcast('exercise:updated', ex);
    }
    res.json(ex);
  });

  app.patch('/api/exercises/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const ex = db.exercises.find((item) => item.id === req.params.id);
    if (!ex) return res.status(404).json({ error: 'Упражнение не найдено' });

    if (
      currentUser.role === 'trainer' &&
      ex.createdByUserId !== currentUser.id &&
      ex.createdBy !== currentUser.name
    ) {
      return res.status(403).json({
        error: 'Менять видимость или параметры упражнения может его автор, администратор или владелец',
      });
    }

    const body = req.body as Partial<Exercise>;
    if (body.visibility === 'public' || body.visibility === 'hidden') {
      ex.visibility = body.visibility;
    }
    if (typeof body.title === 'string' && body.title.trim()) ex.title = body.title.trim();
    if (body.category) ex.category = body.category;
    if (body.exerciseType) ex.exerciseType = body.exerciseType;
    if (typeof body.instructions === 'string') ex.instructions = body.instructions;
    if (typeof body.safetyNotes === 'string') ex.safetyNotes = body.safetyNotes;
    if (typeof body.defaultDurationSec === 'number') ex.defaultDurationSec = body.defaultDurationSec;
    if (typeof body.recommendedLoadPct === 'number') ex.recommendedLoadPct = body.recommendedLoadPct;
    if (Array.isArray(body.targetMuscles)) ex.targetMuscles = body.targetMuscles;
    if (body.limbAngles) ex.limbAngles = body.limbAngles;
    if (body.limbAngleMatrix) {
      ex.limbAngleMatrix = sanitizeLimbAngleMatrix(body.limbAngleMatrix);
    }
    if (typeof body.imageUrl === 'string' && body.imageUrl) ex.imageUrl = body.imageUrl;

    saveDb(db);
    if ((ex.visibility || 'public') === 'public') {
      broadcast('exercise:updated', ex);
    } else {
      broadcast('exercise:hidden', { id: ex.id, createdByUserId: ex.createdByUserId });
    }
    res.json(ex);
  });

  app.delete('/api/exercises/:id', requireAuth(['owner']), (req, res) => {
    const db = getDb();
    const ex = db.exercises.find((item) => item.id === req.params.id);
    if (!ex) return res.status(404).json({ error: 'Упражнение не найдено' });
    db.exercises = db.exercises.filter((item) => item.id !== ex.id);
    db.programs.forEach((prog) => {
      prog.exerciseIds = prog.exerciseIds.filter((eid) => eid !== ex.id);
    });
    saveDb(db);
    broadcast('exercise:deleted', { id: ex.id });
    res.json({ ok: true, id: ex.id });
  });

  app.post('/api/programs', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const body = req.body as Partial<WorkoutProgram>;
    if (!body.title?.trim()) {
      return res.status(400).json({ error: 'Укажите название программы' });
    }
    const prog: WorkoutProgram = {
      id: uid('prog'),
      title: body.title.trim(),
      level: body.level || 'Индивидуальная',
      clientId: body.clientId || undefined,
      description: body.description?.trim() || '',
      exerciseIds: Array.isArray(body.exerciseIds) ? body.exerciseIds : [],
      createdBy: currentUser.name,
      createdByUserId: currentUser.id,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.programs.unshift(prog);
    saveDb(db);
    broadcast('program:updated', prog);
    res.json(prog);
  });

  app.patch('/api/programs/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const prog = db.programs.find((p) => p.id === req.params.id);
    if (!prog) return res.status(404).json({ error: 'Программа не найдена' });
    if (
      currentUser.role === 'trainer' &&
      prog.createdByUserId !== currentUser.id &&
      prog.createdBy !== currentUser.name
    ) {
      return res.status(403).json({ error: 'Можно редактировать только свои программы' });
    }
    const body = req.body as Partial<WorkoutProgram>;
    if (typeof body.title === 'string' && body.title.trim()) prog.title = body.title.trim();
    if (body.level) prog.level = body.level;
    if ('clientId' in body) prog.clientId = body.clientId || undefined;
    if (typeof body.description === 'string') prog.description = body.description;
    if (Array.isArray(body.exerciseIds)) prog.exerciseIds = body.exerciseIds;
    saveDb(db);
    broadcast('program:updated', prog);
    res.json(prog);
  });

  app.delete('/api/programs/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const prog = db.programs.find((p) => p.id === req.params.id);
    if (!prog) return res.status(404).json({ error: 'Программа не найдена' });
    if (
      currentUser.role === 'trainer' &&
      prog.createdByUserId !== currentUser.id &&
      prog.createdBy !== currentUser.name
    ) {
      return res.status(403).json({ error: 'Можно удалять только свои программы' });
    }
    db.programs = db.programs.filter((p) => p.id !== prog.id);
    saveDb(db);
    broadcast('program:deleted', { id: prog.id });
    res.json({ ok: true, id: prog.id });
  });

  // Trainer Social Media Blog Posts
  app.post('/api/trainer-posts', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.trainerPosts) db.trainerPosts = [];
    const body = req.body as Partial<TrainerBlogPost>;
    if (!body.title?.trim() || !body.content?.trim()) {
      return res.status(400).json({ error: 'Заполните заголовок и текст публикации' });
    }
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const post: TrainerBlogPost = {
      id: uid('tpost'),
      trainerId: currentUser.id,
      trainerName: currentUser.name,
      studioId: body.studioId || currentUser.studioId || db.studios[0]?.id || 'st-tverskaya',
      platform: (body.platform || 'telegram') as TrainerBlogPlatform,
      category: body.category || 'Методика ПравИло',
      title: body.title.trim(),
      content: body.content.trim(),
      hashtags: Array.isArray(body.hashtags)
        ? body.hashtags.map((h) => h.trim()).filter(Boolean)
        : ['#ПравИло', '#ЭталонПравило'],
      includeBookingLink: Boolean(body.includeBookingLink),
      status: body.status === 'draft' ? 'draft' : 'published',
      publishedAt: nowStr,
      updatedAt: nowStr,
    };
    db.trainerPosts.unshift(post);
    saveDb(db);
    broadcast('trainer-post:updated', post);
    res.json(post);
  });

  app.patch('/api/trainer-posts/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.trainerPosts) db.trainerPosts = [];
    const post = db.trainerPosts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Публикация не найдена' });
    if (currentUser.role === 'trainer' && post.trainerId !== currentUser.id) {
      return res.status(403).json({ error: 'Можно редактировать только свои публикации' });
    }
    const body = req.body as Partial<TrainerBlogPost>;
    if (typeof body.title === 'string' && body.title.trim()) post.title = body.title.trim();
    if (typeof body.content === 'string' && body.content.trim()) post.content = body.content.trim();
    if (body.platform) post.platform = body.platform;
    if (body.category) post.category = body.category;
    if (Array.isArray(body.hashtags)) {
      post.hashtags = body.hashtags.map((h) => h.trim()).filter(Boolean);
    }
    if (typeof body.includeBookingLink === 'boolean') {
      post.includeBookingLink = body.includeBookingLink;
    }
    if (body.status === 'draft' || body.status === 'published') {
      post.status = body.status;
    }
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    post.updatedAt = nowStr;
    if (post.status === 'published' && !post.publishedAt) {
      post.publishedAt = nowStr;
    }
    saveDb(db);
    broadcast('trainer-post:updated', post);
    res.json(post);
  });

  app.delete('/api/trainer-posts/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.trainerPosts) db.trainerPosts = [];
    const post = db.trainerPosts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Публикация не найдена' });
    if (currentUser.role === 'trainer' && post.trainerId !== currentUser.id) {
      return res.status(403).json({ error: 'Можно удалять только свои публикации' });
    }
    db.trainerPosts = db.trainerPosts.filter((p) => p.id !== post.id);
    saveDb(db);
    broadcast('trainer-post:deleted', { id: post.id });
    res.json({ ok: true, id: post.id });
  });

  // Clients, Anthropometry, Progress Notes
  app.post('/api/clients', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<ClientProfile>;
    const birthDate =
      body.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)
        ? body.birthDate
        : `${Number(body.birthYear) || 1990}-05-14`;
    const birthYear = Number(birthDate.slice(0, 4)) || Number(body.birthYear) || 1990;
    const client: ClientProfile = {
      id: uid('cl'),
      name: body.name || 'Новый клиент',
      gender: body.gender === 'female' ? 'female' : 'male',
      clientStatus: body.clientStatus === 'inactive' ? 'inactive' : 'active',
      phone: body.phone || '',
      email: body.email || '',
      telegram: body.telegram || '',
      studioId: body.studioId || db.studios[0].id,
      birthYear,
      birthDate,
      goal: body.goal || 'Общее вытяжение и декомпрессия',
      contraindications: body.contraindications || 'Нет данных',
      anthropometry: [],
      notes: [],
      npsScore: 95,
      totalSessions: 0,
      lastVisitDate: new Date().toISOString().slice(0, 10),
    };
    db.clients.unshift(client);
    saveDb(db);
    runBirthdayPushDispatch({ clientIds: [client.id] });
    res.json(client);
  });

  app.patch('/api/clients/:id', requireAuth(['owner', 'admin', 'trainer', 'client']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const body = (req.body || {}) as Partial<ClientProfile>;
    const prevBirthDate = client.birthDate;

    if (currentUser.role === 'client') {
      if (client.userId !== currentUser.id) {
        return res.status(403).json({ error: 'Можно редактировать только собственный профиль' });
      }
      if (typeof body.name === 'string') {
        if (!body.name.trim()) return res.status(400).json({ error: 'ФИО не может быть пустым' });
        client.name = body.name.trim();
      }
      if (typeof body.phone === 'string') client.phone = body.phone.trim();
      if (typeof body.email === 'string') client.email = body.email.trim().toLowerCase();
      if (typeof body.telegram === 'string') client.telegram = body.telegram.trim();
      if (body.gender === 'male' || body.gender === 'female') client.gender = body.gender;
      if (typeof body.goal === 'string') client.goal = body.goal.trim();
      if (typeof body.contraindications === 'string') {
        client.contraindications = body.contraindications.trim();
      }
      if (typeof body.studioId === 'string' && db.studios.some((s) => s.id === body.studioId)) {
        client.studioId = body.studioId;
      }
      if (typeof body.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
        client.birthDate = body.birthDate;
        client.birthYear = Number(body.birthDate.slice(0, 4)) || client.birthYear;
        if (body.birthDate !== prevBirthDate) {
          client.lastBirthdayGreetingYear = undefined;
        }
      }

      const linkedUser = db.users.find((u) => u.id === currentUser.id);
      if (linkedUser) {
        linkedUser.name = client.name;
        linkedUser.avatarInitials = makeAvatarInitials(client.name);
        linkedUser.phone = client.phone;
        if (client.email !== (linkedUser.email || '').toLowerCase()) {
          linkedUser.email = client.email;
          linkedUser.emailVerified = false;
        }
        linkedUser.telegramHandle = client.telegram;
        linkedUser.studioId = client.studioId;
        saveDb(db);
        broadcast('user:updated', stripPassword(linkedUser));
      } else {
        saveDb(db);
      }
      broadcast('client:updated', client);
      return res.json(client);
    }

    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
      if (body.gender === 'male' || body.gender === 'female') client.gender = body.gender;
      if (typeof body.goal === 'string') client.goal = body.goal.trim();
      if (typeof body.contraindications === 'string') {
        client.contraindications = body.contraindications.trim();
      }
      if (body.clientStatus === 'active' || body.clientStatus === 'inactive') {
        client.clientStatus = body.clientStatus;
      }
      if (typeof body.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
        client.birthDate = body.birthDate;
        client.birthYear = Number(body.birthDate.slice(0, 4)) || client.birthYear;
        if (body.birthDate !== prevBirthDate) {
          client.lastBirthdayGreetingYear = undefined;
        }
      }
      saveDb(db);
      const redacted = redactClientForTrainer(client);
      broadcast('client:status-updated', {
        id: client.id,
        clientStatus: client.clientStatus || 'active',
      });
      return res.json(redacted);
    }

    // Owner / Admin full personal & profile fields (explicit whitelist)
    if (typeof body.name === 'string') {
      if (!body.name.trim()) return res.status(400).json({ error: 'ФИО клиента не может быть пустым' });
      client.name = body.name.trim();
    }
    if (typeof body.phone === 'string') client.phone = body.phone.trim();
    if (typeof body.email === 'string') client.email = body.email.trim().toLowerCase();
    if (typeof body.telegram === 'string') client.telegram = body.telegram.trim();
    if (body.gender === 'male' || body.gender === 'female') client.gender = body.gender;
    if (typeof body.studioId === 'string' && db.studios.some((s) => s.id === body.studioId)) {
      client.studioId = body.studioId;
    }
    if (typeof body.goal === 'string') client.goal = body.goal.trim();
    if (typeof body.contraindications === 'string') {
      client.contraindications = body.contraindications.trim();
    }
    if (body.clientStatus === 'active' || body.clientStatus === 'inactive') {
      client.clientStatus = body.clientStatus;
    }
    if (typeof body.npsScore === 'number' && Number.isFinite(body.npsScore)) {
      client.npsScore = Math.max(0, Math.min(10, Math.round(body.npsScore)));
    }
    if (typeof body.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
      client.birthDate = body.birthDate;
      client.birthYear = Number(body.birthDate.slice(0, 4)) || client.birthYear;
      if (body.birthDate !== prevBirthDate) {
        client.lastBirthdayGreetingYear = undefined;
      }
    }

    const linkedUser = client.userId ? db.users.find((u) => u.id === client.userId) : undefined;
    if (linkedUser) {
      linkedUser.name = client.name;
      linkedUser.avatarInitials = makeAvatarInitials(client.name);
      linkedUser.phone = client.phone;
      if (client.email !== (linkedUser.email || '').toLowerCase()) {
        linkedUser.email = client.email;
        linkedUser.emailVerified = false;
      }
      linkedUser.telegramHandle = client.telegram;
      linkedUser.studioId = client.studioId;
    }

    saveDb(db);
    if (linkedUser) {
      broadcast('user:updated', stripPassword(linkedUser));
    }
    broadcast('client:updated', client);
    broadcast('client:status-updated', {
      id: client.id,
      clientStatus: client.clientStatus || 'active',
    });
    runBirthdayPushDispatch({ clientIds: [client.id] });
    res.json(client);
  });

  app.post('/api/clients/:id/anthropometry', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    const body = req.body as Partial<AnthropometryRecord> & { rawWeightKg?: number; rawImpedanceOhm?: number };
    const scaleDev = db.equipment.find((d) => d.type === 'xiaomi_scale');
    const ageYears = new Date().getFullYear() - (client.birthYear || 1990);

    const heightBeforeCm = Number((Number(body.heightBeforeCm ?? body.heightCm) || 175).toFixed(1));
    const heightAfterCm =
      body.heightAfterCm !== undefined && body.heightAfterCm !== null && Number(body.heightAfterCm) > 0
        ? Number(Number(body.heightAfterCm).toFixed(1))
        : undefined;
    const heightDeltaCm =
      heightAfterCm !== undefined ? Number((heightAfterCm - heightBeforeCm).toFixed(1)) : undefined;
    const heightCm = heightAfterCm ?? heightBeforeCm;

    const computed = calculateMiScale2Metrics({
      rawWeightKg: Number(body.rawWeightKg ?? body.weightKg) || 75,
      heightCm: heightBeforeCm,
      ageYears,
      gender: client.gender || 'male',
      rawImpedanceOhm: body.impedanceOhm ?? body.rawImpedanceOhm,
      balanceTestSec: body.balanceTestSec,
      calibration: scaleDev?.calibration,
    });

    const rec: AnthropometryRecord = {
      id: uid('an'),
      date: new Date().toISOString().slice(0, 10),
      phase: heightAfterCm !== undefined ? 'paired' : body.phase || 'before',
      heightCm,
      heightBeforeCm,
      heightAfterCm,
      heightDeltaCm,
      weightKg: body.weightKg !== undefined ? Number(body.weightKg) : computed.weightKg,
      bmi: body.bmi !== undefined ? Number(body.bmi) : computed.bmi,
      bodyFatPct: body.bodyFatPct !== undefined ? Number(body.bodyFatPct) : computed.bodyFatPct,
      muscleMassKg: body.muscleMassKg !== undefined ? Number(body.muscleMassKg) : computed.muscleMassKg,
      waterPct: body.waterPct !== undefined ? Number(body.waterPct) : computed.waterPct,
      proteinPct: body.proteinPct !== undefined ? Number(body.proteinPct) : computed.proteinPct,
      visceralFatLevel: body.visceralFatLevel !== undefined ? Number(body.visceralFatLevel) : computed.visceralFatLevel,
      boneMassKg: body.boneMassKg !== undefined ? Number(body.boneMassKg) : computed.boneMassKg,
      bmrKcal: body.bmrKcal !== undefined ? Number(body.bmrKcal) : computed.bmrKcal,
      idealWeightKg: body.idealWeightKg !== undefined ? Number(body.idealWeightKg) : computed.idealWeightKg,
      bodyAgeYears: body.bodyAgeYears !== undefined ? Number(body.bodyAgeYears) : computed.bodyAgeYears,
      bodyScore: body.bodyScore !== undefined ? Number(body.bodyScore) : computed.bodyScore,
      bodyType: body.bodyType || computed.bodyType,
      impedanceOhm: body.impedanceOhm !== undefined ? Number(body.impedanceOhm) : computed.impedanceOhm,
      balanceTestSec: body.balanceTestSec !== undefined ? Number(body.balanceTestSec) : computed.balanceTestSec,
      bpSys: Number(body.bpSys) || 120,
      bpDia: Number(body.bpDia) || 80,
      pulseRest: Number(body.pulseRest) || 68,
      flexibilityScore: Number(body.flexibilityScore) || 70,
      painIndex: Number(body.painIndex ?? 3),
      calibratedScale: body.calibratedScale ?? (scaleDev?.calibration?.calibrated ?? true),
      notes: body.notes || 'Синхронизация Mi Body Composition Scale 2 + замер роста',
    };
    client.anthropometry.push(rec);
    saveDb(db);
    res.json(rec);
  });

  app.patch('/api/clients/:id/anthropometry/:recId', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    const rec = client.anthropometry.find((a) => a.id === req.params.recId);
    if (!rec) return res.status(404).json({ error: 'Замер не найден' });

    const body = req.body as Partial<AnthropometryRecord>;
    if (body.heightBeforeCm !== undefined) {
      rec.heightBeforeCm = Number(Number(body.heightBeforeCm).toFixed(1));
    }
    if (body.heightAfterCm !== undefined) {
      rec.heightAfterCm = Number(Number(body.heightAfterCm).toFixed(1));
      rec.heightDeltaCm = Number((rec.heightAfterCm - rec.heightBeforeCm).toFixed(1));
      rec.heightCm = rec.heightAfterCm;
      rec.phase = 'paired';
    }
    if (body.notes !== undefined) rec.notes = body.notes;
    saveDb(db);
    res.json(rec);
  });

  app.post('/api/clients/:id/notes', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    const note = {
      id: uid('cn'),
      date: new Date().toISOString().slice(0, 10),
      authorName: currentUser.name,
      text: req.body.text || '',
    };
    client.notes.unshift(note);
    saveDb(db);
    res.json(note);
  });

  // Posture Laser Level & Photo Angle Assessments (Before / After Correction)
  app.post('/api/clients/:id/posture-assessments', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    const parsed = sanitizePostureAssessmentInput(req.body, uid('posture'), currentUser.name);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    if (!Array.isArray(client.postureAssessments)) {
      client.postureAssessments = [];
    }
    client.postureAssessments.unshift(parsed.record);
    saveDb(db);
    broadcast('client:posture-updated', {
      clientId: client.id,
      postureAssessments: client.postureAssessments,
    });
    res.json({
      assessment: parsed.record,
      client: currentUser.role === 'trainer' ? redactClientForTrainer(client) : client,
    });
  });

  app.patch('/api/clients/:id/posture-assessments/:aid', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    if (!Array.isArray(client.postureAssessments)) client.postureAssessments = [];
    const idx = client.postureAssessments.findIndex((a) => a.id === req.params.aid);
    if (idx === -1) return res.status(404).json({ error: 'Замер осанки не найден' });

    const existing = client.postureAssessments[idx];
    const mergedRaw = { ...existing, ...(req.body || {}), id: existing.id };
    const parsed = sanitizePostureAssessmentInput(
      mergedRaw,
      existing.id,
      existing.recordedBy || currentUser.name
    );
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    client.postureAssessments[idx] = parsed.record;
    saveDb(db);
    broadcast('client:posture-updated', {
      clientId: client.id,
      postureAssessments: client.postureAssessments,
    });
    res.json({
      assessment: parsed.record,
      client: currentUser.role === 'trainer' ? redactClientForTrainer(client) : client,
    });
  });

  app.delete('/api/clients/:id/posture-assessments/:aid', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    if (currentUser.role === 'trainer') {
      const allowed = getTrainerAssignedClientIds(db, currentUser.id, currentUser.name);
      if (!allowed.has(client.id)) {
        return res.status(403).json({ error: 'Нет доступа к карточке этого клиента' });
      }
    }
    if (!Array.isArray(client.postureAssessments)) client.postureAssessments = [];
    const beforeLen = client.postureAssessments.length;
    client.postureAssessments = client.postureAssessments.filter((a) => a.id !== req.params.aid);
    if (client.postureAssessments.length === beforeLen) {
      return res.status(404).json({ error: 'Замер осанки не найден' });
    }
    saveDb(db);
    broadcast('client:posture-updated', {
      clientId: client.id,
      postureAssessments: client.postureAssessments,
    });
    res.json({
      ok: true,
      id: req.params.aid,
      client: currentUser.role === 'trainer' ? redactClientForTrainer(client) : client,
    });
  });

  // Equipment status, configuration, calibration & real hardware bridge telemetry
  app.get('/api/hardware/bridge-info', requireAuth(['owner', 'admin', 'trainer']), (_req, res) => {
    const key = process.env.HARDWARE_BRIDGE_KEY || 'etalon-studio-bridge';
    res.json({
      telemetryEndpoint: '/api/hardware/telemetry',
      bridgeKey: key,
    });
  });

  app.patch('/api/equipment/:id', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const db = getDb();
    const dev = db.equipment.find((d) => d.id === req.params.id);
    if (!dev) return res.status(404).json({ error: 'Устройство не найдено' });
    const body = req.body as Partial<typeof dev>;
    if (body.hardwareConfig) {
      dev.hardwareConfig = { ...(dev.hardwareConfig || { transport: 'web_bluetooth' }), ...body.hardwareConfig };
    }
    if (body.calibration) {
      dev.calibration = { ...(dev.calibration || { tareOffsetKg: 0, gainFactor: 1, impedanceOffsetOhm: 0, referenceWeightKg: 50, calibrated: true, lastCalibratedAt: '' }), ...body.calibration };
    }
    const { hardwareConfig: _hc, calibration: _cal, ...rest } = body;
    Object.assign(dev, rest, { lastSyncAt: new Date().toISOString() });
    saveDb(db);
    broadcast('equipment:updated', dev);
    res.json(dev);
  });

  app.post('/api/hardware/telemetry', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    const bridgeKey = req.headers['x-hardware-key'] || (typeof req.query.key === 'string' ? req.query.key : '');
    const expectedKey = process.env.HARDWARE_BRIDGE_KEY || 'etalon-studio-bridge';

    if (!payload && bridgeKey !== expectedKey) {
      return res.status(401).json({ error: 'Требуется токен персонала или x-hardware-key шлюза' });
    }

    const db = getDb();
    const body = (req.body || {}) as Partial<LiveHardwarePacket> & { deviceId?: string };
    const dev =
      (body.deviceId && db.equipment.find((d) => d.id === body.deviceId)) ||
      (body.type && db.equipment.find((d) => d.type === body.type));
    if (!dev) {
      return res.status(404).json({ error: 'Датчик с указанным type/deviceId не найден' });
    }

    const packet: LiveHardwarePacket = {
      type: dev.type,
      source: 'http_bridge',
      timestamp: new Date().toISOString(),
      deviceName: body.deviceName || dev.name,
      batteryPct: typeof body.batteryPct === 'number' ? body.batteryPct : undefined,
      lh: typeof body.lh === 'number' ? body.lh : undefined,
      rh: typeof body.rh === 'number' ? body.rh : undefined,
      lf: typeof body.lf === 'number' ? body.lf : undefined,
      rf: typeof body.rf === 'number' ? body.rf : undefined,
      emgCh1Mv: typeof body.emgCh1Mv === 'number' ? body.emgCh1Mv : undefined,
      emgCh2Mv: typeof body.emgCh2Mv === 'number' ? body.emgCh2Mv : undefined,
      heartRateBpm: typeof body.heartRateBpm === 'number' ? body.heartRateBpm : undefined,
      weightKg: typeof body.weightKg === 'number' ? body.weightKg : undefined,
      impedanceOhm: typeof body.impedanceOhm === 'number' ? body.impedanceOhm : undefined,
      stabilized: typeof body.stabilized === 'boolean' ? body.stabilized : undefined,
      sys: typeof body.sys === 'number' ? body.sys : undefined,
      dia: typeof body.dia === 'number' ? body.dia : undefined,
      map: typeof body.map === 'number' ? body.map : undefined,
      pulse: typeof body.pulse === 'number' ? body.pulse : undefined,
    };

    dev.connected = true;
    dev.streaming = true;
    dev.connectionMode = 'websocket_bridge';
    dev.lastError = '';
    dev.lastSyncAt = packet.timestamp;
    if (typeof packet.batteryPct === 'number') dev.batteryPct = packet.batteryPct;
    dev.signalQualityPct = 95;

    if (dev.type === 'esp32_limbs') {
      dev.lastReadingText = `ЛР ${(packet.lh ?? 0).toFixed(1)} · ПР ${(packet.rh ?? 0).toFixed(1)} · ЛН ${(packet.lf ?? 0).toFixed(1)} · ПН ${(packet.rf ?? 0).toFixed(1)} кг`;
    } else if (dev.type === 'myoblue_emg') {
      dev.lastReadingText = `CH1: ${(packet.emgCh1Mv ?? 0).toFixed(2)} мВ · CH2: ${(packet.emgCh2Mv ?? 0).toFixed(2)} мВ`;
    } else if (dev.type === 'wahoo_tickr' && packet.heartRateBpm) {
      dev.lastReadingText = `${Math.round(packet.heartRateBpm)} уд/мин`;
    } else if (dev.type === 'xiaomi_scale' && packet.weightKg) {
      dev.lastReadingText = `${packet.weightKg.toFixed(1)} кг${packet.impedanceOhm ? ` · BIA ${packet.impedanceOhm} Ω` : ''}`;
    } else if (dev.type === 'bp_b05' && packet.sys && packet.dia) {
      dev.lastReadingText = `${packet.sys}/${packet.dia} мм рт. ст.${packet.pulse ? ` · ${packet.pulse} уд/мин` : ''}`;
    }

    saveDb(db);
    broadcast('hardware:telemetry', packet);
    broadcast('equipment:updated', dev);
    res.json({ ok: true, packet, device: dev });
  });

  // Complete Live Training Session + Payment + Subscription Deduction + Auto Notification
  app.post('/api/sessions', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const body = req.body as Partial<TrainingSessionRecord> & { subscriptionId?: string };
    const client = db.clients.find((c) => c.id === body.clientId);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const sessionRecord: TrainingSessionRecord = {
      id: uid('ses'),
      bookingId: body.bookingId,
      studioId: body.studioId || client.studioId,
      clientId: client.id,
      clientName: client.name,
      trainerId: body.trainerId || currentUser.id,
      trainerName: body.trainerName || currentUser.name,
      programId: body.programId,
      programTitle: body.programTitle || 'Индивидуальная тренировка',
      startedAt: body.startedAt || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: typeof body.durationSec === 'number' ? body.durationSec : 1800,
      completedExercises: body.completedExercises || [],
      peakWinchKg: typeof body.peakWinchKg === 'number' ? body.peakWinchKg : 0,
      avgSymmetryPct: typeof body.avgSymmetryPct === 'number' ? body.avgSymmetryPct : 0,
      maxLimbLoads: body.maxLimbLoads || { lh: 0, rh: 0, lf: 0, rf: 0 },
      avgHrBpm: typeof body.avgHrBpm === 'number' ? body.avgHrBpm : 0,
      bpBefore: body.bpBefore || '',
      bpAfter: body.bpAfter || '',
      heightBeforeCm: body.heightBeforeCm ? Number(body.heightBeforeCm) : undefined,
      heightAfterCm: body.heightAfterCm ? Number(body.heightAfterCm) : undefined,
      notes: body.notes || '',
      paymentMethod: body.paymentMethod || 'paid_card',
      amountPaidRub: typeof body.amountPaidRub === 'number' ? body.amountPaidRub : 0,
    };
    db.sessions.unshift(sessionRecord);

    client.totalSessions += 1;
    client.lastVisitDate = new Date().toISOString().slice(0, 10);

    // Record pre/post height dynamics into client's anthropometry history if provided
    if (sessionRecord.heightBeforeCm && sessionRecord.heightBeforeCm > 100) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const latest = client.anthropometry[client.anthropometry.length - 1];
      const hBefore = Number(sessionRecord.heightBeforeCm.toFixed(1));
      const hAfter = sessionRecord.heightAfterCm ? Number(sessionRecord.heightAfterCm.toFixed(1)) : undefined;
      const hDelta = hAfter !== undefined ? Number((hAfter - hBefore).toFixed(1)) : undefined;
      const [bpSysStr, bpDiaStr] = (sessionRecord.bpAfter || sessionRecord.bpBefore || '120/80').split('/');
      const scaleDev = db.equipment.find((d) => d.type === 'xiaomi_scale');
      const ageYears = new Date().getFullYear() - (client.birthYear || 1990);
      const baseWeight = latest?.weightKg || 75;
      const computed = calculateMiScale2Metrics({
        rawWeightKg: baseWeight,
        heightCm: hBefore,
        ageYears,
        gender: client.gender || 'male',
        rawImpedanceOhm: latest?.impedanceOhm,
        calibration: scaleDev?.calibration,
      });

      if (latest && latest.date === todayStr && latest.phase === 'before' && hAfter !== undefined) {
        latest.heightBeforeCm = hBefore;
        latest.heightAfterCm = hAfter;
        latest.heightDeltaCm = hDelta;
        latest.heightCm = hAfter;
        latest.phase = 'paired';
        latest.bpSys = Number(bpSysStr) || latest.bpSys;
        latest.bpDia = Number(bpDiaStr) || latest.bpDia;
      } else {
        client.anthropometry.push({
          ...computed,
          id: uid('an'),
          date: todayStr,
          phase: hAfter !== undefined ? 'paired' : 'before',
          heightCm: hAfter ?? hBefore,
          heightBeforeCm: hBefore,
          heightAfterCm: hAfter,
          heightDeltaCm: hDelta,
          bpSys: Number(bpSysStr) || latest?.bpSys || 120,
          bpDia: Number(bpDiaStr) || latest?.bpDia || 80,
          pulseRest: sessionRecord.avgHrBpm || latest?.pulseRest || 68,
          flexibilityScore: latest?.flexibilityScore || 72,
          painIndex: latest?.painIndex ?? 2,
          calibratedScale: true,
          notes:
            hDelta !== undefined
              ? `Замер роста до/после сессии «${sessionRecord.programTitle}» (${hDelta >= 0 ? '+' : ''}${hDelta.toFixed(1)} см)`
              : `Входной замер роста перед сессией «${sessionRecord.programTitle}»`,
        });
      }
    }

    if (sessionRecord.notes) {
      client.notes.unshift({
        id: uid('cn'),
        date: client.lastVisitDate,
        authorName: sessionRecord.trainerName,
        text: sessionRecord.notes,
      });
    }

    if (sessionRecord.bookingId) {
      const booking = db.bookings.find((b) => b.id === sessionRecord.bookingId);
      if (booking) {
        booking.status = 'completed';
        booking.paymentStatus = sessionRecord.paymentMethod;
        booking.finalAmountRub = sessionRecord.amountPaidRub;
        broadcast('booking:updated', booking);
      }
    }

    // Deduct from subscription / certificate if used
    if ((sessionRecord.paymentMethod === 'paid_subscription' || sessionRecord.paymentMethod === 'paid_certificate') && body.subscriptionId) {
      const csub = db.clientSubscriptions.find((s) => s.id === body.subscriptionId);
      if (csub && csub.remainingSessions > 0) {
        csub.remainingSessions -= 1;
        if (csub.remainingSessions === 0) csub.status = 'used';
        db.subscriptionUsages.unshift({
          id: uid('su'),
          clientSubscriptionId: csub.id,
          clientId: client.id,
          clientName: client.name,
          planName: csub.planName,
          bookingId: sessionRecord.bookingId,
          sessionId: sessionRecord.id,
          usedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          delta: -1,
          note: `Списание за сессию «${sessionRecord.programTitle}»`,
          studioId: sessionRecord.studioId,
        });
      }
    }

    // Create automatic session-completed notification
    const remainingSub = db.clientSubscriptions.find((s) => s.clientId === client.id && s.status === 'active');
    const log: NotificationLog = {
      id: uid('nlog'),
      templateId: 'tpl-session-done',
      channel: 'push',
      recipientName: client.name,
      recipientContact: client.telegram || client.email,
      clientId: client.id,
      subject: 'Отчёт по тренировке ПравИло готов',
      messagePreview: `${client.name}, сессия «${sessionRecord.programTitle}» завершена! Макс. тяга: ${sessionRecord.peakWinchKg.toFixed(1)} кг, симметрия ${sessionRecord.avgSymmetryPct}%. Осталось по абонементу: ${remainingSub ? remainingSub.remainingSessions : 0}.`,
      cabinetLink: `/?cabinet=client&clientId=${client.id}`,
      status: 'delivered',
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    db.notificationLogs.unshift(log);

    saveDb(db);
    broadcast('session:completed', sessionRecord);
    broadcast('notification:push', log);
    res.json(sessionRecord);
  });

  // Notifications & Templates
  app.post('/api/notifications/templates', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const body = req.body as Partial<NotificationTemplate>;
    const tpl: NotificationTemplate = {
      id: uid('tpl'),
      name: body.name || 'Новый шаблон',
      channel: body.channel || 'telegram',
      trigger: body.trigger || 'manual',
      subject: body.subject || 'Уведомление от студии ЭТАЛОН ПРАВИЛО',
      body: body.body || '',
    };
    db.templates.unshift(tpl);
    saveDb(db);
    res.json(tpl);
  });

  app.post('/api/notifications/send', requireAuth(['owner', 'admin', 'trainer']), async (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    const { clientIds, channel, subject, message, templateId } = req.body as {
      clientIds: string[];
      channel: 'email' | 'telegram' | 'whatsapp' | 'push';
      subject: string;
      message: string;
      templateId?: string;
    };
    const targets = db.clients.filter((c) => clientIds.includes(c.id));
    const createdLogs: NotificationLog[] = [];
    if (!db.messengerMessages) db.messengerMessages = [];

    for (const cl of targets) {
      const nextBooking = db.bookings.find((b) => b.clientId === cl.id && b.status !== 'completed' && b.status !== 'cancelled');
      const studio = db.studios.find((s) => s.id === (nextBooking?.studioId || cl.studioId)) || db.studios[0];
      const activeSub = db.clientSubscriptions.find((s) => s.clientId === cl.id && s.status === 'active');
      const cabinetLink = `/?cabinet=client&clientId=${cl.id}`;

      const rendered = message
        .replace(/\{\{client_name\}\}/g, cl.name)
        .replace(/\{\{session_date\}\}/g, nextBooking?.date || new Date().toISOString().slice(0, 10))
        .replace(/\{\{session_time\}\}/g, nextBooking?.time || '12:00')
        .replace(/\{\{trainer_name\}\}/g, nextBooking?.trainerName || 'Дмитрий Волков')
        .replace(/\{\{service_name\}\}/g, nextBooking?.serviceName || 'Индивидуальная сессия ПравИло')
        .replace(/\{\{studio_address\}\}/g, studio?.address || '')
        .replace(/\{\{amount\}\}/g, String(nextBooking?.finalAmountRub || 4200))
        .replace(/\{\{remaining_sessions\}\}/g, String(activeSub?.remainingSessions ?? 0))
        .replace(/\{\{cabinet_link\}\}/g, cabinetLink);

      const contact =
        channel === 'email'
          ? cl.email
          : channel === 'telegram'
          ? cl.telegram || cl.phone
          : cl.phone;

      const delivery = await deliverExternalNotification({
        settings: db.messagingSettings,
        channel,
        client: cl,
        subject,
        text: rendered,
      });

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const log: NotificationLog = {
        id: uid('nlog'),
        templateId,
        channel,
        recipientName: cl.name,
        recipientContact: contact,
        clientId: cl.id,
        subject,
        messagePreview: rendered,
        cabinetLink,
        status: delivery.deliveryStatus === 'failed' ? 'sent' : 'delivered',
        sentAt: nowStr,
      };
      db.notificationLogs.unshift(log);
      createdLogs.push(log);
      broadcast('notification:push', log);

      if (channel === 'telegram' || channel === 'whatsapp') {
        const mmsg: MessengerMessage = {
          id: uid('mmsg'),
          clientId: cl.id,
          clientName: cl.name,
          channel,
          direction: 'outbound',
          senderName: `${currentUser.name} (Рассылка)`,
          contactHandle: contact || cl.name,
          text: rendered,
          sentAt: nowStr,
          readByAdmin: true,
          deliveryStatus: delivery.deliveryStatus,
          deliveryNote: delivery.deliveryNote,
        };
        db.messengerMessages.push(mmsg);
        broadcast('messenger:message', mmsg);
      }
    }

    saveDb(db);
    res.json({ sentCount: createdLogs.length, logs: createdLogs });
  });

  app.post('/api/notifications/birthday-check', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const { force, clientIds } = (req.body || {}) as { force?: boolean; clientIds?: string[] };
    const logs = runBirthdayPushDispatch({ force, clientIds });
    res.json({ sentCount: logs.length, logs });
  });

  app.patch('/api/notifications/settings', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const { birthdayAutomationEnabled } = req.body as { birthdayAutomationEnabled?: boolean };
    if (typeof birthdayAutomationEnabled === 'boolean') {
      db.birthdayAutomationEnabled = birthdayAutomationEnabled;
      saveDb(db);
      if (birthdayAutomationEnabled) {
        runBirthdayPushDispatch();
      }
    }
    res.json({ birthdayAutomationEnabled: db.birthdayAutomationEnabled ?? true });
  });

  // Messaging Integrations Configuration (Email SMTP, Telegram Bot, WhatsApp)
  app.get('/api/messaging/settings', requireAuth(['owner', 'admin']), (_req, res) => {
    const db = getDb();
    res.json(sanitizeMessagingSettings(db.messagingSettings));
  });

  app.patch('/api/messaging/settings', requireAuth(['owner', 'admin']), (req, res) => {
    const db = getDb();
    const current = db.messagingSettings || {
      email: { enabled: false, host: '', port: 465, secure: true, user: '', password: '', fromName: 'ЭТАЛОН ПРАВИЛО', fromEmail: '' },
      telegram: { enabled: false, botUsername: '', botToken: '', webhookSecret: '', autoConfirmBooking: true },
      whatsapp: { enabled: false, provider: 'cloud_api' as const, phoneNumberId: '', accessToken: '', webhookUrl: '', businessPhone: '' },
    };
    const body = req.body as Partial<MessagingSettings>;

    if (body.email) {
      const incomingPwd = body.email.password;
      const keepPwd = incomingPwd === '••••••••' || incomingPwd === undefined;
      current.email = {
        ...current.email,
        ...body.email,
        port: Number(body.email.port ?? current.email.port) || 465,
        password: keepPwd ? current.email.password : incomingPwd,
      };
    }
    if (body.telegram) {
      const incomingToken = body.telegram.botToken;
      const keepToken = incomingToken === '••••••••' || incomingToken === undefined;
      current.telegram = {
        ...current.telegram,
        ...body.telegram,
        botToken: keepToken ? current.telegram.botToken : incomingToken,
      };
    }
    if (body.whatsapp) {
      const incomingWa = body.whatsapp.accessToken;
      const keepWa = incomingWa === '••••••••' || incomingWa === undefined;
      current.whatsapp = {
        ...current.whatsapp,
        ...body.whatsapp,
        accessToken: keepWa ? current.whatsapp.accessToken : incomingWa,
      };
    }

    db.messagingSettings = current;
    saveDb(db);
    res.json(sanitizeMessagingSettings(current));
  });

  app.post('/api/messaging/test-email', requireAuth(['owner', 'admin']), async (req, res) => {
    const db = getDb();
    const cfg = db.messagingSettings?.email;
    const { toEmail } = (req.body || {}) as { toEmail?: string };
    if (!cfg || !cfg.host || !cfg.user || !cfg.password) {
      return res.status(400).json({ error: 'Укажите SMTP хост, логин и пароль приложения, затем сохраните настройки.' });
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port) || 465,
        secure: Boolean(cfg.secure),
        auth: { user: cfg.user, pass: cfg.password },
      });
      await transporter.verify();
      if (toEmail && toEmail.includes('@')) {
        await transporter.sendMail({
          from: `"${cfg.fromName || 'ЭТАЛОН ПРАВИЛО'}" <${cfg.fromEmail || cfg.user}>`,
          to: toEmail,
          subject: 'Тестовое письмо · ЭТАЛОН ПРАВИЛО',
          text: 'Подключение SMTP настроено успешно. Уведомления о записях, оплатах и отчёты тренировок будут отправляться с этого адреса.',
        });
      }
      cfg.lastVerifiedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      cfg.lastError = undefined;
      saveDb(db);
      res.json({
        ok: true,
        message: toEmail
          ? `SMTP проверен, тестовое письмо отправлено на ${toEmail}`
          : 'Соединение с SMTP-сервером подтверждено.',
        settings: sanitizeMessagingSettings(db.messagingSettings),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка подключения SMTP';
      cfg.lastError = msg;
      saveDb(db);
      res.status(400).json({ error: `Ошибка SMTP: ${msg}` });
    }
  });

  app.post('/api/messaging/test-telegram', requireAuth(['owner', 'admin']), async (_req, res) => {
    const db = getDb();
    const tg = db.messagingSettings?.telegram;
    if (!tg || !tg.botToken) {
      return res.status(400).json({ error: 'Введите Bot Token от @BotFather и сохраните настройки Telegram.' });
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${tg.botToken}/getMe`);
      const data = (await resp.json()) as { ok: boolean; result?: { username?: string; first_name?: string }; description?: string };
      if (!data.ok || !data.result) {
        tg.lastError = data.description || 'Неверный Bot Token';
        saveDb(db);
        return res.status(400).json({ error: `Telegram API отклонил токен: ${tg.lastError}` });
      }
      tg.botUsername = data.result.username ? `@${data.result.username}` : tg.botUsername;
      tg.lastVerifiedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      tg.lastError = undefined;
      saveDb(db);
      res.json({
        ok: true,
        message: `Бот ${tg.botUsername} (${data.result.first_name || 'OK'}) успешно подключён.`,
        settings: sanitizeMessagingSettings(db.messagingSettings),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Сетевая ошибка';
      tg.lastError = msg;
      saveDb(db);
      res.status(400).json({ error: `Не удалось подключиться к Telegram API: ${msg}` });
    }
  });

  // Admin <-> Client Messenger Correspondence (Real-time WebSocket)
  app.post('/api/messenger/messages', requireAuth(), async (req, res) => {
    const currentUser = (req as express.Request & { currentUser: UserAccount }).currentUser;
    const db = getDb();
    if (!db.messengerMessages) db.messengerMessages = [];
    const { clientId, channel, text } = req.body as {
      clientId?: string;
      channel?: MessengerChannel;
      text?: string;
    };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Введите текст сообщения' });
    }

    let client: ClientProfile | undefined;
    let direction: 'inbound' | 'outbound' = 'outbound';
    if (currentUser.role === 'client') {
      client = db.clients.find((c) => c.userId === currentUser.id) || db.clients[0];
      direction = 'inbound';
    } else {
      client = db.clients.find((c) => c.id === clientId);
    }
    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const chosenChannel: MessengerChannel = channel || 'telegram';
    const contactHandle =
      chosenChannel === 'telegram'
        ? client.telegram || client.phone
        : chosenChannel === 'whatsapp'
        ? client.phone
        : 'Кабинет PWA';

    let deliveryStatus: MessengerMessage['deliveryStatus'] = 'delivered';
    let deliveryNote = direction === 'inbound' ? 'Отправлено из кабинета клиента' : 'Отправлено администратором';

    if (direction === 'outbound') {
      const delivery = await deliverExternalNotification({
        settings: db.messagingSettings,
        channel: chosenChannel,
        client,
        subject: 'Сообщение от студии ЭТАЛОН ПРАВИЛО',
        text: text.trim(),
      });
      deliveryStatus = delivery.deliveryStatus;
      deliveryNote = delivery.deliveryNote;

      db.messengerMessages.forEach((m) => {
        if (m.clientId === client!.id && m.direction === 'inbound') {
          m.readByAdmin = true;
        }
      });
    }

    const msg: MessengerMessage = {
      id: uid('mmsg'),
      clientId: client.id,
      clientName: client.name,
      channel: chosenChannel,
      direction,
      senderName: direction === 'inbound' ? client.name : currentUser.name,
      contactHandle,
      text: text.trim(),
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      readByAdmin: direction === 'outbound',
      deliveryStatus,
      deliveryNote,
    };

    db.messengerMessages.push(msg);
    saveDb(db);
    broadcast('messenger:message', msg);
    res.json(msg);
  });

  app.post('/api/messenger/mark-read', requireAuth(['owner', 'admin', 'trainer']), (req, res) => {
    const db = getDb();
    const { clientId, channel } = (req.body || {}) as { clientId?: string; channel?: MessengerChannel };
    if (!db.messengerMessages) db.messengerMessages = [];
    let updated = 0;
    db.messengerMessages.forEach((m) => {
      if ((!clientId || m.clientId === clientId) && (!channel || m.channel === channel) && !m.readByAdmin) {
        m.readByAdmin = true;
        updated += 1;
      }
    });
    if (updated > 0) {
      saveDb(db);
      broadcast('messenger:read', { clientId, channel });
    }
    res.json({ updated });
  });

  // Inbound Messenger Webhooks (Telegram & WhatsApp)
  app.post('/api/webhooks/telegram', (req, res) => {
    const db = getDb();
    if (!db.messengerMessages) db.messengerMessages = [];
    const update = req.body as {
      message?: {
        chat?: { id?: number | string };
        from?: { username?: string; first_name?: string; last_name?: string };
        text?: string;
      };
    };
    const msgObj = update?.message;
    if (!msgObj?.text) return res.json({ ok: true });

    const chatId = msgObj.chat?.id ? String(msgObj.chat.id) : undefined;
    const username = msgObj.from?.username ? `@${msgObj.from.username}` : '';
    let client = db.clients.find(
      (c) =>
        (chatId && c.telegramChatId === chatId) ||
        (username && c.telegram.toLowerCase() === username.toLowerCase())
    );
    if (!client) {
      const fullName = [msgObj.from?.first_name, msgObj.from?.last_name].filter(Boolean).join(' ') || username || 'Telegram Клиент';
      client = {
        id: uid('cl'),
        name: fullName,
        gender: 'male',
        phone: '',
        email: '',
        telegram: username || `tg:${chatId}`,
        telegramChatId: chatId,
        studioId: db.studios[0]?.id || 'st-tverskaya',
        birthYear: 1990,
        birthDate: '1990-05-14',
        goal: 'Обращение через Telegram',
        contraindications: 'Уточнить перед первой сессией',
        anthropometry: [],
        notes: [],
        npsScore: 95,
        totalSessions: 0,
        lastVisitDate: new Date().toISOString().slice(0, 10),
      };
      db.clients.unshift(client);
    } else if (chatId && !client.telegramChatId) {
      client.telegramChatId = chatId;
    }

    const inbound: MessengerMessage = {
      id: uid('mmsg'),
      clientId: client.id,
      clientName: client.name,
      channel: 'telegram',
      direction: 'inbound',
      senderName: client.name,
      contactHandle: client.telegram || username || `chat:${chatId}`,
      text: msgObj.text,
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      readByAdmin: false,
      deliveryStatus: 'delivered',
      deliveryNote: 'Входящее из Telegram Webhook',
    };
    db.messengerMessages.push(inbound);
    saveDb(db);
    broadcast('messenger:message', inbound);
    res.json({ ok: true });
  });

  app.post('/api/webhooks/whatsapp', (req, res) => {
    const db = getDb();
    if (!db.messengerMessages) db.messengerMessages = [];
    const { fromPhone, senderName, text } = (req.body || {}) as {
      fromPhone?: string;
      senderName?: string;
      text?: string;
    };
    if (!text) return res.json({ ok: true });
    const normalizedDigits = (fromPhone || '').replace(/\D/g, '').slice(-10);
    let client = normalizedDigits
      ? db.clients.find((c) => c.phone.replace(/\D/g, '').endsWith(normalizedDigits))
      : undefined;
    if (!client) {
      client = {
        id: uid('cl'),
        name: senderName || fromPhone || 'WhatsApp Клиент',
        gender: 'male',
        phone: fromPhone || '',
        email: '',
        telegram: '',
        studioId: db.studios[0]?.id || 'st-tverskaya',
        birthYear: 1990,
        birthDate: '1990-05-14',
        goal: 'Обращение через WhatsApp',
        contraindications: 'Уточнить перед первой сессией',
        anthropometry: [],
        notes: [],
        npsScore: 95,
        totalSessions: 0,
        lastVisitDate: new Date().toISOString().slice(0, 10),
      };
      db.clients.unshift(client);
    }
    const inbound: MessengerMessage = {
      id: uid('mmsg'),
      clientId: client.id,
      clientName: client.name,
      channel: 'whatsapp',
      direction: 'inbound',
      senderName: client.name,
      contactHandle: client.phone || fromPhone || 'WhatsApp',
      text,
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      readByAdmin: false,
      deliveryStatus: 'delivered',
      deliveryNote: 'Входящее из WhatsApp Webhook',
    };
    db.messengerMessages.push(inbound);
    saveDb(db);
    broadcast('messenger:message', inbound);
    res.json({ ok: true });
  });

  // Public Online Booking Link Endpoints (no login required for client booking link /?book=1)
  app.get('/api/public/booking-info', (req, res) => {
    const db = getDb();
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
    const matchedClient = clientId ? db.clients.find((c) => c.id === clientId) : undefined;
    res.json({
      studios: db.studios
        .filter((s) => s.active)
        .map(
          ({
            id,
            name,
            city,
            address,
            phone,
            email,
            routeHint,
            socials,
            openHours,
            weekdayOpenHours,
            weekendOpenHours,
            framesCount,
            description,
            photos,
          }) => ({
            id,
            name,
            city,
            address,
            phone,
            email: email || '',
            routeHint: routeHint || '',
            socials,
            openHours,
            weekdayOpenHours,
            weekendOpenHours,
            framesCount,
            description: description || '',
            photos: Array.isArray(photos) ? photos : [],
          })
        ),
      services: db.services.filter((s) => s.active),
      trainers: db.users
        .filter((u) => u.role === 'trainer' && u.active)
        .map(({ id, name, studioId, avatarInitials, trainerProfile }) => ({
          id,
          name,
          studioId,
          avatarInitials,
          trainerProfile,
        })),
      promos: db.promos
        .filter((p) => p.active)
        .map(({ code, title, discountPercent, studioId }) => ({ code, title, discountPercent, studioId })),
      reviews: db.reviews || [],
      brandAbout: db.brandAbout || DEFAULT_BRAND_ABOUT,
      prefillClient: matchedClient
        ? {
            id: matchedClient.id,
            name: matchedClient.name,
            phone: matchedClient.phone,
            email: matchedClient.email,
            telegram: matchedClient.telegram,
            studioId: matchedClient.studioId,
          }
        : undefined,
    });
  });

  app.post('/api/public/bookings', async (req, res) => {
    const db = getDb();
    if (!db.messengerMessages) db.messengerMessages = [];
    const body = req.body as {
      studioId?: string;
      serviceId?: string;
      trainerId?: string;
      date?: string;
      time?: string;
      promoCode?: string;
      clientId?: string;
      clientName?: string;
      clientPhone?: string;
      clientEmail?: string;
      clientTelegram?: string;
    };

    const studio = db.studios.find((s) => s.id === body.studioId && s.active) || db.studios[0];
    const service = db.services.find((s) => s.id === body.serviceId && s.active) || db.services[0];
    const trainer =
      db.users.find((u) => u.id === body.trainerId && u.role === 'trainer') ||
      db.users.find((u) => u.role === 'trainer');
    if (!studio || !service || !trainer) {
      return res.status(400).json({ error: 'Студия, услуга или тренер недоступны для записи' });
    }
    if (!body.clientName?.trim() || !body.clientPhone?.trim()) {
      return res.status(400).json({ error: 'Укажите имя и телефон для подтверждения записи' });
    }

    const bookingDate = body.date || new Date().toISOString().slice(0, 10);
    const bookingTime = body.time || '12:00';
    if (!isTimeWithinOpenHours(bookingTime, studio, bookingDate)) {
      const range = getStudioHoursForDate(studio, bookingDate);
      const dayTypeLabel = isWeekendDate(bookingDate) ? 'выходные' : 'будни';
      return res.status(400).json({
        error: `Время записи (${bookingTime}) выходит за часы приёма студии (${dayTypeLabel}: ${range.start} – ${range.end})`,
      });
    }

    const phoneDigits = body.clientPhone.replace(/\D/g, '').slice(-10);
    let client =
      (body.clientId && db.clients.find((c) => c.id === body.clientId)) ||
      (phoneDigits.length >= 7
        ? db.clients.find((c) => c.phone.replace(/\D/g, '').endsWith(phoneDigits))
        : undefined);

    if (!client) {
      client = {
        id: uid('cl'),
        name: body.clientName.trim(),
        gender: 'male',
        phone: body.clientPhone.trim(),
        email: body.clientEmail?.trim() || '',
        telegram: body.clientTelegram?.trim() || '',
        studioId: studio.id,
        birthYear: 1990,
        birthDate: '1990-05-14',
        goal: 'Онлайн-запись по публичной ссылке',
        contraindications: 'Уточнить перед сессией',
        anthropometry: [],
        notes: [],
        npsScore: 95,
        totalSessions: 0,
        lastVisitDate: new Date().toISOString().slice(0, 10),
      };
      db.clients.unshift(client);
    }

    let finalAmount = service.priceRub;
    let appliedPromo: string | undefined;
    if (body.promoCode?.trim()) {
      const promo = db.promos.find(
        (p) => p.code.toUpperCase() === body.promoCode!.trim().toUpperCase() && p.active
      );
      if (promo) {
        finalAmount = Math.round(service.priceRub * (1 - promo.discountPercent / 100));
        promo.usageCount += 1;
        appliedPromo = promo.code;
      }
    }

    const booking: Booking = {
      id: uid('bk'),
      studioId: studio.id,
      clientId: client.id,
      clientName: client.name,
      trainerId: trainer.id,
      trainerName: trainer.name,
      serviceId: service.id,
      serviceName: service.name,
      priceRub: service.priceRub,
      date: bookingDate,
      time: bookingTime,
      durationMin: service.durationMin,
      status: 'pending',
      paymentStatus: 'unpaid',
      promoCode: appliedPromo,
      finalAmountRub: finalAmount,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.bookings.unshift(booking);

    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const confirmText = `Новая онлайн-запись: ${client.name}, ${bookingDate} в ${bookingTime} (${service.name}, студия ${studio.name}, тренер ${trainer.name}, к оплате ${finalAmount} ₽).`;
    const confirmChannel: 'telegram' | 'email' | 'push' = client.telegram
      ? 'telegram'
      : client.email
      ? 'email'
      : 'push';
    const delivery = await deliverExternalNotification({
      settings: db.messagingSettings,
      channel: confirmChannel,
      client,
      subject: 'Подтверждение онлайн-записи · ЭТАЛОН ПРАВИЛО',
      text: `${client.name}, ваша заявка на ${bookingDate} в ${bookingTime} (${studio.address}, тренер ${trainer.name}) принята! Кабинет: /?cabinet=client&clientId=${client.id}`,
    });

    const log: NotificationLog = {
      id: uid('nlog'),
      channel: confirmChannel,
      recipientName: client.name,
      recipientContact: client.telegram || client.email || client.phone,
      clientId: client.id,
      subject: 'Онлайн-запись по ссылке',
      messagePreview: confirmText,
      cabinetLink: `/?cabinet=client&clientId=${client.id}`,
      status: delivery.deliveryStatus === 'failed' ? 'sent' : 'delivered',
      sentAt: nowStr,
    };
    db.notificationLogs.unshift(log);

    const mmsg: MessengerMessage = {
      id: uid('mmsg'),
      clientId: client.id,
      clientName: client.name,
      channel: confirmChannel === 'telegram' ? 'telegram' : 'web_chat',
      direction: 'inbound',
      senderName: client.name,
      contactHandle: client.telegram || client.phone,
      text: `Запись по онлайн-ссылке на ${bookingDate} в ${bookingTime} (${service.name})`,
      sentAt: nowStr,
      readByAdmin: false,
      deliveryStatus: 'delivered',
      deliveryNote: 'Автособытие из формы онлайн-записи',
    };
    db.messengerMessages.push(mmsg);

    saveDb(db);
    broadcast('booking:created', booking);
    broadcast('notification:push', log);
    broadcast('messenger:message', mmsg);

    res.json({
      booking,
      clientId: client.id,
      studioAddress: studio.address,
      cabinetLink: `/?cabinet=client&clientId=${client.id}`,
    });
  });

  // System Updates, Backups & Domain Tunnel Settings (Owner only)
  const readPkgVersion = (): string => {
    try {
      const pkgRaw = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { version?: string };
      return pkg.version || '1.2.0';
    } catch {
      return '1.2.0';
    }
  };

  app.get('/api/system/info', requireAuth(['owner']), async (_req, res) => {
    const db = getDb();
    const hasGit = fs.existsSync(path.resolve(process.cwd(), '.git'));
    let commitHash = 'release-bundle';
    if (hasGit) {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD']);
        commitHash = stdout.trim() || commitHash;
      } catch {
        // ignore git error
      }
    }
    res.json({
      appName: 'ЭТАЛОН ПРАВИЛО',
      version: readPkgVersion(),
      commitHash,
      hasGit,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      port: PORT,
      systemSettings: db.systemSettings || {
        requireEmailVerificationOnLogin: false,
        domainUrl: '',
        tunnelMode: 'cloudflare',
        autoCheckUpdates: true,
        releaseChannel: 'stable',
      },
    });
  });

  app.patch('/api/system/settings', requireAuth(['owner']), (req, res) => {
    const db = getDb();
    const current: SystemSecuritySettings = db.systemSettings || {
      requireEmailVerificationOnLogin: false,
      domainUrl: '',
      tunnelMode: 'cloudflare',
      autoCheckUpdates: true,
      releaseChannel: 'stable',
    };
    const body = req.body as Partial<SystemSecuritySettings>;
    if (typeof body.requireEmailVerificationOnLogin === 'boolean') {
      current.requireEmailVerificationOnLogin = body.requireEmailVerificationOnLogin;
    }
    if (typeof body.domainUrl === 'string') {
      current.domainUrl = body.domainUrl.trim();
    }
    if (body.tunnelMode === 'cloudflare' || body.tunnelMode === 'nginx' || body.tunnelMode === 'caddy' || body.tunnelMode === 'local') {
      current.tunnelMode = body.tunnelMode;
    }
    if (typeof body.autoCheckUpdates === 'boolean') {
      current.autoCheckUpdates = body.autoCheckUpdates;
    }
    if (body.releaseChannel === 'stable' || body.releaseChannel === 'beta') {
      current.releaseChannel = body.releaseChannel;
    }
    db.systemSettings = current;
    saveDb(db);
    res.json(current);
  });

  app.get('/api/system/backup', requireAuth(['owner']), (_req, res) => {
    const db = getDb();
    saveDb(db);
    const dateSlug = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="etalon-pravilo-backup-${dateSlug}.json"`
    );
    res.send(JSON.stringify(db, null, 2));
  });

  app.post('/api/system/check-updates', requireAuth(['owner']), async (_req, res) => {
    const db = getDb();
    const version = readPkgVersion();
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (db.systemSettings) {
      db.systemSettings.lastUpdateCheckAt = nowStr;
      saveDb(db);
    }

    const hasGit = fs.existsSync(path.resolve(process.cwd(), '.git'));
    if (!hasGit) {
      return res.json({
        currentVersion: version,
        currentCommit: 'standalone',
        updateAvailable: false,
        commitsBehind: 0,
        checkedAt: nowStr,
        hasGit: false,
        message: 'Установлена автономная серверная сборка. Для 1-клик обновления по Git разместите репозиторий через git clone или загрузите новый архив с заменой без удаления папки data/.',
      });
    }

    try {
      const { stdout: hashOut } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD']);
      await execFileAsync('git', ['fetch', '--quiet'], { timeout: 10000 }).catch(() => undefined);
      let commitsBehind = 0;
      try {
        const { stdout: countOut } = await execFileAsync('git', ['rev-list', '--count', 'HEAD..@{u}']);
        commitsBehind = Number(countOut.trim()) || 0;
      } catch {
        commitsBehind = 0;
      }
      res.json({
        currentVersion: version,
        currentCommit: hashOut.trim(),
        updateAvailable: commitsBehind > 0,
        commitsBehind,
        checkedAt: nowStr,
        hasGit: true,
        message:
          commitsBehind > 0
            ? `Доступно обновлений (коммитов): ${commitsBehind}. Нажмите «Установить обновление», база data/studio-db.json будет сохранена.`
            : `Установлена актуальная версия ${version} (${hashOut.trim()}).`,
      });
    } catch (err) {
      res.json({
        currentVersion: version,
        currentCommit: 'local',
        updateAvailable: false,
        commitsBehind: 0,
        checkedAt: nowStr,
        hasGit: true,
        message: `Локальная проверка выполнена (${err instanceof Error ? err.message : 'без удалённого репозитория'}).`,
      });
    }
  });

  app.post('/api/system/apply-update', requireAuth(['owner']), async (_req, res) => {
    const db = getDb();
    saveDb(db);
    const hasGit = fs.existsSync(path.resolve(process.cwd(), '.git'));
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (!hasGit) {
      return res.status(400).json({
        error: 'В текущем каталоге не инициализирован .git. Для автоматического обновления клонируйте проект с Git или замените файлы приложения (папка data/ остаётся нетронутой).',
      });
    }
    try {
      const { stdout: pullOut } = await execFileAsync('git', ['pull', '--ff-only'], { timeout: 30000 });
      const { stdout: buildOut } = await execFileAsync('npm', ['run', 'build'], { timeout: 90000 });
      if (db.systemSettings) {
        db.systemSettings.lastUpdatedAt = nowStr;
        saveDb(db);
      }
      res.json({
        ok: true,
        updatedAt: nowStr,
        message: 'Обновление загружено и пересобрано. Перезапустите службу (systemctl restart pravilo-studio), чтобы применить новый код.',
        log: `${pullOut}\n${buildOut}`.slice(0, 1500),
      });
    } catch (err) {
      res.status(500).json({
        error: `Не удалось выполнить обновление: ${err instanceof Error ? err.message : 'ошибка команды'}`,
      });
    }
  });

  // Vite Dev or Static Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pravilo Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
