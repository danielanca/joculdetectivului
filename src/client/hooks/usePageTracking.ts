import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getCookie, isBrowser } from "../utils/functions";
import { getSessionId, getVisitorId, looksLikeBot } from "../utils/visitorSession";

const SKIP_PREFIXES = ["/admin", "/login", "/revin"];
const ADMIN_COOKIE = "av_admin";

const HEARTBEAT_MS = 5_000;   // check every 5s
const IDLE_TIMEOUT_MS = 30_000; // no interaction for 30s = idle
const ATTRIBUTION_KEY = "av_utm_attribution";

const AI_SOURCE_HOSTS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "perplexity.ai": "Perplexity",
  "grok.com": "Grok",
};

function getAttribution(): { source?: string; medium?: string; campaign?: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const rawSource = params.get("utm_source")?.trim();
    const source = rawSource
      ? (AI_SOURCE_HOSTS[rawSource.toLowerCase()] ?? rawSource)
      : (() => {
          try {
            const host = new URL(document.referrer).hostname.replace(/^www\./, "").toLowerCase();
            return AI_SOURCE_HOSTS[host];
          } catch { return undefined; }
        })();
    const existing = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (source) {
      const attribution = { source, medium: params.get("utm_medium") || "referral", campaign: params.get("utm_campaign") || undefined };
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
      return attribution;
    }
    return existing ? JSON.parse(existing) as { source?: string; medium?: string; campaign?: string } : {};
  } catch { return {}; }
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

function sendEngagementBeacon(id: string, timeSpent: number, scrollDepth: number) {
  const payload = JSON.stringify({ id, timeSpent, scrollDepth });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/engagement", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/analytics/engagement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

export function usePageTracking() {
  const location = useLocation();
  const prevPage = useRef<string>("");

  const docId = useRef<string>("");
  const activeSeconds = useRef<number>(0);  // only counts genuine reading time
  const maxScrollPct = useRef<number>(0);
  const lastActivityAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!isBrowser()) return;
    if (getCookie(ADMIN_COOKIE) === "1") return;
    if (looksLikeBot()) return;

    const page = location.pathname;
    if (SKIP_PREFIXES.some((p) => page.startsWith(p))) return;

    const referrer = prevPage.current || document.referrer;
    prevPage.current = page;

    // Reset for this page
    docId.current = "";
    activeSeconds.current = 0;
    maxScrollPct.current = 0;
    lastActivityAt.current = Date.now(); // treat page arrival as activity

    const sessionId = getSessionId();
    const { visitorId, isNew } = getVisitorId();
    const params = new URLSearchParams(window.location.search);
    const attribution = getAttribution();

    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        referrer,
        sessionId,
        visitorId,
        isNew,
        utmSource: attribution.source || params.get("utm_source") || undefined,
        utmMedium: attribution.medium || params.get("utm_medium") || undefined,
        utmCampaign: attribution.campaign || params.get("utm_campaign") || undefined,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { ok: boolean; id?: string } | null) => {
        if (data?.id) docId.current = data.id;
      })
      .catch(() => {});

    // ── Activity tracking ─────────────────────────────────────────
    // Any interaction resets the idle clock
    const onActivity = () => { lastActivityAt.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    // ── Scroll depth ──────────────────────────────────────────────
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total > 0) {
        maxScrollPct.current = Math.max(
          maxScrollPct.current,
          Math.round((scrolled / total) * 100),
        );
      }
    };
    // scroll is already in ACTIVITY_EVENTS, so we just piggyback on it
    window.addEventListener("scroll", onScroll, { passive: true });

    // ── Heartbeat ─────────────────────────────────────────────────
    // Every 5s: only accumulate time if tab is visible AND user was active recently
    const interval = setInterval(() => {
      const isVisible = document.visibilityState === "visible";
      const isActive = Date.now() - lastActivityAt.current < IDLE_TIMEOUT_MS;

      if (isVisible && isActive) {
        activeSeconds.current += HEARTBEAT_MS / 1000;
      }

      if (docId.current) {
        fetch("/api/analytics/engagement", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: docId.current,
            timeSpent: activeSeconds.current,
            scrollDepth: maxScrollPct.current,
          }),
        }).catch(() => {});
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));

      // Final send when navigating away (SPA route change)
      if (docId.current) {
        sendEngagementBeacon(docId.current, activeSeconds.current, maxScrollPct.current);
      }
    };
  }, [location.pathname]);
}
