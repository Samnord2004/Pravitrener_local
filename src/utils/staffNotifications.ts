import type { Booking, UserAccount, UserRole } from '../types';

export type StaffPushPermissionState =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

const PROMPT_DISMISSED_KEY_PREFIX = 'atlant_staff_push_prompted_v1_';
const recentNotifiedTags = new Map<string, number>();

export function isStaffRole(role: UserRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'trainer';
}

export function getNotificationPermissionState(): StaffPushPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export function hasDismissedStaffPushPrompt(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return true;
  try {
    return localStorage.getItem(`${PROMPT_DISMISSED_KEY_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function markStaffPushPromptDismissed(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${PROMPT_DISMISSED_KEY_PREFIX}${userId}`, '1');
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function shouldShowFirstLoginPushPrompt(user: UserAccount | null): boolean {
  if (!user || !isStaffRole(user.role)) return false;
  if (getNotificationPermissionState() !== 'default') return false;
  return !hasDismissedStaffPushPrompt(user.id);
}

export function isBookingRelevantForStaff(
  user: UserAccount,
  booking: Booking
): boolean {
  if (user.role === 'owner') return true;
  if (user.role === 'admin') {
    return !user.studioId || booking.studioId === user.studioId;
  }
  if (user.role === 'trainer') {
    return booking.trainerId === user.id;
  }
  return false;
}

export function formatNewBookingAlert(
  booking: Booking,
  studioName?: string
): { title: string; body: string } {
  const studioPart = studioName ? ` · ${studioName}` : '';
  const title = `Новое бронирование${studioPart}`;
  const body = `${booking.clientName} — ${booking.date} в ${booking.time} · ${booking.serviceName} (тренер: ${booking.trainerName}, ${booking.finalAmountRub} ₽)`;
  return { title, body };
}

export async function showStaffSystemNotification(params: {
  title: string;
  body: string;
  tag?: string;
  bookingId?: string;
  url?: string;
  onFocusClick?: () => void;
}): Promise<boolean> {
  if (getNotificationPermissionState() !== 'granted') return false;

  const tag = params.tag || `etalon-${Date.now()}`;
  const now = Date.now();
  const prevTs = recentNotifiedTags.get(tag);
  if (prevTs && now - prevTs < 8000) {
    return false;
  }
  recentNotifiedTags.set(tag, now);
  if (recentNotifiedTags.size > 60) {
    const cutoff = now - 30_000;
    for (const [k, ts] of recentNotifiedTags.entries()) {
      if (ts < cutoff) recentNotifiedTags.delete(k);
    }
  }

  const options: NotificationOptions = {
    body: params.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    data: {
      url: params.url || '/',
      bookingId: params.bookingId || null,
    },
  };

  // Prefer active ServiceWorkerRegistration.showNotification so alerts display reliably
  // even when the browser tab is minimized or in background.
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 600)
      );
      const reg = await Promise.race([regPromise, timeoutPromise]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(params.title, options);
        return true;
      }
    } catch {
      // Fall back to direct Notification constructor
    }
  }

  try {
    const n = new Notification(params.title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore
      }
      params.onFocusClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function requestStaffPushPermission(
  userId: string
): Promise<StaffPushPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    markStaffPushPromptDismissed(userId);
    if (result === 'granted') {
      await showStaffSystemNotification({
        title: 'Push-уведомления включены · ЭТАЛОН ПРАВИЛО',
        body: 'Вы будете мгновенно получать оповещения о новых бронированиях, даже когда вкладка браузера свернута.',
        tag: `welcome-push-${userId}`,
      });
    }
    return result;
  } catch {
    return getNotificationPermissionState();
  }
}
