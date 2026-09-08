import { getCookie, setCookie } from "./functions";

const SESSION_KEY = "av_sid";
const VISITOR_COOKIE = "av_vid";
const VISITOR_COOKIE_DAYS = 365;

/** Stable id for the current tab/session (sessionStorage — cleared when the tab closes). */
export function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Long-lived visitor id (cookie), plus whether this is the first time we've seen them. */
export function getVisitorId(): { visitorId: string; isNew: boolean } {
  const existing = getCookie(VISITOR_COOKIE);
  if (existing) return { visitorId: existing, isNew: false };
  const visitorId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  setCookie(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_DAYS);
  return { visitorId, isNew: true };
}

/** Cheap client-side heuristic to skip obvious automation. */
export function looksLikeBot(): boolean {
  try {
    sessionStorage.setItem("__av_test", "1");
    sessionStorage.removeItem("__av_test");
    if (window.screen.width === 0 || window.screen.height === 0) return true;
    if (navigator.webdriver) return true;
    return false;
  } catch {
    return true;
  }
}
