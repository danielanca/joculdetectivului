import { Router, type Request, type Response } from "express";
import { captureClientError, ERRORS_COLLECTION } from "../monitoring/serverMonitor";
import { firestore } from "../firestore";
import type { Timestamp } from "firebase-admin/firestore";
import { getClientIp, fetchIpInfo } from "../utils/ipinfo";
import { requireFirebaseAuth, requireSupremeAdmin } from "../middleware/requireFirebaseAuth";
import { sendEmail } from "../notifications/mailer";
import { adminUser } from "../constants/credentials";
import { BOT_UA } from "../utils/botUa";
import { isNotifiableCountry } from "../utils/geoFilter";

const router = Router();

const EXTENSION_PATTERNS = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "Extension context invalidated",
];

function isExtensionError(message: string, stack: string): boolean {
  const combined = `${message} ${stack}`;
  return EXTENSION_PATTERNS.some((pattern) => combined.includes(pattern));
}

function isQrDebugError(message: string, page: string): boolean {
  return message.startsWith("[QR DEBUG]") || page.startsWith("/qr-moments/");
}

// A single stuck guest can fail dozens of photo uploads in a row (and re-tap
// Submit), and every failure used to fire its own admin email. Throttle QR
// debug emails to one per page+IP per window — the full detail is still written
// to Firestore for the admin dashboard.
const QR_DEBUG_EMAIL_COOLDOWN_MS = 10 * 60_000;
const qrDebugEmailLastSent = new Map<string, number>();

function shouldSendQrDebugEmail(page: string, ip?: string): boolean {
  const key = `${page}::${ip ?? "-"}`;
  const now = Date.now();
  const last = qrDebugEmailLastSent.get(key);
  if (last && now - last < QR_DEBUG_EMAIL_COOLDOWN_MS) return false;
  qrDebugEmailLastSent.set(key, now);
  for (const [storedKey, timestamp] of qrDebugEmailLastSent) {
    if (now - timestamp > QR_DEBUG_EMAIL_COOLDOWN_MS) qrDebugEmailLastSent.delete(storedKey);
  }
  return true;
}

function isSlowLoadError(message: string): boolean {
  return message.startsWith("[SLOW LOAD]");
}

// Someone landing on a broken link (usually a wrong URL in an ad or printed
// material) triggers one email per unique path per window — the same bad ad
// gets clicked many times, but the admin only needs to hear about it once.
const NOT_FOUND_EMAIL_COOLDOWN_MS = 6 * 60 * 60_000;
const notFoundEmailLastSent = new Map<string, number>();

function shouldSendNotFoundEmail(path: string): boolean {
  const now = Date.now();
  const last = notFoundEmailLastSent.get(path);
  if (last && now - last < NOT_FOUND_EMAIL_COOLDOWN_MS) return false;
  notFoundEmailLastSent.set(path, now);
  for (const [storedKey, timestamp] of notFoundEmailLastSent) {
    if (now - timestamp > NOT_FOUND_EMAIL_COOLDOWN_MS) notFoundEmailLastSent.delete(storedKey);
  }
  return true;
}

// Automated scanners hit these constantly — never an ad mistake, so skip them.
const SCANNER_PATH_PATTERN =
  /(\.php|\.aspx?|\.env|\/wp-|xmlrpc|\/\.git|\/vendor\/|\/cgi-bin|phpmyadmin|\/owa\/|wallet\.dat|\/\.aws|\/\.ssh)/i;

async function sendNotFoundEmail(
  path: string,
  referrer: string,
  userAgent: string,
  ip?: string,
  geo?: { city?: string; region?: string; country?: string },
) {
  const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const location = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ") : "";

  await sendEmail({
    to: adminUser.email,
    subject: `🔗 Link greșit (404) pe ancavisuals.ro — ${path}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <h2 style="color:#f59e0b;margin:0 0 8px;">🔗 Cineva a ajuns pe un link inexistent</h2>
        <p style="color:#a3a3a3;margin:0 0 16px;font-size:13px;">
          Dacă ai o reclamă activă sau un material tipărit care duce aici, corectează linkul.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#737373;width:110px;">Adresă cerută</td><td style="color:#f5f5f5;font-weight:600;word-break:break-all;">${safe(path)}</td></tr>
          <tr><td style="padding:6px 0;color:#737373;">A venit de pe</td><td style="color:#facc15;word-break:break-all;">${safe(referrer || "— (link tastat direct sau necunoscut)")}</td></tr>
          <tr><td style="padding:6px 0;color:#737373;">Locație IP</td><td style="color:#f5f5f5;">${safe(location || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#737373;">IP</td><td style="color:#999;font-size:11px;">${safe(ip || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#737373;">Device</td><td style="color:#a3a3a3;font-size:11px;word-break:break-all;">${safe((userAgent || "—").slice(0, 160))}</td></tr>
          <tr><td style="padding:6px 0;color:#737373;">Ora</td><td style="color:#f5f5f5;">${new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</td></tr>
        </table>
        <p style="color:#444;font-size:11px;margin:20px 0 0;">Trimis automat de AncaVisuals monitoring · max. 1 email / 6h pentru aceeași adresă</p>
      </div>
    `,
  });
}

async function sendSlowLoadEmail(message: string, page: string, ip?: string) {
  const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await sendEmail({
    to: adminUser.email,
    subject: `⏳ Loading lent pe ancavisuals.ro — ${page || "/"}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <h2 style="color:#f59e0b;margin:0 0 16px;">⏳ Loading spinner > 8 secunde</h2>
        <p style="color:#a3a3a3;margin:0 0 8px;"><strong>Pagină:</strong> ${safe(page || "/")}</p>
        <p style="color:#a3a3a3;margin:0 0 8px;"><strong>IP:</strong> ${safe(ip || "-")}</p>
        <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px 16px;margin-top:16px;">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#f5f5f5;font-size:13px;">${safe(message)}</pre>
        </div>
        <p style="color:#444;font-size:11px;margin:20px 0 0;">Trimis automat de AncaVisuals monitoring</p>
      </div>
    `,
  });
}

async function sendQrDebugEmail(message: string, stack: string, page: string, ip?: string, geo?: { city?: string; region?: string; country?: string }) {
  const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const location = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(", ") : "";

  await sendEmail({
    to: adminUser.email,
    subject: `[QR DEBUG] Problemă upload pe ${page || "/qr-moments"}`,
    html: `
      <div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <h2 style="color:#f5f5f5;margin-bottom:8px;">QR Moments client debug</h2>
        <p style="color:#a3a3a3;margin-top:0;"><strong>Page:</strong> ${safe(page || "-")}</p>
        <p style="color:#a3a3a3;"><strong>IP:</strong> ${safe(ip || "-")}</p>
        <p style="color:#a3a3a3;"><strong>Geo:</strong> ${safe(location || "-")}</p>
        <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px 16px;margin-top:16px;">
          <p style="margin:0 0 8px;color:#f59e0b;font-weight:600;">Message</p>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#f5f5f5;">${safe(message)}</pre>
        </div>
        <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:14px 16px;margin-top:16px;">
          <p style="margin:0 0 8px;color:#f59e0b;font-weight:600;">Stack / Context</p>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#d4d4d4;">${safe(stack || "-")}</pre>
        </div>
      </div>
    `,
  });
}

// Public — trimis din browser
router.post("/client-error", async (req: Request, res: Response) => {
  try {
    const { message, stack = "", page = "" } = req.body as {
      message: string;
      stack: string;
      page: string;
    };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    if (isExtensionError(message, stack)) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const ip = getClientIp(req);
    const geoData = await fetchIpInfo(ip).catch(() => null);
    const geo = geoData
      ? { city: geoData.city, region: geoData.region, country: geoData.country }
      : undefined;

    captureClientError(message, stack, page, ip || undefined, geo);
    if (isQrDebugError(message, page) && shouldSendQrDebugEmail(page, ip || undefined)) {
      sendQrDebugEmail(message, stack, page, ip || undefined, geo).catch(() => {});
    }
    if (isSlowLoadError(message)) {
      sendSlowLoadEmail(message, page, ip || undefined).catch(() => {});
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// Public — trimis din browser când un vizitator ajunge pe catch-all route (404)
router.post("/not-found", async (req: Request, res: Response) => {
  try {
    const { path = "", referrer = "", userAgent = "" } = req.body as {
      path?: string;
      referrer?: string;
      userAgent?: string;
    };

    if (!path || typeof path !== "string") {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    const cleanPath = path.slice(0, 300);
    if (SCANNER_PATH_PATTERN.test(cleanPath)) {
      res.json({ ok: true, ignored: true });
      return;
    }

    // Crawlers (Applebot, Googlebot, …) hit dead links constantly and are never
    // a broken ad — skip them entirely.
    if (BOT_UA.test(String(userAgent || ""))) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const ip = getClientIp(req);
    const geoData = await fetchIpInfo(ip).catch(() => null);

    // Only notify for visitors from Europe — US / Canada / Mexic / rest of the
    // world on a 404 is almost always a bot or irrelevant.
    if (geoData && !isNotifiableCountry(geoData.country)) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const geo = geoData
      ? { city: geoData.city, region: geoData.region, country: geoData.country }
      : undefined;

    captureClientError(
      `[404] ${cleanPath}`,
      `Referrer: ${referrer || "-"}\nUA: ${userAgent || "-"}`,
      cleanPath,
      ip || undefined,
      geo,
    );

    if (shouldSendNotFoundEmail(cleanPath)) {
      sendNotFoundEmail(cleanPath, String(referrer || ""), String(userAgent || ""), ip || undefined, geo).catch(() => {});
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// Admin — list errors
router.get("/errors", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore()
      .collection(ERRORS_COLLECTION)
      .orderBy("capturedAt", "desc")
      .limit(200)
      .get();

    const errors = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        message: data.message,
        stack: data.stack,
        source: data.source,
        severity: data.severity,
        page: data.page,
        seen: data.seen,
        ip: data.ip ?? null,
        geo: data.geo ?? null,
        capturedAt: (data.capturedAt as Timestamp)?.toDate().toISOString() ?? null,
      };
    });

    res.json({ errors });
  } catch (error) {
    res.status(500).json({ error: "failed_to_fetch" });
  }
});

// Admin — unseen error count (for the badge)
router.get("/errors/unseen-count", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore()
      .collection(ERRORS_COLLECTION)
      .where("seen", "==", false)
      .count()
      .get();

    res.json({ count: snapshot.data().count });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

router.get("/errors/qr-unseen-count", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore()
      .collection(ERRORS_COLLECTION)
      .where("seen", "==", false)
      .get();

    const count = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return isQrDebugError(String(data.message ?? ""), String(data.page ?? ""));
    }).length;

    res.json({ count });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

// Admin — mark all as seen
router.patch("/errors/mark-seen", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore()
      .collection(ERRORS_COLLECTION)
      .where("seen", "==", false)
      .get();

    if (snapshot.empty) {
      res.json({ updated: 0 });
      return;
    }

    const batch = firestore().batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, { seen: true }));
    await batch.commit();

    res.json({ updated: snapshot.size });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

router.delete("/errors", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore().collection(ERRORS_COLLECTION).get();
    if (snapshot.empty) { res.json({ deleted: 0 }); return; }
    const batch = firestore().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    res.json({ deleted: snapshot.size });
  } catch {
    res.status(500).json({ error: "failed" });
  }
});

export default router;
