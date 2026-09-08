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
const EMAIL_EVENTS: Record<string, string> = {
  whatsapp_clicked: "💬 Click WhatsApp",
  phone_revealed: "📞 Număr de telefon afișat",
  contact_clicked: "🖱️ Click Contactează-ne",
  form_submitted: "✅ Formular de contact trimis",
};
const EVENT_EMAIL_COOLDOWN_MS = 10 * 60_000;
const eventEmailLastSent = new Map<string, number>();

function shouldEmailEvent(sessionId: string, eventName: string): boolean {
  const key = `${sessionId}::${eventName}`;
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
  const title = EMAIL_EVENTS[eventName] ?? eventName;
  const loc = [session.city, session.country].filter(Boolean).join(", ") || "necunoscută";
  const attr = session.attribution ?? {};
  const rows: [string, string][] = [
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

  sendEmail({
    to: adminUser.email,
    subject: `${title} — Vizitator #${session.visitorNumber}${session.isGoogleAds ? " (Google Ads)" : ""}`,
    html,
  }).catch(() => {});
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

    if (CRITICAL_EVENTS.has(body.event)) {
      logActivity({
        type: "lead",
        title: CRITICAL_LABELS[body.event] ?? body.event,
        description: `${[session.city, session.country].filter(Boolean).join(", ") || "locație necunoscută"} · ${event.page}${session.isGoogleAds ? " · Google Ads" : ""}`,
        metadata: {
          event: body.event,
          page: event.page,
          source: session.source,
          visitorNumber: String(session.visitorNumber),
        },
        emailSent: false,
      }).catch(() => {});
    }

    if (EMAIL_EVENTS[body.event] && shouldEmailEvent(body.sessionId, body.event)) {
      sendEventEmail(body.event, session, {
        event: body.event,
        page: event.page,
        label: body.label ?? event.label,
        text: (body.meta as Record<string, unknown> | undefined)?.text,
        href: (body.meta as Record<string, unknown> | undefined)?.href,
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
      const limit = Math.min(Number(req.query.limit) || 50, 300);
      const snap = await firestore()
        .collection("live_sessions")
        .orderBy("startedAtMs", "desc")
        .limit(limit)
        .get();

      const items = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          sessionId: doc.id,
          visitorNumber: d.visitorNumber ?? null,
          firstSeenAt: d.firstSeenAt ?? d.startedAtMs ?? null,
          endedAt: d.endedAt ?? null,
          endReason: d.endReason ?? null,
          durationSeconds: d.durationSeconds ?? 0,
          pageCount: d.pageCount ?? 0,
          path: d.path ?? [],
          events: d.events ?? [],
          source: d.source ?? "direct",
          isGoogleAds: d.isGoogleAds ?? false,
          attribution: d.attribution ?? {},
          city: d.city ?? "",
          country: d.country ?? "",
          deviceType: d.deviceType ?? "desktop",
        };
      });

      res.json({ sessions: items });
    } catch (error) {
      console.error("[live-visitors] GET /live/history failed:", error);
      res.status(500).json({ error: "failed" });
    }
  },
);
