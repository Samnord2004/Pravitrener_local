import React, { useMemo, useState } from 'react';
import {
  FileCheck2,
  ShieldCheck,
  Scale,
  CheckCircle2,
  ChevronRight,
  X,
  Lock,
  Send,
  BookOpen,
  Clock,
  Mail,
  BellRing,
  Check,
  AlertTriangle,
} from 'lucide-react';
import type { LegalAcceptanceRecord, UserAccount, UserRole } from '../types';
import { apiRequest } from '../utils/api';
import { getActiveAndroidAppFlavor } from '../utils/androidApps';
import {
  CURRENT_LEGAL_BUNDLE_VERSION,
  getLegalAgreementsForRole,
  type LegalAgreementDoc,
} from '../utils/legalAgreements';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Владелец сети',
  admin: 'Администратор',
  trainer: 'Тренер',
  client: 'Клиент',
};

const FLAVOR_LABELS: Record<string, string> = {
  admin: 'Android-приложение Администратора',
  trainer: 'Android-приложение Тренера',
  client: 'Android-приложение Клиента',
  web: 'Веб-приложение',
};

interface LegalAgreementsModalProps {
  role: UserRole;
  currentUser?: UserAccount | null;
  mandatoryMode?: boolean;
  initialDocId?: string;
  brandName?: string;
  onAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  onClose?: () => void;
}

export const LegalAgreementsModal: React.FC<LegalAgreementsModalProps> = ({
  role,
  currentUser,
  mandatoryMode = false,
  initialDocId,
  brandName = 'ЭТАЛОН ПРАВИЛО',
  onAccepted,
  onClose,
}) => {
  const docs = useMemo(() => getLegalAgreementsForRole(role), [role]);
  const [activeDocId, setActiveDocId] = useState<string>(
    () => initialDocId || docs[0]?.id || 'privacy_policy'
  );
  const [viewedDocIds, setViewedDocIds] = useState<Record<string, boolean>>(() => ({
    [initialDocId || docs[0]?.id || 'privacy_policy']: true,
  }));
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    if (
      currentUser?.legalAcceptedAt &&
      currentUser.legalAgreementsVersion === CURRENT_LEGAL_BUNDLE_VERSION
    ) {
      return Object.fromEntries(docs.map((d) => [d.id, true]));
    }
    return {};
  });
  const [confirmRead, setConfirmRead] = useState<boolean>(
    Boolean(
      currentUser?.legalAcceptedAt &&
        currentUser.legalAgreementsVersion === CURRENT_LEGAL_BUNDLE_VERSION
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeDoc: LegalAgreementDoc =
    docs.find((d) => d.id === activeDocId) || docs[0];

  const allDocsChecked = docs.every((d) => Boolean(checkedIds[d.id]));
  const acceptedCount = docs.filter((d) => checkedIds[d.id]).length;
  const alreadyAccepted = Boolean(
    currentUser?.legalAcceptedAt &&
      currentUser.legalAgreementsVersion === CURRENT_LEGAL_BUNDLE_VERSION
  );

  const handleSelectDoc = (id: string) => {
    setActiveDocId(id);
    setViewedDocIds((prev) => ({ ...prev, [id]: true }));
  };

  const handleToggleDoc = (id: string) => {
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    setError('');
  };

  const handleCheckAll = () => {
    const nextState = !allDocsChecked;
    setCheckedIds(Object.fromEntries(docs.map((d) => [d.id, nextState])));
    setViewedDocIds(Object.fromEntries(docs.map((d) => [d.id, true])));
    if (nextState) setConfirmRead(true);
    setError('');
  };

  const handleSubmitConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!allDocsChecked) {
      setError('Пожалуйста, отметьте согласие со всеми юридическими документами из перечня.');
      return;
    }
    if (!confirmRead) {
      setError('Необходимо подтвердить прочтение документов и отправку уведомления владельцу.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const flavor = getActiveAndroidAppFlavor() || 'web';
      const res = await apiRequest<{
        ok: boolean;
        user: UserAccount;
        record: LegalAcceptanceRecord;
      }>('/api/legal/accept', {
        method: 'POST',
        body: JSON.stringify({
          acceptedIds: docs.map((d) => d.id),
          confirmRead: true,
          appFlavor: flavor,
        }),
      });
      onAccepted?.({ user: res.user, record: res.record });
      if (!mandatoryMode) {
        onClose?.();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось сохранить подтверждение соглашений'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl st-surface border st-border shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b st-border st-surface-muted flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl st-accent-bg flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider st-accent-text font-semibold">
                  {brandName} · Пакет v{CURRENT_LEGAL_BUNDLE_VERSION}
                </span>
                <span className="px-2 py-0.5 rounded-md border st-border text-[10px] font-medium st-muted">
                  Роль: {ROLE_LABELS[role]}
                </span>
                {mandatoryMode && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                    Обязательно после первого входа
                  </span>
                )}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold mt-0.5">
                Юридические соглашения, конфиденциальность и согласия
              </h2>
              <p className="text-xs st-muted mt-0.5">
                {mandatoryMode
                  ? 'Ознакомьтесь со всеми документами и подтвердите прочтение — уведомление о согласии автоматически отправится владельцу студии.'
                  : 'Полный перечень действующих юридических документов, политик конфиденциальности и добровольных согласий.'}
              </p>
            </div>
          </div>

          {!mandatoryMode && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="p-1.5 rounded-lg st-muted hover:opacity-80 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Two-Column Reader Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Document List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r st-border p-3 overflow-y-auto max-h-56 lg:max-h-none space-y-1.5 st-surface-muted/40">
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold st-muted uppercase tracking-wider">
              <span>Перечень документов ({docs.length})</span>
              {currentUser && (
                <span className="font-mono">
                  {acceptedCount}/{docs.length}
                </span>
              )}
            </div>

            {docs.map((doc, idx) => {
              const isSelected = doc.id === activeDoc.id;
              const isChecked = Boolean(checkedIds[doc.id]);
              const isViewed = Boolean(viewedDocIds[doc.id]);
              return (
                <div
                  key={doc.id}
                  className={`rounded-xl border transition-colors ${
                    isSelected
                      ? 'st-accent-soft border-current shadow-xs'
                      : 'st-surface st-border hover:opacity-95'
                  }`}
                >
                  <div className="flex items-start gap-2.5 p-2.5">
                    {currentUser && (mandatoryMode || !alreadyAccepted) && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDoc(doc.id)}
                        aria-label={`Согласиться с: ${doc.shortTitle}`}
                        className="mt-1 rounded border-slate-300 cursor-pointer shrink-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectDoc(doc.id)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono st-muted">
                          0{idx + 1} · {doc.category}
                        </span>
                        {alreadyAccepted || isChecked ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : isViewed ? (
                          <BookOpen className="w-3.5 h-3.5 st-accent-text shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 st-muted shrink-0" />
                        )}
                      </div>
                      <div className="text-xs font-semibold leading-snug mt-0.5">
                        {doc.shortTitle}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Document Full Text */}
          <div className="lg:col-span-8 p-5 sm:p-6 overflow-y-auto space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b st-border">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono st-accent-text uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {activeDoc.category} · редакция v{activeDoc.version} ({activeDoc.updatedAt})
                </span>
                <h3 className="font-display text-lg font-bold mt-1">{activeDoc.title}</h3>
                <p className="text-xs st-muted mt-1 leading-relaxed">{activeDoc.summary}</p>
              </div>
              {currentUser && (mandatoryMode || !alreadyAccepted) && (
                <button
                  type="button"
                  onClick={() => handleToggleDoc(activeDoc.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer shrink-0 ${
                    checkedIds[activeDoc.id]
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'st-border st-surface-muted hover:opacity-90'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {checkedIds[activeDoc.id] ? 'Прочитано и принято' : 'Отметить согласие'}
                  </span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {activeDoc.sections.map((sec) => (
                <div key={sec.heading} className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wide st-accent-text">
                    {sec.heading}
                  </h4>
                  {sec.paragraphs.map((p, i) => (
                    <p key={i} className="text-xs sm:text-sm leading-relaxed opacity-90">
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Acceptance Form */}
        <form
          onSubmit={handleSubmitConsent}
          className="px-5 py-4 border-t st-border st-surface-muted space-y-3 shrink-0"
        >
          {currentUser ? (
            alreadyAccepted && !mandatoryMode ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Все {docs.length} юридических соглашений приняты ({currentUser.legalAcceptedAt}).
                    Подтверждение ознакомления отправлено владельцу.
                  </span>
                </div>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Закрыть
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleCheckAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:opacity-90"
                  >
                    <FileCheck2 className="w-3.5 h-3.5 st-accent-text" />
                    <span>
                      {allDocsChecked
                        ? 'Снять все отметки'
                        : `Принять весь перечень документов (${docs.length})`}
                    </span>
                  </button>
                  <span className="text-xs st-muted font-mono">
                    Выбрано: {acceptedCount} из {docs.length}
                  </span>
                </div>

                <label className="flex items-start gap-2.5 text-xs cursor-pointer select-none p-2.5 rounded-xl border st-border st-surface">
                  <input
                    type="checkbox"
                    checked={confirmRead}
                    onChange={(e) => {
                      setConfirmRead(e.target.checked);
                      setError('');
                    }}
                    className="mt-0.5 rounded border-slate-300 cursor-pointer shrink-0"
                  />
                  <span className="leading-relaxed">
                    <strong>Уведомление о прочтении:</strong> подтверждаю, что полностью прочитал(а)
                    перечень юридических соглашений, политику конфиденциальности, согласие на
                    обработку персональных данных и условия безопасности, принимаю их в полном
                    объёме и направляю подтверждение ознакомления владельцу студии.
                  </span>
                </label>

                {error && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] st-muted flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Подтверждение сохраняется в журнале и доставляется владельцу</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!mandatoryMode && onClose && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer"
                      >
                        Отмена
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {submitting
                          ? 'Отправка владельцу...'
                          : 'Подтвердить прочтение и отправить владельцу'}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs st-muted">
                Полное подтверждение ознакомления выполняется сразу после первого входа в учётную запись.
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                >
                  Понятно
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

interface LegalAgreementsPanelProps {
  currentUser: UserAccount;
  brandName?: string;
  compact?: boolean;
  onAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
}

export const LegalAgreementsPanel: React.FC<LegalAgreementsPanelProps> = ({
  currentUser,
  brandName,
  compact = false,
  onAccepted,
}) => {
  const docs = useMemo(() => getLegalAgreementsForRole(currentUser.role), [currentUser.role]);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const accepted = Boolean(
    currentUser.legalAcceptedAt &&
      currentUser.legalAgreementsVersion === CURRENT_LEGAL_BUNDLE_VERSION
  );

  return (
    <>
      <div className="rounded-2xl st-surface border st-border p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl st-accent-soft flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 st-accent-text" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold">
                  Юридические соглашения и конфиденциальность
                </h3>
                {accepted ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    Подтверждено ({currentUser.legalAcceptedAt})
                  </span>
                ) : currentUser.role !== 'owner' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                    <Clock className="w-3 h-3" />
                    Требуется подтверждение
                  </span>
                ) : null}
              </div>
              <p className="text-xs st-muted mt-0.5">
                {accepted
                  ? `Уведомление о полном прочтении ${docs.length} документов (v${CURRENT_LEGAL_BUNDLE_VERSION}) отправлено владельцу студии.`
                  : `Полный перечень обязательных юридических документов и согласий (${docs.length}) для роли «${ROLE_LABELS[currentUser.role]}».`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpenDocId(docs[0]?.id || 'privacy_policy')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{accepted ? 'Открыть все документы' : 'Ознакомиться и принять'}</span>
          </button>
        </div>

        <div
          className={`grid gap-2.5 ${
            compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {docs.map((doc, idx) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setOpenDocId(doc.id)}
              className="text-left p-3 rounded-xl st-surface-muted border st-border hover:opacity-90 transition-opacity cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono st-accent-text uppercase">
                  0{idx + 1} · {doc.category}
                </span>
                {accepted && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
              </div>
              <div className="text-xs font-semibold leading-snug">{doc.shortTitle}</div>
              <div className="text-[11px] st-muted line-clamp-2 leading-relaxed">
                {doc.summary}
              </div>
            </button>
          ))}
        </div>
      </div>

      {openDocId && (
        <LegalAgreementsModal
          role={currentUser.role}
          currentUser={currentUser}
          mandatoryMode={false}
          initialDocId={openDocId}
          brandName={brandName}
          onAccepted={onAccepted}
          onClose={() => setOpenDocId(null)}
        />
      )}
    </>
  );
};

interface OwnerLegalConfirmationsPanelProps {
  confirmations: LegalAcceptanceRecord[];
  onMarkedRead?: (rec: LegalAcceptanceRecord) => void;
}

export const OwnerLegalConfirmationsPanel: React.FC<OwnerLegalConfirmationsPanelProps> = ({
  confirmations,
  onMarkedRead,
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'trainer' | 'client'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (roleFilter === 'all') return confirmations;
    return confirmations.filter((r) => r.userRole === roleFilter);
  }, [confirmations, roleFilter]);

  const unreadCount = confirmations.filter(
    (r) => r.ownerNotificationStatus !== 'read_by_owner'
  ).length;

  const handleMarkRead = async (id: string) => {
    setBusyId(id);
    try {
      const res = await apiRequest<{ ok: boolean; record: LegalAcceptanceRecord }>(
        `/api/legal/confirmations/${id}/mark-read`,
        { method: 'POST' }
      );
      onMarkedRead?.(res.record);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl st-surface border st-border overflow-hidden">
      <div className="px-5 py-4 border-b st-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl st-accent-soft flex items-center justify-center shrink-0">
            <FileCheck2 className="w-4 h-4 st-accent-text" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">
                Подтверждения прочтения юридических соглашений (владельцу)
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  Новых: {unreadCount}
                </span>
              )}
            </div>
            <p className="text-xs st-muted">
              Автоматические уведомления о прочтении и согласии после первого входа администраторов,
              тренеров и клиентов.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border st-border p-0.5 st-surface-muted text-xs">
          {(
            [
              ['all', `Все (${confirmations.length})`],
              ['admin', 'Админы'],
              ['trainer', 'Тренеры'],
              ['client', 'Клиенты'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRoleFilter(k)}
              className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                roleFilter === k ? 'st-surface shadow-xs font-semibold' : 'st-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y st-border">
        {filtered.map((rec) => {
          const isRead = rec.ownerNotificationStatus === 'read_by_owner';
          return (
            <div key={rec.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{rec.userName}</span>
                  <span className="px-2 py-0.5 rounded border st-border text-[11px] font-medium st-surface-muted">
                    {ROLE_LABELS[rec.userRole]}
                  </span>
                  <span className="text-[11px] font-mono st-muted">@{rec.userLogin}</span>
                  {rec.studioName && (
                    <span className="text-[11px] st-muted">· {rec.studioName}</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isRead
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {isRead ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Просмотрено владельцем ({rec.ownerReadAt})
                      </>
                    ) : (
                      <>
                        <BellRing className="w-3 h-3" />
                        Новое подтверждение
                      </>
                    )}
                  </span>
                </div>

                <div className="text-xs st-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Подтверждено: <strong className="font-mono">{rec.readConfirmedAt}</strong>
                  </span>
                  <span>· {FLAVOR_LABELS[rec.appFlavor || 'web'] || 'Веб-приложение'}</span>
                  <span>· Пакет v{rec.agreementsVersion}</span>
                  {rec.ownerEmailDispatched && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Mail className="w-3 h-3" />
                      Дублировано на E-mail
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.acceptedItems.map((item) => (
                    <span
                      key={item.agreementId}
                      className="px-2 py-0.5 rounded-md st-surface-muted border st-border text-[10px]"
                    >
                      ✓ {item.title}
                    </span>
                  ))}
                </div>
              </div>

              {!isRead && (
                <button
                  type="button"
                  disabled={busyId === rec.id}
                  onClick={() => handleMarkRead(rec.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border st-surface-muted text-xs font-medium hover:opacity-90 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{busyId === rec.id ? 'Сохранение...' : 'Отметить просмотренным'}</span>
                </button>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs st-muted">
            Пока нет подтверждений юридических соглашений по выбранному фильтру. После первого входа
            администратора, тренера или клиента подтверждение появится здесь автоматически.
          </div>
        )}
      </div>
    </div>
  );
};
