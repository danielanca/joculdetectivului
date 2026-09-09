import { isBrowser } from "./functions";
import { getSessionId, getVisitorId } from "./visitorSession";

type Priority = "low" | "normal" | "high" | "critical";

interface LiveEventExtra {
  page?: string;
  label?: string;
  priority?: Priority;
  meta?: Record<string, unknown>;
}

/** Fire a semantic event into the live-visitor stream from anywhere in the app. */
export function sendLiveEvent(event: string, extra: LiveEventExtra = {}): void {
  if (!isBrowser()) return;
  try {
    const { visitorId } = getVisitorId();
    fetch("/api/analytics/live/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        sessionId: getSessionId(),
        visitorId,
        event,
        page: extra.page ?? window.location.pathname,
        pageTitle: document.title,
        label: extra.label,
        priority: extra.priority,
        meta: extra.meta,
      }),
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

/** Someone checked whether a date is free — the owner gets an email with the date. */
export function reportAvailabilityCheck(
  humanDate: string,
  dateKey: string,
  available: boolean,
  eventType?: string,
): void {
  sendLiveEvent("availability_checked", {
    priority: "high",
    label: humanDate,
    meta: { date: humanDate, dateKey, available, ...(eventType ? { eventType } : {}) },
  });
}
