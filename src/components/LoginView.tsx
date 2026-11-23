import React, { useState } from 'react';
import {
  Lock,
  ArrowRight,
  Smartphone,
  CalendarPlus,
  Mail,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import type { UserAccount } from '../types';
import { apiRequest, setAuthToken } from '../utils/api';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  onOpenPublicBooking: () => void;
  onSuccess: (user: UserAccount) => void;
  sessionNotice?: string;
}

const DEMO_ACCOUNTS = [
  { roleLabel: 'Владелец сети', login: 'owner', pwd: 'owner123', desc: 'Все студии, аналитика, настройки, права' },
  { roleLabel: 'Администратор', login: 'admin', pwd: 'admin123', desc: 'Расписание, услуги, акции, рассылки, касса' },
  { roleLabel: 'Тренер (PWA)', login: 'trainer', pwd: 'trainer123', desc: 'Клиенты (без копирования), программы, блог, график' },
  { roleLabel: 'Клиент (PWA)', login: 'client', pwd: 'client123', desc: 'Запись онлайн, прогресс, абонемент, офлайн' },
];

export const LoginView: React.FC<LoginViewProps> = ({
  onOpenPublicBooking,
  onSuccess,
  sessionNotice,
}) => {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [login, setLogin] = useState('owner');
  const [password, setPassword] = useState('owner123');
  const [emailCode, setEmailCode] = useState('');
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(sessionNotice || '');
  const [infoMsg, setInfoMsg] = useState('');

  // Reset password by E-mail state
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const performLogin = async (l: string, p: string, code?: string) => {
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: l, password: p, ...(code ? { emailCode: code } : {}) }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.requiresEmailCode) {
          setNeedsEmailCode(true);
        }
        throw new Error(data?.error || 'Ошибка входа');
      }
      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(login, password, needsEmailCode ? emailCode : undefined);
  };

  const quickLogin = async (l: string, p: string) => {
    setMode('login');
    setLogin(l);
    setPassword(p);
    setNeedsEmailCode(false);
    setEmailCode('');
    await performLogin(l, p);
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        maskedEmail: string;
        sentViaSmtp: boolean;
        message: string;
      }>('/api/auth/request-email-code', {
        method: 'POST',
        body: JSON.stringify({ loginOrEmail: resetIdentifier, purpose: 'reset_password' }),
      });
      setInfoMsg(res.message);
      if (res.sentViaSmtp) {
        setResetCodeSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить код');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(
        '/api/auth/reset-password-by-email',
        {
          method: 'POST',
          body: JSON.stringify({
            loginOrEmail: resetIdentifier,
            code: resetCode,
            newPassword: resetNewPassword,
          }),
        }
      );
      setInfoMsg(res.message);
      setLogin(resetIdentifier);
      setPassword(resetNewPassword);
      setMode('login');
      setResetCodeSent(false);
      setResetCode('');
      setResetNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col st-canvas">
      <div className="st-ornament-bar" />
      <div className="flex-1 grid lg:grid-cols-12">
        {/* Left Hero Visual */}
        <div className="lg:col-span-7 relative min-h-[280px] overflow-hidden st-hero-gradient flex flex-col justify-between p-8 lg:p-12">
          <img
            src="/assets/aistudio/IMG_6064_172a7fc2.JPG"
            alt="Дракон — символ силы и баланса ЭТАЛОН ПРАВИЛО"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/35" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="h-11 rounded-xl bg-white/95 px-3 py-1.5 flex items-center shadow-sm shrink-0">
              <img
                src="/assets/aistudio/logo_full_etalon.png"
                alt="ЭТАЛОН ПРАВИЛО"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenPublicBooking}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium backdrop-blur-sm cursor-pointer whitespace-nowrap"
              >
                <CalendarPlus className="w-3.5 h-3.5 text-amber-300" />
                <span>Онлайн-запись клиента</span>
              </button>
              <PWAInstallButton />
            </div>
          </div>

          <div className="relative z-10 max-w-xl mt-12">
            <p className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-3">
              Сеть студий биомеханической коррекции
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
              Управление студией, запись и живая телеметрия тренировок
            </h1>
            <p className="mt-4 text-sm sm:text-base text-white/85 leading-relaxed max-w-lg">
              Единая платформа для владельца сети, администраторов, тренеров и клиентов с поддержкой BLE-датчиков MYOblue, Wahoo TICKR FIT, тонометра B05, весов Xiaomi Mi Scale 2 и тензодатчиков ESP32.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-6 pt-6 border-t border-white/15">
              <div>
                <div className="font-mono text-2xl font-bold text-white tabular-nums">3</div>
                <div className="text-xs text-white/80 mt-1">Студии в сети</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-white tabular-nums">5 BLE</div>
                <div className="text-xs text-white/80 mt-1">Датчиков в реальном времени</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-white tabular-nums">PWA + ПК</div>
                <div className="text-xs text-white/80 mt-1">Веб, десктоп и домен</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Form */}
        <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 st-surface border-l st-border">
          <div className="w-full max-w-md space-y-6">
            {mode === 'login' ? (
              <>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Вход в систему</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">
                      Логин или E-mail
                    </label>
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => {
                        setLogin(e.target.value);
                        setNeedsEmailCode(false);
                      }}
                      required
                      placeholder="owner / email@etalon-pravilo.ru"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium">Пароль</label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          setError('');
                          setInfoMsg('');
                          setResetIdentifier(login);
                        }}
                        className="text-xs st-accent-text hover:underline cursor-pointer"
                      >
                        Забыли пароль? Сброс через E-mail
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface focus:outline-none focus:ring-2 focus:ring-cyan-600 pr-10"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                    </div>
                  </div>

                  {needsEmailCode && (
                    <div className="p-3.5 rounded-lg st-surface-muted border st-border space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold st-accent-text">
                        <Mail className="w-3.5 h-3.5" />
                        <span>Двухфакторная проверка по E-mail</span>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="Введите 6-значный код из письма"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border st-border st-surface"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                  {infoMsg && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                      {infoMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg st-accent-bg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <span>{loading ? 'Проверка доступа...' : 'Войти в кабинет'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="pt-5 border-t st-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium st-muted">Быстрый вход по роли</span>
                    <span className="text-xs font-mono st-muted">логин / пароль</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.login}
                        type="button"
                        onClick={() => quickLogin(acc.login, acc.pwd)}
                        className="text-left p-3 rounded-lg border st-border st-surface hover:opacity-90 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{acc.roleLabel}</span>
                          {(acc.login === 'client' || acc.login === 'trainer') && (
                            <Smartphone className="w-3.5 h-3.5 st-accent-text shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] font-mono st-muted mt-0.5">
                          {acc.login} / {acc.pwd}
                        </div>
                        <div className="text-[11px] st-muted mt-1 line-clamp-1">{acc.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setInfoMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium st-muted hover:opacity-90 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Вернуться ко входу</span>
                </button>

                <div>
                  <div className="flex items-center gap-2 text-xs font-medium st-accent-text mb-1.5">
                    <KeyRound className="w-4 h-4" />
                    <span>Восстановление пароля</span>
                  </div>
                  <h2 className="font-display text-2xl font-bold">Сброс пароля через E-mail</h2>
                  <p className="mt-1 text-xs st-muted leading-relaxed">
                    Укажите логин или привязанный E-mail. Если SMTP настроен администратором, на почту придёт 6-значный код; иначе обратитесь к администратору или владельцу для сброса в разделе настроек.
                  </p>
                </div>

                {!resetCodeSent ? (
                  <form onSubmit={handleRequestResetCode} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Логин или E-mail</label>
                      <input
                        type="text"
                        required
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        placeholder="trainer или trainer@etalon-pravilo.ru"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface"
                      />
                    </div>
                    {error && (
                      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                        {error}
                      </div>
                    )}
                    {infoMsg && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                        {infoMsg}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-lg st-accent-bg text-sm font-medium cursor-pointer disabled:opacity-50"
                    >
                      {loading ? 'Отправка кода...' : 'Отправить код подтверждения на E-mail'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmResetPassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Код из письма</label>
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="6 цифр из E-mail"
                        className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border st-border st-surface"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Новый пароль (минимум 6 символов)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface"
                      />
                    </div>
                    {error && (
                      <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                        {error}
                      </div>
                    )}
                    {infoMsg && (
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                        {infoMsg}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-lg st-accent-bg text-sm font-medium cursor-pointer disabled:opacity-50"
                    >
                      {loading ? 'Сохранение...' : 'Установить новый пароль'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

