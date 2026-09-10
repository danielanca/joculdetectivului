import { Router, type Request, type Response } from "express";
import multer from "multer";
import { FieldValue } from "firebase-admin/firestore";
import { requireFirebaseAuth, requireSupremeAdmin } from "../middleware/requireFirebaseAuth";
import { firestore } from "../firestore";
import { getBunnyStorageKey, buildBunnyStorageUrl, BUNNY_ACCESS_KEY_HEADER } from "../constants/bunny";
import { getNotificationSettings } from "../services/activity.service";
import { sendOfferViewNotification } from "../notifications/offerViewNotification";

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const COLLECTION = "campaignPages";

function bunnyPublicUrl(path: string): string {
  return `${process.env.BUNNY_CDN_DOMAIN ?? ""}/${path}`;
}

async function uploadToBunny(buffer: Buffer, bunnyPath: string, contentType: string): Promise<void> {
  const response = await fetch(buildBunnyStorageUrl(bunnyPath), {
    method: "PUT",
    headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey(), "Content-Type": contentType },
    body: buffer,
  });
  if (!response.ok) throw new Error(`Bunny upload failed: ${response.status} ${await response.text()}`);
}

async function deleteFromBunny(bunnyPath: string): Promise<void> {
  await fetch(buildBunnyStorageUrl(bunnyPath), {
    method: "DELETE",
    headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() },
  });
}

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

router.get("/public/:slug", async (req: Request, res: Response) => {
  try {
    const doc = await firestore().collection(COLLECTION).doc(req.params.slug).get();
    if (!doc.exists) { res.status(404).json({ error: "Not found" }); return; }
    const data = doc.data()!;
    if (!data.active) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ slug: doc.id, ...data });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/campaign/:slug/view — track a real visitor view
router.post("/:slug/view", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const ua = String(req.headers["user-agent"] ?? "").toLowerCase();
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "");
    const adminCookie = String(req.headers.cookie ?? "").includes("av_admin=1");

    // Filter bots
    const botPattern = /bot|spider|crawl|wget|curl|python|headless|selenium|puppeteer|lighthouse|googlebot|bingbot|yandex|semrush|ahref|facebookexternalhit|slackbot/;
    if (botPattern.test(ua) || !ua) { res.status(204).send(); return; }

    // Filter localhost
    const normalizedIp = ip.startsWith("::ffff:") ? ip.slice(7) : ip.split(",")[0].trim();
    if (normalizedIp === "127.0.0.1" || normalizedIp === "::1" || normalizedIp === "localhost") {
      res.status(204).send(); return;
    }

    // Filter admins
    if (adminCookie) { res.status(204).send(); return; }

    const db = firestore();
    const doc = await db.collection(COLLECTION).doc(slug).get();
    if (!doc.exists) { res.status(404).send(); return; }

    const campaign = doc.data() ?? {};
    const newCount = (campaign.viewCount ?? 0) + 1;
    await doc.ref.update({ viewCount: newCount });

    const body = req.body as { pageUrl?: unknown; referrer?: unknown };
    const settings = await getNotificationSettings().catch(() => null);
    if (settings?.email.offerViewed ?? true) {
      await sendOfferViewNotification({
        kind: "campaign",
        slug,
        viewCount: newCount,
        request: req,
        title: campaign.title,
        pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : undefined,
        referrer: typeof body.referrer === "string" ? body.referrer : undefined,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/campaign/:slug/interaction — landing interaction signal.
// No longer emails: "formular început" / "acțiune formular" / "spinner" were pure
// noise (one date-check produced 3+ mails). These interactions are visible in the
// live panel (form_started) — the owner only wants email for a page view, an
// availability check, and a real contact lead. Kept as a 200 no-op so the client
// call (which ignores the response) doesn't error in the console.
router.post("/:slug/interaction", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// POST /api/campaign/:slug/contact — form submission from landing page
router.post("/:slug/contact", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { name, phone, eventDate, eventType, location, message } = req.body as {
      name?: string; phone?: string; eventDate?: string; eventType?: string; location?: string; message?: string;
    };
    if (!name || !phone) { res.status(400).json({ error: "Nume și telefon sunt obligatorii." }); return; }

    const doc = await firestore().collection(COLLECTION).doc(slug).get();
    const pageTitle = doc.exists ? (doc.data()?.title ?? slug) : slug;

    const { sendEmail } = await import("../notifications/mailer.js");
    const { adminUser } = await import("../constants/credentials.js");

    await sendEmail({
      to: adminUser.email,
      subject: `📩 Cerere nouă de pe landing "${pageTitle}"`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#111;margin:0 0 20px;">Cerere nouă — ${pageTitle}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#666;width:120px;">Nume</td><td style="color:#111;font-weight:600;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Telefon</td><td style="color:#111;font-weight:600;">${phone}</td></tr>
            ${eventType ? `<tr><td style="padding:8px 0;color:#666;">Tip eveniment</td><td style="color:#111;">${eventType}</td></tr>` : ""}
            ${eventDate ? `<tr><td style="padding:8px 0;color:#666;">Dată eveniment</td><td style="color:#111;">${eventDate}</td></tr>` : ""}
            ${location ? `<tr><td style="padding:8px 0;color:#666;">Localitate</td><td style="color:#111;">${location}</td></tr>` : ""}
            ${message ? `<tr><td style="padding:8px 0;color:#666;">Mesaj</td><td style="color:#111;">${message}</td></tr>` : ""}
            <tr><td style="padding:8px 0;color:#666;">Landing</td><td style="color:#6d28d9;">/oferta/${slug}</td></tr>
          </table>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[campaign] POST /:slug/contact failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// ─── ADMIN: CRUD ──────────────────────────────────────────────────────────────

router.get("/", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore().collection(COLLECTION).orderBy("createdAt", "desc").get();
    const pages = snapshot.docs.map((doc) => ({ slug: doc.id, ...doc.data() }));
    res.json({ pages });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { slug, title, subtitle } = req.body as { slug: string; title: string; subtitle: string };
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "Slug invalid (folosiți doar litere mici, cifre și liniuțe)" });
      return;
    }
    const db = firestore();
    const existing = await db.collection(COLLECTION).doc(slug).get();
    if (existing.exists) { res.status(409).json({ error: "Slug-ul există deja" }); return; }
    await db.collection(COLLECTION).doc(slug).set({
      slug,
      title: title ?? "",
      subtitle: subtitle ?? "",
      ctaText: "Contactează-ne",
      whatsappNumber: "+40745469907",
      phoneNumber: "+40745469907",
      heroImageUrl: "",
      heroImageBunnyPath: "",
      heroVideoUrl: "",
      heroVideoBunnyPath: "",
      gallery: [],
      packages: [],
      testimonials: [],
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ slug });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── TEMPLATES ───────────────────────────────────────────────────────────────

const TEMPLATES_COLLECTION = "campaignTemplates";

router.get("/templates", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const snap = await firestore().collection(TEMPLATES_COLLECTION).orderBy("createdAt", "desc").get();
    res.json({ templates: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/templates", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { name, ...pageData } = req.body as { name: string; [key: string]: unknown };
    if (!name?.toString().trim()) { res.status(400).json({ error: "Numele template-ului este obligatoriu." }); return; }
    const ref = await firestore().collection(TEMPLATES_COLLECTION).add({
      name: name.toString().trim(),
      ...pageData,
      createdAt: new Date().toISOString(),
    });
    res.json({ id: ref.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.delete("/templates/:id", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    await firestore().collection(TEMPLATES_COLLECTION).doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/campaign/from-template/:id — create campaign from template
router.post("/from-template/:id", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { slug } = req.body as { slug: string };
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "Slug invalid (litere mici, cifre, liniuțe)" }); return;
    }
    const db = firestore();
    if ((await db.collection(COLLECTION).doc(slug).get()).exists) {
      res.status(409).json({ error: "Slug-ul există deja" }); return;
    }
    const templateDoc = await db.collection(TEMPLATES_COLLECTION).doc(req.params.id).get();
    if (!templateDoc.exists) { res.status(404).json({ error: "Template inexistent" }); return; }
    const { name: _name, id: _id, ...templateData } = templateDoc.data() as Record<string, unknown>;
    await db.collection(COLLECTION).doc(slug).set({
      ...templateData,
      slug,
      active: false,
      viewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ slug });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/campaign/:slug/duplicate — duplicate an existing campaign
router.post("/:slug/duplicate", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { newSlug } = req.body as { newSlug: string };
    if (!newSlug || !/^[a-z0-9-]+$/.test(newSlug)) {
      res.status(400).json({ error: "Slug invalid" }); return;
    }
    const db = firestore();
    if ((await db.collection(COLLECTION).doc(newSlug).get()).exists) {
      res.status(409).json({ error: "Slug-ul există deja" }); return;
    }
    const source = await db.collection(COLLECTION).doc(req.params.slug).get();
    if (!source.exists) { res.status(404).json({ error: "Campania sursă nu există" }); return; }
    const { slug: _s, viewCount: _v, ...sourceData } = source.data() as Record<string, unknown>;
    await db.collection(COLLECTION).doc(newSlug).set({
      ...sourceData,
      slug: newSlug,
      active: false,
      viewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ slug: newSlug });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.put("/:slug", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    await firestore().collection(COLLECTION).doc(req.params.slug).update({
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.delete("/:slug", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    await firestore().collection(COLLECTION).doc(req.params.slug).delete();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── HERO IMAGE / VIDEO ───────────────────────────────────────────────────────

router.post(
  "/:slug/hero-image",
  requireFirebaseAuth,
  requireSupremeAdmin,
  imageUpload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Lipsește fișierul" }); return; }
    try {
      const safeFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const bunnyPath = `campaigns/${req.params.slug}/hero-${safeFileName}`;
      await uploadToBunny(file.buffer, bunnyPath, file.mimetype);
      const url = bunnyPublicUrl(bunnyPath);
      await firestore().collection(COLLECTION).doc(req.params.slug).update({
        heroImageUrl: url,
        heroImageBunnyPath: bunnyPath,
        updatedAt: new Date().toISOString(),
      });
      res.json({ url });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }
);

router.post(
  "/:slug/hero-video",
  requireFirebaseAuth,
  requireSupremeAdmin,
  videoUpload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Lipsește fișierul" }); return; }
    try {
      const bunnyPath = `campaigns/${req.params.slug}/hero.mp4`;
      await uploadToBunny(file.buffer, bunnyPath, "video/mp4");
      const url = bunnyPublicUrl(bunnyPath);
      await firestore().collection(COLLECTION).doc(req.params.slug).update({
        heroVideoUrl: url,
        heroVideoBunnyPath: bunnyPath,
        updatedAt: new Date().toISOString(),
      });
      res.json({ url });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }
);

// ─── BUNNY STREAM VIDEOS (read-only picker) ───────────────────────────────────

router.get("/stream-videos", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
    const apiKey = process.env.BUNNY_STREAM_API_KEY ?? "";
    if (!libraryId || !apiKey) {
      res.status(500).json({ error: "Bunny Stream not configured (BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY missing)" });
      return;
    }
    const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos?page=1&itemsPerPage=100&orderBy=date`, {
      headers: { AccessKey: apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
      res.status(502).json({ error: `Bunny Stream error: ${response.status}` });
      return;
    }
    const data = await response.json() as { items: Array<{ guid: string; title: string; thumbnailFileName: string; length: number }> };
    const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME || `vz-${libraryId}.b-cdn.net`;
    const videos = data.items.map((video) => ({
      guid: video.guid,
      title: video.title,
      thumbnailUrl: `https://${cdnHostname}/${video.guid}/${video.thumbnailFileName || "thumbnail.jpg"}`,
      embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${video.guid}`,
      length: video.length,
    }));
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── GALLERY ─────────────────────────────────────────────────────────────────

router.post(
  "/:slug/gallery",
  requireFirebaseAuth,
  requireSupremeAdmin,
  imageUpload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Lipsește fișierul" }); return; }
    try {
      const safeFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const bunnyPath = `campaigns/${req.params.slug}/gallery/${safeFileName}`;
      await uploadToBunny(file.buffer, bunnyPath, file.mimetype);
      const url = bunnyPublicUrl(bunnyPath);
      await firestore().collection(COLLECTION).doc(req.params.slug).update({
        gallery: FieldValue.arrayUnion({ url, bunnyPath }),
        updatedAt: new Date().toISOString(),
      });
      res.json({ url, bunnyPath });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }
);

router.delete("/:slug/gallery", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { url, bunnyPath } = req.body as { url: string; bunnyPath: string };
    const db = firestore();
    const doc = await db.collection(COLLECTION).doc(req.params.slug).get();
    if (!doc.exists) { res.status(404).json({ error: "Not found" }); return; }
    const data = doc.data() as { gallery: Array<{ url: string; bunnyPath: string }> };
    const newGallery = data.gallery.filter((item) => item.url !== url);
    await db.collection(COLLECTION).doc(req.params.slug).update({
      gallery: newGallery,
      updatedAt: new Date().toISOString(),
    });
    if (bunnyPath) await deleteFromBunny(bunnyPath).catch(() => {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── PACKAGES ────────────────────────────────────────────────────────────────

router.post("/:slug/packages", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const packageItem = { id: Date.now().toString(), ...req.body };
    await firestore().collection(COLLECTION).doc(req.params.slug).update({
      packages: FieldValue.arrayUnion(packageItem),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ id: packageItem.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.put("/:slug/packages", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const doc = await db.collection(COLLECTION).doc(req.params.slug).get();
    if (!doc.exists) { res.status(404).json({ error: "Not found" }); return; }
    const data = doc.data() as { packages: Array<Record<string, unknown>> };
    const updatedPackages = data.packages.map((pkg) =>
      pkg.id === req.body.id ? { ...pkg, ...req.body } : pkg
    );
    await db.collection(COLLECTION).doc(req.params.slug).update({
      packages: updatedPackages,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.delete("/:slug/packages/:packageId", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const doc = await db.collection(COLLECTION).doc(req.params.slug).get();
    if (!doc.exists) { res.status(404).json({ error: "Not found" }); return; }
    const data = doc.data() as { packages: Array<{ id: string }> };
    const newPackages = data.packages.filter((pkg) => pkg.id !== req.params.packageId);
    await db.collection(COLLECTION).doc(req.params.slug).update({
      packages: newPackages,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────

router.post("/:slug/testimonials", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const testimonial = { id: Date.now().toString(), ...req.body };
    await firestore().collection(COLLECTION).doc(req.params.slug).update({
      testimonials: FieldValue.arrayUnion(testimonial),
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ id: testimonial.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.delete("/:slug/testimonials/:testimonialId", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const doc = await db.collection(COLLECTION).doc(req.params.slug).get();
    if (!doc.exists) { res.status(404).json({ error: "Not found" }); return; }
    const data = doc.data() as { testimonials: Array<{ id: string }> };
    const newTestimonials = data.testimonials.filter((item) => item.id !== req.params.testimonialId);
    await db.collection(COLLECTION).doc(req.params.slug).update({
      testimonials: newTestimonials,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
