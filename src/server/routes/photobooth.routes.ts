import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { firestore } from "../firestore";
import { Timestamp } from "firebase-admin/firestore";
import { sendEmail } from "../notifications/mailer";
import { sendSms, normalizeRomanianPhoneNumber, isSmsConfigured } from "../notifications/sms";
import { requireFirebaseAuth, requireSupremeAdmin } from "../middleware/requireFirebaseAuth";
import QRCode from "qrcode";
import {
  BUNNY_ACCESS_KEY_HEADER,
  BUNNY_IMAGE_FILE_PATTERN,
  buildBunnyDirectoryUrl,
  getBunnyStoragePassword,
} from "../constants/bunny";

const router = Router();

const PHOTOBOOTH_COLLECTION = "photobooth_guests";
const PHOTOBOOTH_SHARES_COLLECTION = "photobooth_shares";
const ADMIN_EVENTS_COLLECTION = "adminEvents";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://ancavisuals.ro";

interface PhotoboothGuest {
  name: string;
  email: string | null;
  phone: string | null;
  gdprConsent: boolean;
  timestamp: Timestamp;
  notified: boolean;
  notifiedAt: Timestamp | null;
}

function buildPhotoboothCdnBase(albumSlug: string): string {
  const cdnDomain = (process.env.BUNNY_CDN_DOMAIN ?? "").replace(/\/$/, "");
  return `${cdnDomain}/${albumSlug}/photobooth`;
}

function buildPhotoboothGalleryUrl(albumSlug: string): string {
  return `${APP_BASE_URL}/fotocabina/${albumSlug}/galerie`;
}

function buildPhotoboothRegistrationUrl(albumSlug: string): string {
  return `${APP_BASE_URL}/fotocabina/${albumSlug}`;
}

function buildEmailHtml(guestName: string, galleryUrl: string): string {
  return `
    <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
      <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">Fotocabina AncaVisuals</p>
        <h2 style="color:#241f1a;margin:0 0 6px;font-size:24px;font-weight:600;">Bună, ${guestName}!</h2>
        <p style="color:#6b5b4d;margin:0 0 18px;line-height:1.6;">
          Pozele de la fotocabina AncaVisuals sunt gata. Intră în galerie, caută-le pe ale tale și le poți descărca direct.
        </p>
        <a href="${galleryUrl}" style="display:inline-block;background:#e0a13b;color:#241f1a;padding:13px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;">
          Deschide galeria foto →
        </a>
        <p style="color:#7b6a5a;font-size:12px;margin:24px 0 0;line-height:1.5;">
          AncaVisuals · <a href="https://ancavisuals.ro" style="color:#8c5a16;text-decoration:none;">ancavisuals.ro</a>
        </p>
      </div>
    </div>
  `;
}

function buildSmsBody(guestName: string, galleryUrl: string): string {
  return `Bună ${guestName}! Pozele de la fotocabina AncaVisuals sunt gata: ${galleryUrl} - AncaVisuals`;
}

interface BunnyFileEntry {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
}

async function listPhotoboothFiles(albumSlug: string): Promise<string[]> {
  const accessKey = getBunnyStoragePassword();
  if (!accessKey) return [];
  const listUrl = buildBunnyDirectoryUrl(albumSlug, "photobooth");
  try {
    const response = await fetch(listUrl, {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: accessKey },
    });
    if (!response.ok) return [];
    const entries = (await response.json()) as BunnyFileEntry[];
    const cdnBase = buildPhotoboothCdnBase(albumSlug);
    return entries
      .filter((entry) => !entry.IsDirectory && BUNNY_IMAGE_FILE_PATTERN.test(entry.ObjectName))
      .map((entry) => `${cdnBase}/${entry.ObjectName}`);
  } catch {
    return [];
  }
}

router.post("/:eventId/register", async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { name, email, phone, gdprConsent } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      gdprConsent?: boolean;
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Numele este obligatoriu." });
      return;
    }

    if (!gdprConsent) {
      res.status(400).json({ error: "Consimțământul GDPR este obligatoriu." });
      return;
    }

    const hasEmail = typeof email === "string" && email.trim().length > 0;
    const hasPhone = typeof phone === "string" && phone.trim().length > 0;

    if (!hasEmail && !hasPhone) {
      res.status(400).json({ error: "Completează cel puțin un email sau un număr de telefon." });
      return;
    }

    const db = firestore();
    const guestData: PhotoboothGuest = {
      name: name.trim(),
      email: hasEmail ? email!.trim() : null,
      phone: hasPhone ? phone!.trim() : null,
      gdprConsent: true,
      timestamp: Timestamp.now(),
      notified: false,
      notifiedAt: null,
    };

    const guestRef = await db
      .collection(PHOTOBOOTH_COLLECTION)
      .doc(eventId)
      .collection("guests")
      .add(guestData);

    res.json({ ok: true, guestId: guestRef.id });
  } catch (error) {
    console.error("[photobooth] register failed:", error);
    res.status(500).json({ error: "Eroare la înregistrare." });
  }
});

router.get("/:eventId/guests", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const db = firestore();

    const snapshot = await db
      .collection(PHOTOBOOTH_COLLECTION)
      .doc(eventId)
      .collection("guests")
      .orderBy("timestamp", "desc")
      .get();

    const guests = snapshot.docs.map((doc) => {
      const data = doc.data() as PhotoboothGuest;
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        gdprConsent: data.gdprConsent,
        notified: data.notified,
        timestamp: data.timestamp?.toDate().toISOString() ?? null,
        notifiedAt: data.notifiedAt?.toDate().toISOString() ?? null,
      };
    });

    res.json({ guests });
  } catch (error) {
    console.error("[photobooth] guests fetch failed:", error);
    res.status(500).json({ error: "Eroare la listarea guesturilor." });
  }
});

router.post("/:eventId/notify", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const db = firestore();

    const eventDoc = await db.collection(ADMIN_EVENTS_COLLECTION).doc(eventId).get();
    if (!eventDoc.exists) {
      res.status(404).json({ error: "Evenimentul nu a fost găsit." });
      return;
    }

    const albumSlug = eventDoc.data()?.albumSlug as string | undefined;
    if (!albumSlug) {
      res.status(400).json({ error: "Evenimentul nu are un album slug setat." });
      return;
    }

    const photoLink = buildPhotoboothGalleryUrl(albumSlug);

    const guestsSnapshot = await db
      .collection(PHOTOBOOTH_COLLECTION)
      .doc(eventId)
      .collection("guests")
      .where("notified", "==", false)
      .get();

    if (guestsSnapshot.empty) {
      res.json({ sent: 0, message: "Toți guestii au fost deja notificați." });
      return;
    }

    let emailsSent = 0;
    let smsSent = 0;
    let errors = 0;
    const batch = db.batch();
    const notifiedAt = Timestamp.now();

    for (const guestDoc of guestsSnapshot.docs) {
      const guest = guestDoc.data() as PhotoboothGuest;

      if (guest.email) {
        try {
          await sendEmail({
            to: guest.email,
            subject: "📸 Pozele tale de la AncaVisuals sunt gata!",
            html: buildEmailHtml(guest.name, photoLink),
          });
          emailsSent++;
        } catch (emailError) {
          console.error(`[photobooth] email failed for ${guest.email}:`, emailError);
          errors++;
        }
      }

      if (guest.phone && isSmsConfigured()) {
        const normalizedPhone = normalizeRomanianPhoneNumber(guest.phone);
        if (normalizedPhone) {
          try {
            await sendSms({ to: normalizedPhone, body: buildSmsBody(guest.name, photoLink) });
            smsSent++;
          } catch (smsError) {
            console.error(`[photobooth] SMS failed for ${guest.phone}:`, smsError);
            errors++;
          }
        }
      }

      batch.update(guestDoc.ref, { notified: true, notifiedAt });
    }

    await batch.commit();

    res.json({ sent: guestsSnapshot.size, emailsSent, smsSent, errors });
  } catch (error) {
    console.error("[photobooth] notify failed:", error);
    res.status(500).json({ error: "Eroare la trimiterea notificărilor." });
  }
});

// GET /api/photobooth/by-slug/:slug — public, resolves albumSlug → eventId + event info
router.get("/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug?.trim()) { res.status(400).json({ error: "Slug invalid." }); return; }
    const db = firestore();
    const snap = await db.collection(ADMIN_EVENTS_COLLECTION).where("albumSlug", "==", slug.trim()).limit(1).get();
    if (snap.empty) { res.status(404).json({ error: "Evenimentul nu a fost găsit." }); return; }
    const doc = snap.docs[0];
    const data = doc.data();
    res.json({
      eventId: doc.id,
      eventType: data.type ?? null,
      eventDate: data.eventDate ?? null,
    });
  } catch (error) {
    console.error("[photobooth] by-slug failed:", error);
    res.status(500).json({ error: "Eroare server." });
  }
});

// GET /api/photobooth/by-slug/:slug/files — public, lists images from Bunny photobooth folder
router.get("/by-slug/:slug/files", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug?.trim()) { res.status(400).json({ error: "Slug invalid." }); return; }
    const urls = await listPhotoboothFiles(slug.trim());
    res.json({ urls, count: urls.length });
  } catch (error) {
    console.error("[photobooth] files listing failed:", error);
    res.status(500).json({ error: "Eroare server." });
  }
});

// POST /api/photobooth/by-slug/:slug/share — public, creates (or reuses) a hashed share link
// that lets the couple share only the photobooth photos without exposing the event slug.
router.post("/by-slug/:slug/share", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug?.trim();
    if (!slug) { res.status(400).json({ error: "Slug invalid." }); return; }

    const db = firestore();
    const eventSnap = await db.collection(ADMIN_EVENTS_COLLECTION).where("albumSlug", "==", slug).limit(1).get();
    if (eventSnap.empty) { res.status(404).json({ error: "Galeria nu a fost găsită." }); return; }

    const existing = await db.collection(PHOTOBOOTH_SHARES_COLLECTION).where("slug", "==", slug).limit(1).get();
    if (!existing.empty) {
      const shareId = existing.docs[0].id;
      res.json({ shareId, path: `/galerie-fotocabina/${shareId}` });
      return;
    }

    const shareId = crypto.randomBytes(9).toString("hex");
    await db.collection(PHOTOBOOTH_SHARES_COLLECTION).doc(shareId).set({
      slug,
      createdAt: Timestamp.now(),
    });

    res.json({ shareId, path: `/galerie-fotocabina/${shareId}` });
  } catch (error) {
    console.error("[photobooth] share create failed:", error);
    res.status(500).json({ error: "Eroare server." });
  }
});

// GET /api/photobooth/share/:shareId/files — public, resolves the hashed share id → photobooth images
router.get("/share/:shareId/files", async (req: Request, res: Response) => {
  try {
    const shareId = req.params.shareId?.trim();
    if (!shareId) { res.status(400).json({ error: "Link invalid." }); return; }

    const doc = await firestore().collection(PHOTOBOOTH_SHARES_COLLECTION).doc(shareId).get();
    if (!doc.exists) { res.status(404).json({ error: "Linkul nu a fost găsit." }); return; }

    const slug = doc.data()?.slug as string | undefined;
    if (!slug) { res.status(404).json({ error: "Linkul nu a fost găsit." }); return; }

    const urls = await listPhotoboothFiles(slug);
    res.json({ urls, count: urls.length });
  } catch (error) {
    console.error("[photobooth] share files listing failed:", error);
    res.status(500).json({ error: "Eroare server." });
  }
});

router.get("/:eventId/qr", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const db = firestore();
    const eventDoc = await db.collection(ADMIN_EVENTS_COLLECTION).doc(eventId).get();
    const albumSlug = eventDoc.data()?.albumSlug as string | undefined;
    const registrationUrl = buildPhotoboothRegistrationUrl(albumSlug ?? eventId);

    const qrPngBuffer = await QRCode.toBuffer(registrationUrl, {
      type: "png",
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="fotocabina-qr-${albumSlug ?? eventId}.png"`,
      "Cache-Control": "no-store",
    });
    res.end(qrPngBuffer);
  } catch (error) {
    console.error("[photobooth] qr generation failed:", error);
    res.status(500).json({ error: "Eroare la generarea QR code." });
  }
});

export default router;
