import type { Request, Response } from "express";
import { Router } from "express";
import { firestore } from "../firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getClientIp, fetchIpInfo } from "../utils/ipinfo";
import { isLocalIp } from "../controllers/triggerEvent.controller";
import { logActivity } from "../services/activity.service";
import { sendEmail } from "../notifications/mailer";
import { adminUser } from "../constants/credentials";
import { BOT_UA } from "../utils/botUa";

const SKIP_PREFIXES = ["/admin", "/login", "/revin"];

const SEO_PAGE_RE = /^\/(fotograf|videograf|foto-video|foto|video)-[a-z]/i;
const ORGANIC_REFERRER_RE = /google\.|bing\.|yahoo\.|duckduckgo\.|yandex\.|baidu\.|ecosia\.|startpage\./i;
const AI_SOURCE_ALIASES: Record<string, string> = {
  chatgpt: "ChatGPT", "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT",
  claude: "Claude", "claude.ai": "Claude", gemini: "Gemini", "gemini.google.com": "Gemini",
  perplexity: "Perplexity", "perplexity.ai": "Perplexity", grok: "Grok", "grok.com": "Grok",
};

function getAiSource(data: FirebaseFirestore.DocumentData): string | null {
  const source = String(data.utmSource ?? "").trim().toLowerCase();
  if (source && AI_SOURCE_ALIASES[source]) return AI_SOURCE_ALIASES[source];
  const referrer = String(data.referrer ?? "");
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    return AI_SOURCE_ALIASES[host] ?? null;
  } catch { return null; }
}

function isOrganicReferrer(referrer: string): boolean {
  if (!referrer || referrer.trim() === "") return false; // direct traffic is not SEO organic
  return ORGANIC_REFERRER_RE.test(referrer);
}

function parseSeoPage(page: string): { city: string; service: string } | null {
  if (!SEO_PAGE_RE.test(page)) return null;
  const slug = page.replace(/^\//, "").replace(/\?.*$/, "");
  const parts = slug.split("-");
  // Pattern: {prefix}-{service}-{city} or {prefix}-{city}-{service}
  // We just extract the full slug and present it cleanly
  if (parts.length < 3) return null;
  // Remove prefix (fotograf / videograf / foto-video / foto / video)
  let rest = slug;
  for (const prefix of ["foto-video", "fotograf", "videograf", "foto", "video"]) {
    if (slug.startsWith(prefix + "-")) {
      rest = slug.slice(prefix.length + 1);
      break;
    }
  }
  const restParts = rest.split("-");
  // Known services — first or last segment
  const SERVICES = new Set(["nunta", "botez", "majorat", "evenimente", "cununie", "civila", "logodna", "corporate", "inmormantare", "trash", "save"]);
  const serviceIdx = restParts.findIndex((p) => SERVICES.has(p));
  if (serviceIdx === -1) return { city: rest, service: "" };
  const service = restParts.slice(serviceIdx).join(" ");
  const city = restParts.slice(0, serviceIdx).join(" ") || restParts.slice(serviceIdx + 1).join(" ");
  return { city: city || slug, service };
}

export const analyticsPublicRouter = Router();
export const analyticsAdminRouter = Router();

// ── Contact Click Tracking ────────────────────────────────────────────────────

const CONTACT_CLICK_COOLDOWN_MS = 20 * 60 * 1000; // 20 min per IP, prevent double-fire
const contactClickByIp = new Map<string, number>();

const CONTACT_CLICK_LABELS: Record<string, string> = {
  phone: "📞 Click număr de telefon",
  whatsapp: "💬 Click WhatsApp",
  instagram: "📸 Click Instagram",
};

// POST /api/analytics/contact-click
analyticsPublicRouter.post("/contact-click", async (req: Request, res: Response) => {
  try {
    const { type, page } = req.body as { type?: string; page?: string };
    if (!type || !CONTACT_CLICK_LABELS[type]) return res.json({ ok: true });

    const ip = getClientIp(req) ?? "";
    if (isLocalIp(ip)) return res.json({ ok: true });
    if (isAdminRequest(req)) return res.json({ ok: true });

    const ua = req.headers["user-agent"] ?? "";
    if (BOT_UA.test(ua)) return res.json({ ok: true });

    res.json({ ok: true });

    const title = CONTACT_CLICK_LABELS[type];
    const ipInfo = await fetchIpInfo(ip).catch(() => null);
    const locationLabel = [ipInfo?.city, ipInfo?.country].filter(Boolean).join(", ") || "locație necunoscută";

    // Always log to activity feed
    logActivity({
      type: "lead",
      title,
      description: `${locationLabel} · ${page || "/"}`,
      metadata: { contactType: type, page: page || "/", city: ipInfo?.city ?? "", country: ipInfo?.country ?? "" },
      emailSent: false,
    }).catch(() => {});

    // Send email with cooldown — phone clicks are high-intent, always notify
    const lastClick = contactClickByIp.get(ip);
    if (lastClick && Date.now() - lastClick < CONTACT_CLICK_COOLDOWN_MS) return;

    contactClickByIp.set(ip, Date.now());
    for (const [storedIp, timestamp] of contactClickByIp) {
      if (Date.now() - timestamp >= CONTACT_CLICK_COOLDOWN_MS) contactClickByIp.delete(storedIp);
    }

    const subject = `${title} — ancavisuals.ro`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f0f0f;color:#e5e5e5;padding:24px;border-radius:12px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#fff">${title}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#888">Pagină</td><td style="padding:6px 0">${page || "/"}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Locație</td><td style="padding:6px 0">${locationLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Provider</td><td style="padding:6px 0">${ipInfo?.org || "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Ora</td><td style="padding:6px 0">${new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</td></tr>
        </table>
      </div>`;

    sendEmail({ to: adminUser.email, subject, html }).catch(() => {});
  } catch {
    res.json({ ok: true });
  }
});

const ADMIN_COOKIE = "av_admin";

function isAdminRequest(req: Request): boolean {
  const cookies = req.headers.cookie ?? "";
  return cookies.split(";").some((c) => c.trim() === `${ADMIN_COOKIE}=1`);
}

// POST /api/analytics/pageview — record a page visit
analyticsPublicRouter.post("/pageview", async (req: Request, res: Response) => {
  try {
    const { page, referrer, sessionId, visitorId, isNew, utmSource, utmMedium, utmCampaign } = req.body as {
      page?: string;
      referrer?: string;
      sessionId?: string;
      visitorId?: string;
      isNew?: boolean;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    };

    if (!page || !sessionId) return res.status(400).json({ error: "Missing fields" });
    if (SKIP_PREFIXES.some((p) => page.startsWith(p))) return res.json({ ok: true });
    if (isAdminRequest(req)) return res.json({ ok: true });

    const ua = req.headers["user-agent"] ?? "";
    if (BOT_UA.test(ua)) return res.json({ ok: true });

    const ip = getClientIp(req);
    if (isLocalIp(ip ?? "")) return res.json({ ok: true });
    const ipInfo = await fetchIpInfo(ip).catch(() => null);

    const db = firestore();
    const docRef = await db.collection("siteVisits").add({
      sessionId,
      visitorId: visitorId ?? "",
      isNew: isNew ?? true,
      page,
      referrer: referrer ?? "",
      utmSource: utmSource ?? "",
      utmMedium: utmMedium ?? "",
      utmCampaign: utmCampaign ?? "",
      timestamp: Timestamp.now(),
      ip: ip ?? "",
      userAgent: ua,
      city: ipInfo?.city ?? "",
      region: ipInfo?.region ?? "",
      country: ipInfo?.country ?? "",
      org: ipInfo?.org ?? "",
      timeSpent: 0,
      scrollDepth: 0,
    });

    res.json({ ok: true, id: docRef.id });
  } catch (error) {
    console.error("[analytics] POST /pageview failed:", error);
    res.status(500).json({ error: "Failed to log pageview" });
  }
});

// PATCH /api/analytics/engagement — update time spent + scroll depth for a visit
analyticsPublicRouter.patch("/engagement", async (req: Request, res: Response) => {
  try {
    const { id, timeSpent, scrollDepth } = req.body as {
      id?: string;
      timeSpent?: number;
      scrollDepth?: number;
    };
    if (!id || typeof timeSpent !== "number") return res.status(400).json({ error: "Missing fields" });

    const db = firestore();
    await db.collection("siteVisits").doc(id).update({
      timeSpent: Math.min(Math.round(timeSpent), 7200),
      scrollDepth: typeof scrollDepth === "number" ? Math.min(100, Math.max(0, Math.round(scrollDepth))) : 0,
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update engagement" });
  }
});

// GET /api/admin/analytics/visits — all recent visits
analyticsAdminRouter.get("/analytics/visits", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const includeLocal = req.query.includeLocal === "true";

    const snapshot = await db
      .collection("siteVisits")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const visits = snapshot.docs
      .filter((doc) => includeLocal || !isLocalIp(doc.data().ip ?? ""))
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          sessionId: d.sessionId,
          visitorId: d.visitorId ?? "",
          isNew: d.isNew ?? true,
          page: d.page,
          referrer: d.referrer,
          timestamp: d.timestamp instanceof Timestamp ? d.timestamp.toDate().toISOString() : d.timestamp,
          ip: d.ip,
          userAgent: d.userAgent,
          city: d.city,
          utmSource: d.utmSource ?? "",
          utmMedium: d.utmMedium ?? "",
          utmCampaign: d.utmCampaign ?? "",
          region: d.region,
          country: d.country,
          org: d.org,
          timeSpent: d.timeSpent ?? 0,
          scrollDepth: d.scrollDepth ?? 0,
        };
      });

    res.json({ visits });
  } catch (error) {
    console.error("[analytics] GET /visits failed:", error);
    res.status(500).json({ error: "Failed to load visits" });
  }
});

// GET /api/admin/analytics/stats — aggregated statistics
analyticsAdminRouter.get("/analytics/stats", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const includeLocal = req.query.includeLocal === "true";
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const daysAgo = (days: number): Date =>
      new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const uniqueVisitors = (snap: FirebaseFirestore.QuerySnapshot): number =>
      new Set(
        snap.docs
          .filter((d) => includeLocal || !isLocalIp(d.data().ip ?? ""))
          .map((d) => d.data().visitorId || d.data().sessionId)
      ).size;

    const [todaySnap, threeDaysSnap, weekSnap, monthSnap, threeMonthsSnap] = await Promise.all([
      db.collection("siteVisits").where("timestamp", ">=", Timestamp.fromDate(todayStart)).get(),
      db.collection("siteVisits").where("timestamp", ">=", Timestamp.fromDate(daysAgo(3))).get(),
      db.collection("siteVisits").where("timestamp", ">=", Timestamp.fromDate(daysAgo(7))).get(),
      db.collection("siteVisits").where("timestamp", ">=", Timestamp.fromDate(daysAgo(30))).get(),
      db.collection("siteVisits").where("timestamp", ">=", Timestamp.fromDate(daysAgo(90))).get(),
    ]);

    const pageCount: Record<string, number> = {};
    const referrerCount: Record<string, number> = {};
    const aiSourceVisitors: Record<string, Set<string>> = {};
    const countryVisitors: Record<string, Set<string>> = {};

    monthSnap.docs.filter((d) => includeLocal || !isLocalIp(d.data().ip ?? "")).forEach((d) => {
      const data = d.data();
      const aiSource = getAiSource(data);
      if (aiSource) {
        const visitorKey = String(data.visitorId || data.sessionId || data.ip || d.id);
        if (!aiSourceVisitors[aiSource]) aiSourceVisitors[aiSource] = new Set();
        aiSourceVisitors[aiSource].add(visitorKey);
      }
      const page = data.page as string;
      pageCount[page] = (pageCount[page] ?? 0) + 1;

      const ref = data.referrer as string;
      if (ref && !ref.includes("ancavisuals.ro")) {
        try {
          const host = new URL(ref).hostname.replace(/^www\./, "");
          if (!includeLocal && (host === "localhost" || host.startsWith("127.") || host === "::1")) return;
          referrerCount[host] = (referrerCount[host] ?? 0) + 1;
        } catch { /* invalid URL */ }
      }

      const country = data.country as string;
      if (country) {
        if (!countryVisitors[country]) countryVisitors[country] = new Set();
        const visitorKey = (data.visitorId as string) || (data.sessionId as string) || (data.ip as string);
        if (visitorKey) countryVisitors[country].add(visitorKey);
      }
    });

    const topPages = Object.entries(pageCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([page, count]) => ({ page, count }));

    const topReferrers = Object.entries(referrerCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([referrer, count]) => ({ referrer, count }));

    const topCountries = Object.entries(countryVisitors)
      .sort(([, a], [, b]) => b.size - a.size)
      .slice(0, 5)
      .map(([country, visitors]) => ({ country, count: visitors.size }));

    const aiSources = Object.entries(aiSourceVisitors)
      .sort(([, a], [, b]) => b.size - a.size)
      .map(([source, visitors]) => ({ source, count: visitors.size }));

    res.json({
      today: { visitors: uniqueVisitors(todaySnap) },
      threeDays: { visitors: uniqueVisitors(threeDaysSnap) },
      week: { visitors: uniqueVisitors(weekSnap) },
      month: { visitors: uniqueVisitors(monthSnap) },
      threeMonths: { visitors: uniqueVisitors(threeMonthsSnap) },
      topPages,
      topReferrers,
      topCountries,
      aiSources,
    });
  } catch (error) {
    console.error("[analytics] GET /stats failed:", error);
    res.status(500).json({ error: "Failed to load stats" });
  }
});
