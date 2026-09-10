import type { Request, Response } from "express";
import { Router } from "express";
import { firestore } from "../firestore";
import { Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import nodeFetch from "node-fetch";
import https from "node:https";
import { buildBunnyStorageUrl, buildBunnyDirectoryUrl, getBunnyStorageKey, BUNNY_ACCESS_KEY_HEADER, BUNNY_PHOTOS_FOLDER, BUNNY_QR_MOMENT_FOLDER } from "../constants/bunny";
import { requireFirebaseAuth, requireSupremeAdmin } from "../middleware/requireFirebaseAuth";
import sharp from "sharp";
import { invalidateAlbumCache } from "../services/album.service.js";
import {
  createJob, getJob, getAllJobs, serializeJob,
  appendJobLog, setJobProgress, finishJob, errorJob,
} from "../services/albumProcessingJobs.js";

const bunnyAgent = new https.Agent({ rejectUnauthorized: false });

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const backupProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Photobooth gallery photos — larger cap, many files per request.
const photoboothUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const PHOTOBOOTH_IMAGE_EXT = /\.(jpg|jpeg|png|webp)$/i;

type LeadEventTypeGuess = "Nuntă" | "Botez" | "Cununie civilă" | "Logodnă" | "Aniversare" | "Altele" | null;

function sanitizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[^\d+]/g, "");
  const hasEnoughDigits = compact.replace(/\D/g, "").length >= 7;
  return hasEnoughDigits ? compact : null;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function sanitizeEventTypeGuess(value: unknown): LeadEventTypeGuess {
  const allowed: Exclude<LeadEventTypeGuess, null>[] = ["Nuntă", "Botez", "Cununie civilă", "Logodnă", "Aniversare", "Altele"];
  return typeof value === "string" && allowed.includes(value as Exclude<LeadEventTypeGuess, null>)
    ? (value as Exclude<LeadEventTypeGuess, null>)
    : null;
}

function serializeAdminEvent(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data();
  if (!data) return null;

  const serializeTimestamp = (value: unknown) =>
    value instanceof Timestamp ? value.toDate().toISOString() : (value ?? null);

  return {
    id: doc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    eventDate: serializeTimestamp(data.eventDate),
    eventEndDate: serializeTimestamp(data.eventEndDate),
    postEventBackupConfirmedAt: serializeTimestamp(data.postEventBackupConfirmedAt),
    postEventBackupReminderSentAt: serializeTimestamp(data.postEventBackupReminderSentAt),
    postEventBackupReminderDueAt: serializeTimestamp(data.postEventBackupReminderDueAt),
  };
}

async function getBackupEventWithToken(id: string, token: string) {
  const doc = await firestore().collection("adminEvents").doc(id).get();
  if (!doc.exists) return { status: 404 as const, error: "Evenimentul nu a fost găsit.", doc: null, data: null };

  const data = doc.data()!;
  const expectedToken = typeof data.postEventBackupConfirmationToken === "string"
    ? data.postEventBackupConfirmationToken.trim()
    : "";

  if (!token || !expectedToken || expectedToken !== token) {
    return { status: 403 as const, error: "Link invalid sau expirat.", doc: null, data: null };
  }

  return { status: 200 as const, error: null, doc, data };
}

async function uploadBackupProof(file: Express.Multer.File, eventId: string) {
  const storageKey = process.env.BUNNY_STORAGE_PASSWORD || getBunnyStorageKey();
  const cdnDomain = process.env.BUNNY_CDN_DOMAIN ?? "";

  if (!storageKey || !cdnDomain) {
    throw new Error("Upload proof indisponibil: lipsește configurarea Bunny.");
  }

  const ext = (file.originalname.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const folder = `admin-events/${eventId}/backup-proof`;
  const uploadUrl = buildBunnyStorageUrl(folder, safeFileName);
  const response = await nodeFetch(uploadUrl, {
    method: "PUT",
    headers: {
      [BUNNY_ACCESS_KEY_HEADER]: storageKey,
      "Content-Type": file.mimetype || "application/octet-stream",
    },
    body: file.buffer,
    agent: bunnyAgent,
  });

  if (!response.ok) {
    throw new Error(`Bunny upload failed: ${response.status}`);
  }

  return {
    url: `${cdnDomain.replace(/\/$/, "")}/${folder}/${safeFileName}`,
    name: file.originalname,
  };
}

router.post("/leads/extract-from-image", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string };

  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: "imageBase64 și mediaType sunt obligatorii." });
    return;
  }

  if (!mediaType.startsWith("image/")) {
    res.status(400).json({ error: "Sunt acceptate doar imagini." });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analizezi un screenshot sau o imagine cu text pentru un CRM de lead-uri foto/video.

Extrage DOAR dacă apare clar în imagine:
- numărul de telefon
- numele persoanei
- data evenimentului
- tipul evenimentului, doar dacă este destul de clar

Reguli stricte:
1. Nu inventa și nu deduce agresiv. Dacă nu e clar, pune null.
2. Pentru telefon, extrage cel mai probabil număr principal al persoanei.
3. Pentru nume, extrage doar numele persoanei, nu și text promoțional.
4. Pentru dată, convertește în format YYYY-MM-DD dacă poți identifica rezonabil ziua, luna și anul; altfel null.
5. Pentru tipul evenimentului, folosește doar una din: "Nuntă", "Botez", "Cununie civilă", "Logodnă", "Aniversare", "Altele" sau null.
6. Dacă vezi doar indicii slabe pentru "nuntă", dar nu e destul de clar, returnează null.
7. Răspunde DOAR cu JSON valid, fără explicații.

Format:
{
  "phone": "string sau null",
  "fullName": "string sau null",
  "eventDate": "YYYY-MM-DD sau null",
  "eventTypeGuess": "Nuntă | Botez | Cununie civilă | Logodnă | Aniversare | Altele | null"
}`,
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, unknown> : {};

    res.json({
      extracted: {
        phone: sanitizePhone(parsed.phone),
        fullName: sanitizeName(parsed.fullName),
        eventDate: sanitizeDate(parsed.eventDate),
        eventTypeGuess: sanitizeEventTypeGuess(parsed.eventTypeGuess),
      },
    });
  } catch (error) {
    console.error("[adminEvents] POST /leads/extract-from-image failed:", error);
    res.status(500).json({ error: "Nu s-au putut extrage datele din imagine." });
  }
});

// GET /api/admin/events — all events, sorted by eventDate
router.get("/events", async (_req: Request, res: Response) => {
  try {
    const db = firestore();
    const snapshot = await db.collection("adminEvents").orderBy("eventDate", "asc").get();
    const events = snapshot.docs.map(serializeAdminEvent).filter(Boolean);

    res.json({ events });
  } catch (error) {
    console.error("[adminEvents] GET /events failed:", error);
    res.status(500).json({ error: "Nu s-au putut încărca evenimentele." });
  }
});

// POST /api/admin/events — create new event
router.post("/events", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const body = req.body;

    if (!body.type || !body.client?.fullName) {
      return res.status(400).json({ error: "Câmpuri obligatorii lipsă: type, client.fullName" });
    }

    const services: { name: string; price: number }[] = body.services ?? [];
    const servicesTotal = services.reduce((sum, s) => sum + (s.price ?? 0), 0);
    const total = Number(body.pricing?.total) || servicesTotal;
    const advanceAmount = Number(body.pricing?.advanceAmount) || 0;
    const advancePaid = body.pricing?.advancePaid === true;

    const newEvent = {
      type: body.type,
      status: body.status ?? "lead",
      fiscalized: body.fiscalized === true,
      createdAt: Timestamp.now(),
      eventDate: body.eventDate ? Timestamp.fromDate(new Date(body.eventDate)) : null,
      eventEndDate: body.eventEndDate ? Timestamp.fromDate(new Date(body.eventEndDate)) : null,
      ...(body.typeLabel ? { typeLabel: body.typeLabel } : {}),
      client: {
        fullName: body.client.fullName,
        phone: body.client.phone ?? "",
        email: body.client.email ?? "",
      },
      services,
      pricing: {
        total,
        advanceAmount,
        advancePaid,
        remainingAmount: Math.max(0, total - advanceAmount),
      },
      ...(body.contractId ? { contractId: body.contractId } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    };

    const docRef = await db.collection("adminEvents").add(newEvent);
    res.status(201).json({ id: docRef.id });
  } catch (error) {
    console.error("[adminEvents] POST /events failed:", error);
    res.status(500).json({ error: "Nu s-a putut crea evenimentul." });
  }
});

// GET /api/admin/events/:id — fetch single event
router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const snapshot = await firestore().collection("adminEvents").doc(req.params.id).get();
    if (!snapshot.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });
    const data = snapshot.data()!;
    res.json({
      ...data,
      id: snapshot.id,
      eventDate: data.eventDate?.toDate?.()?.toISOString() ?? null,
      eventEndDate: data.eventEndDate?.toDate?.()?.toISOString() ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error("[adminEvents] GET /events/:id failed:", error);
    res.status(500).json({ error: "Nu s-a putut încărca evenimentul." });
  }
});

// PATCH /api/admin/events/:id — update fields
router.patch("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const { id } = req.params;
    const updates = req.body;

    if (updates.eventDate) {
      updates.eventDate = Timestamp.fromDate(new Date(updates.eventDate));
    } else if (updates.eventDate === null) {
      updates.eventDate = null;
    }
    if (updates.eventEndDate) {
      updates.eventEndDate = Timestamp.fromDate(new Date(updates.eventEndDate));
    } else if (updates.eventEndDate === null) {
      updates.eventEndDate = null;
    }

    await db.collection("adminEvents").doc(id).update(updates);
    res.json({ ok: true });
  } catch (error) {
    console.error("[adminEvents] PATCH /events/:id failed:", error);
    res.status(500).json({ error: "Nu s-a putut actualiza evenimentul." });
  }
});

router.post("/events/:id/post-event-backup/confirm-admin", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const { id } = req.params;
    const doc = await db.collection("adminEvents").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Evenimentul nu a fost găsit." });
    }

    await doc.ref.update({
      postEventBackupConfirmedAt: Timestamp.now(),
    });

    res.json({ ok: true, confirmedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[adminEvents] POST /events/:id/post-event-backup/confirm-admin failed:", error);
    res.status(500).json({ error: "Nu s-a putut confirma backup-ul." });
  }
});

router.get("/events/:id/post-event-backup/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    const result = await getBackupEventWithToken(id, token);

    if (result.error || !result.doc || !result.data) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const dateSource = result.data.eventEndDate ?? result.data.eventDate;
    const eventDate = dateSource instanceof Timestamp ? dateSource.toDate().toISOString() : (dateSource ?? null);

    res.json({
      event: {
        id: result.doc.id,
        name: result.data.client?.fullName?.trim() || result.data.typeLabel || result.data.type || "Eveniment",
        eventDate,
        albumSlug: typeof result.data.albumSlug === "string" ? result.data.albumSlug : null,
        confirmedAt: result.data.postEventBackupConfirmedAt instanceof Timestamp
          ? result.data.postEventBackupConfirmedAt.toDate().toISOString()
          : (result.data.postEventBackupConfirmedAt ?? null),
        proofUrl: typeof result.data.postEventBackupProofUrl === "string" ? result.data.postEventBackupProofUrl : null,
        proofName: typeof result.data.postEventBackupProofName === "string" ? result.data.postEventBackupProofName : null,
      },
    });
  } catch (error) {
    console.error("[adminEvents] GET /events/:id/post-event-backup/status failed:", error);
    res.status(500).json({ error: "Nu s-a putut încărca statusul backup-ului." });
  }
});

router.post("/events/:id/post-event-backup/submit", backupProofUpload.single("proof"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
    const result = await getBackupEventWithToken(id, token);

    if (result.error || !result.doc) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const updates: Record<string, unknown> = {
      postEventBackupConfirmedAt: Timestamp.now(),
    };

    if (req.file) {
      const uploadedProof = await uploadBackupProof(req.file, id);
      updates.postEventBackupProofUrl = uploadedProof.url;
      updates.postEventBackupProofName = uploadedProof.name;
    }

    await result.doc.ref.update(updates);

    res.json({
      ok: true,
      confirmedAt: new Date().toISOString(),
      proofUrl: typeof updates.postEventBackupProofUrl === "string" ? updates.postEventBackupProofUrl : null,
      proofName: typeof updates.postEventBackupProofName === "string" ? updates.postEventBackupProofName : null,
    });
  } catch (error) {
    console.error("[adminEvents] POST /events/:id/post-event-backup/submit failed:", error);
    res.status(500).json({ error: "Nu s-a putut salva confirmarea backup-ului." });
  }
});

// Legacy email links now redirect to the interactive site page instead of confirming directly.
router.get("/events/:id/post-event-backup/confirm", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    const result = await getBackupEventWithToken(id, token);

    if (result.error) {
      res.status(result.status).send(result.error);
      return;
    }

    res.redirect(302, `/backup/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error("[adminEvents] GET /events/:id/post-event-backup/confirm failed:", error);
    res.status(500).send("Nu s-a putut deschide pagina de backup.");
  }
});

// DELETE /api/admin/events/:id — permanently delete event
router.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const { id } = req.params;
    await db.collection("adminEvents").doc(id).delete();
    res.json({ ok: true });
  } catch (error) {
    console.error("[adminEvents] DELETE /events/:id failed:", error);
    res.status(500).json({ error: "Nu s-a putut șterge evenimentul." });
  }
});

// GET /api/admin/settings — goals + currency
router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const db = firestore();
    const doc = await db.collection("settings").doc("admin").get();

    if (!doc.exists) {
      // return sensible defaults if the document doesn't exist yet
      const defaults = {
        goals: {
          sixMonths: { targetRevenue: 15000, startDate: "2026-04-01", endDate: "2026-09-30" },
          oneYear: { targetRevenue: 30000, startDate: "2026-01-01", endDate: "2026-12-31" },
        },
        currency: "EUR",
        exchangeRate: 5.0,
        bankDetails: {
          beneficiaryName: "",
          iban: "",
        },
        bankProfiles: [],
      };
      return res.json(defaults);
    }

    res.json(doc.data());
  } catch (error) {
    console.error("[adminEvents] GET /settings failed:", error);
    res.status(500).json({ error: "Nu s-au putut încărca setările." });
  }
});

// PUT /api/admin/settings — save goals
router.put("/settings", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    await db.collection("settings").doc("admin").set(req.body, { merge: true });
    res.json({ ok: true });
  } catch (error) {
    console.error("[adminEvents] PUT /settings failed:", error);
    res.status(500).json({ error: "Nu s-au putut salva setările." });
  }
});

router.get("/ui-state", async (_req: Request, res: Response) => {
  try {
    const db = firestore();
    const doc = await db.collection("settings").doc("adminUIState").get();
    res.json(doc.exists ? doc.data() : {});
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.put("/ui-state", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    await db.collection("settings").doc("adminUIState").set(req.body, { merge: true });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/events/:id/create-album", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { slug, pin } = req.body as { slug: string; pin?: string };

    if (!slug || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).json({ error: "Slug invalid. Folosește doar litere mici, cifre și cratimă." });
    }

    // Check if the folder already exists in Bunny
    const checkUrl = buildBunnyStorageUrl(slug, BUNNY_PHOTOS_FOLDER) + "/";
    const checkRes = await nodeFetch(checkUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() }, agent: bunnyAgent });
    if (checkRes.ok) {
      return res.status(409).json({ error: "Un album cu acest slug există deja în Bunny." });
    }

    // Create folder structure via placeholder files
    const folders = [
      BUNNY_PHOTOS_FOLDER,
      "shortvideo",
      "longvideo",
      "photobooth",
      `${BUNNY_QR_MOMENT_FOLDER}/photo`,
      `${BUNNY_QR_MOMENT_FOLDER}/video`,
      `${BUNNY_QR_MOMENT_FOLDER}/audio`,
    ];
    for (const folder of folders) {
      const placeholderUrl = buildBunnyStorageUrl(slug, folder, ".keep");
      const uploadRes = await nodeFetch(placeholderUrl, {
        method: "PUT",
        headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey(), "Content-Type": "application/octet-stream" },
        body: "",
        agent: bunnyAgent,
      });
      if (!uploadRes.ok) {
        return res.status(500).json({ error: `Bunny upload failed for ${folder}: ${uploadRes.status}` });
      }
    }

    // Save albumSlug and albumPin on the event
    const db = firestore();
    const updates: Record<string, unknown> = { albumSlug: slug };
    if (pin) updates.albumPin = pin;
    await db.collection("adminEvents").doc(id).update(updates);

    res.json({ ok: true, slug, mediaUrl: `/media/${slug}` });
  } catch (error) {
    console.error("[adminEvents] create-album failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

const ALBUM_PHOTO_EXT = /\.(jpe?g|png)$/i;

const sanitizePhotoName = (raw: string): string =>
  raw
    .replace(/^.*[/\\]/, "")            // strip any path
    .replace(/[^a-zA-Z0-9._-]/g, "_")   // keep only safe chars
    .replace(/_{2,}/g, "_")
    .slice(-128);

// POST /api/admin/events/:id/upload-photo?name=<filename>
// Streaming pass-through: originalul curge direct browser → server → Bunny {albumSlug}/photos/,
// fără să fie ținut în RAM. Previzualizarea WebP se generează separat cu process-album.
router.post("/events/:id/upload-photo", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rawName = String((req.query as { name?: string }).name ?? "").trim();
    if (!ALBUM_PHOTO_EXT.test(rawName)) {
      return res.status(400).json({ error: "Doar fișiere JPG sau PNG." });
    }
    const safeName = sanitizePhotoName(rawName);
    if (!ALBUM_PHOTO_EXT.test(safeName)) {
      return res.status(400).json({ error: "Nume de fișier invalid." });
    }

    const db = firestore();
    const doc = await db.collection("adminEvents").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });

    const slug = doc.data()?.albumSlug as string | undefined;
    if (!slug) return res.status(400).json({ error: "Evenimentul nu are un album slug setat." });

    const headers: Record<string, string> = {
      [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey(),
      "Content-Type": "application/octet-stream",
    };
    const contentLength = req.headers["content-length"];
    if (contentLength) headers["Content-Length"] = String(contentLength);

    const bunnyRes = await nodeFetch(buildBunnyStorageUrl(slug, BUNNY_PHOTOS_FOLDER, safeName), {
      method: "PUT",
      headers,
      body: req,
      agent: bunnyAgent,
    });

    if (!bunnyRes.ok) {
      const detail = await bunnyRes.text().catch(() => "");
      console.error(`[adminEvents] upload-photo Bunny ${bunnyRes.status}: ${detail}`);
      return res.status(502).json({ error: `Bunny a respins upload-ul (${bunnyRes.status}).` });
    }

    invalidateAlbumCache(slug);
    res.json({ ok: true, name: safeName });
  } catch (error) {
    console.error("[adminEvents] upload-photo failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/admin/events/:id/photobooth-folder — ensure {albumSlug}/photobooth/ exists in Bunny
router.post("/events/:id/photobooth-folder", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = firestore();
    const doc = await db.collection("adminEvents").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });

    const slug = doc.data()?.albumSlug as string | undefined;
    if (!slug) return res.status(400).json({ error: "Evenimentul nu are un album slug setat." });

    const placeholderUrl = buildBunnyStorageUrl(slug, "photobooth", ".keep");
    const uploadRes = await nodeFetch(placeholderUrl, {
      method: "PUT",
      headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey(), "Content-Type": "application/octet-stream" },
      body: "",
      agent: bunnyAgent,
    });
    if (!uploadRes.ok) {
      return res.status(500).json({ error: `Bunny folder create failed: ${uploadRes.status}` });
    }

    res.json({ ok: true, slug, galleryUrl: `/fotocabina/${slug}/galerie` });
  } catch (error) {
    console.error("[adminEvents] photobooth-folder failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/admin/events/:id/photobooth-upload — upload photobooth photos to {albumSlug}/photobooth/
router.post(
  "/events/:id/photobooth-upload",
  requireFirebaseAuth,
  requireSupremeAdmin,
  photoboothUpload.array("files", 40),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) return res.status(400).json({ error: "Niciun fișier primit." });

      const db = firestore();
      const doc = await db.collection("adminEvents").doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });

      const slug = doc.data()?.albumSlug as string | undefined;
      if (!slug) return res.status(400).json({ error: "Evenimentul nu are un album slug setat." });

      const storageKey = getBunnyStorageKey();
      const failed: string[] = [];
      let uploaded = 0;

      await Promise.all(
        files.map(async (file, idx) => {
          const isImage =
            file.mimetype.toLowerCase().startsWith("image/") || PHOTOBOOTH_IMAGE_EXT.test(file.originalname);
          if (!isImage) {
            failed.push(file.originalname);
            return;
          }

          const safeName = `${Date.now()}-${idx}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
          const uploadUrl = buildBunnyStorageUrl(slug, "photobooth", safeName);
          try {
            const uploadRes = await nodeFetch(uploadUrl, {
              method: "PUT",
              headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey, "Content-Type": "application/octet-stream" },
              body: file.buffer,
              agent: bunnyAgent,
            });
            if (uploadRes.ok) uploaded++;
            else failed.push(file.originalname);
          } catch {
            failed.push(file.originalname);
          }
        }),
      );

      if (uploaded > 0) invalidateAlbumCache(slug);
      res.json({ uploaded, failed, total: files.length });
    } catch (error) {
      console.error("[adminEvents] photobooth-upload failed:", error);
      res.status(500).json({ error: String(error) });
    }
  },
);

// GET /api/admin/events/:id/photobooth-files — list photos currently in {albumSlug}/photobooth/
router.get("/events/:id/photobooth-files", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = firestore();
    const doc = await db.collection("adminEvents").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });

    const slug = doc.data()?.albumSlug as string | undefined;
    if (!slug) return res.status(400).json({ error: "Evenimentul nu are un album slug setat." });

    const listUrl = buildBunnyDirectoryUrl(slug, "photobooth");
    const listRes = await nodeFetch(listUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() }, agent: bunnyAgent });
    if (!listRes.ok) return res.json({ files: [] });

    const entries = await listRes.json() as { ObjectName: string; IsDirectory?: boolean }[];
    const cdnDomain = (process.env.BUNNY_CDN_DOMAIN ?? "").replace(/\/$/, "");
    const files = entries
      .filter((e) => !e.IsDirectory && PHOTOBOOTH_IMAGE_EXT.test(e.ObjectName))
      .map((e) => ({
        name: e.ObjectName,
        url: cdnDomain ? `${cdnDomain}/${slug}/photobooth/${e.ObjectName}` : "",
      }));

    res.json({ files });
  } catch (error) {
    console.error("[adminEvents] photobooth-files failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/admin/events/:id/photobooth-delete — delete selected photos from {albumSlug}/photobooth/
router.post("/events/:id/photobooth-delete", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const raw = (req.body as { filenames?: unknown }).filenames;
    const filenames = Array.isArray(raw)
      ? raw.filter((n): n is string => typeof n === "string" && n.length > 0 && !n.includes("/") && !n.includes("\\") && !n.includes(".."))
      : [];
    if (filenames.length === 0) return res.status(400).json({ error: "Niciun fișier de șters." });

    const db = firestore();
    const doc = await db.collection("adminEvents").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Evenimentul nu a fost găsit." });

    const slug = doc.data()?.albumSlug as string | undefined;
    if (!slug) return res.status(400).json({ error: "Evenimentul nu are un album slug setat." });

    const storageKey = getBunnyStorageKey();
    const failed: string[] = [];
    let deleted = 0;

    await Promise.all(
      filenames.map(async (name) => {
        try {
          const delRes = await nodeFetch(buildBunnyStorageUrl(slug, "photobooth", name), {
            method: "DELETE",
            headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
            agent: bunnyAgent,
          });
          if (delRes.ok || delRes.status === 404) deleted++;
          else failed.push(name);
        } catch {
          failed.push(name);
        }
      }),
    );

    if (deleted > 0) invalidateAlbumCache(slug);
    res.json({ deleted, failed });
  } catch (error) {
    console.error("[adminEvents] photobooth-delete failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Checks if a Bunny folder already exists for the given slug and auto-links it to the event
router.post("/events/:id/detect-album", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { slug } = req.body as { slug: string };

    if (!slug || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).json({ found: false });
    }

    const checkUrl = buildBunnyStorageUrl(slug, BUNNY_PHOTOS_FOLDER) + "/";
    const checkRes = await nodeFetch(checkUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() }, agent: bunnyAgent });

    if (!checkRes.ok) return res.json({ found: false });

    const db = firestore();
    await db.collection("adminEvents").doc(id).update({ albumSlug: slug });
    res.json({ found: true, slug });
  } catch (error) {
    res.status(500).json({ found: false, error: String(error) });
  }
});

router.patch("/events/:id/album", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { albumSlug, albumPin } = req.body as { albumSlug?: string; albumPin?: string };
    const db = firestore();
    const updates: Record<string, unknown> = {};
    if (albumSlug !== undefined) updates.albumSlug = albumSlug;
    if (albumPin !== undefined) updates.albumPin = albumPin;
    await db.collection("adminEvents").doc(id).update(updates);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/admin/events/:id/process-album
// SSE stream: generates WebP previews in photos_preview/ and a photos.zip in Bunny
router.post("/events/:id/process-album", async (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const db = firestore();
    const doc = await db.collection("adminEvents").doc(id).get();
    const slug = doc.data()?.albumSlug as string | undefined;

    if (!slug) {
      send({ error: "Evenimentul nu are albumSlug setat." });
      return res.end();
    }

    const storageKey = getBunnyStorageKey();

    // List all files in photos/
    const listUrl = buildBunnyDirectoryUrl(slug, BUNNY_PHOTOS_FOLDER);
    const listRes = await nodeFetch(listUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent });
    if (!listRes.ok) {
      send({ error: "Nu pot lista folderul photos din Bunny." });
      return res.end();
    }

    const entries = await listRes.json() as { ObjectName: string; IsDirectory: boolean }[];
    const photos = entries
      .filter((e) => !e.IsDirectory && /\.(jpg|jpeg|png)$/i.test(e.ObjectName) && e.ObjectName !== ".keep")
      .map((e) => e.ObjectName);

    send({ stage: "start", total: photos.length });

    // List existing previews to skip already-processed files
    const previewListUrl = buildBunnyDirectoryUrl(slug, "photos_preview");
    const previewListRes = await nodeFetch(previewListUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent });
    const existingPreviews = new Set<string>();
    if (previewListRes.ok) {
      const previewEntries = await previewListRes.json() as { ObjectName: string }[];
      previewEntries.forEach((e) => {
        const base = e.ObjectName.replace(/\.[^.]+$/, "");
        existingPreviews.add(base);
      });
    }

    // Step 1: Generate WebP previews incrementally
    send({ stage: "previews", message: "Generez previzualizări WebP..." });
    let previewsDone = 0;
    let previewsSkipped = 0;

    for (const filename of photos) {
      const baseName = filename.replace(/\.[^.]+$/, "");
      if (existingPreviews.has(baseName)) {
        previewsSkipped++;
        continue;
      }

      const originalUrl = buildBunnyStorageUrl(slug, BUNNY_PHOTOS_FOLDER, filename);
      const dlRes = await nodeFetch(originalUrl, { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent });
      if (!dlRes.ok || !dlRes.body) {
        send({ stage: "previews", warning: `Skip ${filename}: download failed` });
        continue;
      }

      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const webpBuffer = await sharp(buffer)
        .resize({ width: 1400, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();

      const previewName = `${baseName}.webp`;
      const uploadUrl = buildBunnyStorageUrl(slug, "photos_preview", previewName);
      const upRes = await nodeFetch(uploadUrl, {
        method: "PUT",
        headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey, "Content-Type": "image/webp" },
        body: webpBuffer,
        agent: bunnyAgent,
      });

      if (upRes.ok) {
        previewsDone++;
        send({ stage: "previews", done: previewsDone, total: photos.length, current: previewName });
      } else {
        send({ stage: "previews", warning: `Upload failed for ${previewName}` });
      }
    }

    send({ stage: "previews_complete", done: previewsDone, skipped: previewsSkipped });
    invalidateAlbumCache(slug);
    send({ stage: "done" });
  } catch (err) {
    send({ error: String(err) });
  }

  res.end();
});

// GET /api/admin/media-activity — most recent visits to /media pages
router.get("/media-activity", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const snapshot = await db
      .collection("mediaVisits")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const visits = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        slug: d.slug,
        timestamp: d.timestamp instanceof Timestamp ? d.timestamp.toDate().toISOString() : d.timestamp,
        ip: d.ip,
        userAgent: d.userAgent,
        city: d.city,
        region: d.region,
        country: d.country,
        org: d.org,
      };
    });

    res.json({ visits });
  } catch (error) {
    console.error("[adminEvents] GET /media-activity failed:", error);
    res.status(500).json({ error: "Nu s-a putut încărca activitatea." });
  }
});

// DELETE /api/admin/media-activity/:id — delete a visit record
router.delete("/media-activity/:id", async (req: Request, res: Response) => {
  try {
    const db = firestore();
    await db.collection("mediaVisits").doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (error) {
    console.error("[adminEvents] DELETE /media-activity/:id failed:", error);
    res.status(500).json({ error: "Nu s-a putut șterge vizita." });
  }
});

// POST /api/admin/album-health/create — create album folder structure in Bunny
router.post("/album-health/create", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  const slug = String((req.body as { slug?: string }).slug ?? "").trim().toLowerCase();

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: "Slug invalid. Folosește doar litere mici, cifre și liniuțe." });
  }

  try {
    const storageKey = getBunnyStorageKey();

    const checkRes = await nodeFetch(buildBunnyDirectoryUrl(slug), {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
      agent: bunnyAgent,
    });
    if (checkRes.ok) return res.status(409).json({ error: `Albumul „${slug}" există deja în Bunny.` });

    const folders = ["photos", "photos_preview", "shortvideo", "longvideo"];
    const uploads = await Promise.all(
      folders.map((folder) =>
        nodeFetch(buildBunnyStorageUrl(slug, folder, ".keep"), {
          method: "PUT",
          headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey, "Content-Type": "application/octet-stream" },
          body: Buffer.alloc(0),
          agent: bunnyAgent,
        })
      )
    );

    if (uploads.some((r) => !r.ok)) return res.status(500).json({ error: "Nu s-a putut crea structura în Bunny." });

    res.json({ ok: true, slug });
  } catch (error) {
    console.error("[album-health] create failed:", error);
    res.status(500).json({ error: "Eroare la creare." });
  }
});

// GET /api/admin/album-health — scan all Bunny albums and report WebP preview coverage
router.get("/album-health", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const storageKey = getBunnyStorageKey();

    const rootRes = await nodeFetch(buildBunnyDirectoryUrl(""), {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
      agent: bunnyAgent,
    });
    if (!rootRes.ok) return res.status(500).json({ error: "Nu pot lista root-ul Bunny." });

    const EXCLUDED_DIRS = new Set(["expenses", "bank-statements", "offers", "offers-assets", "qr-moments", "health-activity", "admin-events"]);

    const rootEntries = await rootRes.json() as { ObjectName: string; IsDirectory: boolean }[];
    const albumDirs = rootEntries.filter((e) => e.IsDirectory && !EXCLUDED_DIRS.has(e.ObjectName));

    const results = await Promise.all(
      albumDirs.map(async (dir) => {
        const slug = dir.ObjectName;

        const [photosRes, previewsRes] = await Promise.all([
          nodeFetch(buildBunnyDirectoryUrl(slug, "photos"), { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent }),
          nodeFetch(buildBunnyDirectoryUrl(slug, "photos_preview"), { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent }),
        ]);

        type BunnyHealthEntry = { ObjectName: string; IsDirectory: boolean; LastChanged?: string };

        const photos: BunnyHealthEntry[] = [];
        const previewBases = new Set<string>();

        if (photosRes.ok) {
          const entries = await photosRes.json() as BunnyHealthEntry[];
          entries
            .filter((e) => !e.IsDirectory && /\.(jpg|jpeg|png)$/i.test(e.ObjectName))
            .forEach((e) => photos.push(e));
        }

        if (previewsRes.ok) {
          const entries = await previewsRes.json() as BunnyHealthEntry[];
          entries
            .filter((e) => !e.IsDirectory && /\.webp$/i.test(e.ObjectName))
            .forEach((e) => previewBases.add(e.ObjectName.replace(/\.webp$/i, "")));
        }

        // ZIP status: check photos.zip in album root vs latest photo date
        const rootRes = await nodeFetch(buildBunnyDirectoryUrl(slug), { headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey }, agent: bunnyAgent });
        let zipStatus: "ok" | "stale" | "missing" = "missing";
        let zipDate: string | null = null;

        if (rootRes.ok) {
          const rootEntries = await rootRes.json() as BunnyHealthEntry[];
          const zipEntry = rootEntries.find((e) => !e.IsDirectory && e.ObjectName === "photos.zip");
          if (zipEntry?.LastChanged) {
            zipDate = zipEntry.LastChanged;
            const latestPhoto = photos.reduce((max, p) =>
              p.LastChanged && new Date(p.LastChanged) > new Date(max) ? p.LastChanged : max,
              zipEntry.LastChanged
            );
            zipStatus = new Date(zipEntry.LastChanged) >= new Date(latestPhoto) ? "ok" : "stale";
          }
        }

        const total = photos.length;
        const missingFiles = photos
          .filter((p) => !previewBases.has(p.ObjectName.replace(/\.[^.]+$/, "")))
          .map((p) => p.ObjectName);
        const withPreview = total - missingFiles.length;
        const missing = missingFiles.length;
        const coverage = total > 0 ? Math.round((withPreview / total) * 100) : (previewsRes.ok ? 100 : 0);

        return { slug, total, withPreview, missing, missingFiles, hasPreviewFolder: previewsRes.ok, coverage, zipStatus, zipDate };
      })
    );

    results.sort((a, b) => b.missing - a.missing || a.slug.localeCompare(b.slug));

    res.json({ albums: results });
  } catch (error) {
    console.error("[album-health] GET failed:", error);
    res.status(500).json({ error: "Nu s-a putut scana Bunny." });
  }
});

// Background processing function — runs independently of any HTTP connection
async function runAlbumProcessing(slug: string): Promise<void> {
  const storageKey = getBunnyStorageKey();

  try {
    const listRes = await nodeFetch(buildBunnyDirectoryUrl(slug, BUNNY_PHOTOS_FOLDER), {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
      agent: bunnyAgent,
    });
    if (!listRes.ok) {
      appendJobLog(slug, "❌ Nu pot lista folderul photos din Bunny.");
      errorJob(slug, "Nu pot lista folderul photos din Bunny.");
      return;
    }

    const entries = await listRes.json() as { ObjectName: string; IsDirectory: boolean }[];
    const photos = entries
      .filter((e) => !e.IsDirectory && /\.(jpg|jpeg|png)$/i.test(e.ObjectName) && e.ObjectName !== ".keep")
      .map((e) => e.ObjectName);

    appendJobLog(slug, `📂 ${photos.length} poze găsite`);
    setJobProgress(slug, 0, photos.length);

    const previewListRes = await nodeFetch(buildBunnyDirectoryUrl(slug, "photos_preview"), {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
      agent: bunnyAgent,
    });
    const existingPreviews = new Set<string>();
    if (previewListRes.ok) {
      const previewEntries = await previewListRes.json() as { ObjectName: string }[];
      previewEntries.forEach((e) => existingPreviews.add(e.ObjectName.replace(/\.[^.]+$/, "")));
    }

    appendJobLog(slug, "🖼 Generez previzualizări WebP...");
    let done = 0;
    let skipped = 0;

    for (const filename of photos) {
      const baseName = filename.replace(/\.[^.]+$/, "");
      if (existingPreviews.has(baseName)) { skipped++; continue; }

      const dlRes = await nodeFetch(buildBunnyStorageUrl(slug, BUNNY_PHOTOS_FOLDER, filename), {
        headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
        agent: bunnyAgent,
      });
      if (!dlRes.ok || !dlRes.body) {
        appendJobLog(slug, `⚠️ Skip ${filename}: download failed`);
        continue;
      }

      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const webpBuffer = await sharp(buffer)
        .resize({ width: 1400, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();

      const previewName = `${baseName}.webp`;
      const upRes = await nodeFetch(buildBunnyStorageUrl(slug, "photos_preview", previewName), {
        method: "PUT",
        headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey, "Content-Type": "image/webp" },
        body: webpBuffer,
        agent: bunnyAgent,
      });

      if (upRes.ok) {
        done++;
        setJobProgress(slug, done, photos.length);
        appendJobLog(slug, `✅ ${previewName} (${done}/${photos.length})`);
      } else {
        appendJobLog(slug, `⚠️ Upload failed for ${previewName}`);
      }
    }

    appendJobLog(slug, `🎉 Gata! ${done} generate, ${skipped} sărite`);
    invalidateAlbumCache(slug);
    finishJob(slug);
  } catch (err) {
    const message = String(err);
    appendJobLog(slug, `❌ Eroare: ${message}`);
    errorJob(slug, message);
  }
}

// GET /api/admin/album-health/jobs — all in-memory jobs (must be before /:slug routes)
router.get("/album-health/jobs", requireFirebaseAuth, requireSupremeAdmin, (_req: Request, res: Response) => {
  res.json({ jobs: getAllJobs() });
});

// GET /api/admin/album-health/categories — load persisted category overrides
router.get("/album-health/categories", requireFirebaseAuth, requireSupremeAdmin, async (_req: Request, res: Response) => {
  try {
    const doc = await firestore().collection("settings").doc("albumHealthCategories").get();
    res.json(doc.exists ? (doc.data() ?? {}) : {});
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// PUT /api/admin/album-health/categories — persist category override for one or more slugs
router.put("/album-health/categories", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  try {
    await firestore().collection("settings").doc("albumHealthCategories").set(
      req.body as Record<string, string>,
      { merge: true }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /api/admin/album-health/:slug/zip — removes photos.zip from Bunny Storage for the given album
router.delete("/album-health/:slug/zip", requireFirebaseAuth, requireSupremeAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  try {
    const zipUrl = buildBunnyStorageUrl(slug, "photos.zip");
    const deleteRes = await nodeFetch(zipUrl, {
      method: "DELETE",
      headers: { [BUNNY_ACCESS_KEY_HEADER]: getBunnyStorageKey() },
      agent: bunnyAgent,
    });
    if (!deleteRes.ok && deleteRes.status !== 404) {
      return res.status(500).json({ error: `Bunny delete failed: ${deleteRes.status}` });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[album-health] DELETE zip failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/admin/album-health/:slug/live — SSE stream, replays history then streams live updates
router.get("/album-health/:slug/live", requireFirebaseAuth, requireSupremeAdmin, (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

  const job = getJob(slug);
  if (!job) { send({ type: "error", error: "Job negăsit." }); return res.end(); }

  send({ type: "init", ...serializeJob(job) });
  if (job.status !== "running") return res.end();

  const onUpdate = (event: object) => {
    send(event);
    const typed = event as { type: string };
    if (typed.type === "done" || typed.type === "error") res.end();
  };

  job.emitter.on("update", onUpdate);
  req.on("close", () => job.emitter.off("update", onUpdate));
});

// POST /api/admin/album-health/:slug/process — start background job, returns immediately
router.post("/album-health/:slug/process", requireFirebaseAuth, requireSupremeAdmin, (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const initialWithPreview = Number((req.body as { initialWithPreview?: number }).initialWithPreview ?? 0);

  const existing = getJob(slug);
  if (existing?.status === "running") {
    return res.json({ ok: true, status: "already_running" });
  }

  createJob(slug, initialWithPreview);
  runAlbumProcessing(slug).catch(() => {});

  res.json({ ok: true, status: "started" });
});

export default router;
