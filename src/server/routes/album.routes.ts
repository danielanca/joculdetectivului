import { Router } from "express";
import express from "express";
import type { Request, Response } from "express";
import { getAlbum, downloadSelectedPhotos, postPrintSelection, downloadAll, deletePhoto, downloadPrintDynamic, addDeliveryAddress, getDeliveryAddress, addSwissLink } from "../controllers/album.controller";
import { getAlbumStats } from "../services/albumStats.service";
import { getAlbumRetentionBySlug } from "../services/albumRetention.service";
import { getClientIp, fetchIpInfo } from "../utils/ipinfo";
import { sendEmail } from "../notifications/mailer";
import { firestore } from "../firestore";
import { adminUser } from "../constants/credentials";

const ADMIN_EMAIL = adminUser.email;

const router = Router();

router.get("/admin/list", async (req: Request, res: Response) => {
  try {
    const { buildBunnyDirectoryUrl, getBunnyStorageKey, BUNNY_ACCESS_KEY_HEADER } = await import("../constants/bunny");
    const url = buildBunnyDirectoryUrl();
    const response = await fetch(url, { headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() } });
    if (!response.ok) return res.status(500).json({ error: "Bunny list failed" });
    const entries = await response.json() as { ObjectName: string; IsDirectory: boolean }[];
    const slugs = entries
      .filter((e) => e.IsDirectory)
      .map((e) => e.ObjectName.replace(/\/$/, ""))
      .sort();

    if (req.query.hasShortVideo === "true") {
      const storageKey = getBunnyStorageKey();
      const results = await Promise.all(slugs.map(async slug => {
        const dirUrl = buildBunnyDirectoryUrl(slug, "shortvideo");
        const dirResponse = await fetch(dirUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey } });
        if (!dirResponse.ok) return null;
        const files = await dirResponse.json() as { ObjectName: string; IsDirectory: boolean }[];
        return files.some(f => !f.IsDirectory) ? slug : null;
      }));
      const filtered = results.filter((slug): slug is string => slug !== null);
      return res.json({ slugs: filtered, links: filtered.map(s => `/media/${s}`) });
    }

    res.json({ slugs, links: slugs.map((s) => `/media/${s}`) });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/album/:slug/report-error — trimite email admin când un client nu poate vedea pozele sau albumul e lent
router.post("/:slug/report-error", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { photosCount, errorMessage, pageUrl, userAgent, timestamp } = req.body as {
      photosCount?: number;
      errorMessage?: string;
      pageUrl?: string;
      userAgent?: string;
      timestamp?: string;
    };

    const ip = getClientIp(req);
    const ipInfo = await fetchIpInfo(ip).catch(() => null);
    const location = [ipInfo?.city, ipInfo?.region, ipInfo?.country].filter(Boolean).join(", ") || "—";

    const isSlowLoad = errorMessage?.includes("8 secunde");
    const subject = isSlowLoad
      ? `🐢 Album lent (>8s) — /${slug}`
      : `⚠️ Eroare album: clientă nu vede pozele — /${slug}`;
    const headerColor = isSlowLoad ? "#d97706" : "#dc2626";
    const headerText = isSlowLoad ? "🐢 Încărcare lentă album" : "⚠️ Eroare vizualizare album";
    const subText = isSlowLoad
      ? "Un vizitator a așteptat mai mult de 8 secunde să se încarce albumul."
      : "Un vizitator nu a putut vedea pozele din album.";

    await sendEmail({
      to: ADMIN_EMAIL,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="color:${headerColor};margin:0 0 8px;">${headerText}</h2>
          <p style="color:#666;font-size:13px;margin:0 0 20px;">${subText}</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:7px 0;color:#888;width:140px;">Album</td><td style="color:#111;font-weight:600;">/${slug}</td></tr>
            ${!isSlowLoad ? `<tr><td style="padding:7px 0;color:#888;">Poze pe server</td><td style="color:#111;">${photosCount ?? "necunoscut"}</td></tr>` : ""}
            <tr><td style="padding:7px 0;color:#888;">Problemă</td><td style="color:${headerColor};">${errorMessage ?? "Imagini inaccesibile"}</td></tr>
            <tr><td style="padding:7px 0;color:#888;">URL</td><td style="color:#4f46e5;word-break:break-all;">${pageUrl ?? "—"}</td></tr>
            <tr><td style="padding:7px 0;color:#888;">Locație IP</td><td style="color:#111;">${location}</td></tr>
            <tr><td style="padding:7px 0;color:#888;">IP</td><td style="color:#999;font-size:11px;">${ip}</td></tr>
            <tr><td style="padding:7px 0;color:#888;">Device</td><td style="color:#555;font-size:11px;word-break:break-all;">${(userAgent ?? "—").slice(0, 120)}</td></tr>
            <tr><td style="padding:7px 0;color:#888;">Ora</td><td style="color:#111;">${timestamp ?? new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</td></tr>
          </table>
          ${isSlowLoad
            ? `<div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;">
                <p style="color:#92400e;font-size:12px;margin:0;">Verifică serverul / Bunny CDN. Albumul poate fi prea mare sau conexiunea clientei e slabă.</p>
               </div>`
            : `<div style="margin-top:20px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
                <p style="color:#991b1b;font-size:12px;margin:0;">Verifică folderul Bunny: <strong>${slug}/photos_preview/</strong> și <strong>${slug}/photos/</strong></p>
               </div>`
          }
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[album] report-error failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

router.get("/:slug", getAlbum);
router.get("/:slug/stats", getAlbumStats);
router.get("/:slug/retention", async (req: Request, res: Response) => {
  try {
    const retention = await getAlbumRetentionBySlug(req.params.slug);
    if (!retention) {
      res.status(404).json({ error: "Retention not found" });
      return;
    }
    res.json(retention);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/:slug/download-selected", express.urlencoded({ extended: false }), downloadSelectedPhotos);
router.post("/:slug/print-selection", express.json(), postPrintSelection);
router.post("/:slug/download-all", downloadAll);
router.post("/:slug/delete-photo", express.json(), deletePhoto);
router.post("/:slug/download-print-dynamic", downloadPrintDynamic);
router.post("/:slug/delivery-address", express.json(), addDeliveryAddress);
router.get("/:slug/delivery-address", getDeliveryAddress);
router.post("/:slug/swisslink", express.json(), addSwissLink);

router.get("/:slug/qr-moments", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { buildBunnyDirectoryUrl, getBunnyStorageKey, BUNNY_ACCESS_KEY_HEADER, BUNNY_QR_MOMENT_FOLDER } = await import("../constants/bunny");
    const { signBunnyUrl } = await import("../utils/signBunnyUrl");

    const storageKey = getBunnyStorageKey();

    // QR moments are stored directly under {slug}/qr-moment/{type}/
    const listFolder = async (type: string): Promise<string[]> => {
      const url = buildBunnyDirectoryUrl(slug, BUNNY_QR_MOMENT_FOLDER, type);
      const response = await fetch(url, { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey } });
      if (!response.ok) return [];
      const entries = await response.json() as { ObjectName: string; IsDirectory?: boolean }[];
      return entries
        .filter((e) => !e.IsDirectory)
        .map((e) => signBunnyUrl(`/${slug}/${BUNNY_QR_MOMENT_FOLDER}/${type}/${e.ObjectName}`));
    };

    const [photos, videos, audio] = await Promise.all([
      listFolder("photo"),
      listFolder("video"),
      listFolder("audio"),
    ]);

    let eventSlug: string | null = null;
    let galleryUrl: string | null = null;

    const adminEventSnapshot = await firestore()
      .collection("adminEvents")
      .where("albumSlug", "==", slug)
      .limit(1)
      .get();

    if (!adminEventSnapshot.empty) {
      const adminEventId = adminEventSnapshot.docs[0].id;
      const qrEventSnapshot = await firestore()
        .collection("qr_events")
        .where("adminEventId", "==", adminEventId)
        .limit(1)
        .get();

      if (!qrEventSnapshot.empty) {
        const qrEventDoc = qrEventSnapshot.docs[0];
        const qrEventData = qrEventDoc.data();
        eventSlug = (qrEventData.eventSlug as string | undefined) ?? qrEventDoc.id;
        const pin = qrEventData.pin as string | undefined;
        if (eventSlug && pin) {
          galleryUrl = `/qr-moments/${eventSlug}/gallery?pin=${encodeURIComponent(pin)}`;
        }
      }
    }

    res.json({ photos, videos, audio, eventSlug, galleryUrl });
  } catch (error) {
    console.error("[album] qr-moments failed:", error);
    res.status(500).json({ error: "Failed to load QR moments" });
  }
});

// GET /api/album/:slug/photobooth — photos uploaded to {slug}/photobooth/ (from the photo booth)
router.get("/:slug/photobooth", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { buildBunnyDirectoryUrl, getBunnyStorageKey, BUNNY_ACCESS_KEY_HEADER, BUNNY_IMAGE_FILE_PATTERN } = await import("../constants/bunny");
    const { signBunnyUrl } = await import("../utils/signBunnyUrl");

    const url = buildBunnyDirectoryUrl(slug, "photobooth");
    const response = await fetch(url, { headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() } });

    if (!response.ok) {
      res.json({ photos: [], galleryUrl: null });
      return;
    }

    const entries = await response.json() as { ObjectName: string; IsDirectory?: boolean }[];
    const photos = entries
      .filter((e) => !e.IsDirectory && BUNNY_IMAGE_FILE_PATTERN.test(e.ObjectName))
      .map((e) => signBunnyUrl(`/${slug}/photobooth/${e.ObjectName}`));

    res.json({
      photos,
      galleryUrl: photos.length > 0 ? `/fotocabina/${slug}/galerie` : null,
    });
  } catch (error) {
    console.error("[album] photobooth failed:", error);
    res.status(500).json({ error: "Failed to load photobooth photos" });
  }
});

router.post("/:slug/consent", express.json(), async (req: Request, res: Response) => {
  try {
    // Notificarea pe email a fost dezactivată la cerere; doar confirmăm succesul către client
    res.json({ ok: true });
  } catch (error) {
    console.error("[album] consent failed:", error);
    res.status(500).json({ error: "consent failed" });
  }
});

export default router;
