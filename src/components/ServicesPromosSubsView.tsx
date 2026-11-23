import React, { useMemo, useState } from 'react';
import {
  Plus,
  Tag,
  Ticket,
  CreditCard,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  CalendarClock,
} from 'lucide-react';
import type {
  ClientProfile,
  ClientSubscription,
  PromoCode,
  ServiceCategory,
  ServiceItem,
  Studio,
  SubscriptionPlan,
  SubscriptionUsage,
} from '../types';
import { apiRequest } from '../utils/api';
import {
  SERVICE_CATEGORY_OPTIONS,
  SERVICE_CATEGORY_SHORT_MAP,
  inferServiceCategory,
} from '../utils/serviceCategories';

interface ServicesPromosSubsProps {
  studios: Studio[];
  clients: ClientProfile[];
  services: ServiceItem[];
  promos: PromoCode[];
  subscriptionPlans: SubscriptionPlan[];
  clientSubscriptions: ClientSubscription[];
  subscriptionUsages: SubscriptionUsage[];
  onServiceAdded: (s: ServiceItem) => void;
  onServiceUpdated: (s: ServiceItem) => void;
  onServiceDeleted: (id: string) => void;
  onPromoAdded: (p: PromoCode) => void;
  onPromoUpdated: (p: PromoCode) => void;
  onSubscriptionPlanAdded: (p: SubscriptionPlan) => void;
  onSubscriptionPlanUpdated: (p: SubscriptionPlan) => void;
  onSubscriptionPlanDeleted: (id: string) => void;
  onSubscriptionIssued: (s: ClientSubscription) => void;
  onSubscriptionUpdated: () => void;
  onSubscriptionDeleted: () => void;
  onSubscriptionsBulkCleanup: () => void;
}

type ServiceSortMode = 'default' | 'price_asc' | 'price_desc' | 'duration_asc' | 'name_asc';
type PlanFilterMode = 'active' | 'archived' | 'all';
type SubFilterMode = 'actual' | 'worked_out' | 'archived' | 'all';

const CATEGORY_ORDER: Record<ServiceCategory, number> = {
  relax: 1,
  fitness: 2,
  sport: 3,
  wellness: 4,
};

const VALIDITY_DAY_PRESETS = [30, 60, 90, 180, 365];

function addDaysToIsoDate(startDateStr: string, days: number): string {
  const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)
    ? startDateStr
    : new Date().toISOString().slice(0, 10);
  const d = new Date(`${safeStart}T00:00:00Z`);
  return new Date(d.getTime() + Math.max(1, days) * 86400000).toISOString().slice(0, 10);
}

function diffDaysBetweenDates(startStr: string, endStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return null;
  const startMs = new Date(`${startStr}T00:00:00Z`).getTime();
  const endMs = new Date(`${endStr}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function isWorkedOutSubscription(sub: ClientSubscription): boolean {
  return sub.status === 'used' || sub.status === 'expired' || sub.remainingSessions <= 0;
}

export const ServicesPromosSubsView: React.FC<ServicesPromosSubsProps> = ({
  studios,
  clients,
  services,
  promos,
  subscriptionPlans,
  clientSubscriptions,
  subscriptionUsages,
  onServiceAdded,
  onServiceUpdated,
  onServiceDeleted,
  onPromoAdded,
  onPromoUpdated,
  onSubscriptionPlanAdded,
  onSubscriptionPlanUpdated,
  onSubscriptionPlanDeleted,
  onSubscriptionIssued,
  onSubscriptionUpdated,
  onSubscriptionDeleted,
  onSubscriptionsBulkCleanup,
}) => {
  const [subTab, setSubTab] = useState<'services' | 'promos' | 'subs'>('services');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ServiceCategory>('all');
  const [sortMode, setSortMode] = useState<ServiceSortMode>('default');
  const [serviceError, setServiceError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);

  // New Service
  const [showNewService, setShowNewService] = useState(false);
  const [srvName, setSrvName] = useState('');
  const [srvCategory, setSrvCategory] = useState<ServiceCategory>('wellness');
  const [srvDesc, setSrvDesc] = useState('');
  const [srvDuration, setSrvDuration] = useState(60);
  const [srvPrice, setSrvPrice] = useState(4500);
  const [srvSortOrder, setSrvSortOrder] = useState(10);

  // Edit Service
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [editSrvName, setEditSrvName] = useState('');
  const [editSrvCategory, setEditSrvCategory] = useState<ServiceCategory>('wellness');
  const [editSrvDesc, setEditSrvDesc] = useState('');
  const [editSrvDuration, setEditSrvDuration] = useState(60);
  const [editSrvPrice, setEditSrvPrice] = useState(4500);
  const [editSrvSortOrder, setEditSrvSortOrder] = useState(1);
  const [editSrvActive, setEditSrvActive] = useState(true);

  // New Promo
  const [showNewPromo, setShowNewPromo] = useState(false);
  const [prCode, setPrCode] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prDiscount, setPrDiscount] = useState(15);
  const [prValidUntil, setPrValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Subscription Plans Filter & CRUD
  const [planFilter, setPlanFilter] = useState<PlanFilterMode>('active');
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [planType, setPlanType] = useState<'subscription' | 'certificate'>('subscription');
  const [planName, setPlanName] = useState('');
  const [planSessions, setPlanSessions] = useState(5);
  const [planPrice, setPlanPrice] = useState(18000);
  const [planValidityDays, setPlanValidityDays] = useState(90);
  const [planDesc, setPlanDesc] = useState('');

  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editPlanType, setEditPlanType] = useState<'subscription' | 'certificate'>('subscription');
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanSessions, setEditPlanSessions] = useState(5);
  const [editPlanPrice, setEditPlanPrice] = useState(18000);
  const [editPlanValidityDays, setEditPlanValidityDays] = useState(90);
  const [editPlanDesc, setEditPlanDesc] = useState('');
  const [editPlanActive, setEditPlanActive] = useState(true);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  // Issue Subscription / Certificate (with custom validity period)
  const activePlans = useMemo(
    () => subscriptionPlans.filter((p) => p.active),
    [subscriptionPlans]
  );
  const [showIssueSub, setShowIssueSub] = useState(false);
  const [issueClientId, setIssueClientId] = useState(clients[0]?.id || '');
  const [issuePlanId, setIssuePlanId] = useState(
    activePlans[0]?.id || subscriptionPlans[0]?.id || ''
  );
  const [issueStudioId, setIssueStudioId] = useState(studios[0]?.id || '');
  const [issueStartDate, setIssueStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueValidityDays, setIssueValidityDays] = useState(
    activePlans[0]?.validityDays || subscriptionPlans[0]?.validityDays || 90
  );
  const [issueExpiresAt, setIssueExpiresAt] = useState(() =>
    addDaysToIsoDate(
      new Date().toISOString().slice(0, 10),
      activePlans[0]?.validityDays || subscriptionPlans[0]?.validityDays || 90
    )
  );

  // Issued Client Subscriptions Filter, Edit, Archive & Delete
  const [subFilter, setSubFilter] = useState<SubFilterMode>('actual');
  const [editingSub, setEditingSub] = useState<ClientSubscription | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubType, setEditSubType] = useState<'subscription' | 'certificate'>('subscription');
  const [editSubCode, setEditSubCode] = useState('');
  const [editSubTotal, setEditSubTotal] = useState(5);
  const [editSubRemaining, setEditSubRemaining] = useState(5);
  const [editSubStart, setEditSubStart] = useState('');
  const [editSubExpires, setEditSubExpires] = useState('');
  const [editSubStatus, setEditSubStatus] = useState<ClientSubscription['status']>('active');
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);
  const [confirmBulkDeleteUsed, setConfirmBulkDeleteUsed] = useState(false);
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [subNotice, setSubNotice] = useState('');

  const filteredSortedServices = useMemo(() => {
    const list = services.filter((srv) => {
      if (categoryFilter === 'all') return true;
      return inferServiceCategory(srv) === categoryFilter;
    });
    return [...list].sort((a, b) => {
      if (sortMode === 'price_asc') return a.priceRub - b.priceRub;
      if (sortMode === 'price_desc') return b.priceRub - a.priceRub;
      if (sortMode === 'duration_asc') return a.durationMin - b.durationMin;
      if (sortMode === 'name_asc') return a.name.localeCompare(b.name, 'ru');
      const catDiff =
        CATEGORY_ORDER[inferServiceCategory(a)] - CATEGORY_ORDER[inferServiceCategory(b)];
      if (catDiff !== 0) return catDiff;
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    });
  }, [services, categoryFilter, sortMode]);

  const filteredPlans = useMemo(() => {
    if (planFilter === 'active') return subscriptionPlans.filter((p) => p.active);
    if (planFilter === 'archived') return subscriptionPlans.filter((p) => !p.active);
    return subscriptionPlans;
  }, [subscriptionPlans, planFilter]);

  const subCounts = useMemo(() => {
    const actual = clientSubscriptions.filter((s) => s.status === 'active' && s.remainingSessions > 0).length;
    const workedOut = clientSubscriptions.filter(
      (s) => s.status !== 'archived' && isWorkedOutSubscription(s)
    ).length;
    const archived = clientSubscriptions.filter((s) => s.status === 'archived').length;
    return { actual, workedOut, archived, all: clientSubscriptions.length };
  }, [clientSubscriptions]);

  const filteredClientSubs = useMemo(() => {
    return clientSubscriptions.filter((s) => {
      if (subFilter === 'actual') return s.status === 'active' && s.remainingSessions > 0;
      if (subFilter === 'worked_out') return s.status !== 'archived' && isWorkedOutSubscription(s);
      if (subFilter === 'archived') return s.status === 'archived';
      return true;
    });
  }, [clientSubscriptions, subFilter]);

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceError('');
    try {
      const created = await apiRequest<ServiceItem>('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: srvName,
          category: srvCategory,
          description: srvDesc,
          durationMin: srvDuration,
          priceRub: srvPrice,
          sortOrder: srvSortOrder,
          studioId: 'all',
        }),
      });
      onServiceAdded(created);
      setShowNewService(false);
      setSrvName('');
      setSrvDesc('');
      setSrvCategory('wellness');
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось добавить услугу');
    }
  };

  const openEditService = (srv: ServiceItem) => {
    setServiceError('');
    setEditingService(srv);
    setEditSrvName(srv.name);
    setEditSrvCategory(inferServiceCategory(srv));
    setEditSrvDesc(srv.description);
    setEditSrvDuration(srv.durationMin);
    setEditSrvPrice(srv.priceRub);
    setEditSrvSortOrder(srv.sortOrder ?? 1);
    setEditSrvActive(srv.active);
  };

  const handleSaveEditService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    setServiceError('');
    setBusyServiceId(editingService.id);
    try {
      const updated = await apiRequest<ServiceItem>(`/api/services/${editingService.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editSrvName,
          category: editSrvCategory,
          description: editSrvDesc,
          durationMin: editSrvDuration,
          priceRub: editSrvPrice,
          sortOrder: editSrvSortOrder,
          active: editSrvActive,
        }),
      });
      onServiceUpdated(updated);
      setEditingService(null);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось обновить услугу');
    } finally {
      setBusyServiceId(null);
    }
  };

  const handleDeleteService = async (id: string) => {
    setServiceError('');
    setBusyServiceId(id);
    try {
      await apiRequest(`/api/services/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      onServiceDeleted(id);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось удалить услугу');
    } finally {
      setBusyServiceId(null);
    }
  };

  const toggleServiceActive = async (srv: ServiceItem) => {
    const updated = await apiRequest<ServiceItem>(`/api/services/${srv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !srv.active }),
    });
    onServiceUpdated(updated);
  };

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await apiRequest<PromoCode>('/api/promos', {
      method: 'POST',
      body: JSON.stringify({
        code: prCode,
        title: prTitle,
        discountPercent: prDiscount,
        validUntil: prValidUntil,
        studioId: 'all',
      }),
    });
    onPromoAdded(created);
    setShowNewPromo(false);
    setPrCode('');
    setPrTitle('');
  };

  const togglePromoActive = async (p: PromoCode) => {
    const updated = await apiRequest<PromoCode>(`/api/promos/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !p.active }),
    });
    onPromoUpdated(updated);
  };

  // Plans CRUD
  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceError('');
    try {
      const created = await apiRequest<SubscriptionPlan>('/api/subscription-plans', {
        method: 'POST',
        body: JSON.stringify({
          name: planName,
          type: planType,
          sessionsCount: planSessions,
          priceRub: planPrice,
          validityDays: planValidityDays,
          description: planDesc,
          active: true,
        }),
      });
      onSubscriptionPlanAdded(created);
      setShowNewPlan(false);
      setPlanName('');
      setPlanDesc('');
      setPlanValidityDays(90);
      setSubNotice(`Создан тариф «${created.name}» со сроком действия ${created.validityDays} дн.`);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось создать тариф');
    }
  };

  const openEditPlan = (pl: SubscriptionPlan) => {
    setServiceError('');
    setEditingPlan(pl);
    setEditPlanType(pl.type);
    setEditPlanName(pl.name);
    setEditPlanSessions(pl.sessionsCount);
    setEditPlanPrice(pl.priceRub);
    setEditPlanValidityDays(pl.validityDays);
    setEditPlanDesc(pl.description);
    setEditPlanActive(pl.active);
  };

  const handleSaveEditPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setServiceError('');
    setBusyPlanId(editingPlan.id);
    try {
      const updated = await apiRequest<SubscriptionPlan>(`/api/subscription-plans/${editingPlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editPlanName,
          type: editPlanType,
          sessionsCount: editPlanSessions,
          priceRub: editPlanPrice,
          validityDays: editPlanValidityDays,
          description: editPlanDesc,
          active: editPlanActive,
        }),
      });
      onSubscriptionPlanUpdated(updated);
      setEditingPlan(null);
      setSubNotice(`Тариф «${updated.name}» обновлён (период ${updated.validityDays} дн.).`);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось обновить тариф');
    } finally {
      setBusyPlanId(null);
    }
  };

  const togglePlanArchive = async (pl: SubscriptionPlan) => {
    setBusyPlanId(pl.id);
    try {
      const updated = await apiRequest<SubscriptionPlan>(`/api/subscription-plans/${pl.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !pl.active }),
      });
      onSubscriptionPlanUpdated(updated);
      setSubNotice(updated.active ? `Тариф «${updated.name}» возвращён из архива.` : `Тариф «${updated.name}» отправлен в архив.`);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось изменить статус тарифа');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleDeletePlan = async (id: string) => {
    setBusyPlanId(id);
    try {
      await apiRequest(`/api/subscription-plans/${id}`, { method: 'DELETE' });
      setConfirmDeletePlanId(null);
      onSubscriptionPlanDeleted(id);
      setSubNotice('Тариф удалён.');
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось удалить тариф');
    } finally {
      setBusyPlanId(null);
    }
  };

  // Issue Sub with custom validity period
  const openIssueSubModal = () => {
    const defaultPlan = activePlans[0] || subscriptionPlans[0];
    const start = new Date().toISOString().slice(0, 10);
    const days = defaultPlan?.validityDays || 90;
    setIssuePlanId(defaultPlan?.id || '');
    setIssueClientId(clients[0]?.id || '');
    setIssueStudioId(studios[0]?.id || '');
    setIssueStartDate(start);
    setIssueValidityDays(days);
    setIssueExpiresAt(addDaysToIsoDate(start, days));
    setShowIssueSub(true);
  };

  const handleSelectIssuePlan = (newPlanId: string) => {
    setIssuePlanId(newPlanId);
    const found = subscriptionPlans.find((p) => p.id === newPlanId);
    if (found) {
      setIssueValidityDays(found.validityDays);
      setIssueExpiresAt(addDaysToIsoDate(issueStartDate, found.validityDays));
    }
  };

  const handleIssueSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceError('');
    try {
      const created = await apiRequest<ClientSubscription>('/api/client-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          clientId: issueClientId,
          planId: issuePlanId,
          studioId: issueStudioId,
          purchasedAt: issueStartDate,
          validityDays: issueValidityDays,
          expiresAt: issueExpiresAt,
        }),
      });
      onSubscriptionIssued(created);
      setShowIssueSub(false);
      setSubNotice(`Выдан ${created.code} с периодом действия ${created.purchasedAt} — ${created.expiresAt}.`);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось выдать абонемент');
    }
  };

  // Issued Client Subscription Edit / Archive / Delete
  const openEditSub = (sub: ClientSubscription) => {
    setServiceError('');
    setEditingSub(sub);
    setEditSubName(sub.planName);
    setEditSubType(sub.type);
    setEditSubCode(sub.code);
    setEditSubTotal(sub.totalSessions);
    setEditSubRemaining(sub.remainingSessions);
    setEditSubStart(sub.purchasedAt);
    setEditSubExpires(sub.expiresAt);
    setEditSubStatus(sub.status);
  };

  const handleSaveEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setServiceError('');
    setBusySubId(editingSub.id);
    try {
      await apiRequest<ClientSubscription>(`/api/client-subscriptions/${editingSub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          planName: editSubName,
          type: editSubType,
          code: editSubCode,
          totalSessions: editSubTotal,
          remainingSessions: editSubRemaining,
          purchasedAt: editSubStart,
          expiresAt: editSubExpires,
          status: editSubStatus,
        }),
      });
      setEditingSub(null);
      onSubscriptionUpdated();
      setSubNotice(`Данные ${editSubCode} обновлены (срок ${editSubStart} — ${editSubExpires}).`);
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось обновить абонемент');
    } finally {
      setBusySubId(null);
    }
  };

  const handleArchiveToggleSub = async (sub: ClientSubscription) => {
    setServiceError('');
    setBusySubId(sub.id);
    const nextStatus: ClientSubscription['status'] =
      sub.status === 'archived'
        ? sub.remainingSessions > 0
          ? 'active'
          : 'used'
        : 'archived';
    try {
      await apiRequest<ClientSubscription>(`/api/client-subscriptions/${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      onSubscriptionUpdated();
      setSubNotice(
        nextStatus === 'archived'
          ? `${sub.code} отправлен в архив.`
          : `${sub.code} восстановлен из архива.`
      );
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось изменить статус архива');
    } finally {
      setBusySubId(null);
    }
  };

  const handleDeleteSub = async (id: string) => {
    setServiceError('');
    setBusySubId(id);
    try {
      await apiRequest(`/api/client-subscriptions/${id}`, { method: 'DELETE' });
      setConfirmDeleteSubId(null);
      onSubscriptionDeleted();
      setSubNotice('Абонемент/сертификат полностью удалён.');
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось удалить запись');
    } finally {
      setBusySubId(null);
    }
  };

  const handleBulkCleanup = async (action: 'archive' | 'delete') => {
    setServiceError('');
    try {
      const res = await apiRequest<{ ok: boolean; count: number }>(
        '/api/client-subscriptions/cleanup-used',
        {
          method: 'POST',
          body: JSON.stringify({ action }),
        }
      );
      setConfirmBulkDeleteUsed(false);
      onSubscriptionsBulkCleanup();
      setSubNotice(
        action === 'archive'
          ? `В архив отправлено отработанных: ${res.count}`
          : `Полностью удалено отработанных/архивных: ${res.count}`
      );
    } catch (err) {
      setServiceError(err instanceof Error ? err.message : 'Не удалось выполнить массовую операцию');
    }
  };

  return (
    <div className="space-y-6">
      {/* Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('services')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'services'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Услуги и прайс ({services.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('promos')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'promos'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Акции и промокоды ({promos.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('subs')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'subs'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Абонементы и сертификаты ({clientSubscriptions.length})
          </button>
        </div>

        {subTab === 'services' && (
          <button
            type="button"
            onClick={() => {
              setServiceError('');
              setShowNewService(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить услугу</span>
          </button>
        )}
        {subTab === 'promos' && (
          <button
            type="button"
            onClick={() => setShowNewPromo(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Создать акцию</span>
          </button>
        )}
        {subTab === 'subs' && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setServiceError('');
                setShowNewPlan(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer whitespace-nowrap hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Новый тариф / сертификат</span>
            </button>
            <button
              type="button"
              onClick={openIssueSubModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-cyan-600 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Выдать клиенту</span>
            </button>
          </div>
        )}
      </div>

      {serviceError && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {serviceError}
        </div>
      )}
      {subNotice && subTab === 'subs' && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <span>{subNotice}</span>
          <button
            type="button"
            onClick={() => setSubNotice('')}
            className="text-[11px] underline cursor-pointer"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* Tab 1: Services */}
      {subTab === 'services' && (
        <div className="space-y-4">
          {/* Category Filter + Sort Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Все направления ({services.length})
              </button>
              {SERVICE_CATEGORY_OPTIONS.map((cat) => {
                const count = services.filter((s) => inferServiceCategory(s) === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cat.shortLabel} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 whitespace-nowrap">Сортировка:</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as ServiceSortMode)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="default">По направлению и порядку</option>
                <option value="price_asc">Сначала дешевле</option>
                <option value="price_desc">Сначала дороже</option>
                <option value="duration_asc">По длительности</option>
                <option value="name_asc">По алфавиту (А–Я)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSortedServices.map((srv) => {
              const cat = inferServiceCategory(srv);
              const isBusy = busyServiceId === srv.id;
              const isConfirmingDelete = confirmDeleteId === srv.id;
              return (
                <div
                  key={srv.id}
                  className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {SERVICE_CATEGORY_SHORT_MAP[cat]}
                      </span>
                      {typeof srv.sortOrder === 'number' && (
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          #{srv.sortOrder}
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-display text-base font-semibold">{srv.name}</h4>
                      <span className="font-mono text-base font-bold tabular-nums text-cyan-700 dark:text-cyan-400 whitespace-nowrap">
                        {srv.priceRub.toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{srv.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-500 tabular-nums">
                        {srv.durationMin} мин
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleServiceActive(srv)}
                        className={`font-medium cursor-pointer ${
                          srv.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {srv.active ? '● Активна' : '○ Скрыта'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditService(srv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Изменить</span>
                      </button>
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteService(srv.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 cursor-pointer"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(srv.id)}
                          title="Удалить услугу"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredSortedServices.length === 0 && (
              <div className="md:col-span-2 p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                В выбранном направлении услуг пока нет.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Promos */}
      {subTab === 'promos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promos.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-mono text-sm font-bold text-cyan-700 dark:text-cyan-400">
                  {p.code} · −{p.discountPercent}%
                </div>
                <div className="text-sm font-medium mt-1">{p.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Действует до {p.validUntil} · Использований: {p.usageCount}
                </div>
              </div>
              <button
                type="button"
                onClick={() => togglePromoActive(p)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap ${
                  p.active
                    ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-400'
                }`}
              >
                {p.active ? 'Активна' : 'Отключена'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Subscriptions, Certificates & Usage History */}
      {subTab === 'subs' && (
        <div className="space-y-6">
          {/* Plans Catalog Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold">
              Тарифы абонементов и подарочных сертификатов
            </h3>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'active', label: `Активные (${subscriptionPlans.filter((p) => p.active).length})` },
                  { id: 'archived', label: `Архив (${subscriptionPlans.filter((p) => !p.active).length})` },
                  { id: 'all', label: `Все (${subscriptionPlans.length})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlanFilter(item.id)}
                  className={`px-2.5 py-1 text-xs rounded-md cursor-pointer whitespace-nowrap ${
                    planFilter === item.id
                      ? 'bg-white dark:bg-slate-800 font-semibold shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Plans Catalog Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredPlans.map((pl) => {
              const isBusy = busyPlanId === pl.id;
              const isConfirmDelete = confirmDeletePlanId === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3 ${
                    !pl.active ? 'opacity-75' : ''
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">
                        {pl.type === 'certificate' ? 'Подарочный сертификат' : 'Абонемент'}
                      </span>
                      <span className="font-mono inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <CalendarClock className="w-3 h-3" />
                        {pl.validityDays} дн.
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-display text-base font-semibold">{pl.name}</div>
                      {!pl.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                          Архив
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xl font-bold tabular-nums text-cyan-700 dark:text-cyan-400">
                        {pl.priceRub.toLocaleString('ru-RU')} ₽
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {pl.sessionsCount} зан.
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{pl.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => openEditPlan(pl)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Изменить</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => togglePlanArchive(pl)}
                        title={pl.active ? 'Отправить тариф в архив' : 'Восстановить из архива'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                      >
                        {pl.active ? (
                          <Archive className="w-3 h-3" />
                        ) : (
                          <ArchiveRestore className="w-3 h-3 text-emerald-600" />
                        )}
                        <span>{pl.active ? 'В архив' : 'Вернуть'}</span>
                      </button>

                      {isConfirmDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeletePlan(pl.id)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePlanId(null)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 cursor-pointer"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePlanId(pl.id)}
                          title="Удалить тариф"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredPlans.length === 0 && (
              <div className="md:col-span-3 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                В этом разделе тарифов нет.
              </div>
            )}
          </div>

          {/* Issued Client Subscriptions */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-600" />
                <h3 className="font-display text-base font-semibold">Выданные абонементы и сертификаты</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { id: 'actual', label: `Активные (${subCounts.actual})` },
                      { id: 'worked_out', label: `Отработанные (${subCounts.workedOut})` },
                      { id: 'archived', label: `Архив (${subCounts.archived})` },
                      { id: 'all', label: `Все (${subCounts.all})` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSubFilter(item.id)}
                      className={`px-2.5 py-1 text-xs rounded-md cursor-pointer whitespace-nowrap ${
                        subFilter === item.id
                          ? 'bg-white dark:bg-slate-900 font-semibold shadow-sm'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {subCounts.workedOut > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkCleanup('archive')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>В архив отработанные ({subCounts.workedOut})</span>
                  </button>
                )}

                {subCounts.workedOut + subCounts.archived > 0 &&
                  (confirmBulkDeleteUsed ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleBulkCleanup('delete')}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Удалить навсегда ({subCounts.workedOut + subCounts.archived})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBulkDeleteUsed(false)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmBulkDeleteUsed(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-medium cursor-pointer whitespace-nowrap hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить отработанные</span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-left">
                    <th className="py-2.5 px-4 font-medium">Код</th>
                    <th className="py-2.5 px-4 font-medium">Клиент</th>
                    <th className="py-2.5 px-4 font-medium">Тариф / Тип</th>
                    <th className="py-2.5 px-4 font-medium text-right">Остаток</th>
                    <th className="py-2.5 px-4 font-medium">Период действия</th>
                    <th className="py-2.5 px-4 font-medium">Статус</th>
                    <th className="py-2.5 px-4 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredClientSubs.map((sub) => {
                    const daysLen = diffDaysBetweenDates(sub.purchasedAt, sub.expiresAt);
                    const isBusy = busySubId === sub.id;
                    const isConfirmDelete = confirmDeleteSubId === sub.id;
                    return (
                      <tr key={sub.id} className={sub.status === 'archived' ? 'opacity-70' : ''}>
                        <td className="py-3 px-4 font-mono text-xs font-semibold whitespace-nowrap">
                          {sub.code}
                        </td>
                        <td className="py-3 px-4 font-medium">{sub.clientName}</td>
                        <td className="py-3 px-4">
                          <div className="text-slate-700 dark:text-slate-200">{sub.planName}</div>
                          <div className="text-[11px] text-slate-400">
                            {sub.type === 'certificate' ? 'Сертификат' : 'Абонемент'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                          {sub.remainingSessions} / {sub.totalSessions}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          <div>
                            {sub.purchasedAt} — {sub.expiresAt}
                          </div>
                          {daysLen !== null && (
                            <div className="text-[10px] text-slate-400">Период: {daysLen} дн.</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {sub.status === 'active' && sub.remainingSessions > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Активен</span>
                          ) : sub.status === 'archived' ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">◫ В архиве</span>
                          ) : sub.status === 'expired' ? (
                            <span className="text-rose-500">○ Истёк</span>
                          ) : (
                            <span className="text-slate-400">○ Отработан</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditSub(sub)}
                              title="Редактировать абонемент / период действия"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span className="hidden xl:inline">Изменить</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleArchiveToggleSub(sub)}
                              title={sub.status === 'archived' ? 'Восстановить из архива' : 'Отправить в архив'}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                              {sub.status === 'archived' ? (
                                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Archive className="w-3.5 h-3.5 text-amber-600" />
                              )}
                            </button>
                            {isConfirmDelete ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDeleteSub(sub.id)}
                                  className="px-2 py-1 rounded-md bg-rose-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Удалить
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSubId(null)}
                                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 cursor-pointer"
                                >
                                  Отмена
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSubId(sub.id)}
                                title="Полностью удалить"
                                className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClientSubs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        В выбранной категории записей нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Usage History Audit */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold">История использования и списаний</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {subscriptionUsages.map((u) => (
                <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {u.clientName} · {u.planName}
                    </div>
                    <div className="text-slate-500 mt-0.5">{u.note}</div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className={u.delta > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-700 dark:text-slate-300 font-semibold'}>
                      {u.delta > 0 ? `+${u.delta}` : u.delta} зан.
                    </div>
                    <div className="text-slate-400">{u.usedAt}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Service */}
      {showNewService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleAddService}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Новая услуга в прайсе</h3>
            <div>
              <label className="block text-xs mb-1">Направление (категория)</label>
              <select
                value={srvCategory}
                onChange={(e) => setSrvCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {SERVICE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              required
              placeholder="Название услуги"
              value={srvName}
              onChange={(e) => setSrvName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={2}
              placeholder="Описание"
              value={srvDesc}
              onChange={(e) => setSrvDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Длительность (мин)</label>
                <input
                  type="number"
                  min={10}
                  value={srvDuration}
                  onChange={(e) => setSrvDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Стоимость (₽)</label>
                <input
                  type="number"
                  min={0}
                  value={srvPrice}
                  onChange={(e) => setSrvPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Порядок</label>
                <input
                  type="number"
                  min={1}
                  value={srvSortOrder}
                  onChange={(e) => setSrvSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewService(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
              >
                Добавить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Service */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditService}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Редактировать услугу</h3>
            <div>
              <label className="block text-xs mb-1">Направление (категория)</label>
              <select
                value={editSrvCategory}
                onChange={(e) => setEditSrvCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {SERVICE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Название</label>
              <input
                type="text"
                required
                value={editSrvName}
                onChange={(e) => setEditSrvName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Описание</label>
              <textarea
                rows={2}
                value={editSrvDesc}
                onChange={(e) => setEditSrvDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Длительность (мин)</label>
                <input
                  type="number"
                  min={10}
                  value={editSrvDuration}
                  onChange={(e) => setEditSrvDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Стоимость (₽)</label>
                <input
                  type="number"
                  min={0}
                  value={editSrvPrice}
                  onChange={(e) => setEditSrvPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Порядок</label>
                <input
                  type="number"
                  min={1}
                  value={editSrvSortOrder}
                  onChange={(e) => setEditSrvSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editSrvActive}
                onChange={(e) => setEditSrvActive(e.target.checked)}
              />
              <span>Услуга активна в прайсе и доступна для записи</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={busyServiceId === editingService.id}
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                Сохранить изменения
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Promo */}
      {showNewPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddPromo}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Новая акция / промокод</h3>
            <input
              type="text"
              required
              placeholder="Промокод (например: AUTUMN20)"
              value={prCode}
              onChange={(e) => setPrCode(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              required
              placeholder="Описание акции"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">Скидка (%)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={prDiscount}
                  onChange={(e) => setPrDiscount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Действует до</label>
                <input
                  type="date"
                  value={prValidUntil}
                  onChange={(e) => setPrValidUntil(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewPromo(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
              >
                Создать акцию
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Subscription / Certificate Plan */}
      {showNewPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleAddPlan}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Новый тариф абонемента / сертификата</h3>
            <div>
              <label className="block text-xs mb-1">Тип</label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value as 'subscription' | 'certificate')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="subscription">Абонемент</option>
                <option value="certificate">Подарочный сертификат</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Название</label>
              <input
                type="text"
                required
                placeholder="Например: Абонемент 8 сессий / Сертификат Премиум"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Занятий</label>
                <input
                  type="number"
                  min={1}
                  value={planSessions}
                  onChange={(e) => setPlanSessions(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Период (дней)</label>
                <input
                  type="number"
                  min={1}
                  value={planValidityDays}
                  onChange={(e) => setPlanValidityDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Цена (₽)</label>
                <input
                  type="number"
                  min={0}
                  value={planPrice}
                  onChange={(e) => setPlanPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VALIDITY_DAY_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPlanValidityDays(d)}
                  className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer border ${
                    planValidityDays === d
                      ? 'bg-slate-900 dark:bg-cyan-600 text-white border-transparent'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d} дн.
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="Описание условий"
              value={planDesc}
              onChange={(e) => setPlanDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewPlan(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
              >
                Создать тариф
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Subscription / Certificate Plan */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditPlan}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Редактировать тариф / сертификат</h3>
            <div>
              <label className="block text-xs mb-1">Тип</label>
              <select
                value={editPlanType}
                onChange={(e) => setEditPlanType(e.target.value as 'subscription' | 'certificate')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="subscription">Абонемент</option>
                <option value="certificate">Подарочный сертификат</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Название</label>
              <input
                type="text"
                required
                value={editPlanName}
                onChange={(e) => setEditPlanName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Занятий</label>
                <input
                  type="number"
                  min={1}
                  value={editPlanSessions}
                  onChange={(e) => setEditPlanSessions(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Период (дней)</label>
                <input
                  type="number"
                  min={1}
                  value={editPlanValidityDays}
                  onChange={(e) => setEditPlanValidityDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Цена (₽)</label>
                <input
                  type="number"
                  min={0}
                  value={editPlanPrice}
                  onChange={(e) => setEditPlanPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VALIDITY_DAY_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEditPlanValidityDays(d)}
                  className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer border ${
                    editPlanValidityDays === d
                      ? 'bg-slate-900 dark:bg-cyan-600 text-white border-transparent'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d} дн.
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs mb-1">Описание</label>
              <textarea
                rows={2}
                value={editPlanDesc}
                onChange={(e) => setEditPlanDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editPlanActive}
                onChange={(e) => setEditPlanActive(e.target.checked)}
              />
              <span>Активен (доступен к выдаче; снимите галочку для архива)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={busyPlanId === editingPlan.id}
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Issue Subscription / Certificate (with custom validity period) */}
      {showIssueSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleIssueSub}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Оформить абонемент или сертификат</h3>
            <div>
              <label className="block text-xs mb-1">Клиент</label>
              <select
                value={issueClientId}
                onChange={(e) => setIssueClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Тариф / Сертификат</label>
              <select
                value={issuePlanId}
                onChange={(e) => handleSelectIssuePlan(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {(activePlans.length > 0 ? activePlans : subscriptionPlans).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.priceRub.toLocaleString('ru-RU')} ₽ ({p.validityDays} дн.)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Студия оформления</label>
              <select
                value={issueStudioId}
                onChange={(e) => setIssueStudioId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-cyan-600" />
                <span>Период действия</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Дата начала</label>
                  <input
                    type="date"
                    value={issueStartDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setIssueStartDate(nextStart);
                      setIssueExpiresAt(addDaysToIsoDate(nextStart, issueValidityDays));
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Срок (дней)</label>
                  <input
                    type="number"
                    min={1}
                    value={issueValidityDays}
                    onChange={(e) => {
                      const days = Math.max(1, Number(e.target.value) || 1);
                      setIssueValidityDays(days);
                      setIssueExpiresAt(addDaysToIsoDate(issueStartDate, days));
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Действует до</label>
                  <input
                    type="date"
                    value={issueExpiresAt}
                    onChange={(e) => {
                      setIssueExpiresAt(e.target.value);
                      const d = diffDaysBetweenDates(issueStartDate, e.target.value);
                      if (d !== null && d >= 1) setIssueValidityDays(d);
                    }}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {VALIDITY_DAY_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setIssueValidityDays(d);
                      setIssueExpiresAt(addDaysToIsoDate(issueStartDate, d));
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border ${
                      issueValidityDays === d
                        ? 'bg-slate-900 dark:bg-cyan-600 text-white border-transparent'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {d} дн.
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowIssueSub(false)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer"
              >
                Выдать клиенту
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Issued Subscription / Certificate */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditSub}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Редактирование абонемента / сертификата</h3>
            </div>
            <div className="text-xs text-slate-500">
              Клиент: <span className="font-semibold text-slate-800 dark:text-slate-200">{editingSub.clientName}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">Тип</label>
                <select
                  value={editSubType}
                  onChange={(e) => setEditSubType(e.target.value as 'subscription' | 'certificate')}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="subscription">Абонемент</option>
                  <option value="certificate">Сертификат</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1">Код</label>
                <input
                  type="text"
                  required
                  value={editSubCode}
                  onChange={(e) => setEditSubCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1">Название тарифа / сертификата</label>
              <input
                type="text"
                required
                value={editSubName}
                onChange={(e) => setEditSubName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Осталось зан.</label>
                <input
                  type="number"
                  min={0}
                  value={editSubRemaining}
                  onChange={(e) => setEditSubRemaining(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Всего зан.</label>
                <input
                  type="number"
                  min={1}
                  value={editSubTotal}
                  onChange={(e) => setEditSubTotal(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs mb-1">Статус</label>
                <select
                  value={editSubStatus}
                  onChange={(e) => setEditSubStatus(e.target.value as ClientSubscription['status'])}
                  className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="active">Активен</option>
                  <option value="used">Отработан</option>
                  <option value="expired">Истёк</option>
                  <option value="archived">В архиве</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-cyan-600" />
                <span>Период действия</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Дата выдачи</label>
                  <input
                    type="date"
                    value={editSubStart}
                    onChange={(e) => setEditSubStart(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Действует до</label>
                  <input
                    type="date"
                    value={editSubExpires}
                    onChange={(e) => setEditSubExpires(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-slate-500 mr-1">От даты выдачи:</span>
                {VALIDITY_DAY_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEditSubExpires(addDaysToIsoDate(editSubStart, d))}
                    className="px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {d} дн.
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={busySubId === editingSub.id}
                className="px-4 py-2 text-xs rounded-lg bg-slate-900 dark:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"
              >
                Сохранить изменения
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
