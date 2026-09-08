import { EventEmitter } from "events";
import { firestore } from "../firestore.js";
import { FieldValue } from "firebase-admin/firestore";

// ── Types ────────────────────────────────────────────────────────────────────

export type EventPriority = "low" | "normal" | "high" | "critical";

export interface LiveEvent {
  id: string;
  name: string;
  at: number;
  page: string;
  label?: string;
  priority: EventPriority;
  meta?: Record<string, unknown>;
}

export interface LiveAttribution {
  gclid?: string;
  gadSource?: string;
  wbraid?: string;
  gbraid?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPath?: string;
}

export interface LiveSession {
  sessionId: string;
  visitorId: string;
  isNew: boolean;
  visitorNumber: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastEventAt: number;
  endedAt: number | null;
  endReason: string | null;
  endDurationSeconds: number | null;
  currentPage: string;
  currentPageTitle: string;
  pageCount: number;
  path: { page: string; at: number }[];
  events: LiveEvent[];
  scrollByPage: Record<string, number>;
  attribution: LiveAttribution;
  isGoogleAds: boolean;
  source: "google_ads" | "organic" | "ai" | "direct" | "referral";
  ip: string;
  city: string;
  region: string;
  country: string;
  org: string;
  ua: string;
  deviceType: "mobile" | "tablet" | "desktop";
  idle: boolean;
  geoResolved: boolean;
}

export interface RecordEventInput {
  sessionId: string;
  visitorId?: string;
  isNew?: boolean;
  event: string;
  page?: string;
  pageTitle?: string;
  label?: string;
  priority?: EventPriority;
  meta?: Record<string, unknown>;
  landingMeta?: LiveAttribution & { isGoogleAds?: boolean };
  scrollDepth?: number;
}

export interface SessionContext {
  ip: string;
  ua: string;
  geo?: { city?: string; region?: string; country?: string; org?: string } | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EVENTS_CAP = 200;
const PATH_CAP = 60;
const HEARTBEAT_TIMEOUT_MS = 75_000; // tolerate background-tab timer throttling
const IDLE_AFTER_MS = 60_000;
const KEEP_ENDED_MS = 10 * 60_000;
const PERSIST_DEBOUNCE_MS = 5_000;
const SWEEP_INTERVAL_MS = 5_000;
const LIVE_SESSIONS_COLLECTION = "live_sessions";

const AI_HOSTS: Record<string, string> = {
  "chatgpt.com": "ai", "chat.openai.com": "ai", "claude.ai": "ai",
  "gemini.google.com": "ai", "perplexity.ai": "ai", "grok.com": "ai", "copilot.microsoft.com": "ai",
};
const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|ecosia|startpage)\./i;

// ── Store ────────────────────────────────────────────────────────────────────

const sessions = new Map<string, LiveSession>();
export const liveVisitorsEmitter = new EventEmitter();
liveVisitorsEmitter.setMaxListeners(50);

let visitorCounter = 0;
const persistTimers = new Map<string, NodeJS.Timeout>();

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function deviceFromUa(ua: string): LiveSession["deviceType"] {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|android.*mobile|phone/.test(s)) return "mobile";
  return "desktop";
}

function classifySource(attr: LiveAttribution, isGoogleAds: boolean): LiveSession["source"] {
  if (isGoogleAds) return "google_ads";
  const ref = attr.referrer ?? "";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
    if (AI_HOSTS[host]) return "ai";
    if (SEARCH_HOSTS.test(host)) return "organic";
    if (host && !host.includes("ancavisuals.ro")) return "referral";
  } catch { /* no / invalid referrer */ }
  const src = (attr.utmSource ?? "").toLowerCase();
  if (AI_HOSTS[src] || ["chatgpt", "claude", "gemini", "perplexity", "grok"].includes(src)) return "ai";
  if (src === "google" || src === "bing") return "organic";
  return "direct";
}

function computeIsGoogleAds(attr: LiveAttribution, hint?: boolean): boolean {
  if (hint) return true;
  if (attr.gclid || attr.wbraid || attr.gbraid) return true;
  const src = (attr.utmSource ?? "").toLowerCase();
  const med = (attr.utmMedium ?? "").toLowerCase();
  return (src === "google" || src === "adwords") && ["cpc", "ppc", "paid", "paidsearch", "sem"].includes(med);
}

function createSession(input: RecordEventInput, ctx: SessionContext): LiveSession {
  visitorCounter += 1;
  const attr: LiveAttribution = { ...(input.landingMeta ?? {}) };
  const isGoogleAds = computeIsGoogleAds(attr, input.landingMeta?.isGoogleAds);
  const now = Date.now();
  const page = input.page ?? "/";
  const session: LiveSession = {
    sessionId: input.sessionId,
    visitorId: input.visitorId ?? "",
    isNew: input.isNew ?? true,
    visitorNumber: visitorCounter,
    firstSeenAt: now,
    lastSeenAt: now,
    lastEventAt: now,
    endedAt: null,
    endReason: null,
    endDurationSeconds: null,
    currentPage: page,
    currentPageTitle: input.pageTitle ?? "",
    pageCount: 1,
    path: [{ page, at: now }],
    events: [],
    scrollByPage: {},
    attribution: attr,
    isGoogleAds,
    source: classifySource(attr, isGoogleAds),
    ip: ctx.ip,
    city: ctx.geo?.city ?? "",
    region: ctx.geo?.region ?? "",
    country: ctx.geo?.country ?? "",
    org: ctx.geo?.org ?? "",
    ua: ctx.ua,
    deviceType: deviceFromUa(ctx.ua),
    idle: false,
    geoResolved: Boolean(ctx.geo),
  };
  sessions.set(session.sessionId, session);
  return session;
}

/** Whether geo still needs resolving for this session (avoids repeat ipinfo calls). */
export function sessionNeedsGeo(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  return !s || !s.geoResolved;
}

export function recordEvent(input: RecordEventInput, ctx: SessionContext): { session: LiveSession; event: LiveEvent } {
  let session = sessions.get(input.sessionId);
  const now = Date.now();

  if (!session) {
    session = createSession(input, ctx);
    liveVisitorsEmitter.emit("update", { type: "session_started", sessionId: session.sessionId, session: serializeSession(session) });
  } else {
    if (ctx.geo && !session.geoResolved) {
      session.city = ctx.geo.city ?? session.city;
      session.region = ctx.geo.region ?? session.region;
      session.country = ctx.geo.country ?? session.country;
      session.org = ctx.geo.org ?? session.org;
      session.geoResolved = true;
    }
    if (session.endedAt) {
      // A ping/event arrived after we timed the session out — revive it.
      session.endedAt = null;
      session.endReason = null;
    }
  }

  session.lastSeenAt = now;
  session.lastEventAt = now;
  session.idle = false;

  const page = input.page ?? session.currentPage;
  if (input.event === "page_view" && page !== session.currentPage) {
    session.currentPage = page;
    session.currentPageTitle = input.pageTitle ?? "";
    session.pageCount += 1;
    session.path.push({ page, at: now });
    if (session.path.length > PATH_CAP) session.path.splice(0, session.path.length - PATH_CAP);
  } else if (input.pageTitle) {
    session.currentPageTitle = input.pageTitle;
  }

  let meta = input.meta;
  if (typeof input.scrollDepth === "number") {
    const depth = Math.round(input.scrollDepth);
    session.scrollByPage[page] = Math.max(session.scrollByPage[page] ?? 0, depth);
    if (input.event === "scroll_depth") meta = { depth, ...(meta ?? {}) };
  }

  const event: LiveEvent = {
    id: newId(),
    name: input.event,
    at: now,
    page,
    label: input.label,
    priority: input.priority ?? "normal",
    meta,
  };
  session.events.push(event);
  if (session.events.length > EVENTS_CAP) session.events.splice(0, session.events.length - EVENTS_CAP);

  liveVisitorsEmitter.emit("update", {
    type: "event",
    sessionId: session.sessionId,
    session: serializeSession(session),
    event,
  });

  schedulePersist(session);
  return { session, event };
}

export function ping(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  const now = Date.now();
  session.lastSeenAt = now;
  if (session.endedAt) { session.endedAt = null; session.endReason = null; }
  if (session.idle) {
    session.idle = false;
    liveVisitorsEmitter.emit("update", { type: "idle_changed", sessionId, idle: false, session: serializeSession(session) });
  }
  liveVisitorsEmitter.emit("update", { type: "ping", sessionId, lastSeenAt: now });
}

export function endSession(sessionId: string, reason: string, durationSeconds?: number): void {
  const session = sessions.get(sessionId);
  if (!session || session.endedAt) return;
  const now = Date.now();
  session.endedAt = now;
  session.endReason = reason;
  const duration = typeof durationSeconds === "number" && durationSeconds >= 0
    ? Math.round(durationSeconds)
    : Math.round((now - session.firstSeenAt) / 1000);
  session.endDurationSeconds = duration;

  const event: LiveEvent = {
    id: newId(),
    name: "session_ended",
    at: now,
    page: session.currentPage,
    priority: "normal",
    meta: { reason, durationSeconds: duration, pageCount: session.pageCount },
  };
  session.events.push(event);

  liveVisitorsEmitter.emit("update", {
    type: "session_ended",
    sessionId,
    reason,
    durationSeconds: duration,
    session: serializeSession(session),
    event,
  });

  flushPersist(session);
}

// ── Serialization ────────────────────────────────────────────────────────────

export function serializeSession(s: LiveSession) {
  return {
    sessionId: s.sessionId,
    visitorId: s.visitorId,
    isNew: s.isNew,
    visitorNumber: s.visitorNumber,
    firstSeenAt: s.firstSeenAt,
    lastSeenAt: s.lastSeenAt,
    lastEventAt: s.lastEventAt,
    endedAt: s.endedAt,
    endReason: s.endReason,
    durationSeconds: s.endDurationSeconds ?? Math.round(((s.endedAt ?? Date.now()) - s.firstSeenAt) / 1000),
    currentPage: s.currentPage,
    currentPageTitle: s.currentPageTitle,
    pageCount: s.pageCount,
    path: s.path,
    events: s.events,
    scrollByPage: s.scrollByPage,
    attribution: s.attribution,
    isGoogleAds: s.isGoogleAds,
    source: s.source,
    city: s.city,
    region: s.region,
    country: s.country,
    org: s.org,
    deviceType: s.deviceType,
    idle: s.idle,
  };
}

export function getActiveSnapshot() {
  return Array.from(sessions.values())
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
    .map(serializeSession);
}

// ── Firestore persistence ────────────────────────────────────────────────────

async function writeSession(session: LiveSession): Promise<void> {
  try {
    await firestore()
      .collection(LIVE_SESSIONS_COLLECTION)
      .doc(session.sessionId)
      .set(
        {
          ...serializeSession(session),
          ip: session.ip,
          ua: session.ua,
          updatedAt: FieldValue.serverTimestamp(),
          startedAtMs: session.firstSeenAt,
        },
        { merge: true },
      );
  } catch (error) {
    console.warn(`[live-visitors] persist failed for ${session.sessionId}:`, error);
  }
}

function schedulePersist(session: LiveSession): void {
  if (persistTimers.has(session.sessionId)) return;
  const timer = setTimeout(() => {
    persistTimers.delete(session.sessionId);
    void writeSession(session);
  }, PERSIST_DEBOUNCE_MS);
  persistTimers.set(session.sessionId, timer);
}

function flushPersist(session: LiveSession): void {
  const timer = persistTimers.get(session.sessionId);
  if (timer) { clearTimeout(timer); persistTimers.delete(session.sessionId); }
  void writeSession(session);
}

// ── Sweeper ──────────────────────────────────────────────────────────────────

let sweeper: NodeJS.Timeout | null = null;

export function startLiveVisitorsSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (!session.endedAt && now - session.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        endSession(session.sessionId, "timeout");
        continue;
      }
      if (
        !session.endedAt &&
        !session.idle &&
        now - session.lastEventAt > IDLE_AFTER_MS
      ) {
        session.idle = true;
        const event: LiveEvent = {
          id: newId(),
          name: "visitor_idle",
          at: now,
          page: session.currentPage,
          priority: "low",
        };
        session.events.push(event);
        liveVisitorsEmitter.emit("update", {
          type: "event",
          sessionId: session.sessionId,
          session: serializeSession(session),
          event,
        });
      }
      if (session.endedAt && now - session.endedAt > KEEP_ENDED_MS) {
        sessions.delete(session.sessionId);
        const timer = persistTimers.get(session.sessionId);
        if (timer) { clearTimeout(timer); persistTimers.delete(session.sessionId); }
        liveVisitorsEmitter.emit("update", { type: "session_removed", sessionId: session.sessionId });
      }
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof sweeper.unref === "function") sweeper.unref();
}

// Test helper — reset in-memory state between tests.
export function __resetLiveVisitors(): void {
  sessions.clear();
  persistTimers.forEach((t) => clearTimeout(t));
  persistTimers.clear();
  visitorCounter = 0;
  liveVisitorsEmitter.removeAllListeners();
}
