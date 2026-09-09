import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getCookie, isBrowser } from "../utils/functions";
import { getSessionId, getVisitorId, looksLikeBot } from "../utils/visitorSession";
import { captureLandingMeta, getLandingMeta, isGoogleAdsSession } from "../utils/sessionAttribution";

const ADMIN_COOKIE = "av_admin";
const SKIP_PREFIXES = ["/admin", "/login", "/revin", "/wedding-hub", "/colaborator", "/backup"];
const FIRED_KEY = "av_live_fired";
const HEARTBEAT_MS = 10_000;
const SCROLL_MILESTONES = [25, 50, 75, 100];

type Priority = "low" | "normal" | "high" | "critical";

interface EventExtra {
  page?: string;
  pageTitle?: string;
  label?: string;
  priority?: Priority;
  meta?: Record<string, unknown>;
  scrollDepth?: number;
  landingMeta?: Record<string, unknown>;
}

// On localhost we want to be able to watch ourselves in /admin/live, so ignore
// the admin cookie there. In production the cookie still excludes the owner.
function isDevHost(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

function shouldSkipVisitor(pathname: string): boolean {
  if (!isDevHost() && getCookie(ADMIN_COOKIE) === "1") return true;
  if (looksLikeBot()) return true;
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

function firedOnceThisSession(name: string): boolean {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (set.has(name)) return true;
    set.add(name);
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
    return false;
  } catch {
    return false;
  }
}

function friendlyPageName(path: string): string {
  const p = path.replace(/\/+$/, "") || "/";
  const map: Record<string, string> = {
    "/": "Acasă",
    "/oferta": "Ofertă",
    "/pricing": "Prețuri",
    "/preturi": "Prețuri",
    "/portfolio": "Portofoliu",
    "/videos": "Video",
    "/contact": "Contact",
    "/about": "Despre",
    "/blog": "Blog",
    "/fotocabina": "Fotocabină",
    "/recenzii": "Recenzii",
  };
  if (map[p]) return map[p];
  if (p.startsWith("/oferta/")) return "Ofertă";
  if (p.startsWith("/blog/")) return "Articol blog";
  if (p.startsWith("/media/")) return "Galerie client";
  if (/^\/(fotograf|videograf|foto-video|foto|video)-/.test(p)) return "Pagină SEO local";
  return p;
}

type FormKind = "contact" | "delivery" | "subscribe" | "other";

/** Figure out what kind of form was interacted with — reading only field metadata, never values. */
function classifyForm(
  form: HTMLFormElement | null,
  path: string,
): { kind: FormKind; label: string; startedLabel: string; priority: Priority } {
  const fields = form ? Array.from(form.querySelectorAll("input, select, textarea")) : [];
  const attrText = (el: Element) =>
    `${el.getAttribute("name") ?? ""} ${el.getAttribute("placeholder") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.id} ${el.previousElementSibling?.textContent ?? ""}`.toLowerCase();
  const blob = form
    ? `${form.id} ${form.className} ${form.getAttribute("name") ?? ""} ${form.getAttribute("action") ?? ""}`.toLowerCase()
    : "";
  const hasAddress = fields.some((f) => /address|strad|street|jude[tț]|county|ora[sș]|city|localit|easybox|locker|cod po[sș]tal|postal/.test(attrText(f)));
  const hasTel = fields.some((f) => f.getAttribute("type") === "tel" || /phone|telefon|whatsapp|mobil/.test(attrText(f)));
  const hasEmail = fields.some((f) => f.getAttribute("type") === "email" || /e-?mail/.test(attrText(f)));

  if (hasAddress || /deliver|address|livrare|adres/.test(blob)) {
    return { kind: "delivery", label: "📦 A completat adresa de livrare — vrea albumul fizic", startedLabel: "Completează adresa de livrare", priority: "high" };
  }
  if (/subscribe|abon|newsletter|notific/.test(blob) || (hasEmail && !hasTel && fields.length <= 3 && !path.startsWith("/contact") && !path.startsWith("/oferta"))) {
    return { kind: "subscribe", label: "📧 S-a abonat — vrea să fie anunțat când sunt gata pozele", startedLabel: "Se abonează la album", priority: "high" };
  }
  if (path === "/contact" || path.startsWith("/oferta") || /contact|booking|rezerv|cerere|ofert/.test(blob) || (hasTel && !path.startsWith("/media"))) {
    return { kind: "contact", label: "🎯 Un client a trimis formularul de contact — vrea să-l suni", startedLabel: "A început formularul de contact", priority: "critical" };
  }
  return { kind: "other", label: "A trimis un formular", startedLabel: "A început un formular", priority: "normal" };
}

function isPricingPath(path: string): boolean {
  return /^\/(oferta|pricing|preturi)(\/|$)/.test(path);
}
function isGalleryPath(path: string): boolean {
  return /^\/(portfolio|videos|fotografii|galerie)(\/|$)/.test(path);
}

export function useLiveVisitor() {
  const location = useLocation();
  const sendRef = useRef<((event: string, extra?: EventExtra) => void) | null>(null);
  const scrollHitRef = useRef<Set<number>>(new Set());

  // ── Session-scoped listeners, heartbeat, session start & end ──────────────
  useEffect(() => {
    if (!isBrowser()) return;
    if (shouldSkipVisitor(location.pathname)) return;

    captureLandingMeta();
    const sessionId = getSessionId();
    const { visitorId, isNew } = getVisitorId();
    const startedAt = Date.now();

    const send = (event: string, extra: EventExtra = {}) => {
      try {
        fetch("/api/analytics/live/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            sessionId,
            visitorId,
            isNew,
            event,
            page: extra.page ?? window.location.pathname,
            pageTitle: extra.pageTitle ?? document.title,
            label: extra.label,
            priority: extra.priority,
            meta: extra.meta,
            scrollDepth: extra.scrollDepth,
            landingMeta: extra.landingMeta,
          }),
        }).catch(() => {});
      } catch {
        /* noop */
      }
    };
    // expose to the route effect below
    sendRef.current = send;

    if (!firedOnceThisSession("session_started")) {
      const meta = getLandingMeta();
      send("session_started", {
        landingMeta: meta ? { ...meta, isGoogleAds: isGoogleAdsSession(meta) } : undefined,
      });
    }

    // Heartbeat
    const hb = window.setInterval(() => {
      fetch("/api/analytics/live/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }, HEARTBEAT_MS);

    // ── Delegated click detection — every button / link becomes an event ────
    const clickDedup = new Map<string, number>();
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "a,button,[role=button],input[type=submit],input[type=button]",
      ) as HTMLElement | null;
      if (!el) return;

      // The availability "Verifică" button reports its own richer event (with the date).
      if (el.classList.contains("verify-btn")) return;

      const href = (el.getAttribute("href") ?? "").toLowerCase();
      const rawLabel =
        (el.textContent ?? "").replace(/\s+/g, " ").trim() ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el as HTMLInputElement).value ||
        (el.tagName === "A" ? "link" : "buton");
      const label = rawLabel.slice(0, 90);
      const lower = label.toLowerCase();

      let name = "element_clicked";
      let priority: Priority = "normal";
      if (/wa\.me|wa\.link|whatsapp\.com|api\.whatsapp/.test(href)) {
        name = "whatsapp_clicked"; priority = "critical";
      } else if (href.startsWith("tel:")) {
        name = "phone_revealed"; priority = "critical";
      } else if (/\/contact(\/|$|\?)/.test(href) || el.dataset.cta === "contact") {
        name = "contact_clicked"; priority = "critical";
      } else if (
        el.classList.contains("pg-load-more-btn") ||
        ["mai multe poze", "load more", "vezi mai multe", "mai multe"].includes(lower)
      ) {
        name = "gallery_load_more";
      }

      // collapse repeated identical clicks (double-tap, re-render) within 1.5s
      const key = `${name}|${label}|${href}`;
      const now = Date.now();
      if (clickDedup.has(key) && now - (clickDedup.get(key) ?? 0) < 1500) return;
      clickDedup.set(key, now);

      send(name, {
        priority,
        label,
        meta: {
          text: label,
          tag: el.tagName.toLowerCase(),
          ...(el.getAttribute("href") ? { href: el.getAttribute("href") } : {}),
        },
      });
    };
    document.addEventListener("click", onClick, true);

    // ── Form interaction (classifies the form; never reads values) ────────
    const seenForms = new WeakSet<HTMLFormElement>();
    const onFocusIn = (e: FocusEvent) => {
      const form = (e.target as HTMLElement | null)?.closest?.("form") as HTMLFormElement | null;
      if (!form || seenForms.has(form)) return;
      seenForms.add(form);
      const c = classifyForm(form, window.location.pathname);
      send("form_started", {
        priority: c.priority === "critical" ? "high" : "normal",
        label: c.startedLabel,
        meta: { kind: c.kind },
      });
    };
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      const c = classifyForm(form && form.tagName === "FORM" ? form : null, window.location.pathname);
      send("form_submitted", { priority: c.priority, label: c.label, meta: { kind: c.kind } });
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("submit", onSubmit, true);

    // ── Lightbox open (portfolio) — yet-another-react-lightbox adds .yarl__root
    const lightboxObserver = new MutationObserver(() => {
      if (document.querySelector(".yarl__root, [data-rmiz-modal-overlay=\"visible\"]")) {
        if (!firedOnceThisSession("lightbox_opened_once")) {
          send("lightbox_opened", { label: "Poză mărită" });
        }
      }
    });
    lightboxObserver.observe(document.body, { childList: true, subtree: false });

    // ── Exit ──────────────────────────────────────────────────────────────
    // Only a real unload ends the session. A tab switch (visibility "hidden")
    // does NOT — the owner keeps a monitoring tab open next to the site, and
    // the server's heartbeat timeout covers an abrupt close/crash.
    const end = () => {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      const payload = JSON.stringify({ sessionId, durationSeconds });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/live/end", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/analytics/live/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
      }
    };
    const ping = () => {
      fetch("/api/analytics/live/ping", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === "visible") ping(); };
    window.addEventListener("pagehide", end);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(hb);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pagehide", end);
      document.removeEventListener("visibilitychange", onVisibility);
      lightboxObserver.disconnect();
      sendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-route: page_view + scroll milestones + route-based events ─────────
  useEffect(() => {
    if (!isBrowser()) return;
    const path = location.pathname;
    if (shouldSkipVisitor(path)) return;

    const send = sendRef.current;
    if (!send) return;

    // small delay so document.title reflects the new route (Helmet updates async)
    const t = window.setTimeout(() => {
      send("page_view", { page: path, pageTitle: document.title, meta: { name: friendlyPageName(path) } });
      if (isPricingPath(path)) send("pricing_viewed", { page: path, priority: "high", label: friendlyPageName(path) });
      if (isGalleryPath(path)) send("gallery_viewed", { page: path, label: friendlyPageName(path) });
    }, 250);

    scrollHitRef.current = new Set();
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = Math.round(((window.scrollY) / total) * 100);
      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !scrollHitRef.current.has(m)) {
          scrollHitRef.current.add(m);
          send("scroll_depth", { page: path, priority: "low", scrollDepth: m, meta: { depth: m, name: friendlyPageName(path) } });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // section dwell via [data-track-section]
    const dwellTimers = new Map<Element, number>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const label = (entry.target as HTMLElement).dataset.trackSection ?? "";
        if (entry.isIntersecting && document.visibilityState === "visible") {
          if (!dwellTimers.has(entry.target)) {
            const id = window.setTimeout(() => {
              if (!firedOnceThisSession(`section_dwell:${path}:${label}`)) {
                send("section_dwell", { page: path, label, meta: { section: label } });
              }
            }, 4000);
            dwellTimers.set(entry.target, id);
          }
        } else {
          const id = dwellTimers.get(entry.target);
          if (id) { window.clearTimeout(id); dwellTimers.delete(entry.target); }
        }
      }
    }, { threshold: 0.4 });
    document.querySelectorAll("[data-track-section]").forEach((el) => io.observe(el));

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      dwellTimers.forEach((id) => window.clearTimeout(id));
      io.disconnect();
    };
  }, [location.pathname]);
}
