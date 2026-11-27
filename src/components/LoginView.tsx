import React, { useEffect, useState } from 'react';
import {
  Lock,
  ArrowRight,
  CalendarPlus,
  Mail,
  KeyRound,
  ArrowLeft,
  Smartphone,
  Scale,
} from 'lucide-react';
import type { BrandAboutInfo, LegalAgreementDoc, UserAccount } from '../types';
import { apiRequest, setAuthToken } from '../utils/api';
import { DEFAULT_BRAND_ABOUT } from '../utils/brandAbout';
import { PWAInstallButton } from './PWAInstallButton';
import { AndroidAppsModal } from './AndroidAppsModal';
import { LegalAgreementsModal } from './LegalAgreementsModal';
import { setActiveLegalBundle } from '../utils/legalAgreements';
import {
  applyAndroidAppManifestToDocument,
  getActiveAndroidAppFlavor,
  getAndroidAppDefinition,
} from '../utils/androidApps';

interface LoginViewProps {
  onOpenPublicBooking: () => void;
  onSuccess: (user: UserAccount) => void;
  sessionNotice?: string;
  brandAbout?: BrandAboutInfo;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onOpenPublicBooking,
  onSuccess,
  sessionNotice,
  brandAbout,
}) => {
  const [publicBrand, setPublicBrand] = useState<BrandAboutInfo>(
    brandAbout || DEFAULT_BRAND_ABOUT
  );
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
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
  const [showAndroidModal, setShowAndroidModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const activeAndroidFlavor = getActiveAndroidAppFlavor();
  const activeAndroidApp = getAndroidAppDefinition(activeAndroidFlavor);

  useEffect(() => {
    applyAndroidAppManifestToDocument(activeAndroidFlavor, publicBrand.brandName);
  }, [activeAndroidFlavor, publicBrand.brandName]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/legal-agreements')
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { documents?: LegalAgreementDoc[]; bundleVersion?: string } | null) => {
        if (!cancelled && res && typeof res === 'object') {
          setActiveLegalBundle(res.documents, res.bundleVersion);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (brandAbout) {
      setPublicBrand(brandAbout);
      return;
    }
    let cancelled = false;
    fetch('/api/public/brand-about')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!cancelled && res && typeof res === 'object') {
          setPublicBrand({ ...DEFAULT_BRAND_ABOUT, ...res });
        }
      })
      .catch(() => {
        // fallback to default
      });
    return () => {
      cancelled = true;
    };
  }, [brandAbout]);

  const performLogin = async (l: string, p: string, code?: string) => {
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: l,
          password: p,
          ...(code ? { emailCode: code } : {}),
          appFlavor: activeAndroidFlavor || 'web',
        }),
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

  const logoSrc = publicBrand.logoUrl || DEFAULT_BRAND_ABOUT.logoUrl!;
  const heroBgSrc = publicBrand.homeHeroImageUrl || DEFAULT_BRAND_ABOUT.homeHeroImageUrl!;
  const heroBadge = publicBrand.homeBadge || DEFAULT_BRAND_ABOUT.homeBadge!;
  const heroTitle = publicBrand.homeTitle || DEFAULT_BRAND_ABOUT.homeTitle!;
  const heroSubtitle = publicBrand.homeSubtitle || DEFAULT_BRAND_ABOUT.homeSubtitle!;
  const highlights =
    publicBrand.homeHighlights && publicBrand.homeHighlights.length > 0
      ? publicBrand.homeHighlights
      : DEFAULT_BRAND_ABOUT.homeHighlights || [];

  return (
    <div className="min-h-screen flex flex-col st-canvas">
      <div className="st-ornament-bar" />
      <div className="flex-1 grid lg:grid-cols-12">
        {/* Left Hero Visual */}
        <div className="lg:col-span-7 relative min-h-[280px] overflow-hidden st-hero-gradient flex flex-col justify-between p-8 lg:p-12">
          <img
            src={heroBgSrc}
            alt={publicBrand.brandName || 'ЭТАЛОН ПРАВИЛО'}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/35" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="h-11 rounded-xl bg-white/95 px-3 py-1.5 flex items-center shadow-sm shrink-0">
              <img
                src={logoSrc}
                alt={publicBrand.brandName || 'ЭТАЛОН ПРАВИЛО'}
                className="h-full w-auto max-w-[200px] object-contain"
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
              {heroBadge}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
              {heroTitle}
            </h1>
            <p className="mt-4 text-sm sm:text-base text-white/85 leading-relaxed max-w-lg">
              {heroSubtitle}
            </p>

            {highlights.length > 0 && (
              <div
                className={`mt-8 grid gap-6 pt-6 border-t border-white/15 ${
                  highlights.length >= 3 ? 'grid-cols-3' : highlights.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {highlights.map((hl, idx) => (
                  <div key={`${hl.value}-${idx}`}>
                    <div className="font-mono text-2xl font-bold text-white tabular-nums">
                      {hl.value}
                    </div>
                    <div className="text-xs text-white/80 mt-1">{hl.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Auth Form */}
        <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 st-surface border-l st-border">
          <div className="w-full max-w-md space-y-6">
            {mode === 'login' ? (
              <>
                <div className="space-y-2">
                  {activeAndroidApp && (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl st-surface-muted border st-border">
                      <img
                        src={activeAndroidApp.iconUrl}
                        alt={activeAndroidApp.title}
                        className="w-9 h-9 rounded-lg border st-border shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">
                          {activeAndroidApp.title}
                        </div>
                        <div className="text-[11px] st-muted truncate">
                          Android-версия · {activeAndroidApp.roleLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = '/';
                        }}
                        className="text-[11px] st-accent-text hover:underline shrink-0 cursor-pointer"
                      >
                        Сменить
                      </button>
                    </div>
                  )}
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
                      placeholder="Логин или E-mail"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1.5">Пароль</label>
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
                    <div className="mt-1.5 flex justify-end">
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

                <div className="pt-3 border-t st-border space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs st-muted">Мобильные версии для Android:</span>
                    <button
                      type="button"
                      onClick={() => setShowAndroidModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
                    >
                      <Smartphone className="w-3.5 h-3.5 st-accent-text" />
                      <span>Админ / Тренер / Клиент</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLegalModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border st-border st-surface-muted text-xs st-muted hover:opacity-90 cursor-pointer"
                  >
                    <Scale className="w-3.5 h-3.5 st-accent-text" />
                    <span>Юридические соглашения и политика конфиденциальности</span>
                  </button>
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
      {showAndroidModal && (
        <AndroidAppsModal
          brandName={publicBrand.brandName}
          showApkInstructions={false}
          onClose={() => setShowAndroidModal(false)}
        />
      )}
      {showLegalModal && (
        <LegalAgreementsModal
          role={
            activeAndroidFlavor === 'admin'
              ? 'admin'
              : activeAndroidFlavor === 'trainer'
              ? 'trainer'
              : 'client'
          }
          mandatoryMode={false}
          brandName={publicBrand.brandName}
          onClose={() => setShowLegalModal(false)}
        />
      )}
    </div>
  );
};

