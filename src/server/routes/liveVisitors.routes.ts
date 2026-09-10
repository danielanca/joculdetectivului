import type { Request, Response } from "express";
import { Router } from "express";
import { firestore } from "../firestore";
import { getClientIp, fetchIpInfo } from "../utils/ipinfo";
import { isLocalIp } from "../controllers/triggerEvent.controller";
import { BOT_UA } from "../utils/botUa";
import { logActivity } from "../services/activity.service";
import { sendEmail } from "../notifications/mailer";
import { adminUser } from "../constants/credentials";
import { requireFirebaseAuth, requireSupremeAdmin } from "../middleware/requireFirebaseAuth";
import {
  recordEvent,
  ping,
  endSession,
  getActiveSnapshot,
  sessionNeedsGeo,
  liveVisitorsEmitter,
  type RecordEventInput,
  type SessionContext,
  type LiveSession,
} from "../services/liveVisitors.service";

export const liveVisitorsPublicRouter = Router();
export const liveVisitorsAdminRouter = Router();

const ADMIN_COOKIE = "av_admin";
const SKIP_PREFIXES = ["/admin", "/login", "/revin", "/wedding-hub", "/colaborator"];
// In dev every request comes from localhost — don't filter it out, or the panel
// can never be tested. Production still drops local/office traffic.
const IS_PROD = process.env.NODE_ENV === "production";
const CRITICAL_EVENTS = new Set(["contact_clicked", "whatsapp_clicked", "phone_revealed", "form_submitted"]);
const CRITICAL_LABELS: Record<string, string> = {
  contact_clicked: "🖱️ Click Contactează-ne (live)",
  whatsapp_clicked: "💬 Click WhatsApp (live)",
  phone_revealed: "📞 Număr afișat (live)",
  form_submitted: "✅ Formular trimis (live)",
};

// Events that also trigger an email (so the owner is notified with the panel closed).
// `form_submitted` is intentionally NOT here: the generic client-side submit
// listener fires it for any form and carries no field values, so it would only
// ever be a value-less "someone submitted a form" alert. It still shows in the
// live panel and the activity feed. Real leads are emailed by their own routes
// (/api/campaign/:slug/contact, /triggerEvent) — see `formSubmittedShouldEmail`
// for the delivery/subscribe exceptions that have no dedicated route.
const EMAIL_EVENTS: Record<string, string> = {
  whatsapp_clicked: "💬 Click WhatsApp",
  phone_revealed: "📞 Număr de telefon afișat",
  contact_clicked: "🖱️ Click Contactează-ne",
  availability_checked: "📅 A verificat disponibilitatea",
};

// `form_submitted` still emails for these intents — they have no other route
// that notifies the owner. `contact`/`other` do not: a contact lead is emailed
// by the form's own endpoint, and `other` is too vague to be worth an email.
function formSubmittedShouldEmail(kind: string): boolean {
  return kind === "delivery" || kind === "subscribe";
}
// `form_submitted` is one event but three very different intentions — title by `meta.kind`.
const FORM_KIND_TITLE: Record<string, string> = {
  contact: "🎯 Un client vrea să fie contactat",
  delivery: "📦 Adresă de livrare completată (vrea albumul fizic)",
  subscribe: "📧 Abonare la album — vrea notificare când sunt gata pozele",
  other: "✅ Formular trimis",
};
// Events written to the activity feed (`site_activity`) beyond the critical set.
const LOGGED_EVENTS = new Set([...CRITICAL_EVENTS, "availability_checked"]);
const EVENT_EMAIL_COOLDOWN_MS = 10 * 60_000;
const eventEmailLastSent = new Map<string, number>();

function shouldEmailEvent(sessionId: string, eventName: string, discriminator = ""): boolean {
  const key = `${sessionId}::${eventName}::${discriminator}`;
  const now = Date.now();
  const last = eventEmailLastSent.get(key);
  if (last && now - last < EVENT_EMAIL_COOLDOWN_MS) return false;
  eventEmailLastSent.set(key, now);
  for (const [k, t] of eventEmailLastSent) {
    if (now - t > EVENT_EMAIL_COOLDOWN_MS) eventEmailLastSent.delete(k);
  }
  return true;
}

const SOURCE_RO: Record<string, string> = {
  google_ads: "Google Ads", organic: "Căutare organică", ai: "AI (ChatGPT/Claude/…)",
  referral: "Alt site", direct: "Direct / tastat",
};

function sendEventEmail(
  eventName: string,
  session: LiveSession,
  eventBody: Record<string, unknown>,
): void {
  const safe = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const formKind = eventName === "form_submitted" ? String(eventBody.kind ?? "other") : "";
  const title = formKind
    ? (FORM_KIND_TITLE[formKind] ?? FORM_KIND_TITLE.other)
    : (EMAIL_EVENTS[eventName] ?? eventName);
  const loc = [session.city, session.country].filter(Boolean).join(", ") || "necunoscută";
  const attr = session.attribution ?? {};
  const checkedDate = eventName === "availability_checked" ? String(eventBody.date ?? "") : "";
  const dateFree = eventBody.available;
  const rows: [string, string][] = [
    ...(checkedDate
      ? [["Data verificată", `${checkedDate}${dateFree === false ? " — OCUPATĂ" : dateFree === true ? " — liberă ✅" : ""}`] as [string, string]]
      : []),
    ["Vizitator", `#${session.visitorNumber}`],
    ["Sursă", `${SOURCE_RO[session.source] ?? session.source}${session.isGoogleAds ? " ✅" : ""}`],
    ["Pagina", session.currentPage || "/"],
    ["Locație IP", loc],
    ["Provider", session.org || "—"],
    ["Device", session.deviceType],
    ...(attr.utmCampaign ? [["Campanie", attr.utmCampaign] as [string, string]] : []),
    ...(attr.utmTerm ? [["Termen", attr.utmTerm] as [string, string]] : []),
    ...(attr.gclid ? [["gclid", "✓ prezent"] as [string, string]] : []),
    ["IP", session.ip || "—"],
    ["Ora", new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })],
  ];

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
      <h2 style="color:#f59e0b;margin:0 0 4px;">${safe(title)}</h2>
      <p style="color:#a3a3a3;margin:0 0 16px;font-size:13px;">Vizitator activ pe ancavisuals.ro chiar acum.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${rows.map(([k, v]) => `<tr><td style="padding:5px 0;color:#737373;width:110px;">${k}</td><td style="color:#f5f5f5;word-break:break-all;">${safe(String(v))}</td></tr>`).join("")}
      </table>
      <p style="margin:16px 0 6px;color:#737373;font-size:12px;">Event body:</p>
      <pre style="margin:0;padding:12px;background:#171717;border:1px solid #262626;border-radius:8px;color:#d4d4d4;font-size:11px;white-space:pre-wrap;word-break:break-word;">${safe(JSON.stringify(eventBody, null, 2))}</pre>
      <p style="margin:18px 0 0;"><a href="https://ancavisuals.ro/admin/live" style="color:#c9a96e;">Deschide panoul live →</a></p>
    </div>`;

  const subject = checkedDate
    ? `📅 Verificare disponibilitate: ${checkedDate}${dateFree === false ? " (ocupată)" : ""} — Vizitator #${session.visitorNumber}`
    : `${title} — Vizitator #${session.visitorNumber}${session.isGoogleAds ? " · Google Ads" : ""} · ${session.currentPage || "/"}`;

  sendEmail({ to: adminUser.email, subject, html }).catch(() => {});
}

function isAdminRequest(req: Request): boolean {
  const cookies = req.headers.cookie ?? "";
  return cookies.split(";").some((c) => c.trim() === `${ADMIN_COOKIE}=1`);
}

function isTrackableRequest(req: Request, page?: string): boolean {
  // In dev the owner IS the only tester — don't exclude their admin cookie or
  // localhost IP, or the panel can never be exercised. Production still does.
  if (IS_PROD && isAdminRequest(req)) return false;
  const ua = String(req.headers["user-agent"] ?? "");
  if (!ua || BOT_UA.test(ua)) return false;
  if (IS_PROD && isLocalIp(getClientIp(req) ?? "")) return false;
  if (page && SKIP_PREFIXES.some((p) => page.startsWith(p))) return false;
  return true;
}

// POST /api/analytics/live/event
liveVisitorsPublicRouter.post("/live/event", async (req: Request, res: Response) => {
  try {
    const body = req.body as RecordEventInput;
    if (!body?.sessionId || !body?.event || typeof body.sessionId !== "string") {
      return res.status(400).json({ error: "invalid_payload" });
    }
    if (!isTrackableRequest(req, body.page)) return res.json({ ok: true, ignored: true });

    const ip = getClientIp(req) ?? "";
    const ua = String(req.headers["user-agent"] ?? "");

    let geo: SessionContext["geo"] = null;
    if (sessionNeedsGeo(body.sessionId)) {
      geo = await fetchIpInfo(ip).catch(() => null);
    }

    const { session, event } = recordEvent(body, { ip, ua, geo });
    const meta = (body.meta ?? {}) as Record<string, unknown>;
    const checkedDate = body.event === "availability_checked" ? String(meta.date ?? "") : "";
    const formKind = body.event === "form_submitted" ? String(meta.kind ?? "other") : "";
    const emailDiscriminator = checkedDate || formKind;

    const leadName = body.event === "form_submitted" ? String(meta.name ?? "").trim() : "";
    const leadPhone = body.event === "form_submitted" ? String(meta.phone ?? "").trim() : "";
    const leadContact = [leadName, leadPhone].filter(Boolean).join(" · ");

    if (LOGGED_EVENTS.has(body.event)) {
      const geoLabel = [session.city, session.country].filter(Boolean).join(", ") || "locație necunoscută";
      logActivity({
        type: "lead",
        title: (formKind
          ? (FORM_KIND_TITLE[formKind] ?? FORM_KIND_TITLE.other)
          : (CRITICAL_LABELS[body.event] ?? EMAIL_EVENTS[body.event] ?? body.event)) + (checkedDate ? `: ${checkedDate}` : ""),
        description: `${leadContact ? `${leadContact} · ` : ""}${geoLabel} · ${event.page}${session.isGoogleAds ? " · Google Ads" : ""}`,
        metadata: {
          event: body.event,
          page: event.page,
          source: session.source,
          visitorNumber: String(session.visitorNumber),
          ...(checkedDate ? { checkedDate, available: String(meta.available ?? "") } : {}),
          ...(formKind ? { formKind } : {}),
          ...(leadName ? { leadName } : {}),
          ...(leadPhone ? { leadPhone } : {}),
        },
        emailSent: false,
      }).catch(() => {});
    }

    const wantEmail =
      Boolean(EMAIL_EVENTS[body.event]) ||
      (body.event === "form_submitted" && formSubmittedShouldEmail(formKind));
    if (wantEmail && shouldEmailEvent(body.sessionId, body.event, emailDiscriminator)) {
      sendEventEmail(body.event, session, {
        event: body.event,
        page: event.page,
        label: body.label ?? event.label,
        kind: formKind || undefined,
        text: meta.text,
        href: meta.href,
        date: meta.date,
        available: meta.available,
        priority: event.priority,
        at: new Date(event.at).toISOString(),
        visitorNumber: session.visitorNumber,
        source: session.source,
        isGoogleAds: session.isGoogleAds,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[live-visitors] POST /live/event failed:", error);
    res.status(500).json({ error: "failed" });
  }
});

// POST /api/analytics/live/ping
liveVisitorsPublicRouter.post("/live/ping", (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (sessionId && typeof sessionId === "string") ping(sessionId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// POST /api/analytics/live/end  (navigator.sendBeacon)
liveVisitorsPublicRouter.post("/live/end", (req: Request, res: Response) => {
  try {
    const { sessionId, durationSeconds } = req.body as { sessionId?: string; durationSeconds?: number };
    if (sessionId && typeof sessionId === "string") {
      endSession(sessionId, "left", typeof durationSeconds === "number" ? durationSeconds : undefined);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// GET /api/admin/analytics/live/stream — SSE
liveVisitorsAdminRouter.get(
  "/analytics/live/stream",
  requireFirebaseAuth,
  requireSupremeAdmin,
  (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (data: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ type: "snapshot", sessions: getActiveSnapshot(), serverTime: Date.now() });

    const onUpdate = (payload: object) => send(payload);
    liveVisitorsEmitter.on("update", onUpdate);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`:hb ${Date.now()}\n\n`);
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      liveVisitorsEmitter.off("update", onUpdate);
    });
  },
);

// GET /api/admin/analytics/live/history — recent ended sessions from Firestore
liveVisitorsAdminRouter.get(
  "/analytics/live/history",
  requireFirebaseAuth,
  requireSupremeAdmin,
  async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const wantArchived = req.query.archived === "1" || req.query.archived === "true";
      // Fetch a wider window then filter by archived flag in code (legacy docs
      // have no `archived` field, which a Firestore `where` would exclude).
      const snap = await firestore()
        .collection("live_sessions")
        .orderBy("startedAtMs", "desc")
        .limit(limit * 3)
        .get();

      const items = snap.docs
        .filter((doc) => Boolean(doc.data().archived) === wantArchived)
        .slice(0, limit)
        .map((doc) => {
          const d = doc.data();
          delete d.updatedAt; // Firestore Timestamp — not needed by the client
          delete d.ip;
          delete d.ua;
          return {
            ...d,
            sessionId: doc.id,
            archived: Boolean(d.archived),
            firstSeenAt: d.firstSeenAt ?? d.startedAtMs ?? null,
            path: d.path ?? [],
            events: d.events ?? [],
            source: d.source ?? "direct",
            attribution: d.attribution ?? {},
          };
        });

      res.json({ sessions: items });
    } catch (error) {
      console.error("[live-visitors] GET /live/history failed:", error);
      res.status(500).json({ error: "failed" });
    }
  },
);

// POST /api/admin/analytics/live/:sessionId/archive — { archived: boolean }
liveVisitorsAdminRouter.post(
  "/analytics/live/:sessionId/archive",
  requireFirebaseAuth,
  requireSupremeAdmin,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const archived = (req.body as { archived?: boolean }).archived !== false;
      await firestore().collection("live_sessions").doc(sessionId).set({ archived }, { merge: true });
      res.json({ ok: true, archived });
    } catch (error) {
      console.error("[live-visitors] POST /live/:sessionId/archive failed:", error);
      res.status(500).json({ error: "failed" });
    }
  },
);
