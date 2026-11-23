import React, { useEffect, useState } from 'react';
import {
  X,
  Sun,
  Moon,
  Shield,
  UserPlus,
  KeyRound,
  Palette,
  Mail,
  CheckCircle2,
  UserX,
  UserCheck,
  RefreshCw,
  Download,
  Globe,
  Monitor,
  Copy,
  Check,
  ImagePlus,
  Trash2,
  UserCog,
  Pencil,
  BellRing,
} from 'lucide-react';
import type {
  ClientProfile,
  EmploymentStatus,
  Studio,
  StudioStyleTheme,
  SystemSecuritySettings,
  TrainerPublicProfile,
  UserAccount,
  UserRole,
} from '../types';
import { apiRequest, getAuthToken, setAuthToken } from '../utils/api';
import { BACKGROUND_PRESETS, STYLE_THEME_OPTIONS } from '../utils/themes';
import { PWAInstallButton } from './PWAInstallButton';
import { TrainerProfileEditorForm } from './TrainerProfileCard';
import {
  getNotificationPermissionState,
  isStaffRole,
  requestStaffPushPermission,
  showStaffSystemNotification,
  type StaffPushPermissionState,
} from '../utils/staffNotifications';

interface ProfileSettingsModalProps {
  currentUser: UserAccount;
  users: UserAccount[];
  studios: Studio[];
  clientProfile?: ClientProfile;
  theme: 'light' | 'dark';
  styleTheme: StudioStyleTheme;
  bgImage: string;
  bgOpacity: number;
  onToggleTheme: (t: 'light' | 'dark') => void;
  onSelectStyleTheme: (s: StudioStyleTheme) => void;
  onChangeBgImage: (url: string) => void;
  onChangeBgOpacity: (opacity: number) => void;
  onCurrentUserUpdated: (u: UserAccount) => void;
  onClientUpdated?: (c: ClientProfile) => void;
  onUserCreated: (u: UserAccount) => void;
  onUserUpdated: (u: UserAccount) => void;
  onPushPermissionChange?: (perm: StaffPushPermissionState) => void;
  onClose: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Владелец сети (полный доступ)',
  admin: 'Администратор студии',
  trainer: 'Тренер',
  client: 'Клиент',
};

const ROLE_SHORT: Record<UserRole, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  trainer: 'Тренер',
  client: 'Клиент',
};

interface SystemInfoResponse {
  appName: string;
  version: string;
  commitHash: string;
  hasGit: boolean;
  nodeVersion: string;
  platform: string;
  uptimeSec: number;
  port: number;
  systemSettings: SystemSecuritySettings;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  currentUser,
  users,
  studios,
  clientProfile,
  theme,
  styleTheme,
  bgImage,
  bgOpacity,
  onToggleTheme,
  onSelectStyleTheme,
  onChangeBgImage,
  onChangeBgOpacity,
  onCurrentUserUpdated,
  onClientUpdated,
  onUserCreated,
  onUserUpdated,
  onPushPermissionChange,
  onClose,
}) => {
  const isOwnerOrAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  const isOwner = currentUser.role === 'owner';
  const isStaff = isStaffRole(currentUser.role);
  const [pushPerm, setPushPerm] = useState<StaffPushPermissionState>(() =>
    getNotificationPermissionState()
  );
  const [pushTestMsg, setPushTestMsg] = useState('');

  const [tab, setTab] = useState<'profile' | 'staff' | 'system'>('profile');
  const [bgUrlInput, setBgUrlInput] = useState(() =>
    bgImage && !bgImage.startsWith('data:') ? bgImage : ''
  );
  const [bgMsg, setBgMsg] = useState('');

  // Own Personal Profile Data
  const [myName, setMyName] = useState(currentUser.name || '');
  const [myPhone, setMyPhone] = useState(currentUser.phone || '');
  const [myTelegram, setMyTelegram] = useState(currentUser.telegramHandle || '');
  const [myStudioId, setMyStudioId] = useState(currentUser.studioId || studios[0]?.id || '');
  const [myGender, setMyGender] = useState<'male' | 'female'>(clientProfile?.gender || 'male');
  const [myBirthDate, setMyBirthDate] = useState(clientProfile?.birthDate || '');
  const [myGoal, setMyGoal] = useState(clientProfile?.goal || '');
  const [myContra, setMyContra] = useState(clientProfile?.contraindications || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [myTrainerSaving, setMyTrainerSaving] = useState(false);
  const [myTrainerMsg, setMyTrainerMsg] = useState('');

  // Own E-mail & Verification
  const [myEmail, setMyEmail] = useState(currentUser.email || '');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [emailVerifyStep, setEmailVerifyStep] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');

  // Own Password
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMessage, setPwdMessage] = useState('');

  // Staff Management (Owner / Admin)
  const [staffFilter, setStaffFilter] = useState<'all' | 'working' | 'fired'>('all');
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPwdInput, setResetPwdInput] = useState('');
  const [resetSendEmail, setResetSendEmail] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserTg, setEditUserTg] = useState('');
  const [editUserStudioId, setEditUserStudioId] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('trainer');
  const [editTrainerProfileUserId, setEditTrainerProfileUserId] = useState<string | null>(null);
  const [editTrainerProfileSaving, setEditTrainerProfileSaving] = useState(false);
  const [staffActionMsg, setStaffActionMsg] = useState('');

  // Create Staff/Client User (Owner/Admin)
  const [uLogin, setULogin] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState<UserRole>('trainer');
  const [uStudioId, setUStudioId] = useState(studios[0]?.id || '');
  const [userMsg, setUserMsg] = useState('');

  // System Updates, Desktop & Domain (Owner only)
  const [sysInfo, setSysInfo] = useState<SystemInfoResponse | null>(null);
  const [sysSettings, setSysSettings] = useState<SystemSecuritySettings>({
    requireEmailVerificationOnLogin: false,
    domainUrl: '',
    tunnelMode: 'cloudflare',
    autoCheckUpdates: true,
    releaseChannel: 'stable',
  });
  const [updateCheckResult, setUpdateCheckResult] = useState<{
    updateAvailable: boolean;
    message: string;
    checkedAt: string;
  } | null>(null);
  const [sysBusy, setSysBusy] = useState(false);
  const [sysMsg, setSysMsg] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isOwner && tab === 'system' && !sysInfo) {
      apiRequest<SystemInfoResponse>('/api/system/info')
        .then((res) => {
          setSysInfo(res);
          setSysSettings(res.systemSettings);
        })
        .catch(() => undefined);
    }
  }, [isOwner, tab, sysInfo]);

  const handleSavePersonalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileSaving(true);
    try {
      const res = await apiRequest<{ user: UserAccount; client?: ClientProfile | null }>(
        '/api/auth/profile',
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: myName.trim(),
            phone: myPhone.trim(),
            email: myEmail.trim(),
            telegramHandle: myTelegram.trim(),
            ...(myStudioId ? { studioId: myStudioId } : {}),
            ...(clientProfile
              ? {
                  gender: myGender,
                  birthDate: myBirthDate,
                  goal: myGoal.trim(),
                  contraindications: myContra.trim(),
                }
              : {}),
          }),
        }
      );
      onCurrentUserUpdated(res.user);
      onUserUpdated(res.user);
      if (res.client) onClientUpdated?.(res.client);
      setProfileMsg('Личные данные успешно обновлены.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Ошибка сохранения личных данных');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveMyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg('');
    try {
      const res = await apiRequest<{ user: UserAccount; client?: ClientProfile | null }>(
        '/api/auth/profile',
        {
          method: 'PATCH',
          body: JSON.stringify({ email: myEmail.trim() }),
        }
      );
      onCurrentUserUpdated(res.user);
      onUserUpdated(res.user);
      if (res.client) onClientUpdated?.(res.client);
      setEmailMsg('E-mail сохранён. Теперь можно запросить код подтверждения.');
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : 'Ошибка сохранения E-mail');
    }
  };

  const handleRequestEmailVerify = async () => {
    setEmailMsg('');
    try {
      const res = await apiRequest<{
        ok: boolean;
        sentViaSmtp: boolean;
        message: string;
      }>('/api/auth/request-email-code', {
        method: 'POST',
        body: JSON.stringify({ email: myEmail.trim(), purpose: 'verify_email' }),
      });
      setEmailMsg(res.message);
      if (res.sentViaSmtp) {
        setEmailVerifyStep(true);
      }
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : 'Ошибка отправки кода');
    }
  };

  const handleConfirmEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg('');
    try {
      const res = await apiRequest<{ ok: boolean; user: UserAccount }>(
        '/api/auth/confirm-email',
        {
          method: 'POST',
          body: JSON.stringify({ code: emailCodeInput }),
        }
      );
      onCurrentUserUpdated(res.user);
      onUserUpdated(res.user);
      setEmailVerifyStep(false);
      setEmailCodeInput('');
      setEmailMsg('E-mail успешно подтверждён.');
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : 'Неверный код');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage('');
    try {
      const res = await apiRequest<{ ok: boolean; token?: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });
      if (res.token) setAuthToken(res.token);
      setPwdMessage('Пароль успешно обновлён.');
      setCurPwd('');
      setNewPwd('');
    } catch (err) {
      setPwdMessage(err instanceof Error ? err.message : 'Ошибка смены пароля');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMsg('');
    try {
      const created = await apiRequest<UserAccount>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          login: uLogin,
          password: uPassword,
          name: uName,
          email: uEmail,
          role: uRole,
          studioId: uStudioId,
        }),
      });
      onUserCreated(created);
      setUserMsg(`Учётная запись «${created.login}» создана.`);
      setULogin('');
      setUPassword('');
      setUName('');
      setUEmail('');
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : 'Ошибка создания аккаунта');
    }
  };

  const handleToggleEmploymentStatus = async (u: UserAccount) => {
    setStaffActionMsg('');
    const currentStatus: EmploymentStatus =
      u.employmentStatus === 'fired' || !u.active ? 'fired' : 'working';
    const nextStatus: EmploymentStatus = currentStatus === 'working' ? 'fired' : 'working';
    try {
      const updated = await apiRequest<UserAccount>(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ employmentStatus: nextStatus }),
      });
      onUserUpdated(updated);
      setStaffActionMsg(
        nextStatus === 'fired'
          ? `Сотрудник ${updated.name} уволен — доступ к приложению немедленно закрыт.`
          : `Доступ сотрудника ${updated.name} восстановлен (статус: Работает).`
      );
    } catch (err) {
      setStaffActionMsg(err instanceof Error ? err.message : 'Ошибка смены статуса');
    }
  };

  const openEditUserRow = (u: UserAccount) => {
    if (editingUserId === u.id) {
      setEditingUserId(null);
      return;
    }
    setEditingUserId(u.id);
    setEditUserName(u.name || '');
    setEditUserPhone(u.phone || '');
    setEditUserEmail(u.email || '');
    setEditUserTg(u.telegramHandle || '');
    setEditUserStudioId(u.studioId || studios[0]?.id || '');
    setEditUserRole(u.role);
  };

  const handleSaveEditedUser = async (u: UserAccount) => {
    setStaffActionMsg('');
    try {
      const updated = await apiRequest<UserAccount>(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editUserName.trim(),
          phone: editUserPhone.trim(),
          email: editUserEmail.trim(),
          telegramHandle: editUserTg.trim(),
          studioId: editUserStudioId || null,
          ...(isOwner ? { role: editUserRole } : {}),
        }),
      });
      onUserUpdated(updated);
      if (updated.id === currentUser.id) {
        onCurrentUserUpdated(updated);
      }
      setEditingUserId(null);
      setStaffActionMsg(`Личные данные пользователя ${updated.name} обновлены.`);
    } catch (err) {
      setStaffActionMsg(err instanceof Error ? err.message : 'Ошибка обновления данных пользователя');
    }
  };

  const handleSaveStaffTrainerProfile = async (
    u: UserAccount,
    nextProfile: TrainerPublicProfile
  ) => {
    setStaffActionMsg('');
    setEditTrainerProfileSaving(true);
    try {
      const updated = await apiRequest<UserAccount>(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ trainerProfile: nextProfile }),
      });
      onUserUpdated(updated);
      if (updated.id === currentUser.id) {
        onCurrentUserUpdated(updated);
      }
      setEditTrainerProfileUserId(null);
      setStaffActionMsg(`Анкета «О себе» для тренера ${updated.name} сохранена.`);
    } catch (err) {
      setStaffActionMsg(
        err instanceof Error ? err.message : 'Ошибка сохранения анкеты тренера'
      );
    } finally {
      setEditTrainerProfileSaving(false);
    }
  };

  const handleAdminResetPassword = async (u: UserAccount) => {
    setStaffActionMsg('');
    try {
      const res = await apiRequest<{
        ok: boolean;
        user: UserAccount;
        emailed: boolean;
        generatedPassword?: string;
      }>(`/api/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          newPassword: resetPwdInput.trim() || undefined,
          sendEmail: resetSendEmail,
        }),
      });
      onUserUpdated(res.user);
      setResetTargetId(null);
      setResetPwdInput('');
      setStaffActionMsg(
        `Пароль для ${u.name} (${u.login}) сброшен.${
          res.generatedPassword ? ` Новый временный пароль: ${res.generatedPassword}.` : ''
        }${res.emailed ? ' Отправлено на E-mail.' : ''}`
      );
    } catch (err) {
      setStaffActionMsg(err instanceof Error ? err.message : 'Ошибка сброса пароля');
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSysBusy(true);
    setSysMsg('');
    try {
      const updated = await apiRequest<SystemSecuritySettings>('/api/system/settings', {
        method: 'PATCH',
        body: JSON.stringify(sysSettings),
      });
      setSysSettings(updated);
      setSysMsg('Настройки безопасности, домена и обновлений сохранены.');
    } catch (err) {
      setSysMsg(err instanceof Error ? err.message : 'Ошибка сохранения настроек');
    } finally {
      setSysBusy(false);
    }
  };

  const handleCheckUpdates = async () => {
    setSysBusy(true);
    setSysMsg('');
    try {
      const res = await apiRequest<{
        updateAvailable: boolean;
        message: string;
        checkedAt: string;
      }>('/api/system/check-updates', { method: 'POST' });
      setUpdateCheckResult(res);
    } catch (err) {
      setSysMsg(err instanceof Error ? err.message : 'Ошибка проверки обновлений');
    } finally {
      setSysBusy(false);
    }
  };

  const handleApplyUpdate = async () => {
    setSysBusy(true);
    setSysMsg('');
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/system/apply-update', {
        method: 'POST',
      });
      setSysMsg(res.message);
    } catch (err) {
      setSysMsg(err instanceof Error ? err.message : 'Не удалось применить обновление');
    } finally {
      setSysBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    setSysMsg('');
    try {
      const token = getAuthToken();
      const resp = await fetch('/api/system/backup', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Не удалось скачать резервную копию');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etalon-pravilo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSysMsg('Резервная копия базы данных скачана на устройство.');
    } catch (err) {
      setSysMsg(err instanceof Error ? err.message : 'Ошибка скачивания копии');
    }
  };

  const filteredUsers = users.filter((u) => {
    const isFired = u.employmentStatus === 'fired' || !u.active;
    if (staffFilter === 'working') return !isFired;
    if (staffFilter === 'fired') return isFired;
    return true;
  });

  const cleanDomainHost = (sysSettings.domainUrl || 'https://studio.yourdomain.ru').replace(
    /\/$/,
    ''
  );
  const desktopLaunchCmd = `STUDIO_SERVER_URL="${cleanDomainHost}" npx electron desktop/main.cjs`;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 overflow-hidden"
    >
      <div className="w-full max-w-3xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col rounded-xl st-surface border st-border shadow-xl overflow-hidden">
        {/* Sticky Modal Header */}
        <div className="shrink-0 flex items-center justify-between border-b st-border px-4 py-3.5 sm:px-6 sm:py-4 gap-3 st-surface">
          <div className="min-w-0">
            <h3 className="font-display text-base sm:text-lg font-semibold truncate">
              Настройки профиля, доступов и системы
            </h3>
            <p className="text-xs st-muted mt-0.5 truncate">
              {currentUser.name} · {ROLE_LABELS[currentUser.role]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки"
            title="Закрыть"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border st-border hover:opacity-80 cursor-pointer shrink-0 text-xs font-medium"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Закрыть</span>
          </button>
        </div>

        {/* Sticky Navigation Tabs */}
        <div className="shrink-0 px-4 pt-3 pb-2 sm:px-6 border-b st-border st-surface">
          <div className="flex flex-wrap items-center gap-1 p-1 st-surface-muted rounded-lg border st-border w-fit max-w-full">
            <button
              type="button"
              onClick={() => setTab('profile')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                tab === 'profile' ? 'st-surface shadow-sm font-semibold' : 'st-muted'
              }`}
            >
              Профиль и оформление
            </button>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={() => setTab('staff')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  tab === 'staff' ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                }`}
              >
                Персонал и доступы ({users.length})
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setTab('system')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  tab === 'system' ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                }`}
              >
                Обновления, Десктоп и Домен
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* TAB 1: PROFILE, PERSONAL DATA & APPEARANCE */}
        {tab === 'profile' && (
          <div className="space-y-5">
            {/* Personal Profile Details Form */}
            <form
              onSubmit={handleSavePersonalProfile}
              className="p-4 rounded-xl st-surface border st-border space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserCog className="w-4 h-4 st-accent-text" />
                  <span>Мои личные данные</span>
                </div>
                <span className="text-[11px] font-mono st-muted">Логин: {currentUser.login}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block st-muted mb-1">ФИО</label>
                  <input
                    type="text"
                    required
                    value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                    placeholder="Иванов Иван Иванович"
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">Телефон</label>
                  <input
                    type="text"
                    value={myPhone}
                    onChange={(e) => setMyPhone(e.target.value)}
                    placeholder="+7 (999) 000-00-00"
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">E-mail</label>
                  <input
                    type="email"
                    value={myEmail}
                    onChange={(e) => setMyEmail(e.target.value)}
                    placeholder="name@etalon-pravilo.ru"
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">Telegram (@username)</label>
                  <input
                    type="text"
                    value={myTelegram}
                    onChange={(e) => setMyTelegram(e.target.value)}
                    placeholder="@username"
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              {studios.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block st-muted mb-1">Основная студия</label>
                    <select
                      value={myStudioId}
                      onChange={(e) => setMyStudioId(e.target.value)}
                      disabled={currentUser.role === 'trainer' || currentUser.role === 'admin'}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface disabled:opacity-65"
                    >
                      {studios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.city})
                        </option>
                      ))}
                    </select>
                  </div>
                  {clientProfile && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block st-muted mb-1">Пол</label>
                        <select
                          value={myGender}
                          onChange={(e) => setMyGender(e.target.value as 'male' | 'female')}
                          className="w-full px-2.5 py-2 rounded-lg border st-border st-surface"
                        >
                          <option value="male">Мужской</option>
                          <option value="female">Женский</option>
                        </select>
                      </div>
                      <div>
                        <label className="block st-muted mb-1">Дата рождения</label>
                        <input
                          type="date"
                          value={myBirthDate}
                          onChange={(e) => setMyBirthDate(e.target.value)}
                          className="w-full px-2 py-2 font-mono rounded-lg border st-border st-surface"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {clientProfile && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block st-muted mb-1">Цель тренировок</label>
                    <input
                      type="text"
                      value={myGoal}
                      onChange={(e) => setMyGoal(e.target.value)}
                      placeholder="Снятие зажимов, осанка, восстановление..."
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">Особенности / ограничения</label>
                    <input
                      type="text"
                      value={myContra}
                      onChange={(e) => setMyContra(e.target.value)}
                      placeholder="Укажите травмы или ограничения"
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs st-accent-text">{profileMsg}</span>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  {profileSaving ? 'Сохранение...' : 'Сохранить личные данные'}
                </button>
              </div>
            </form>

            {currentUser.role === 'trainer' && (
              <div className="p-4 rounded-xl st-surface border st-border space-y-3">
                <div className="text-sm font-semibold">
                  Публичный профиль тренера («О себе» для клиентов)
                </div>
                <TrainerProfileEditorForm
                  initialProfile={currentUser.trainerProfile}
                  trainerName={currentUser.name}
                  saving={myTrainerSaving}
                  statusMessage={myTrainerMsg}
                  onSave={async (profile: TrainerPublicProfile) => {
                    setMyTrainerSaving(true);
                    setMyTrainerMsg('');
                    try {
                      const res = await apiRequest<{ user: UserAccount }>('/api/auth/profile', {
                        method: 'PATCH',
                        body: JSON.stringify({ trainerProfile: profile }),
                      });
                      onCurrentUserUpdated(res.user);
                      onUserUpdated(res.user);
                      setMyTrainerMsg('Публичный профиль тренера обновлён.');
                    } catch (err) {
                      setMyTrainerMsg(
                        err instanceof Error ? err.message : 'Ошибка сохранения профиля'
                      );
                    } finally {
                      setMyTrainerSaving(false);
                    }
                  }}
                />
              </div>
            )}

            {isStaff && (
              <div className="p-4 rounded-xl st-surface border st-border space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BellRing className="w-4 h-4 st-accent-text" />
                    <span>Push-уведомления о новых бронированиях</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      pushPerm === 'granted'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : pushPerm === 'denied'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    {pushPerm === 'granted'
                      ? 'Включены'
                      : pushPerm === 'denied'
                      ? 'Заблокированы в браузере'
                      : pushPerm === 'unsupported'
                      ? 'Не поддерживаются'
                      : 'Не настроены'}
                  </span>
                </div>
                <p className="st-muted leading-relaxed">
                  Оповещения о новых записях клиентов приходят мгновенно, даже когда вкладка
                  браузера свернута.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {pushPerm === 'default' && (
                    <button
                      type="button"
                      onClick={async () => {
                        setPushTestMsg('');
                        const res = await requestStaffPushPermission(currentUser.id);
                        setPushPerm(res);
                        onPushPermissionChange?.(res);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg st-accent-bg font-medium cursor-pointer"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      <span>Разрешить Push-уведомления</span>
                    </button>
                  )}
                  {pushPerm === 'granted' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await showStaffSystemNotification({
                          title: 'Тестовое уведомление · ЭТАЛОН ПРАВИЛО',
                          body: 'Оповещения о новых бронированиях настроены и работают в фоне.',
                          tag: `test-push-${Date.now()}`,
                        });
                        setPushTestMsg(
                          ok
                            ? 'Тестовое Push-уведомление отправлено.'
                            : 'Не удалось показать уведомление.'
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border st-border font-medium hover:opacity-85 cursor-pointer"
                    >
                      <BellRing className="w-3.5 h-3.5 st-accent-text" />
                      <span>Проверить уведомление</span>
                    </button>
                  )}
                  {pushPerm === 'denied' && (
                    <span className="text-[11px] st-muted">
                      Нажмите на значок настроек сайта слева от адресной строки браузера и
                      разрешите «Уведомления».
                    </span>
                  )}
                  {pushTestMsg && <span className="st-accent-text">{pushTestMsg}</span>}
                </div>
              </div>
            )}

            {/* Visual Theme, Cultural Style & PWA */}
            <div className="p-4 rounded-xl st-surface-muted border st-border space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Визуальное оформление интерфейса</div>
                  <div className="text-xs st-muted">
                    Переключение светлой/тёмной палитры и культурного стиля
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleTheme('light')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      theme === 'light' ? 'st-accent-bg' : 'st-surface border st-border'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Светлая</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTheme('dark')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      theme === 'dark' ? 'st-accent-bg' : 'st-surface border st-border'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Тёмная</span>
                  </button>
                  <PWAInstallButton compact />
                </div>
              </div>

              <div className="pt-3 border-t st-border space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Palette className="w-3.5 h-3.5 st-accent-text" />
                  <span>Цветовой, культурный стиль и шрифты студии</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STYLE_THEME_OPTIONS.map((opt) => {
                    const active = styleTheme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSelectStyleTheme(opt.id)}
                        className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                          active ? 'st-accent-soft border-current' : 'st-surface st-border hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-base font-bold leading-tight"
                            style={{ fontFamily: opt.fontDisplayPreview }}
                          >
                            {opt.name}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {opt.swatches.map((hex) => (
                              <span
                                key={hex}
                                className="w-3.5 h-3.5 rounded-sm border border-black/15"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </span>
                        </div>
                        <div className="text-[11px] st-muted mt-1">{opt.subtitle}</div>
                        <div className="text-[10px] font-medium st-accent-text mt-1">{opt.fontLabel}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background Image & Opacity Controls */}
              <div className="pt-3 border-t st-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <ImagePlus className="w-3.5 h-3.5 st-accent-text" />
                    <span>Фоновое изображение приложения и прозрачность</span>
                  </div>
                  {bgImage && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeBgImage('');
                        setBgUrlInput('');
                        setBgMsg('Фоновое изображение удалено');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border st-border st-surface text-[11px] text-rose-600 dark:text-rose-400 hover:opacity-85 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Убрать фон</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {BACKGROUND_PRESETS.map((preset) => {
                    const isSelected = bgImage === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onChangeBgImage(preset.url);
                          setBgUrlInput(preset.url);
                          setBgMsg(preset.url ? `Установлен фон: ${preset.label}` : 'Фон отключён');
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                          isSelected
                            ? 'st-accent-bg border-transparent'
                            : 'st-surface st-border hover:opacity-90'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5 st-accent-text" />
                    <span>{bgImage ? 'Заменить с компьютера' : 'Загрузить с компьютера'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                          if (!dataUrl) return;
                          const img = new Image();
                          img.onload = () => {
                            const maxDim = 1920;
                            let w = img.naturalWidth || 1280;
                            let h = img.naturalHeight || 720;
                            if (w > maxDim || h > maxDim) {
                              const scale = maxDim / Math.max(w, h);
                              w = Math.round(w * scale);
                              h = Math.round(h * scale);
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(img, 0, 0, w, h);
                              const compressed = canvas.toDataURL('image/jpeg', 0.84);
                              onChangeBgImage(compressed);
                              setBgUrlInput('');
                              setBgMsg(`Загружено фоновое изображение: ${file.name}`);
                            } else {
                              onChangeBgImage(dataUrl);
                              setBgUrlInput('');
                              setBgMsg(`Загружено фоновое изображение: ${file.name}`);
                            }
                          };
                          img.onerror = () => {
                            onChangeBgImage(dataUrl);
                            setBgMsg(`Загружено изображение: ${file.name}`);
                          };
                          img.src = dataUrl;
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={bgUrlInput}
                    onChange={(e) => setBgUrlInput(e.target.value)}
                    placeholder="Или вставьте URL / путь к изображению..."
                    className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border st-border st-surface"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = bgUrlInput.trim();
                      onChangeBgImage(clean);
                      setBgMsg(clean ? 'Фоновое изображение обновлено' : 'Фон очищен');
                    }}
                    className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                  >
                    Применить
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="st-muted">Прозрачность фонового изображения</span>
                      <span className="font-mono font-bold tabular-nums">{Math.round(bgOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(bgOpacity * 100)}
                      onChange={(e) => onChangeBgOpacity(Number(e.target.value) / 100)}
                      className="w-full accent-current st-accent-text cursor-pointer"
                    />
                  </div>

                  {bgImage && (
                    <div className="w-24 h-14 rounded-lg border st-border overflow-hidden st-canvas shrink-0 relative">
                      <img
                        src={bgImage}
                        alt="Предпросмотр фона"
                        className="w-full h-full object-cover"
                        style={{ opacity: bgOpacity }}
                      />
                    </div>
                  )}
                </div>

                {bgMsg && <div className="text-[11px] st-accent-text">{bgMsg}</div>}
              </div>
            </div>

            {/* Own E-mail Verification */}
            <div className="p-4 rounded-xl st-surface border st-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Mail className="w-4 h-4 st-accent-text" />
                  <span>E-mail для сброса пароля и проверки доступа</span>
                </div>
                {currentUser.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Подтверждён
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Не подтверждён кодом
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveMyEmail} className="flex flex-wrap gap-2">
                <input
                  type="email"
                  required
                  value={myEmail}
                  onChange={(e) => setMyEmail(e.target.value)}
                  placeholder="name@etalon-pravilo.ru"
                  className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer hover:opacity-85"
                >
                  Сохранить E-mail
                </button>
                <button
                  type="button"
                  onClick={handleRequestEmailVerify}
                  className="px-3 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                >
                  Отправить код проверки
                </button>
              </form>

              {emailVerifyStep && (
                <form onSubmit={handleConfirmEmailVerify} className="flex flex-wrap gap-2 pt-1">
                  <input
                    type="text"
                    required
                    value={emailCodeInput}
                    onChange={(e) => setEmailCodeInput(e.target.value)}
                    placeholder="6-значный код из письма"
                    className="w-48 px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                  >
                    Подтвердить E-mail
                  </button>
                </form>
              )}

              {emailMsg && <div className="text-xs st-accent-text">{emailMsg}</div>}
            </div>

            {/* Change Own Password */}
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="w-4 h-4 st-accent-text" />
                <span>Безопасность: смена пароля ({currentUser.login})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="password"
                  required
                  placeholder="Текущий пароль"
                  value={curPwd}
                  onChange={(e) => setCurPwd(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Новый пароль (мин. 6 симв.)"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                >
                  Обновить пароль
                </button>
              </div>
              {pwdMessage && <div className="text-xs st-accent-text">{pwdMessage}</div>}
            </form>
          </div>
        )}

        {/* TAB 2: STAFF & ACCESS CONTROL (OWNER / ADMIN) */}
        {tab === 'staff' && isOwnerOrAdmin && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="w-4 h-4 st-accent-text" />
                <span>Персонал, клиенты и статусы доступа</span>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg st-surface-muted border st-border text-xs">
                {(
                  [
                    ['all', 'Все'],
                    ['working', 'Работают / Активные'],
                    ['fired', 'Уволенные / Закрыт'],
                  ] as const
                ).map(([fk, fl]) => (
                  <button
                    key={fk}
                    type="button"
                    onClick={() => setStaffFilter(fk)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                      staffFilter === fk ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                    }`}
                  >
                    {fl}
                  </button>
                ))}
              </div>
            </div>

            {staffActionMsg && (
              <div className="p-3 rounded-lg st-accent-soft border border-current text-xs font-medium">
                {staffActionMsg}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto divide-y st-border border st-border rounded-xl">
              {filteredUsers.map((u) => {
                const isFired = u.employmentStatus === 'fired' || !u.active;
                const canManageTarget =
                  isOwner || (currentUser.role === 'admin' && (u.role === 'trainer' || u.role === 'client'));
                const isSelf = u.id === currentUser.id;
                const isResetting = resetTargetId === u.id;
                const isEditingRow = editingUserId === u.id;

                return (
                  <div key={u.id} className="p-3 space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-semibold ${isFired ? 'line-through st-muted' : ''}`}>
                            {u.name}
                          </span>
                          <span className="font-mono st-muted">({u.login})</span>
                          <span className="font-mono text-[11px] st-accent-text font-medium">
                            {ROLE_SHORT[u.role]}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              isFired
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {isFired ? '● Уволен (доступ закрыт)' : '● Работает'}
                          </span>
                        </div>
                        <div className="text-[11px] st-muted mt-0.5 font-mono">
                          {u.phone || 'Тел. не указан'} · {u.email || 'E-mail не указан'} ·{' '}
                          {u.telegramHandle || 'Telegram —'} ·{' '}
                          {u.emailVerified ? 'E-mail подтверждён' : 'Не подтверждён'}
                          {u.lastLoginAt ? ` · Вход: ${u.lastLoginAt}` : ''}
                        </div>
                      </div>

                      {canManageTarget && (
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditUserRow(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border hover:opacity-85 cursor-pointer whitespace-nowrap"
                          >
                            <Pencil className="w-3 h-3 st-accent-text" />
                            <span>{isEditingRow ? 'Скрыть' : 'Изменить'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResetTargetId(isResetting ? null : u.id);
                              setResetPwdInput('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border hover:opacity-85 cursor-pointer whitespace-nowrap"
                          >
                            <KeyRound className="w-3 h-3 st-accent-text" />
                            <span>Сбросить пароль</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleToggleEmploymentStatus(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                                isFired
                                  ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                                  : 'border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {isFired ? (
                                <>
                                  <UserCheck className="w-3 h-3" />
                                  <span>Восстановить</span>
                                </>
                              ) : (
                                <>
                                  <UserX className="w-3 h-3" />
                                  <span>Уволить / закрыть доступ</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditingRow && (
                      <div className="p-3 rounded-lg st-surface-muted border st-border space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={editUserName}
                            onChange={(e) => setEditUserName(e.target.value)}
                            placeholder="ФИО"
                            className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                          />
                          <input
                            type="text"
                            value={editUserPhone}
                            onChange={(e) => setEditUserPhone(e.target.value)}
                            placeholder="Телефон"
                            className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                          />
                          <input
                            type="email"
                            value={editUserEmail}
                            onChange={(e) => setEditUserEmail(e.target.value)}
                            placeholder="E-mail"
                            className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                          />
                          <input
                            type="text"
                            value={editUserTg}
                            onChange={(e) => setEditUserTg(e.target.value)}
                            placeholder="Telegram (@username)"
                            className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                          />
                          <select
                            value={editUserStudioId}
                            onChange={(e) => setEditUserStudioId(e.target.value)}
                            className="px-2 py-1.5 text-xs rounded border st-border st-surface"
                          >
                            <option value="">Без привязки к студии</option>
                            {studios.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          {isOwner && !isSelf && (
                            <select
                              value={editUserRole}
                              onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                              className="px-2 py-1.5 text-xs rounded border st-border st-surface"
                            >
                              <option value="admin">Админ</option>
                              <option value="trainer">Тренер</option>
                              <option value="client">Клиент</option>
                            </select>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {u.role === 'trainer' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditTrainerProfileUserId((prev) =>
                                  prev === u.id ? null : u.id
                                )
                              }
                              className="px-2.5 py-1 rounded border st-border text-xs font-medium hover:opacity-85 cursor-pointer"
                            >
                              {editTrainerProfileUserId === u.id
                                ? 'Скрыть анкету тренера (О себе)'
                                : 'Анкета тренера (О себе)'}
                            </button>
                          ) : (
                            <span />
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(null);
                                setEditTrainerProfileUserId(null);
                              }}
                              className="px-2.5 py-1 rounded border st-border text-xs cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditedUser(u)}
                              className="px-3 py-1 rounded st-accent-bg text-xs font-medium cursor-pointer"
                            >
                              Сохранить данные
                            </button>
                          </div>
                        </div>

                        {u.role === 'trainer' && editTrainerProfileUserId === u.id && (
                          <div className="pt-3 border-t st-border">
                            <TrainerProfileEditorForm
                              key={u.id}
                              initialProfile={u.trainerProfile}
                              trainerName={u.name}
                              saving={editTrainerProfileSaving}
                              onSave={(profile) => handleSaveStaffTrainerProfile(u, profile)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {isResetting && (
                      <div className="p-2.5 rounded-lg st-surface-muted border st-border flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={resetPwdInput}
                          onChange={(e) => setResetPwdInput(e.target.value)}
                          placeholder="Новый пароль (или пусто = автогенерация)"
                          className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs font-mono rounded border st-border st-surface"
                        />
                        <label className="inline-flex items-center gap-1.5 text-[11px] st-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={resetSendEmail}
                            onChange={(e) => setResetSendEmail(e.target.checked)}
                          />
                          <span>Отправить на E-mail</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAdminResetPassword(u)}
                          className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer whitespace-nowrap"
                        >
                          Подтвердить сброс
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleCreateUser}
              className="space-y-2.5 p-3.5 rounded-xl st-surface-muted border st-border"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <UserPlus className="w-3.5 h-3.5 st-accent-text" />
                <span>Добавить пользователя с паролем и E-mail</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="ФИО"
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                />
                <input
                  type="email"
                  required
                  placeholder="E-mail (для сброса и проверки)"
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                />
                <input
                  type="text"
                  required
                  placeholder="Логин"
                  value={uLogin}
                  onChange={(e) => setULogin(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono rounded border st-border st-surface"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Пароль (мин. 6 симв.)"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded border st-border st-surface"
                />
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as UserRole)}
                  className="px-2 py-1.5 text-xs rounded border st-border st-surface"
                >
                  {isOwner && <option value="admin">Админ</option>}
                  <option value="trainer">Тренер</option>
                  <option value="client">Клиент</option>
                </select>
                <select
                  value={uStudioId}
                  onChange={(e) => setUStudioId(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded border st-border st-surface"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs st-accent-text">{userMsg}</span>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                >
                  Создать доступ
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: UPDATES, DESKTOP & DOMAIN TUNNELING (OWNER ONLY) */}
        {tab === 'system' && isOwner && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl st-surface-muted border st-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Версия сервера и простое обновление</div>
                  <div className="text-xs st-muted font-mono tabular-nums mt-0.5">
                    Версия: {sysInfo?.version || '1.2.0'} · Сборка: {sysInfo?.commitHash || '...'} ·
                    Node {sysInfo?.nodeVersion || '...'} · Порт {sysInfo?.port || 3000}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={sysBusy}
                    onClick={handleDownloadBackup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 st-accent-text" />
                    <span>Скачать копию БД</span>
                  </button>
                  <button
                    type="button"
                    disabled={sysBusy}
                    onClick={handleCheckUpdates}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg st-accent-bg text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sysBusy ? 'animate-spin' : ''}`} />
                    <span>Проверить обновления</span>
                  </button>
                </div>
              </div>

              {updateCheckResult && (
                <div className="p-3 rounded-lg st-surface border st-border text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{updateCheckResult.message}</span>
                    {updateCheckResult.updateAvailable && (
                      <button
                        type="button"
                        disabled={sysBusy}
                        onClick={handleApplyUpdate}
                        className="px-3 py-1.5 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                      >
                        Установить обновление (Git + Build)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {sysMsg && (
                <div className="p-3 rounded-lg st-accent-soft border border-current text-xs font-medium">
                  {sysMsg}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSaveSystemSettings}
              className="p-4 rounded-xl st-surface border st-border space-y-3"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Globe className="w-4 h-4 st-accent-text" />
                <span>Безопасность входа, домен и туннелирование</span>
              </div>

              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={sysSettings.requireEmailVerificationOnLogin}
                  onChange={(e) =>
                    setSysSettings((s) => ({
                      ...s,
                      requireEmailVerificationOnLogin: e.target.checked,
                    }))
                  }
                />
                <span>
                  Требовать одноразовый код с E-mail при входе в систему (включайте после настройки SMTP в «Рассылки и чаты»)
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs st-muted mb-1">
                    Публичный домен студии (HTTPS)
                  </label>
                  <input
                    type="url"
                    value={sysSettings.domainUrl}
                    onChange={(e) =>
                      setSysSettings((s) => ({ ...s, domainUrl: e.target.value }))
                    }
                    placeholder="https://studio.yourdomain.ru"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs st-muted mb-1">
                    Способ туннелирования на сервер (порт 3000)
                  </label>
                  <select
                    value={sysSettings.tunnelMode}
                    onChange={(e) =>
                      setSysSettings((s) => ({
                        ...s,
                        tunnelMode: e.target.value as SystemSecuritySettings['tunnelMode'],
                      }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  >
                    <option value="cloudflare">Cloudflare Tunnel (без белого IP)</option>
                    <option value="caddy">Caddy Reverse Proxy (авто-SSL)</option>
                    <option value="nginx">Nginx + Let&apos;s Encrypt</option>
                    <option value="local">Локальная сеть студии</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sysBusy}
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-medium cursor-pointer"
                >
                  Сохранить параметры сервера
                </button>
              </div>
            </form>

            {/* Desktop Client Launch & Domain Tunnel Kit */}
            <div className="p-4 rounded-xl st-surface-muted border st-border space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Monitor className="w-4 h-4 st-accent-text" />
                <span>Десктопная версия (Electron) и шаблоны туннеля</span>
              </div>
              <p className="st-muted leading-relaxed">
                В проекте подготовлены готовые файлы для десктопа (Windows/macOS/Linux с поддержкой Web Bluetooth для Mi Scale 2, ESP32 и MYOblue) и шаблоны доменного туннелирования через <span className="font-mono">Cloudflare Tunnel</span>, <span className="font-mono">Caddy</span> и <span className="font-mono">Nginx</span> на порт 3000.
              </p>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg st-surface border st-border font-mono text-[11px] overflow-x-auto">
                <span className="truncate">{desktopLaunchCmd}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(desktopLaunchCmd);
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border st-border shrink-0 cursor-pointer"
                >
                  {copiedCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Скопировано' : 'Копировать'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 flex justify-end border-t st-border px-4 py-3 sm:px-6 st-surface">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

