import React, { useEffect, useMemo, useState } from 'react';
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
  Pencil,
  Plus,
  Trash2,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { LegalAcceptanceRecord, UserAccount, UserRole } from '../types';
import { apiRequest } from '../utils/api';
import { getActiveAndroidAppFlavor } from '../utils/androidApps';
import {
  LEGAL_AGREEMENT_CATEGORIES,
  getActiveLegalBundleVersion,
  getActiveLegalDocuments,
  getLegalAgreementsForRole,
  mergeLegalAgreements,
  setActiveLegalBundle,
  subscribeLegalDocuments,
  type LegalAgreementCategory,
  type LegalAgreementDoc,
} from '../utils/legalAgreements';

function useSyncedLegalBundle(
  propDocs?: LegalAgreementDoc[],
  propBundleVersion?: string
): { allDocs: LegalAgreementDoc[]; bundleVersion: string } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return subscribeLegalDocuments(() => setTick((t) => t + 1));
  }, []);
  return useMemo(
    () => ({
      allDocs: propDocs ? mergeLegalAgreements(propDocs) : getActiveLegalDocuments(),
      bundleVersion: propBundleVersion || getActiveLegalBundleVersion(),
    }),
    [propDocs, propBundleVersion, tick]
  );
}

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
  customDocuments?: LegalAgreementDoc[];
  bundleVersion?: string;
  onAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  onClose?: () => void;
}

export const LegalAgreementsModal: React.FC<LegalAgreementsModalProps> = ({
  role,
  currentUser,
  mandatoryMode = false,
  initialDocId,
  brandName = 'ЭТАЛОН ПРАВИЛО',
  customDocuments,
  bundleVersion: propBundleVersion,
  onAccepted,
  onClose,
}) => {
  const { allDocs, bundleVersion } = useSyncedLegalBundle(customDocuments, propBundleVersion);
  const docs = useMemo(
    () => getLegalAgreementsForRole(role, allDocs),
    [role, allDocs]
  );
  const [activeDocId, setActiveDocId] = useState<string>(
    () => initialDocId || docs[0]?.id || 'privacy_policy'
  );
  const [viewedDocIds, setViewedDocIds] = useState<Record<string, boolean>>(() => ({
    [initialDocId || docs[0]?.id || 'privacy_policy']: true,
  }));
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    if (
      currentUser?.legalAcceptedAt &&
      currentUser.legalAgreementsVersion === bundleVersion
    ) {
      return Object.fromEntries(docs.map((d) => [d.id, true]));
    }
    return {};
  });
  const [confirmRead, setConfirmRead] = useState<boolean>(
    Boolean(
      currentUser?.legalAcceptedAt &&
        currentUser.legalAgreementsVersion === bundleVersion
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
      currentUser.legalAgreementsVersion === bundleVersion
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
                  {brandName} · Пакет v{bundleVersion}
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
  customDocuments?: LegalAgreementDoc[];
  bundleVersion?: string;
  onAccepted?: (res: { user: UserAccount; record: LegalAcceptanceRecord }) => void;
  onDocumentsUpdated?: (res: { documents: LegalAgreementDoc[]; bundleVersion: string }) => void;
}

export const LegalAgreementsPanel: React.FC<LegalAgreementsPanelProps> = ({
  currentUser,
  brandName,
  compact = false,
  customDocuments,
  bundleVersion: propBundleVersion,
  onAccepted,
  onDocumentsUpdated,
}) => {
  const { allDocs, bundleVersion } = useSyncedLegalBundle(customDocuments, propBundleVersion);
  const docs = useMemo(
    () => getLegalAgreementsForRole(currentUser.role, allDocs),
    [currentUser.role, allDocs]
  );
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const accepted = Boolean(
    currentUser.legalAcceptedAt &&
      currentUser.legalAgreementsVersion === bundleVersion
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
                ) : (
                  <span className="px-2 py-0.5 rounded-md border st-border text-[10px] font-mono st-muted">
                    Пакет v{bundleVersion}
                  </span>
                )}
              </div>
              <p className="text-xs st-muted mt-0.5">
                {accepted
                  ? `Уведомление о полном прочтении ${docs.length} документов (v${bundleVersion}) отправлено владельцу студии.`
                  : `Полный перечень обязательных юридических документов и согласий (${docs.length}) для роли «${ROLE_LABELS[currentUser.role]}».`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {currentUser.role === 'owner' && (
              <button
                type="button"
                onClick={() => setShowEditor(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border st-surface-muted text-xs font-semibold cursor-pointer hover:opacity-90"
              >
                <Pencil className="w-3.5 h-3.5 st-accent-text" />
                <span>Редактировать тексты</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpenDocId(docs[0]?.id || 'privacy_policy')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{accepted ? 'Открыть все документы' : 'Ознакомиться и принять'}</span>
            </button>
          </div>
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
          customDocuments={allDocs}
          bundleVersion={bundleVersion}
          onAccepted={onAccepted}
          onClose={() => setOpenDocId(null)}
        />
      )}

      {showEditor && currentUser.role === 'owner' && (
        <OwnerLegalDocumentsEditorModal
          documents={allDocs}
          bundleVersion={bundleVersion}
          onUpdated={onDocumentsUpdated}
          onClose={() => setShowEditor(false)}
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

interface OwnerLegalDocumentsEditorProps {
  documents?: LegalAgreementDoc[];
  bundleVersion?: string;
  onUpdated?: (res: { documents: LegalAgreementDoc[]; bundleVersion: string }) => void;
  onClose?: () => void;
}

const BUILTIN_DOC_IDS = new Set([
  'privacy_policy',
  'personal_data_consent',
  'user_agreement',
  'health_safety_consent',
  'telemetry_photo_consent',
  'notifications_consent',
  'staff_nda',
]);

export const OwnerLegalDocumentsEditor: React.FC<OwnerLegalDocumentsEditorProps> = ({
  documents: propDocs,
  bundleVersion: propVersion,
  onUpdated,
  onClose,
}) => {
  const { allDocs, bundleVersion } = useSyncedLegalBundle(propDocs, propVersion);
  const [draftDocs, setDraftDocs] = useState<LegalAgreementDoc[]>(() =>
    allDocs.map((d) => ({
      ...d,
      requiredFor: [...d.requiredFor],
      sections: d.sections.map((s) => ({
        heading: s.heading,
        paragraphs: [...s.paragraphs],
      })),
    }))
  );
  const [selectedDocId, setSelectedDocId] = useState<string>(
    () => allDocs[0]?.id || 'privacy_policy'
  );
  const [bumpBundleVersion, setBumpBundleVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDraftDocs(
      allDocs.map((d) => ({
        ...d,
        requiredFor: [...d.requiredFor],
        sections: d.sections.map((s) => ({
          heading: s.heading,
          paragraphs: [...s.paragraphs],
        })),
      }))
    );
  }, [allDocs]);

  const activeDoc =
    draftDocs.find((d) => d.id === selectedDocId) || draftDocs[0];

  const updateActiveDoc = (updater: (doc: LegalAgreementDoc) => LegalAgreementDoc) => {
    if (!activeDoc) return;
    setDraftDocs((prev) =>
      prev.map((d) => (d.id === activeDoc.id ? updater(d) : d))
    );
    setStatusMsg(null);
  };

  const handleToggleRole = (targetRole: UserRole) => {
    if (targetRole === 'owner') return;
    updateActiveDoc((doc) => {
      const has = doc.requiredFor.includes(targetRole);
      const nextRoles: UserRole[] = has
        ? doc.requiredFor.filter((r) => r !== targetRole)
        : [...doc.requiredFor, targetRole];
      return {
        ...doc,
        requiredFor: nextRoles.includes('owner') ? nextRoles : ['owner', ...nextRoles],
      };
    });
  };

  const handleAddSection = () => {
    updateActiveDoc((doc) => ({
      ...doc,
      sections: [
        ...doc.sections,
        {
          heading: `${doc.sections.length + 1}. Новый раздел`,
          paragraphs: ['Введите текст пункта соглашения.'],
        },
      ],
    }));
  };

  const handleRemoveSection = (idx: number) => {
    updateActiveDoc((doc) => {
      if (doc.sections.length <= 1) return doc;
      return {
        ...doc,
        sections: doc.sections.filter((_, i) => i !== idx),
      };
    });
  };

  const handleAddCustomDocument = () => {
    const newId = `custom_doc_${Date.now().toString(36)}`;
    const today = new Date().toISOString().slice(0, 10);
    const nextDoc: LegalAgreementDoc = {
      id: newId,
      title: 'Новое юридическое соглашение студии',
      shortTitle: 'Новое соглашение',
      category: 'Оферта и правила',
      version: '1.0',
      updatedAt: today,
      requiredFor: ['owner', 'admin', 'trainer', 'client'],
      summary: 'Краткое описание нового юридического документа.',
      sections: [
        {
          heading: '1. Основные положения',
          paragraphs: ['Укажите текст нового юридического соглашения.'],
        },
      ],
    };
    setDraftDocs((prev) => [...prev, nextDoc]);
    setSelectedDocId(newId);
    setStatusMsg(null);
  };

  const handleDeleteCustomDocument = (docId: string) => {
    if (BUILTIN_DOC_IDS.has(docId)) return;
    setDraftDocs((prev) => {
      const filteredDocs = prev.filter((d) => d.id !== docId);
      if (selectedDocId === docId && filteredDocs[0]) {
        setSelectedDocId(filteredDocs[0].id);
      }
      return filteredDocs;
    });
    setStatusMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        documents: LegalAgreementDoc[];
        bundleVersion: string;
      }>('/api/legal/documents', {
        method: 'PUT',
        body: JSON.stringify({
          documents: draftDocs,
          bumpBundleVersion,
        }),
      });
      setActiveLegalBundle(res.documents, res.bundleVersion);
      onUpdated?.({ documents: res.documents, bundleVersion: res.bundleVersion });
      setBumpBundleVersion(false);
      setStatusMsg({
        ok: true,
        text: `Изменения сохранены (пакет v${res.bundleVersion}). Новые тексты уже активны во всех приложениях.`,
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : 'Не удалось сохранить юридические соглашения.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetActiveDoc = async () => {
    if (!activeDoc || !BUILTIN_DOC_IDS.has(activeDoc.id)) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        documents: LegalAgreementDoc[];
        bundleVersion: string;
      }>('/api/legal/documents/reset', {
        method: 'POST',
        body: JSON.stringify({ docId: activeDoc.id }),
      });
      setActiveLegalBundle(res.documents, res.bundleVersion);
      onUpdated?.({ documents: res.documents, bundleVersion: res.bundleVersion });
      setStatusMsg({
        ok: true,
        text: `Текст документа «${activeDoc.shortTitle}» восстановлен к стандартной редакции.`,
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : 'Не удалось сбросить текст документа.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!activeDoc) return null;

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl st-surface border st-border overflow-hidden"
    >
      <div className="px-5 py-4 border-b st-border st-surface-muted flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl st-accent-soft flex items-center justify-center shrink-0">
            <Pencil className="w-4 h-4 st-accent-text" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold">
                Редактор текстов юридических соглашений (владелец)
              </h3>
              <span className="px-2 py-0.5 rounded border st-border text-[10px] font-mono st-surface">
                Пакет v{bundleVersion}
              </span>
            </div>
            <p className="text-xs st-muted">
              Редактируйте формулировки, заголовки, версии и список ролей — изменения сразу обновляются на экране входа и в приложениях администратора, тренера и клиента.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть редактор"
            className="p-1.5 rounded-lg border st-border st-surface hover:opacity-80 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left: List of Documents */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r st-border p-3 space-y-2 st-surface-muted/40">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider st-muted">
              Документы ({draftDocs.length})
            </span>
            <button
              type="button"
              onClick={handleAddCustomDocument}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border st-border st-surface text-[11px] font-medium hover:opacity-90 cursor-pointer"
            >
              <Plus className="w-3 h-3 st-accent-text" />
              <span>Добавить</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-[420px] lg:max-h-[580px] overflow-y-auto pr-0.5">
            {draftDocs.map((doc, idx) => {
              const isSelected = doc.id === activeDoc.id;
              return (
                <div
                  key={doc.id}
                  className={`rounded-xl border transition-colors ${
                    isSelected
                      ? 'st-accent-soft border-current'
                      : 'st-surface st-border hover:opacity-95'
                  }`}
                >
                  <div className="flex items-start gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedDocId(doc.id)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-[10px] font-mono st-muted">
                        0{idx + 1} · {doc.category} · v{doc.version}
                      </div>
                      <div className="text-xs font-semibold leading-snug mt-0.5">
                        {doc.shortTitle}
                      </div>
                    </button>
                    {!BUILTIN_DOC_IDS.has(doc.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomDocument(doc.id)}
                        title="Удалить дополнительный документ"
                        className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active Document Form */}
        <div className="lg:col-span-8 p-4 sm:p-5 space-y-4 max-h-[660px] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium st-muted">Полное название документа</span>
              <input
                type="text"
                required
                maxLength={220}
                value={activeDoc.title}
                onChange={(e) =>
                  updateActiveDoc((d) => ({ ...d, title: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface text-sm font-medium"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium st-muted">Краткое название в списке</span>
              <input
                type="text"
                required
                maxLength={100}
                value={activeDoc.shortTitle}
                onChange={(e) =>
                  updateActiveDoc((d) => ({ ...d, shortTitle: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium st-muted">Категория</span>
              <select
                value={activeDoc.category}
                onChange={(e) =>
                  updateActiveDoc((d) => ({
                    ...d,
                    category: e.target.value as LegalAgreementCategory,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface"
              >
                {LEGAL_AGREEMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-medium st-muted">Версия редакции</span>
              <input
                type="text"
                required
                maxLength={24}
                value={activeDoc.version}
                onChange={(e) =>
                  updateActiveDoc((d) => ({ ...d, version: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium st-muted">Дата обновления</span>
              <input
                type="date"
                required
                value={activeDoc.updatedAt}
                onChange={(e) =>
                  updateActiveDoc((d) => ({ ...d, updatedAt: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium st-muted">Краткая аннотация</span>
              <textarea
                rows={2}
                maxLength={600}
                value={activeDoc.summary}
                onChange={(e) =>
                  updateActiveDoc((d) => ({ ...d, summary: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border st-border st-surface leading-relaxed"
              />
            </label>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="font-medium st-muted">Обязательно для ознакомления и согласия ролям:</div>
            <div className="flex flex-wrap gap-2">
              {(['admin', 'trainer', 'client'] as UserRole[]).map((r) => {
                const active = activeDoc.requiredFor.includes(r);
                return (
                  <label
                    key={r}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                      active
                        ? 'st-accent-soft border-current font-semibold'
                        : 'st-surface st-border st-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => handleToggleRole(r)}
                      className="rounded cursor-pointer"
                    />
                    <span>{ROLE_LABELS[r]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Sections Editor */}
          <div className="space-y-3 pt-2 border-t st-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider st-accent-text">
                Разделы и полный текст документа ({activeDoc.sections.length})
              </span>
              <button
                type="button"
                onClick={handleAddSection}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border st-surface-muted text-xs font-medium cursor-pointer hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5 st-accent-text" />
                <span>Добавить раздел</span>
              </button>
            </div>

            {activeDoc.sections.map((sec, sIdx) => (
              <div
                key={`${activeDoc.id}-sec-${sIdx}`}
                className="p-3.5 rounded-xl st-surface-muted border st-border space-y-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={sec.heading}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveDoc((d) => ({
                        ...d,
                        sections: d.sections.map((item, i) =>
                          i === sIdx ? { ...item, heading: val } : item
                        ),
                      }));
                    }}
                    placeholder="Заголовок раздела"
                    className="flex-1 px-3 py-1.5 rounded-lg border st-border st-surface font-semibold"
                  />
                  {activeDoc.sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sIdx)}
                      title="Удалить раздел"
                      className="p-1.5 rounded-lg border st-border st-surface text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <textarea
                  rows={4}
                  required
                  value={sec.paragraphs.join('\n\n')}
                  onChange={(e) => {
                    const rawLines = e.target.value.split(/\n{2,}|\n(?=\S)/);
                    const nextParagraphs = rawLines.length > 0 ? rawLines : [''];
                    updateActiveDoc((d) => ({
                      ...d,
                      sections: d.sections.map((item, i) =>
                        i === sIdx ? { ...item, paragraphs: nextParagraphs } : item
                      ),
                    }));
                  }}
                  placeholder="Текст раздела (абзацы разделяйте пустой строкой)"
                  className="w-full px-3 py-2 rounded-lg border st-border st-surface text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-4 border-t st-border st-surface-muted space-y-3">
        <label className="flex items-start gap-2.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bumpBundleVersion}
            onChange={(e) => setBumpBundleVersion(e.target.checked)}
            className="mt-0.5 rounded cursor-pointer shrink-0"
          />
          <span className="leading-relaxed">
            <strong>Потребовать повторное ознакомление (повысить версию пакета):</strong> при следующей
            авторизации администраторы, тренеры и клиенты увидят обновлённые соглашения и заново отправят подтверждение прочтения владельцу.
          </span>
        </label>

        {statusMsg && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
              statusMsg.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            }`}
          >
            {statusMsg.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {BUILTIN_DOC_IDS.has(activeDoc.id) && (
              <button
                type="button"
                disabled={saving}
                onClick={handleResetActiveDoc}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить документ к стандарту</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer"
              >
                Закрыть
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Сохранение...' : 'Сохранить юридические соглашения'}</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};

interface OwnerLegalDocumentsEditorModalProps {
  documents?: LegalAgreementDoc[];
  bundleVersion?: string;
  onUpdated?: (res: { documents: LegalAgreementDoc[]; bundleVersion: string }) => void;
  onClose: () => void;
}

export const OwnerLegalDocumentsEditorModal: React.FC<OwnerLegalDocumentsEditorModalProps> = ({
  documents,
  bundleVersion,
  onUpdated,
  onClose,
}) => {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-5xl my-auto">
        <OwnerLegalDocumentsEditor
          documents={documents}
          bundleVersion={bundleVersion}
          onUpdated={onUpdated}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

