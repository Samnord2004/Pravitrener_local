import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  Mail,
  MessageCircle,
  BellRing,
  Plus,
  Link2,
  Cake,
  Settings2,
  Inbox,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react';
import type {
  Booking,
  ClientProfile,
  ClientSubscription,
  MessagingSettings,
  MessengerChannel,
  MessengerMessage,
  NotificationChannel,
  NotificationLog,
  NotificationTemplate,
  PromoCode,
  Studio,
} from '../types';
import { apiRequest } from '../utils/api';

interface NotificationsCenterProps {
  studios: Studio[];
  clients: ClientProfile[];
  bookings: Booking[];
  promos: PromoCode[];
  clientSubscriptions: ClientSubscription[];
  templates: NotificationTemplate[];
  logs: NotificationLog[];
  messagingSettings?: MessagingSettings;
  messengerMessages: MessengerMessage[];
  birthdayAutomationEnabled?: boolean;
  onBirthdayAutomationToggle?: (enabled: boolean) => void;
  onTemplateAdded: (t: NotificationTemplate) => void;
  onLogsAdded: (logs: NotificationLog[]) => void;
  onMessagingSettingsUpdated: (s: MessagingSettings) => void;
  onMessengerMessageAdded: (m: MessengerMessage) => void;
  onMessengerMarkedRead: (clientId?: string) => void;
  onOpenPublicBookingPreview: (query: string) => void;
}

const VARIABLES = [
  { key: '{{client_name}}', label: 'Имя клиента' },
  { key: '{{session_date}}', label: 'Дата записи' },
  { key: '{{session_time}}', label: 'Время' },
  { key: '{{trainer_name}}', label: 'Тренер' },
  { key: '{{studio_address}}', label: 'Адрес студии' },
  { key: '{{amount}}', label: 'Сумма оплаты' },
  { key: '{{remaining_sessions}}', label: 'Остаток занятий' },
  { key: '{{cabinet_link}}', label: 'Ссылка в кабинет' },
];

const SMTP_PRESETS = [
  { label: 'Яндекс Почта', host: 'smtp.yandex.ru', port: 465, secure: true },
  { label: 'Mail.ru', host: 'smtp.mail.ru', port: 465, secure: true },
  { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  { label: 'Timeweb / STARTTLS', host: 'smtp.timeweb.ru', port: 587, secure: false },
];

export const NotificationsCenterView: React.FC<NotificationsCenterProps> = ({
  studios,
  clients,
  bookings,
  promos,
  clientSubscriptions,
  templates,
  logs,
  messagingSettings,
  messengerMessages,
  birthdayAutomationEnabled = true,
  onBirthdayAutomationToggle,
  onTemplateAdded,
  onLogsAdded,
  onMessagingSettingsUpdated,
  onMessengerMessageAdded,
  onMessengerMarkedRead,
  onOpenPublicBookingPreview,
}) => {
  const [subTab, setSubTab] = useState<'inbox' | 'broadcast' | 'settings' | 'online_links'>('inbox');

  // --- INBOX STATE ---
  const [selectedChatClientId, setSelectedChatClientId] = useState<string>(clients[0]?.id || '');
  const [chatChannelFilter, setChatChannelFilter] = useState<'all' | MessengerChannel>('all');
  const [chatSearch, setChatSearch] = useState('');
  const [replyChannel, setReplyChannel] = useState<MessengerChannel>('telegram');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  // --- BROADCAST STATE ---
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || '');
  const [channel, setChannel] = useState<NotificationChannel>(templates[0]?.channel || 'telegram');
  const [subject, setSubject] = useState(templates[0]?.subject || '');
  const [body, setBody] = useState(templates[0]?.body || '');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(
    clients[0] ? [clients[0].id] : []
  );
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState('');
  const [birthdayStatusMsg, setBirthdayStatusMsg] = useState('');
  const [autoRules, setAutoRules] = useState({
    reminder24h: true,
    reminder2h: true,
    paymentReminder: true,
  });
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [newTplName, setNewTplName] = useState('');

  // --- INTEGRATION SETTINGS STATE ---
  const [cfg, setCfg] = useState<MessagingSettings>(
    () =>
      messagingSettings || {
        email: {
          enabled: false,
          host: 'smtp.yandex.ru',
          port: 465,
          secure: true,
          user: '',
          password: '',
          fromName: 'Студия ЭТАЛОН ПРАВИЛО',
          fromEmail: '',
        },
        telegram: {
          enabled: false,
          botUsername: '@etalon_pravilo_bot',
          botToken: '',
          webhookSecret: 'etalon-tg-hook-2026',
          autoConfirmBooking: true,
        },
        whatsapp: {
          enabled: false,
          provider: 'cloud_api',
          phoneNumberId: '',
          accessToken: '',
          webhookUrl: '',
          businessPhone: '+7 (495) 120-88-10',
        },
      }
  );

  useEffect(() => {
    if (messagingSettings) {
      setCfg(messagingSettings);
    }
  }, [messagingSettings]);

  const [testEmailTo, setTestEmailTo] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgStatus, setCfgStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // --- ONLINE BOOKING LINKS STATE ---
  const [linkStudioId, setLinkStudioId] = useState(studios[0]?.id || '');
  const [linkClientId, setLinkClientId] = useState('');
  const [linkPromo, setLinkPromo] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  // Unread counter
  const totalUnreadCount = useMemo(
    () => messengerMessages.filter((m) => m.direction === 'inbound' && !m.readByAdmin).length,
    [messengerMessages]
  );

  // Threads list grouped by client
  const chatThreads = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return clients
      .map((cl) => {
        const msgs = messengerMessages.filter(
          (m) => m.clientId === cl.id && (chatChannelFilter === 'all' || m.channel === chatChannelFilter)
        );
        const lastMsg = msgs[msgs.length - 1];
        const unread = msgs.filter((m) => m.direction === 'inbound' && !m.readByAdmin).length;
        return { client: cl, msgs, lastMsg, unread };
      })
      .filter((row) => {
        if (q && !row.client.name.toLowerCase().includes(q) && !row.client.phone.includes(q)) {
          return false;
        }
        if (chatChannelFilter !== 'all' && row.msgs.length === 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.unread !== b.unread) return b.unread - a.unread;
        const ta = a.lastMsg?.sentAt || '';
        const tb = b.lastMsg?.sentAt || '';
        return tb.localeCompare(ta);
      });
  }, [clients, messengerMessages, chatChannelFilter, chatSearch]);

  const activeChatClient = useMemo(
    () => clients.find((c) => c.id === selectedChatClientId) || chatThreads[0]?.client,
    [clients, selectedChatClientId, chatThreads]
  );

  const activeThreadMessages = useMemo(
    () =>
      activeChatClient
        ? messengerMessages.filter(
            (m) =>
              m.clientId === activeChatClient.id &&
              (chatChannelFilter === 'all' || m.channel === chatChannelFilter)
          )
        : [],
    [messengerMessages, activeChatClient, chatChannelFilter]
  );

  const selectChatClient = async (clId: string) => {
    setSelectedChatClientId(clId);
    const msgs = messengerMessages.filter((m) => m.clientId === clId);
    const lastCh = msgs[msgs.length - 1]?.channel;
    if (lastCh) setReplyChannel(lastCh);
    const hasUnread = msgs.some((m) => m.direction === 'inbound' && !m.readByAdmin);
    if (hasUnread) {
      try {
        await apiRequest('/api/messenger/mark-read', {
          method: 'POST',
          body: JSON.stringify({ clientId: clId }),
        });
        onMessengerMarkedRead(clId);
      } catch {
        // ignore
      }
    }
  };

  const handleSendChatReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatClient || !replyText.trim()) return;
    setSendingReply(true);
    setReplyError('');
    try {
      const msg = await apiRequest<MessengerMessage>('/api/messenger/messages', {
        method: 'POST',
        body: JSON.stringify({
          clientId: activeChatClient.id,
          channel: replyChannel,
          text: replyText.trim(),
        }),
      });
      onMessengerMessageAdded(msg);
      onMessengerMarkedRead(activeChatClient.id);
      setReplyText('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSendingReply(false);
    }
  };

  // --- BIRTHDAY & BROADCAST HANDLERS ---
  const todayMd = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const todayBirthdayClients = useMemo(
    () => clients.filter((c) => (c.birthDate || '').slice(5, 10) === todayMd),
    [clients, todayMd]
  );

  const handleToggleBirthdayAuto = async (enabled: boolean) => {
    const res = await apiRequest<{ birthdayAutomationEnabled: boolean }>('/api/notifications/settings', {
      method: 'PATCH',
      body: JSON.stringify({ birthdayAutomationEnabled: enabled }),
    });
    onBirthdayAutomationToggle?.(res.birthdayAutomationEnabled);
  };

  const handleRunBirthdayPushNow = async (force = false) => {
    const res = await apiRequest<{ sentCount: number; logs: NotificationLog[] }>(
      '/api/notifications/birthday-check',
      {
        method: 'POST',
        body: JSON.stringify({
          force,
          clientIds: todayBirthdayClients.length ? todayBirthdayClients.map((c) => c.id) : undefined,
        }),
      }
    );
    if (res.logs.length > 0) {
      onLogsAdded(res.logs);
      setBirthdayStatusMsg(`Отправлено поздравительных Push-уведомлений: ${res.sentCount}`);
    } else {
      setBirthdayStatusMsg(
        todayBirthdayClients.length > 0
          ? 'Именинники сегодня уже получили поздравительный Push в этом году (нажмите «Повторить Push», чтобы отправить повторно).'
          : 'На сегодня в Базе клиентов нет именинников.'
      );
    }
  };

  const selectTemplate = (tpl: NotificationTemplate) => {
    setSelectedTemplateId(tpl.id);
    setChannel(tpl.channel);
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const insertVariable = (varKey: string) => {
    setBody((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}${varKey}`);
  };

  const toggleClient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const previewText = useMemo(() => {
    const sampleClient = clients.find((c) => selectedClientIds.includes(c.id)) || clients[0];
    if (!sampleClient) return body;
    const nextBk = bookings.find((b) => b.clientId === sampleClient.id && b.status !== 'cancelled');
    const st = studios.find((s) => s.id === (nextBk?.studioId || sampleClient.studioId)) || studios[0];
    const activeSub = clientSubscriptions.find((s) => s.clientId === sampleClient.id && s.status === 'active');
    const cabinetUrl = `${window.location.origin}/?cabinet=client&clientId=${sampleClient.id}`;

    return body
      .replace(/\{\{client_name\}\}/g, sampleClient.name)
      .replace(/\{\{session_date\}\}/g, nextBk?.date || new Date().toISOString().slice(0, 10))
      .replace(/\{\{session_time\}\}/g, nextBk?.time || '12:00')
      .replace(/\{\{trainer_name\}\}/g, nextBk?.trainerName || 'Дмитрий Волков')
      .replace(/\{\{service_name\}\}/g, nextBk?.serviceName || 'Индивидуальная сессия ПравИло')
      .replace(/\{\{studio_address\}\}/g, st?.address || '')
      .replace(/\{\{amount\}\}/g, String(nextBk?.finalAmountRub || 4200))
      .replace(/\{\{remaining_sessions\}\}/g, String(activeSub?.remainingSessions ?? 0))
      .replace(/\{\{cabinet_link\}\}/g, cabinetUrl);
  }, [body, clients, selectedClientIds, bookings, studios, clientSubscriptions]);

  const handleSend = async () => {
    if (!selectedClientIds.length || !body.trim()) return;
    setSending(true);
    setSendFeedback('');
    try {
      const res = await apiRequest<{ sentCount: number; logs: NotificationLog[] }>(
        '/api/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            clientIds: selectedClientIds,
            channel,
            subject,
            message: body,
            templateId: selectedTemplateId,
          }),
        }
      );
      onLogsAdded(res.logs);
      setSendFeedback(`Отправлено уведомлений: ${res.sentCount} (канал: ${channel.toUpperCase()})`);
    } finally {
      setSending(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await apiRequest<NotificationTemplate>('/api/notifications/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: newTplName,
        channel,
        trigger: 'manual',
        subject,
        body,
      }),
    });
    onTemplateAdded(created);
    setSelectedTemplateId(created.id);
    setShowNewTpl(false);
    setNewTplName('');
  };

  // --- SAVE / TEST SETTINGS ---
  const saveMessagingConfig = async (partial?: Partial<MessagingSettings>) => {
    setCfgSaving(true);
    setCfgStatus(null);
    try {
      const updated = await apiRequest<MessagingSettings>('/api/messaging/settings', {
        method: 'PATCH',
        body: JSON.stringify(partial || cfg),
      });
      setCfg(updated);
      onMessagingSettingsUpdated(updated);
      setCfgStatus({ ok: true, text: 'Настройки каналов связи сохранены.' });
    } catch (err) {
      setCfgStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Ошибка сохранения настроек',
      });
    } finally {
      setCfgSaving(false);
    }
  };

  const testSmtpConnection = async () => {
    setCfgSaving(true);
    setCfgStatus(null);
    try {
      await apiRequest('/api/messaging/settings', {
        method: 'PATCH',
        body: JSON.stringify({ email: cfg.email }),
      });
      const res = await apiRequest<{ ok: boolean; message: string; settings: MessagingSettings }>(
        '/api/messaging/test-email',
        {
          method: 'POST',
          body: JSON.stringify({ toEmail: testEmailTo.trim() || undefined }),
        }
      );
      setCfg(res.settings);
      onMessagingSettingsUpdated(res.settings);
      setCfgStatus({ ok: true, text: res.message });
    } catch (err) {
      setCfgStatus({ ok: false, text: err instanceof Error ? err.message : 'Ошибка проверки SMTP' });
    } finally {
      setCfgSaving(false);
    }
  };

  const testTelegramBot = async () => {
    setCfgSaving(true);
    setCfgStatus(null);
    try {
      await apiRequest('/api/messaging/settings', {
        method: 'PATCH',
        body: JSON.stringify({ telegram: cfg.telegram }),
      });
      const res = await apiRequest<{ ok: boolean; message: string; settings: MessagingSettings }>(
        '/api/messaging/test-telegram',
        { method: 'POST' }
      );
      setCfg(res.settings);
      onMessagingSettingsUpdated(res.settings);
      setCfgStatus({ ok: true, text: res.message });
    } catch (err) {
      setCfgStatus({ ok: false, text: err instanceof Error ? err.message : 'Ошибка проверки Telegram' });
    } finally {
      setCfgSaving(false);
    }
  };

  const channelLabel = (ch: NotificationChannel | MessengerChannel) => {
    switch (ch) {
      case 'email':
        return 'Email';
      case 'telegram':
        return 'Telegram';
      case 'whatsapp':
        return 'WhatsApp';
      case 'push':
        return 'Web Push';
      case 'web_chat':
        return 'Кабинет PWA';
    }
  };

  // --- ONLINE LINK GENERATOR ---
  const generatedBookingQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('book', '1');
    if (linkStudioId) params.set('studio', linkStudioId);
    if (linkClientId) params.set('clientId', linkClientId);
    if (linkPromo) params.set('promo', linkPromo);
    return `?${params.toString()}`;
  }, [linkStudioId, linkClientId, linkPromo]);

  const fullBookingUrl = `${window.location.origin}/${generatedBookingQuery}`;
  const tgWebhookUrl = `${window.location.origin}/api/webhooks/telegram`;
  const waWebhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;

  return (
    <div className="space-y-5">
      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl st-surface-muted border st-border">
          <button
            type="button"
            onClick={() => setSubTab('inbox')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              subTab === 'inbox' ? 'st-surface shadow-sm font-semibold' : 'st-muted hover:opacity-90'
            }`}
          >
            <Inbox className="w-3.5 h-3.5 st-accent-text" />
            <span>Диалоги (Мессенджеры)</span>
            {totalUnreadCount > 0 && (
              <span className="font-mono text-[11px] font-bold st-accent-text">· {totalUnreadCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('broadcast')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              subTab === 'broadcast' ? 'st-surface shadow-sm font-semibold' : 'st-muted hover:opacity-90'
            }`}
          >
            <Send className="w-3.5 h-3.5 st-accent-text" />
            <span>Рассылки и шаблоны</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              subTab === 'settings' ? 'st-surface shadow-sm font-semibold' : 'st-muted hover:opacity-90'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 st-accent-text" />
            <span>Настройка Email и ботов</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('online_links')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              subTab === 'online_links' ? 'st-surface shadow-sm font-semibold' : 'st-muted hover:opacity-90'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 st-accent-text" />
            <span>Онлайн-запись (ссылки)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono st-muted">
          <span>
            SMTP: {cfg.email.enabled ? 'вкл.' : 'ожидает'} · TG: {cfg.telegram.enabled ? 'вкл.' : 'ожидает'} · WA:{' '}
            {cfg.whatsapp.enabled ? 'вкл.' : 'ожидает'}
          </span>
        </div>
      </div>

      {/* ==================== TAB 1: MESSENGER INBOX ==================== */}
      {subTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Client Dialogs List */}
          <div className="lg:col-span-4 rounded-xl st-surface border st-border flex flex-col overflow-hidden">
            <div className="p-4 border-b st-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">Переписка с клиентами</h3>
                <span className="text-xs font-mono st-muted">{chatThreads.length}</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 st-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск клиента или телефона..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border st-border st-surface"
                />
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg st-surface-muted">
                {(
                  [
                    ['all', 'Все'],
                    ['telegram', 'Telegram'],
                    ['whatsapp', 'WhatsApp'],
                    ['web_chat', 'PWA'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChatChannelFilter(key)}
                    className={`flex-1 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                      chatChannelFilter === key ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y st-border max-h-[520px] overflow-y-auto">
              {chatThreads.map(({ client, lastMsg, unread }) => {
                const active = activeChatClient?.id === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectChatClient(client.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                      active ? 'st-accent-soft' : 'hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold truncate">{client.name}</span>
                      <span className="font-mono text-[11px] st-muted shrink-0">
                        {lastMsg ? channelLabel(lastMsg.channel) : 'Нет диалога'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-xs st-muted line-clamp-1">
                        {lastMsg ? lastMsg.text : `${client.telegram || client.phone}`}
                      </span>
                      {unread > 0 && (
                        <span className="font-mono text-[11px] font-bold st-accent-text shrink-0">
                          +{unread}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Active Chat Conversation */}
          <div className="lg:col-span-8 rounded-xl st-surface border st-border flex flex-col min-h-[540px]">
            {activeChatClient ? (
              <>
                <div className="p-4 border-b st-border flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-base font-bold">{activeChatClient.name}</div>
                    <div className="text-xs st-muted font-mono">
                      {activeChatClient.telegram || 'Telegram не указан'} · {activeChatClient.phone} ·{' '}
                      {activeChatClient.email}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setReplyText((prev) =>
                          `${prev}${prev ? ' ' : ''}${window.location.origin}/?book=1&studio=${activeChatClient.studioId}&clientId=${activeChatClient.id}`
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer"
                    >
                      + Ссылка онлайн-записи
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReplyText((prev) =>
                          `${prev}${prev ? ' ' : ''}${window.location.origin}/?cabinet=client&clientId=${activeChatClient.id}`
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer"
                    >
                      + Ссылка в кабинет
                    </button>
                  </div>
                </div>

                {/* Message History */}
                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[400px] st-surface-muted">
                  {activeThreadMessages.map((msg) => {
                    const isOut = msg.direction === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-xl px-4 py-2.5 text-xs space-y-1 border ${
                            isOut
                              ? 'st-accent-bg border-transparent'
                              : 'st-surface st-border'
                          }`}
                        >
                          <div className={`flex items-center justify-between gap-4 text-[11px] ${isOut ? 'text-white/80' : 'st-muted'}`}>
                            <span className="font-semibold">
                              {msg.senderName} · {channelLabel(msg.channel)}
                            </span>
                            <span className="font-mono">{msg.sentAt}</span>
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                          {msg.deliveryNote && (
                            <div className={`text-[10px] font-mono ${isOut ? 'text-white/75' : 'st-muted'}`}>
                              {msg.deliveryNote}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {activeThreadMessages.length === 0 && (
                    <div className="py-12 text-center text-xs st-muted">
                      Сообщений с этим клиентом пока нет. Отправьте первое сообщение или ссылку на запись ниже.
                    </div>
                  )}
                </div>

                {/* Reply Composer */}
                <form onSubmit={handleSendChatReply} className="p-4 border-t st-border space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-lg st-surface-muted">
                      {(
                        [
                          ['telegram', 'Telegram'],
                          ['whatsapp', 'WhatsApp'],
                          ['web_chat', 'Чат кабинета PWA'],
                        ] as const
                      ).map(([ch, label]) => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setReplyChannel(ch)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                            replyChannel === ch ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] st-muted">
                      Входящие из Telegram/WhatsApp Webhook и PWA-чата приходят сюда в реальном времени
                    </span>
                  </div>

                  {replyError && (
                    <div className="text-xs text-rose-600">{replyError}</div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Написать ${activeChatClient.name} в ${channelLabel(replyChannel)}...`}
                      className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border st-border st-surface"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingReply ? 'Отправка...' : 'Отправить'}</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-8 text-center text-xs st-muted">Выберите клиента слева для просмотра переписки.</div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: BROADCASTS & TEMPLATES ==================== */}
      {subTab === 'broadcast' && (
        <div className="space-y-6">
          {/* Automated Rules Strip + Birthday Auto-Push */}
          <div className="rounded-xl st-surface border st-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs font-medium">
                Автоматические триггеры рассылки и Push-напоминаний:
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRules.reminder24h}
                    onChange={(e) => setAutoRules((r) => ({ ...r, reminder24h: e.target.checked }))}
                  />
                  <span>За 24ч до сессии (Telegram/Email)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRules.reminder2h}
                    onChange={(e) => setAutoRules((r) => ({ ...r, reminder2h: e.target.checked }))}
                  />
                  <span>За 2ч до сессии (Push PWA)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRules.paymentReminder}
                    onChange={(e) => setAutoRules((r) => ({ ...r, paymentReminder: e.target.checked }))}
                  />
                  <span>Напоминание об оплате / продлении</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold st-accent-text">
                  <input
                    type="checkbox"
                    checked={birthdayAutomationEnabled}
                    onChange={(e) => handleToggleBirthdayAuto(e.target.checked)}
                  />
                  <span>Авто-поздравление с Днём рождения (Push)</span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t st-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Cake className="w-4 h-4 st-accent-text shrink-0" />
                <span>
                  Именинники сегодня ({todayMd.split('-').reverse().join('.')}):{' '}
                  <strong>
                    {todayBirthdayClients.length > 0
                      ? todayBirthdayClients.map((c) => c.name).join(', ')
                      : 'нет совпадений'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunBirthdayPushNow(false)}
                  className="px-3 py-1.5 rounded-lg border st-border font-medium cursor-pointer"
                >
                  Проверить сейчас
                </button>
                {todayBirthdayClients.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRunBirthdayPushNow(true)}
                    className="px-3 py-1.5 rounded-lg st-accent-bg font-medium cursor-pointer"
                  >
                    Повторить Push именинникам
                  </button>
                )}
              </div>
            </div>
            {birthdayStatusMsg && (
              <div className="text-xs st-accent-text font-medium">{birthdayStatusMsg}</div>
            )}
          </div>

          {/* Main Split: Templates + Composer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-xl st-surface border st-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">Шаблоны рассылок</h3>
                  <button
                    type="button"
                    onClick={() => setShowNewTpl(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium st-accent-text hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Сохранить как шаблон</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => selectTemplate(tpl)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedTemplateId === tpl.id
                          ? 'st-accent-soft border-current'
                          : 'st-border hover:opacity-85'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{tpl.name}</span>
                        <span className="font-mono st-accent-text">{channelLabel(tpl.channel)}</span>
                      </div>
                      <div className="text-xs st-muted mt-1 line-clamp-1">{tpl.body}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipients */}
              <div className="rounded-xl st-surface border st-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">
                    Получатели ({selectedClientIds.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedClientIds(
                        selectedClientIds.length === clients.length ? [] : clients.map((c) => c.id)
                      )
                    }
                    className="text-xs st-accent-text hover:underline cursor-pointer"
                  >
                    {selectedClientIds.length === clients.length ? 'Снять все' : 'Выбрать всех'}
                  </button>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {clients.map((cl) => (
                    <label
                      key={cl.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:opacity-90 cursor-pointer text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(cl.id)}
                          onChange={() => toggleClient(cl.id)}
                        />
                        <span className="font-medium">{cl.name}</span>
                      </span>
                      <span className="st-muted font-mono truncate max-w-[140px]">
                        {channel === 'email' ? cl.email : cl.telegram || cl.phone}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl st-surface border st-border p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-base font-bold">Конструктор сообщения с автоподстановкой</h3>
                <div className="flex items-center gap-1 p-1 st-surface-muted rounded-lg">
                  {(
                    [
                      ['telegram', 'Telegram', MessageCircle],
                      ['whatsapp', 'WhatsApp', MessageCircle],
                      ['email', 'Email', Mail],
                      ['push', 'Push PWA', BellRing],
                    ] as const
                  ).map(([ch, label, Icon]) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        channel === ch ? 'st-surface shadow-sm font-semibold' : 'st-muted'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium st-muted mb-1">Тема сообщения</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                />
              </div>

              <div>
                <div className="text-xs st-muted mb-1.5 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 st-accent-text" />
                  <span>Быстрая вставка данных и ссылки в личный кабинет:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="px-2.5 py-1 rounded-md border st-border st-surface-muted text-[11px] font-medium cursor-pointer"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium st-muted mb-1">Шаблон текста</label>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                />
              </div>

              <div className="p-4 rounded-lg st-surface-muted border st-border space-y-1.5">
                <div className="text-[11px] font-mono st-muted">
                  Предпросмотр для первого выбранного клиента
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{previewText}</div>
              </div>

              {sendFeedback && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                  {sendFeedback}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={sending || !selectedClientIds.length}
                  onClick={handleSend}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg st-accent-bg text-xs font-medium disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sending ? 'Отправка...' : `Отправить (${selectedClientIds.length})`}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Log */}
          <div className="rounded-xl st-surface border st-border overflow-hidden">
            <div className="px-5 py-4 border-b st-border">
              <h3 className="font-display text-base font-bold">Журнал отправленных уведомлений</h3>
            </div>
            <div className="divide-y st-border max-h-72 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {channelLabel(log.channel)} → {log.recipientName} ({log.recipientContact})
                    </div>
                    <div className="st-muted line-clamp-1">{log.messagePreview}</div>
                  </div>
                  <div className="text-right font-mono st-muted whitespace-nowrap">
                    <div className="st-secondary-text">Доставлено</div>
                    <div>{log.sentAt}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: EMAIL & MESSENGER CONFIGURATION ==================== */}
      {subTab === 'settings' && (
        <div className="space-y-6">
          {cfgStatus && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                cfgStatus.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}
            >
              {cfgStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{cfgStatus.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email SMTP Setup */}
            <div className="rounded-xl st-surface border st-border p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 st-accent-text" />
                  <h3 className="font-display text-base font-bold">Настройка E-mail рассылок (SMTP)</h3>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.email.enabled}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, enabled: e.target.checked } }))
                    }
                  />
                  <span>Включить SMTP</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SMTP_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setCfg((prev) => ({
                        ...prev,
                        email: { ...prev.email, host: p.host, port: p.port, secure: p.secure },
                      }))
                    }
                    className="px-2.5 py-1 rounded-md border st-border st-surface-muted text-[11px] font-medium cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs st-muted mb-1">SMTP-сервер</label>
                  <input
                    type="text"
                    value={cfg.email.host}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, host: e.target.value } }))
                    }
                    placeholder="smtp.yandex.ru"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs st-muted mb-1">Порт</label>
                  <input
                    type="number"
                    value={cfg.email.port}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, port: Number(e.target.value) } }))
                    }
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs st-muted mb-1">Логин SMTP (почта)</label>
                  <input
                    type="text"
                    value={cfg.email.user}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, user: e.target.value } }))
                    }
                    placeholder="studio@yandex.ru"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs st-muted mb-1">Пароль приложения</label>
                  <input
                    type="password"
                    value={cfg.email.password || ''}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, password: e.target.value } }))
                    }
                    placeholder="Пароль приложения SMTP"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs st-muted mb-1">Имя отправителя</label>
                  <input
                    type="text"
                    value={cfg.email.fromName}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, fromName: e.target.value } }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs st-muted mb-1">Email отправителя</label>
                  <input
                    type="email"
                    value={cfg.email.fromEmail}
                    onChange={(e) =>
                      setCfg((prev) => ({ ...prev, email: { ...prev.email, fromEmail: e.target.value } }))
                    }
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.email.secure}
                  onChange={(e) =>
                    setCfg((prev) => ({ ...prev, email: { ...prev.email, secure: e.target.checked } }))
                  }
                />
                <span>Использовать защищённое SSL/TLS соединение (порт 465)</span>
              </label>

              <div className="p-3 rounded-lg st-surface-muted border st-border text-[11px] space-y-1">
                <div className="font-semibold">Как настроить за 2 минуты:</div>
                <div>1. Выберите провайдера выше (Яндекс, Mail.ru или Gmail).</div>
                <div>2. Создайте «Пароль приложения» в настройках безопасности почтового ящика.</div>
                <div>3. Включите тумблер SMTP, сохраните и отправьте тестовое письмо ниже.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="Email для тестовой отправки (необязательно)"
                  className="flex-1 min-w-[180px] px-3 py-2 text-xs rounded-lg border st-border st-surface"
                />
                <button
                  type="button"
                  disabled={cfgSaving}
                  onClick={testSmtpConnection}
                  className="px-3.5 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
                >
                  Проверить SMTP
                </button>
                <button
                  type="button"
                  disabled={cfgSaving}
                  onClick={() => saveMessagingConfig({ email: cfg.email })}
                  className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                >
                  Сохранить Email
                </button>
              </div>
              {cfg.email.lastVerifiedAt && (
                <div className="text-[11px] font-mono st-secondary-text">
                  Проверено: {cfg.email.lastVerifiedAt}
                </div>
              )}
            </div>

            {/* Telegram + WhatsApp Messengers Setup */}
            <div className="space-y-5">
              {/* Telegram Bot */}
              <div className="rounded-xl st-surface border st-border p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 st-accent-text" />
                    <h3 className="font-display text-base font-bold">Подключение Telegram-бота</h3>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.telegram.enabled}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          telegram: { ...prev.telegram, enabled: e.target.checked },
                        }))
                      }
                    />
                    <span>Включить Telegram</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs st-muted mb-1">Bot Token (@BotFather)</label>
                    <input
                      type="password"
                      value={cfg.telegram.botToken || ''}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          telegram: { ...prev.telegram, botToken: e.target.value },
                        }))
                      }
                      placeholder="123456:ABC-DEF..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">Имя бота</label>
                    <input
                      type="text"
                      value={cfg.telegram.botUsername}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          telegram: { ...prev.telegram, botUsername: e.target.value },
                        }))
                      }
                      placeholder="@etalon_pravilo_bot"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs st-muted mb-1">
                    Webhook URL для входящих сообщений (попадают в «Диалоги»)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={tgWebhookUrl}
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface-muted"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('tg_hook', tgWebhookUrl)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border st-border text-xs cursor-pointer"
                    >
                      {copiedKey === 'tg_hook' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Копия</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg st-surface-muted border st-border text-[11px] space-y-1">
                  <div className="font-semibold">Как настроить Telegram:</div>
                  <div>1. Создайте бота в @BotFather (`/newbot`) и вставьте Token выше.</div>
                  <div>2. Нажмите «Проверить токен», затем установите Webhook на адрес выше — ответы клиентов сразу появятся во вкладке «Диалоги (Мессенджеры)».</div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={cfgSaving}
                    onClick={testTelegramBot}
                    className="px-3.5 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
                  >
                    Проверить токен (getMe)
                  </button>
                  <button
                    type="button"
                    disabled={cfgSaving}
                    onClick={() => saveMessagingConfig({ telegram: cfg.telegram })}
                    className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Сохранить Telegram
                  </button>
                </div>
                {cfg.telegram.lastVerifiedAt && (
                  <div className="text-[11px] font-mono st-secondary-text">
                    Бот проверен: {cfg.telegram.lastVerifiedAt}
                  </div>
                )}
              </div>

              {/* WhatsApp Setup */}
              <div className="rounded-xl st-surface border st-border p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 st-secondary-text" />
                    <h3 className="font-display text-base font-bold">WhatsApp Business / Шлюз</h3>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.whatsapp.enabled}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          whatsapp: { ...prev.whatsapp, enabled: e.target.checked },
                        }))
                      }
                    />
                    <span>Включить WhatsApp</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs st-muted mb-1">Провайдер интеграции</label>
                    <select
                      value={cfg.whatsapp.provider}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          whatsapp: {
                            ...prev.whatsapp,
                            provider: e.target.value as MessagingSettings['whatsapp']['provider'],
                          },
                        }))
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                    >
                      <option value="cloud_api">WhatsApp Cloud API (Meta)</option>
                      <option value="green_api">Green-API / Wazzup</option>
                      <option value="custom_webhook">Свой REST-шлюз (Webhook)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">Phone Number ID / Instance ID</label>
                    <input
                      type="text"
                      value={cfg.whatsapp.phoneNumberId}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          whatsapp: { ...prev.whatsapp, phoneNumberId: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">API Token / Secret</label>
                    <input
                      type="password"
                      value={cfg.whatsapp.accessToken || ''}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          whatsapp: { ...prev.whatsapp, accessToken: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-xs st-muted mb-1">URL исходящего шлюза (опц.)</label>
                    <input
                      type="url"
                      value={cfg.whatsapp.webhookUrl}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          whatsapp: { ...prev.whatsapp, webhookUrl: e.target.value },
                        }))
                      }
                      placeholder="https://api.green-api.com/..."
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs st-muted mb-1">
                    Входящий Webhook для ответов клиентов WhatsApp
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={waWebhookUrl}
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface-muted"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('wa_hook', waWebhookUrl)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border st-border text-xs cursor-pointer"
                    >
                      {copiedKey === 'wa_hook' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Копия</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={cfgSaving}
                    onClick={() => saveMessagingConfig({ whatsapp: cfg.whatsapp })}
                    className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                  >
                    Сохранить WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: ONLINE BOOKING LINKS & FLOW ==================== */}
      {subTab === 'online_links' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Link Generator */}
          <div className="lg:col-span-7 rounded-xl st-surface border st-border p-5 space-y-4">
            <h3 className="font-display text-lg font-bold">
              Генератор онлайн-ссылок для записи клиентов
            </h3>
            <p className="text-xs st-muted leading-relaxed">
              Эту ссылку можно разместить на сайте, в Instagram/VK, в кнопке Telegram-бота или отправить лично клиенту в переписке. Авторизация по паролю клиенту не требуется — заявка мгновенно попадёт к администратору.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs st-muted mb-1">Студия (филиал)</label>
                <select
                  value={linkStudioId}
                  onChange={(e) => setLinkStudioId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs st-muted mb-1">Персонально для клиента</label>
                <select
                  value={linkClientId}
                  onChange={(e) => setLinkClientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  <option value="">Публичная ссылка (любой клиент)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs st-muted mb-1">Промокод в ссылке</label>
                <select
                  value={linkPromo}
                  onChange={(e) => setLinkPromo(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  <option value="">Без промокода</option>
                  {promos.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} (−{p.discountPercent}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-xl st-surface-muted border st-border space-y-2">
              <div className="text-[11px] font-mono st-muted">Готовая ссылка для онлайн-записи:</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fullBookingUrl}
                  className="flex-1 min-w-[220px] px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                />
                <button
                  type="button"
                  onClick={() => copyText('booking_url', fullBookingUrl)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer"
                >
                  {copiedKey === 'booking_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'booking_url' ? 'Скопировано' : 'Копировать'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPublicBookingPreview(generatedBookingQuery)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Открыть форму как клиент</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Two Booking Scenarios Explained */}
          <div className="lg:col-span-5 rounded-xl st-surface border st-border p-5 space-y-4">
            <h3 className="font-display text-lg font-bold">Два способа записи клиента</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg st-surface-muted border st-border space-y-1.5">
                <div className="font-semibold st-accent-text">
                  1. По прямой онлайн-ссылке (`?book=1`)
                </div>
                <p className="st-muted leading-relaxed">
                  Клиент переходит по ссылке из Telegram/WhatsApp/сайта без ввода пароля, выбирает студию, тренера, слот (строго внутри ваших часов приёма) и подтверждает телефон. Заявка сразу появляется в «Расписание и записи» и в «Диалогах».
                </p>
              </div>

              <div className="p-3.5 rounded-lg st-surface-muted border st-border space-y-1.5">
                <div className="font-semibold st-secondary-text">
                  2. Через клиентское приложение (PWA)
                </div>
                <p className="st-muted leading-relaxed">
                  Клиент открывает установленное на смартфон PWA-приложение, видит остаток абонемента, историю роста и тяги, нажимает «Записаться на сессию», выбирает время, общается с администратором во встроенном чате и получает Push-напоминания за 2 часа и в День рождения.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save Template */}
      {showNewTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveTemplate}
            className="w-full max-w-md rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold">Сохранить новый шаблон</h3>
            <input
              type="text"
              required
              placeholder="Название шаблона"
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTpl(false)}
                className="px-4 py-2 text-xs rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg st-accent-bg font-medium cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
