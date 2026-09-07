import { Router, type NextFunction, type Request, type Response } from 'express';
import archiver from 'archiver';
import { Readable } from 'node:stream';
import multer from 'multer';
import heicConvert from 'heic-convert';
import sharp from 'sharp';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { firestore } from '../firestore';
import { requireFirebaseAuth, requireSupremeAdmin } from '../middleware/requireFirebaseAuth';
const SUPREME_ADMIN_EMAIL = 'ancadaniel1994@gmail.com';
import {
  BUNNY_ACCESS_KEY_HEADER,
  BUNNY_QR_MOMENT_FOLDER,
  buildBunnyStorageUrl,
  getBunnyStorageKey,
} from '../constants/bunny';
import { sendEmail } from '../notifications/mailer';
import { adminUser } from '../constants/credentials';
import { APP_BASE_URL } from '../constants/domain';
import { getHeadlineText, getHostRoleLabel, getHostsFallbackName, normalizeQrEventType, type QrEventType } from '../../shared/qrMoments/hostRoles';
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_MB } from '../../shared/qrMoments/uploadLimits';
import { downloadBunnyOriginal } from '../utils/downloadBunnyOriginal';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES } });

// multer/busboy tears down the incoming request as soon as a file exceeds
// limits.fileSize, which the client sees as a raw connection error rather than
// a clean 4xx — wrapping the middleware lets us respond with a clear message
// on the rare occasion the connection survives long enough to send one.
function uploadFilesMiddleware(request: Request, response: Response, next: NextFunction) {
  upload.array('files', MAX_FILES_PER_REQUEST)(request, response, (error: unknown) => {
    if (!error) { next(); return; }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: `Fișierul depășește limita maximă de ${MAX_UPLOAD_FILE_SIZE_MB}MB.` });
      return;
    }
    console.error('[qr-moments] upload middleware failed:', error);
    response.status(400).json({ error: 'Eroare la procesarea fișierelor.' });
  });
}

const QR_EVENTS = 'qr_events';
const QR_GUESTS = 'qr_guests';
const QR_UPLOADS = 'qr_uploads';
const QR_COMMENTS = 'qr_comments';
const QR_GALLERY_SUBSCRIBERS = 'qr_gallery_subscribers';

const UPLOAD_CLOSE_HOUR = 4;
const UPLOAD_WINDOW_DAYS = 30;
const MAX_FILES_PER_REQUEST = 25;

const QUICK_REPLIES = [
  'Mulțumim pentru mesaj! Vă iubim',
  'Îți mulțumim din suflet!',
  'Ce surpriză minunată, mulțumim!',
  'Mulțumim, înseamnă enorm pentru noi!',
];

type UploadLookup = {
  id: string;
  guestId: string;
  bunnyUrl: string;
  type: string;
  mimeType: string;
  originalName: string;
};

type GuestLookup = {
  id: string;
  name: string;
  email: string;
};

async function isSupremeAdminRequest(authHeader?: string): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    return decoded.email === SUPREME_ADMIN_EMAIL;
  } catch {
    return false;
  }
}

function generatePin(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const ROMANIAN_MONTH_SLUGS = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

function normalizeEventSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDateSlug(date: Date): string {
  const month = ROMANIAN_MONTH_SLUGS[date.getMonth()] ?? '';
  return `${String(date.getDate()).padStart(2, '0')}${month}${date.getFullYear()}`;
}

async function getEventBySlug(eventSlug: string) {
  return firestore().collection(QR_EVENTS).doc(eventSlug).get();
}

function isUploadWindowOpen(eventDate: Date): boolean {
  return new Date() < getUploadDeadline(eventDate);
}

function getUploadDeadline(eventDate: Date): Date {
  const deadline = new Date(eventDate);
  deadline.setDate(deadline.getDate() + UPLOAD_WINDOW_DAYS);
  deadline.setHours(UPLOAD_CLOSE_HOUR, 0, 0, 0);
  return deadline;
}

function buildBunnyCdnUrl(albumSlug: string, guestId: string, fileName: string): string {
  const cdnDomain = process.env.BUNNY_CDN_DOMAIN ?? '';
  return `${cdnDomain}/${albumSlug}/${BUNNY_QR_MOMENT_FOLDER}/${guestId}/${fileName}`;
}

function buildBunnyUploadUrl(albumSlug: string, guestId: string, fileName: string): string {
  return buildBunnyStorageUrl(albumSlug, BUNNY_QR_MOMENT_FOLDER, guestId, fileName);
}

async function fetchAlbumSlug(adminEventId: string | null | undefined): Promise<string | null> {
  if (!adminEventId) return null;
  const adminEventDoc = await firestore().collection('adminEvents').doc(adminEventId).get();
  const albumSlug = adminEventDoc.data()?.albumSlug;
  return typeof albumSlug === 'string' && albumSlug.trim() ? albumSlug.trim() : null;
}

/**
 * QR Moments can be created without an adminEvents record. In that case the
 * QR event slug is also the Bunny album slug. Integrated events continue to
 * use the album configured on adminEvents.
 */
export async function resolveQrAlbumSlug(
  eventData: { adminEventId?: string | null; albumSlug?: string | null },
  eventSlug: string,
): Promise<string | null> {
  const storedAlbumSlug = typeof eventData.albumSlug === 'string' ? eventData.albumSlug.trim() : '';
  if (storedAlbumSlug) return storedAlbumSlug;

  const adminEventId = typeof eventData.adminEventId === 'string' ? eventData.adminEventId.trim() : '';
  if (adminEventId) return fetchAlbumSlug(adminEventId);

  return normalizeEventSlug(eventSlug) || null;
}

export function detectMediaType(mimeType: string, originalName: string): 'photo' | 'video' | 'audio' {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'];
  const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'hevc', 'm4v', '3gp', 'ts'];
  // Check the audio mimeType prefix first: some browsers (Firefox, some Android
  // devices) record voice messages as audio/webm, and .webm is also a valid video
  // extension — without this, those recordings were misclassified as video.
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/') || IMAGE_EXTS.includes(ext)) return 'photo';
  if (mimeType.startsWith('video/') || (mimeType === 'application/octet-stream' && VIDEO_EXTS.includes(ext)) || VIDEO_EXTS.includes(ext)) return 'video';
  return 'audio';
}

// HEIC/HEIF (default format on iPhone cameras, incl. Live Photos' still frame) isn't
// renderable in most browsers/gallery viewers — convert to JPEG on the way in so
// every guest upload displays correctly for the couple, regardless of source device.
export async function convertHeicIfNeeded(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  const isHeic = mimeType.toLowerCase() === 'image/heic' || mimeType.toLowerCase() === 'image/heif' || ext === 'heic' || ext === 'heif';
  if (!isHeic) return { buffer, mimeType, originalName };

  const jpegName = originalName.replace(/\.(heic|heif)$/i, '.jpg');
  const inputArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  try {
    const converted = Buffer.from(await heicConvert({ buffer: inputArrayBuffer, format: 'JPEG', quality: 0.9 }));
    if (converted.length > 0) {
      return { buffer: converted, mimeType: 'image/jpeg', originalName: jpegName };
    }
  } catch (error) {
    console.warn('[qr-moments] HEIC convert via heic-convert failed, retrying with sharp:', error);
  }

  try {
    const sharpConverted = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    return { buffer: sharpConverted, mimeType: 'image/jpeg', originalName: jpegName };
  } catch (error) {
    console.warn('[qr-moments] HEIC convert via sharp also failed, uploading original HEIC:', error);
    return { buffer, mimeType, originalName };
  }
}

function buildUnsubscribeUrl(guestId: string): string {
  const base = APP_BASE_URL;
  return `${base}/qr-moments/unsubscribe/${guestId}`;
}

const EMAIL_PORTFOLIO_IMAGES = [
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2Fhomepage%2FLAST_EVENTS%2FPoze-125.jpg?alt=media&token=364b1285-b470-4251-8002-8ba6a7a1bb98',
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2Fhomepage%2FLAST_EVENTS%2FClaudiu-016.jpg?alt=media&token=151a9324-2424-476b-8163-9b6610611f12',
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2Fhomepage%2FVertical-218mm.jpg?alt=media&token=08420520-11dc-4d9e-86eb-8ee371d4bd98',
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2FAndradaAnca%2FPoze-2315.jpg?alt=media&token=2966ffae-cd87-436a-ae24-b8b764185ae7',
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2Feggsparty%2Fmulaje-20.jpg?alt=media&token=5781c4d2-3d9e-440a-a197-fc00480ecf68',
  'https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2Fmedia%2Feggsparty%2Fchristmas-162.jpg?alt=media&token=1c90c7ad-b718-499a-be91-03d888519b16',
];

async function sendThankYouEmail(
  guestEmail: string,
  guestName: string,
  message: string,
  hostDisplayName: string,
  guestId: string,
  eventType: QrEventType,
): Promise<void> {
  const unsubscribeUrl = buildUnsubscribeUrl(guestId);
  await sendEmail({
    to: guestEmail,
    subject: `💌 Mulțumim pentru amintire, ${guestName}!`,
    html: `
      <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
        <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">QR Moments</p>
          <h2 style="color:#241f1a;margin:0 0 6px;font-size:24px;font-weight:600;">Bună, ${guestName}!</h2>
          <p style="color:#6b5b4d;margin:0 0 18px;">${hostDisplayName} ți-a lăsat un mesaj special:</p>
          <div style="background:#fbf6ee;border:1px solid #ecd9bd;padding:16px 18px;border-radius:12px;margin:0 0 20px;">
            <p style="margin:0;font-size:16px;line-height:1.45;color:#241f1a;">"${message}"</p>
          </div>
          <p style="color:#6b5b4d;font-size:13px;line-height:1.6;margin:0 0 20px;">${eventType === 'corporate' ? 'Ne bucurăm că ai contribuit la amintirile echipei și ale evenimentului.' : 'Ne bucurăm că ai fost alături de ei și că ai imortalizat aceste momente.'}</p>
          <hr style="border:none;border-top:1px solid #eadfce;margin:0 0 18px;">
          <p style="font-size:12px;color:#7b6a5a;margin:0 0 8px;">
            Nu mai vrei să primești notificări?
            <a href="${unsubscribeUrl}" style="color:#8c5a16;text-decoration:underline;">Dezabonează-te</a>.
          </p>
          <p style="font-size:12px;color:#7b6a5a;margin:0;">
            ${getHeadlineText(eventType)}
            <a href="https://ancavisuals.ro" style="color:#8c5a16;text-decoration:underline;">Recomandă-ne</a>
            și primești o ședință foto gratuită.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendViewNotificationEmail(
  guestEmail: string,
  guestName: string,
  hostDisplayName: string,
  guestId: string,
  thumbnailUrl: string | null,
  mediaLabel: string,
  eventType: QrEventType,
): Promise<void> {
  const unsubscribeUrl = buildUnsubscribeUrl(guestId);
  const thumbnailHtml = thumbnailUrl
    ? `<img src="${thumbnailUrl}" alt="Fișierul tău" style="display:block;max-width:280px;width:100%;border-radius:12px;border:1px solid #eadfce;margin:12px 0;">`
    : '';
  const viewedAt = new Date().toLocaleTimeString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const viewVerb = eventType === 'corporate' ? 'a vizualizat' : 'au vizualizat';

  await sendEmail({
    to: guestEmail,
    subject: `👀 ${hostDisplayName} ${viewVerb} ${mediaLabel} de tine · ${viewedAt}`,
    html: `
      <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
        <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">QR Moments</p>
          <h2 style="color:#241f1a;margin:0 0 6px;font-size:24px;font-weight:600;">Bună, ${guestName}!</h2>
          <p style="color:#6b5b4d;margin:0 0 12px;">${hostDisplayName} ${viewVerb} ${mediaLabel} la eveniment. ${eventType === 'corporate' ? 'Mulțumim că ai surprins energia echipei!' : 'Mulțumim că ai imortalizat aceste momente!'}</p>
          ${thumbnailHtml}
          <div style="margin:22px 0 0;padding:18px 18px 16px;border-radius:14px;background:linear-gradient(135deg,#fbf3e5,#fffaf2);border:1px solid #ead9bd;">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#b7791f;">AncaVisuals</p>
            <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#241f1a;">Păstrează emoția evenimentului tău</p>
            ${EMAIL_PORTFOLIO_IMAGES.map((imageUrl) => `<img src="${imageUrl}" alt="AncaVisuals — fotografie de eveniment" style="display:block;width:100%;height:170px;margin:0 0 8px;border-radius:10px;object-fit:cover;">`).join('')}
            <p style="margin:12px 0 0;color:#6b5b4d;font-size:13px;line-height:1.55;">Foto · Video · Fotocabină · Videocabină · QR Moments</p>
            <a href="https://ancavisuals.ro" style="display:inline-block;margin-top:13px;padding:10px 18px;border-radius:999px;background:#e0a13b;color:#241f1a;text-decoration:none;font-size:13px;font-weight:700;">Descoperă AncaVisuals</a>
          </div>
          <hr style="border:none;border-top:1px solid #eadfce;margin:16px 0;">
          <p style="font-size:12px;color:#7b6a5a;margin:0 0 8px;">
            Nu mai vrei să primești notificări?
            <a href="${unsubscribeUrl}" style="color:#8c5a16;text-decoration:underline;">Dezabonează-te</a>.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendCommentNotification(
  guestEmail: string,
  guestName: string,
  commentText: string,
  eventSlug: string,
  guestId: string,
  thumbnailUrl: string | null,
  hostDisplayName: string,
  eventType: QrEventType,
): Promise<void> {
  const galleryUrl = `${APP_BASE_URL}/qr-moments/${eventSlug}/gallery`;
  const unsubscribeUrl = buildUnsubscribeUrl(guestId);

  const thumbnailHtml = thumbnailUrl
    ? `<img src="${thumbnailUrl}" alt="Poza ta" style="max-width:280px;border-radius:8px;margin:12px 0;">`
    : '';

  await sendEmail({
    to: guestEmail,
    subject: `💌 ${hostDisplayName} a răspuns la ce ai trimis!`,
    html: `
      <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
        <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">QR Moments</p>
          <h2 style="color:#241f1a;margin:0 0 6px;font-size:24px;font-weight:600;">Bună, ${guestName}!</h2>
          <p style="color:#6b5b4d;margin:0;">${hostDisplayName} a lăsat un mesaj la ce ai trimis:</p>

          <div style="background:#fbf6ee;border:1px solid #ecd9bd;padding:16px 18px;border-radius:12px;margin:18px 0;">
            <p style="margin:0;font-size:16px;line-height:1.45;color:#241f1a;">"${commentText}"</p>
          </div>

          ${thumbnailHtml ? `<div style="margin:0 0 12px;">${thumbnailHtml.replace('style="max-width:280px;border-radius:8px;margin:12px 0;"', 'style="display:block;max-width:280px;width:100%;border-radius:12px;border:1px solid #eadfce;margin:0;"')}</div>` : ''}

          <a href="${galleryUrl}" style="display:inline-block;background:#e0a13b;color:#241f1a;padding:11px 22px;border-radius:999px;text-decoration:none;font-weight:700;margin-top:8px;">
            Vezi galeria
          </a>

          <hr style="border:none;border-top:1px solid #eadfce;margin:28px 0 18px;">
          <p style="font-size:12px;line-height:1.5;color:#7b6a5a;margin:0 0 8px;">
            Nu mai vrei să primești notificări?
            <a href="${unsubscribeUrl}" style="color:#8c5a16;text-decoration:underline;">Dezabonează-te</a>.
          </p>
          <p style="font-size:12px;line-height:1.5;color:#7b6a5a;margin:0;">
            ${getHeadlineText(eventType)}
            <a href="https://ancavisuals.ro" style="color:#8c5a16;text-decoration:underline;">Recomandă-ne cu drag</a>
            și primești o ședință foto gratuită.
          </p>
        </div>
      </div>
    `,
  });
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

function describeUploadCounts(typeCounts: { photo: number; video: number; audio: number }): string {
  const parts: string[] = [];
  if (typeCounts.photo > 0) parts.push(pluralize(typeCounts.photo, 'poză', 'poze'));
  if (typeCounts.video > 0) parts.push(pluralize(typeCounts.video, 'videoclip', 'videoclipuri'));
  if (typeCounts.audio > 0) parts.push(pluralize(typeCounts.audio, 'mesaj vocal', 'mesaje vocale'));

  if (parts.length === 0) return 'un fișier nou';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} și ${parts[parts.length - 1]}`;
}

async function sendUploadNotification(
  notificationEmail: string,
  eventSlug: string,
  guestName: string,
  typeCounts: { photo: number; video: number; audio: number },
): Promise<void> {
  const uploadLabel = describeUploadCounts(typeCounts);
  const galleryUrl = `${APP_BASE_URL}/qr-moments/${eventSlug}/gallery`;

  await sendEmail({
    to: notificationEmail,
    subject: `QR Moments: ${guestName} a încărcat ${uploadLabel}`,
    html: `
      <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
        <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">QR Moments</p>
          <h2 style="color:#241f1a;margin:0 0 8px;font-size:24px;font-weight:600;">Upload nou în QR Moments</h2>
          <p style="color:#6b5b4d;margin:0;line-height:1.5;">${guestName} a încărcat ${uploadLabel} pentru evenimentul <strong>${eventSlug}</strong>.</p>
          <a href="${galleryUrl}" style="display:inline-block;background:#e0a13b;color:#241f1a;padding:11px 22px;border-radius:999px;text-decoration:none;font-weight:700;margin-top:18px;">
            Deschide galeria
          </a>
        </div>
      </div>
    `,
  });
}

type UploadCounts = { photo: number; video: number; audio: number };
type PendingUploadNotification = {
  eventSlug: string;
  guestName: string;
  counts: UploadCounts;
  timer: ReturnType<typeof setTimeout>;
};

const pendingUploadNotifications = new Map<string, PendingUploadNotification>();

function queueUploadNotification(
  batchId: string | undefined,
  notificationEmails: string[],
  eventSlug: string,
  guestName: string,
  counts: UploadCounts,
): void {
  if (notificationEmails.length === 0) return;
  // The client sends one request per file for resilient retries. Group the
  // requests belonging to one selection into a single notification email.
  if (!batchId) {
    for (const recipient of notificationEmails) {
      sendUploadNotification(recipient, eventSlug, guestName, counts).catch((error) => {
        console.error(`[qr-moments] upload notification email failed for ${eventSlug} -> ${recipient}:`, error);
      });
    }
    return;
  }

  const existing = pendingUploadNotifications.get(batchId);
  if (existing) {
    existing.counts.photo += counts.photo;
    existing.counts.video += counts.video;
    existing.counts.audio += counts.audio;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushUploadNotification(batchId, notificationEmails), 15_000);
    return;
  }

  pendingUploadNotifications.set(batchId, {
    eventSlug,
    guestName,
    counts: { ...counts },
    timer: setTimeout(() => flushUploadNotification(batchId, notificationEmails), 15_000),
  });
}

function flushUploadNotification(batchId: string, notificationEmails: string[]): void {
  const pending = pendingUploadNotifications.get(batchId);
  if (!pending) return;
  pendingUploadNotifications.delete(batchId);
  for (const recipient of notificationEmails) {
    sendUploadNotification(recipient, pending.eventSlug, pending.guestName, pending.counts).catch((error) => {
      console.error(`[qr-moments] upload notification email failed for ${pending.eventSlug} -> ${recipient}:`, error);
    });
  }
}

async function getGallerySubscriberEmails(eventSlug: string): Promise<string[]> {
  const snapshot = await firestore()
    .collection(QR_GALLERY_SUBSCRIBERS)
    .where('eventSlug', '==', eventSlug)
    .get();
  return snapshot.docs
    .map((doc) => String(doc.data().email ?? '').trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function resolveUploadNotificationEmail(eventNotificationEmail: unknown): string | null {
  const configuredEmail = typeof eventNotificationEmail === 'string' ? eventNotificationEmail.trim().toLowerCase() : '';
  return configuredEmail || adminUser.email.trim().toLowerCase() || null;
}

// ─── Public: check event + pass + expiry ────────────────────────────────────

router.get('/:eventSlug', async (request: Request, response: Response) => {
  const { eventSlug } = request.params;
  const { pass } = request.query as { pass?: string };

  // Admin bypass: skip pass check and force isOpen=true
  let isAdmin = false;
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
      isAdmin = decoded.email === SUPREME_ADMIN_EMAIL;
    } catch { }
  }

  try {
    const eventDoc = await getEventBySlug(eventSlug);

    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    const eventData = eventDoc.data()!;

    if (!isAdmin && eventData.pin !== pass) {
      response.status(403).json({ error: 'Acces interzis.' });
      return;
    }

    const eventDate = (eventData.eventDate as Timestamp).toDate();
    const deadline = getUploadDeadline(eventDate);
    const isOpen = isAdmin ? true : isUploadWindowOpen(eventDate);

    response.json({
      eventSlug,
      isOpen,
      deadline: deadline.toISOString(),
      bride: eventData.bride ?? null,
      groom: eventData.groom ?? null,
      eventType: normalizeQrEventType(eventData.eventType),
    });
  } catch (error) {
    console.error('[qr-moments] GET /:eventSlug failed:', error);
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Public: register guest ──────────────────────────────────────────────────

router.post('/guest/register', async (request: Request, response: Response) => {
  const { eventSlug, name, email, gdprConsent, emailConsent, pass } = request.body as {
    eventSlug: string;
    name: string;
    email: string;
    gdprConsent: boolean;
    emailConsent: boolean;
    pass?: string;
  };

  // Admin bypass: skip pass + window checks
  let isAdmin = false;
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
      isAdmin = decoded.email === SUPREME_ADMIN_EMAIL;
    } catch { }
  }

  if (!eventSlug || !name?.trim() || !email?.trim()) {
    response.status(400).json({ error: 'Câmpuri obligatorii lipsă.' });
    return;
  }

  if (!isAdmin && !gdprConsent) {
    response.status(400).json({ error: 'Consimțământul GDPR este obligatoriu.' });
    return;
  }

  try {
    const eventDoc = await getEventBySlug(eventSlug);
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    if (!isAdmin && eventDoc.data()!.pin !== pass) {
      response.status(403).json({ error: 'Acces interzis.' });
      return;
    }

    const eventDate = (eventDoc.data()!.eventDate as Timestamp).toDate();
    if (!isAdmin && !isUploadWindowOpen(eventDate)) {
      response.status(403).json({ error: 'Perioada de upload s-a închis.' });
      return;
    }

    const existingSnapshot = await firestore()
      .collection(QR_GUESTS)
      .where('eventSlug', '==', eventSlug)
      .where('email', '==', email.toLowerCase().trim())
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      response.json({ guestId: existingSnapshot.docs[0].id, returning: true });
      return;
    }

    const docRef = await firestore().collection(QR_GUESTS).add({
      eventSlug,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      gdprConsent: true,
      emailConsent: emailConsent === true,
      uploadIds: [],
      createdAt: Timestamp.now(),
    });

    response.status(201).json({ guestId: docRef.id });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Public: upload asset ────────────────────────────────────────────────────

router.post(
  '/:eventSlug/upload',
  uploadFilesMiddleware,
  async (request: Request, response: Response) => {
    const { eventSlug } = request.params;
    const { guestId, pass, batchId } = request.body as { guestId: string; pass?: string; batchId?: string };
    const files = request.files as Express.Multer.File[];

    console.log(`[qr-moments] upload request: slug=${eventSlug} guestId=${guestId} files=${files?.length ?? 0} ua=${request.headers['user-agent']?.slice(0, 60)}`);

    if (!guestId || !files?.length) {
      response.status(400).json({ error: 'guestId și fișiere sunt obligatorii.' });
      return;
    }

    const accessKey = getBunnyStorageKey();
    if (!accessKey) {
      response.status(500).json({ error: 'Configurare server eronată.' });
      return;
    }

    // Admin flow bypasses the PIN check for uploads as well.
    let isAdmin = false;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
        isAdmin = decoded.email === SUPREME_ADMIN_EMAIL;
      } catch { }
    }

    try {
      const [eventDoc, guestDoc] = await Promise.all([
        getEventBySlug(eventSlug),
        firestore().collection(QR_GUESTS).doc(guestId).get(),
      ]);

      if (!eventDoc.exists) {
        response.status(404).json({ error: 'Evenimentul nu există.' });
        return;
      }

      if (!isAdmin && eventDoc.data()!.pin !== pass) {
        response.status(403).json({ error: 'Acces interzis.' });
        return;
      }

      if (!guestDoc.exists || guestDoc.data()!.eventSlug !== eventSlug) {
        response.status(403).json({ error: 'Invitat invalid pentru acest eveniment.' });
        return;
      }

      const eventDateRaw = eventDoc.data()!.eventDate as Timestamp | undefined;
      if (!eventDateRaw) {
        console.error(`[qr-moments] upload: eventDate lipsă pentru ${eventSlug}`);
        response.status(500).json({ error: 'Configurare eveniment incompletă.' });
        return;
      }
      const eventDate = eventDateRaw.toDate();
      if (!isAdmin && !isUploadWindowOpen(eventDate)) {
        response.status(403).json({ error: 'Perioada de upload s-a închis.' });
        return;
      }

      const eventData = eventDoc.data()!;
      const adminEventId = eventData.adminEventId as string | null | undefined;
      const albumSlug = await resolveQrAlbumSlug(eventData, eventSlug);
      if (!albumSlug) {
        console.error(`[qr-moments] upload: albumSlug lipsă pentru evenimentul ${eventSlug} (adminEventId=${adminEventId})`);
        response.status(500).json({ error: 'Evenimentul nu are un album Bunny asociat. Setează albumSlug în adminEvents.' });
        return;
      }

      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const converted = await convertHeicIfNeeded(file.buffer, file.mimetype, file.originalname);
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${converted.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const storageUrl = buildBunnyUploadUrl(albumSlug, guestId, uniqueName);

          const uploadResponse = await fetch(storageUrl, {
            method: 'PUT',
            headers: {
              [BUNNY_ACCESS_KEY_HEADER]: accessKey,
              'Content-Type': 'application/octet-stream',
            },
            body: new Uint8Array(converted.buffer),
            signal: AbortSignal.timeout(180_000),
          });

          if (!uploadResponse.ok) {
            const bunnyBody = await uploadResponse.text().catch(() => '');
            throw new Error(`Bunny upload eșuat pentru ${converted.originalName}: ${uploadResponse.status} ${bunnyBody}`);
          }

          const mediaType = detectMediaType(converted.mimeType, converted.originalName);
          const cdnUrl = buildBunnyCdnUrl(albumSlug, guestId, uniqueName);

          const uploadDoc = await firestore().collection(QR_UPLOADS).add({
            eventSlug,
            guestId,
            albumSlug,
            type: mediaType,
            bunnyUrl: cdnUrl,
            fileName: uniqueName,
            mimeType: converted.mimeType,
            originalName: converted.originalName,
            visible: true,
            createdAt: Timestamp.now(),
          });

          return { id: uploadDoc.id, type: mediaType };
        }),
      );

      const uploadIds = uploadResults.map((result) => result.id);

      await firestore()
        .collection(QR_GUESTS)
        .doc(guestId)
        .update({
          uploadIds: (await firestore().collection(QR_GUESTS).doc(guestId).get()).data()?.uploadIds?.concat(uploadIds) ?? uploadIds,
        });

      const guestName = guestDoc.data()!.name as string;
      const notificationEmail = resolveUploadNotificationEmail(eventDoc.data()!.notificationEmail);
      const subscriberEmails = await getGallerySubscriberEmails(eventSlug).catch((error) => {
        console.error(`[qr-moments] could not load gallery subscribers for ${eventSlug}:`, error);
        return [];
      });
      const notificationEmails = Array.from(new Set([
        ...(notificationEmail ? [notificationEmail] : []),
        ...subscriberEmails,
      ]));
      if (notificationEmails.length > 0) {
        const typeCounts = uploadResults.reduce(
          (counts, result) => {
            counts[result.type] += 1;
            return counts;
          },
          { photo: 0, video: 0, audio: 0 },
        );
        queueUploadNotification(batchId, notificationEmails, eventSlug, guestName, typeCounts);
      }

      response.status(201).json({ uploadedCount: uploadResults.length, uploadIds });
    } catch (uploadError) {
      console.error(`[qr-moments] upload failed for ${eventSlug}:`, uploadError);
      response.status(500).json({ error: 'Eroare la upload.' });
    }
  },
);

// ─── Gallery: get uploads grouped by guest (PIN protected) ──────────────────

router.get('/:eventSlug/gallery', async (request: Request, response: Response) => {
  const { eventSlug } = request.params;
  const { pin } = request.query as { pin?: string };

  // Admin flow: skip the PIN if a valid supreme-admin Firebase token is present.
  let isAdmin = false;
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
      isAdmin = decoded.email === SUPREME_ADMIN_EMAIL;
    } catch { }
  }

  if (!isAdmin && !pin) {
    response.status(401).json({ error: 'PIN necesar.' });
    return;
  }

  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(eventSlug).get();
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Eveniment negăsit.' });
      return;
    }
    if (!isAdmin && eventDoc.data()!.pin !== pin) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    const [uploadsSnapshot, guestsSnapshot] = await Promise.all([
      firestore().collection(QR_UPLOADS).where('eventSlug', '==', eventSlug).where('visible', '==', true).get(),
      firestore().collection(QR_GUESTS).where('eventSlug', '==', eventSlug).get(),
    ]);

    const guestMap = new Map(
      guestsSnapshot.docs.map((doc) => [
        doc.id,
        {
          id: doc.id,
          name: doc.data().name as string,
          hasEmail: !!(doc.data().email && doc.data().emailConsent !== false),
        },
      ]),
    );

    const uploadsByGuest = new Map<string, { guest: { id: string; name: string; hasEmail: boolean }; uploads: object[] }>();

    for (const doc of uploadsSnapshot.docs) {
      const data = doc.data();
      const guestId = data.guestId as string;
      const guest = guestMap.get(guestId) ?? { id: guestId, name: 'Anonim', hasEmail: false };

      if (!uploadsByGuest.has(guestId)) {
        uploadsByGuest.set(guestId, { guest, uploads: [] });
      }

      uploadsByGuest.get(guestId)!.uploads.push({
        id: doc.id,
        type: data.type,
        bunnyUrl: data.bunnyUrl,
        mimeType: data.mimeType,
        originalName: data.originalName,
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
        thankedAt: data.thankedAt ? (data.thankedAt as Timestamp).toDate().toISOString() : null,
      });
    }

    const grouped = Array.from(uploadsByGuest.values()).map((group) => ({
      ...group,
      uploads: group.uploads.sort((firstUpload, secondUpload) => {
        const firstCreatedAt = (firstUpload as { createdAt: string }).createdAt;
        const secondCreatedAt = (secondUpload as { createdAt: string }).createdAt;
        return secondCreatedAt.localeCompare(firstCreatedAt);
      }),
    })).sort((a, b) => {
      const aLatest = (a.uploads[0] as { createdAt: string }).createdAt;
      const bLatest = (b.uploads[0] as { createdAt: string }).createdAt;
      return bLatest.localeCompare(aLatest);
    });

    response.json({
      groups: grouped,
      quickReplies: QUICK_REPLIES,
      event: {
        bride: eventDoc.data()!.bride ?? null,
        groom: eventDoc.data()!.groom ?? null,
        eventType: normalizeQrEventType(eventDoc.data()!.eventType),
      },
    });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Gallery: get comments for an upload ────────────────────────────────────

router.get('/comment/:uploadId', async (request: Request, response: Response) => {
  try {
    const { eventSlug, pin } = request.query as { eventSlug?: string; pin?: string };
    const authHeader = request.headers.authorization;
    const isAdmin = await isSupremeAdminRequest(authHeader);

    if (!eventSlug || (!isAdmin && !pin)) {
      response.status(401).json({ error: 'PIN necesar.' });
      return;
    }

    const eventDoc = await getEventBySlug(eventSlug);
    if (!eventDoc.exists || (!isAdmin && eventDoc.data()!.pin !== pin)) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    const uploadDoc = await firestore().collection(QR_UPLOADS).doc(request.params.uploadId).get();
    if (!uploadDoc.exists || uploadDoc.data()!.eventSlug !== eventSlug) {
      response.status(404).json({ error: 'Upload negăsit.' });
      return;
    }

    const snapshot = await firestore()
      .collection(QR_COMMENTS)
      .where('uploadId', '==', request.params.uploadId)
      .get();

    const comments = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        text: doc.data().text as string,
        fromHost: doc.data().fromHost as boolean,
        hostRole: (doc.data().hostRole as 'bride' | 'groom' | undefined) ?? null,
        createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    response.json({ comments });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Gallery: post comment (host only — PIN protected) ───────────────────────

router.post('/comment', async (request: Request, response: Response) => {
  const { uploadId, eventSlug, pin, text } = request.body as {
    uploadId: string;
    eventSlug: string;
    pin: string;
    text: string;
    hostRole?: 'bride' | 'groom';
  };
  const authHeader = request.headers.authorization;
  const isAdmin = await isSupremeAdminRequest(authHeader);

  if (!uploadId || !eventSlug || (!isAdmin && !pin) || !text?.trim()) {
    response.status(400).json({ error: 'Câmpuri obligatorii lipsă.' });
    return;
  }

  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(eventSlug).get();
    if (!eventDoc.exists || (!isAdmin && eventDoc.data()!.pin !== pin)) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    await firestore().collection(QR_COMMENTS).add({
      uploadId,
      eventSlug,
      text: text.trim(),
      fromHost: true,
      hostRole: request.body.hostRole === 'groom' ? 'groom' : 'bride',
      createdAt: Timestamp.now(),
    });

    const uploadDoc = await firestore().collection(QR_UPLOADS).doc(uploadId).get();
    if (!uploadDoc.exists) {
      response.json({ ok: true });
      return;
    }

    const uploadData = uploadDoc.data()!;
    const guestDoc = await firestore().collection(QR_GUESTS).doc(uploadData.guestId as string).get();

    if (guestDoc.exists && guestDoc.data()!.emailConsent === true) {
      const guestData = guestDoc.data()!;
      const isPhoto = (uploadData.type as string) === 'photo';
      const thumbnail = isPhoto ? (uploadData.bunnyUrl as string) : null;
      const eventData = eventDoc.data()!;
      const eventType = normalizeQrEventType(eventData.eventType);
      const hostRole = request.body.hostRole === 'groom' ? 'groom' : 'bride';
      const hostDisplayName = hostRole === 'groom'
        ? ((eventData.groom as string | undefined)?.trim() || getHostRoleLabel(eventType, 'groom'))
        : ((eventData.bride as string | undefined)?.trim() || getHostRoleLabel(eventType, 'bride'));

      sendCommentNotification(
        guestData.email as string,
        guestData.name as string,
        text.trim(),
        eventSlug,
        guestDoc.id,
        thumbnail,
        hostDisplayName,
        eventType,
      ).catch(() => {});
    }

    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Gallery: thank guest for upload ────────────────────────────────────────

router.post('/thank/:uploadId', async (request: Request, response: Response) => {
  const { uploadId } = request.params;
  const { eventSlug, pin, message, hostRole } = request.body as {
    eventSlug: string;
    pin: string;
    message: string;
    hostRole?: 'bride' | 'groom';
  };

  const authHeader = request.headers.authorization;
  const isAdmin = await isSupremeAdminRequest(authHeader);

  if (!uploadId || !eventSlug || !message?.trim() || (!isAdmin && !pin)) {
    response.status(400).json({ error: 'Câmpuri obligatorii lipsă.' });
    return;
  }

  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(eventSlug).get();
    if (!eventDoc.exists || (!isAdmin && eventDoc.data()!.pin !== pin)) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    const uploadRef = firestore().collection(QR_UPLOADS).doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists || uploadDoc.data()!.eventSlug !== eventSlug) {
      response.status(404).json({ error: 'Upload negăsit.' });
      return;
    }

    if (uploadDoc.data()!.thankedAt) {
      response.json({ ok: true, alreadyThanked: true });
      return;
    }

    const thankedAt = Timestamp.now();
    await uploadRef.update({ thankedAt, thankMessage: message.trim() });

    const guestDoc = await firestore().collection(QR_GUESTS).doc(uploadDoc.data()!.guestId as string).get();
    if (guestDoc.exists && guestDoc.data()!.email && guestDoc.data()!.emailConsent === true) {
      const guestData = guestDoc.data()!;
      const eventData = eventDoc.data()!;
      const eventType = normalizeQrEventType(eventData.eventType);
      const effectiveHostRole = hostRole === 'groom' ? 'groom' : 'bride';
      const hostDisplayName = effectiveHostRole === 'groom'
        ? ((eventData.groom as string | undefined)?.trim() || getHostRoleLabel(eventType, 'groom'))
        : ((eventData.bride as string | undefined)?.trim() || getHostRoleLabel(eventType, 'bride'));

      sendThankYouEmail(
        guestData.email as string,
        guestData.name as string,
        message.trim(),
        hostDisplayName,
        guestDoc.id,
        eventType,
      ).catch(() => {});
    }

    response.json({ ok: true, thankedAt: thankedAt.toDate().toISOString() });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Gallery: notify guest/admin once per guest and event ────────────────────

type ViewNotificationClaims = {
  guest: boolean;
  admin: boolean;
};

/**
 * Claim the two possible view-email deliveries atomically on the guest.
 *
 * The old implementation stored these flags on each upload, which meant that
 * one guest with five uploads could trigger five emails. Keeping the claims on
 * the event guest also makes concurrent view requests safe: only one request
 * can claim a delivery for that guest.
 */
async function claimViewNotification(
  guestId: string,
  shouldNotifyGuest: boolean,
  shouldNotifyAdmin: boolean,
): Promise<ViewNotificationClaims> {
  const guestRef = firestore().collection(QR_GUESTS).doc(guestId);
  return firestore().runTransaction(async (transaction) => {
    const guestDoc = await transaction.get(guestRef);
    if (!guestDoc.exists) return { guest: false, admin: false };

    const data = guestDoc.data() ?? {};
    const guest = shouldNotifyGuest && !data.viewNotificationSentAt;
    const admin = shouldNotifyAdmin && !data.adminViewNotificationSentAt;
    const updates: Record<string, Timestamp> = {};
    if (guest) updates.viewNotificationSentAt = Timestamp.now();
    if (admin) updates.adminViewNotificationSentAt = Timestamp.now();
    if (Object.keys(updates).length > 0) transaction.update(guestRef, updates);
    return { guest, admin };
  });
}

async function releaseViewNotificationClaim(guestId: string, claims: ViewNotificationClaims): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (claims.guest) updates.viewNotificationSentAt = FieldValue.delete();
  if (claims.admin) updates.adminViewNotificationSentAt = FieldValue.delete();
  if (Object.keys(updates).length === 0) return;
  await firestore().collection(QR_GUESTS).doc(guestId).update(updates);
}

router.post('/view-notify/:uploadId', async (request: Request, response: Response) => {
  const { uploadId } = request.params;
  const { eventSlug, pin } = request.body as { eventSlug: string; pin: string };

  const authHeader = request.headers.authorization;
  const isAdmin = await isSupremeAdminRequest(authHeader);

  if (!uploadId || !eventSlug || (!isAdmin && !pin)) {
    response.status(400).json({ error: 'Câmpuri obligatorii lipsă.' });
    return;
  }

  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(eventSlug).get();
    if (!eventDoc.exists || (!isAdmin && eventDoc.data()!.pin !== pin)) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    const uploadRef = firestore().collection(QR_UPLOADS).doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists || uploadDoc.data()!.eventSlug !== eventSlug) {
      response.status(404).json({ error: 'Upload negăsit.' });
      return;
    }

    const uploadData = uploadDoc.data()!;
    const guestDoc = await firestore().collection(QR_GUESTS).doc(uploadData.guestId as string).get();
    const guestData = guestDoc.exists ? guestDoc.data()! : {};
    const eventData = eventDoc.data()!;
    const eventType = normalizeQrEventType(eventData.eventType);
    const brideName = (eventData.bride as string | undefined)?.trim() || getHostRoleLabel(eventType, 'bride');
    const groomName = (eventData.groom as string | undefined)?.trim() || getHostRoleLabel(eventType, 'groom');
    const hostDisplayName = eventType === 'corporate'
      ? brideName || getHostsFallbackName(eventType)
      : `${brideName} și ${groomName}`;
    const mediaType = uploadData.type as 'photo' | 'video' | 'audio';
    const mediaLabel = mediaType === 'photo' ? 'poza încărcată' : mediaType === 'video' ? 'videoclipul încărcat' : 'mesajul vocal încărcat';
    const thumbnailUrl = mediaType === 'photo' ? (uploadData.bunnyUrl as string) : null;
    const guestEmail = String(guestData.email ?? '').trim().toLowerCase();
    const guestName = String(guestData.name ?? 'un invitat');
    const shouldNotifyGuest = Boolean(guestDoc.exists && guestEmail && guestData.emailConsent === true);
    const shouldNotifyAdmin = true;
    const claims = guestDoc.exists
      ? await claimViewNotification(guestDoc.id, shouldNotifyGuest, shouldNotifyAdmin)
      : { guest: false, admin: !uploadData.adminViewNotificationSentAt };

    if (!claims.guest && !claims.admin) {
      response.json({ ok: true, alreadyNotified: true });
      return;
    }

    const recipientKinds = new Map<string, { guest: boolean; admin: boolean }>();
    if (claims.guest) {
      recipientKinds.set(guestEmail, { guest: true, admin: false });
    }
    if (claims.admin) {
      const adminEmail = SUPREME_ADMIN_EMAIL;
      const existingKinds = recipientKinds.get(adminEmail);
      recipientKinds.set(adminEmail, { guest: existingKinds?.guest ?? false, admin: true });
    }

    const deliveries = Array.from(recipientKinds.entries()).map(([recipient, kinds]) => {
      return sendViewNotificationEmail(
          recipient,
          guestName,
          hostDisplayName,
          guestDoc.exists ? guestDoc.id : '',
          thumbnailUrl,
          mediaLabel,
          eventType,
        ).then(() => ({ recipient, ...kinds, ok: true as const }))
        .catch((error) => {
          console.error(`[qr-moments] view notification email failed for ${eventSlug}/${uploadId} -> ${recipient}:`, error);
          return { recipient, ...kinds, ok: false as const };
        });
    });
    const deliveryResults = await Promise.all(deliveries);
    const successfulGuestDelivery = deliveryResults.some((delivery) => delivery.ok && delivery.guest);
    const successfulAdminDelivery = deliveryResults.some((delivery) => delivery.ok && delivery.admin);
    const failedClaims = {
      guest: claims.guest && !successfulGuestDelivery,
      admin: claims.admin && !successfulAdminDelivery,
    };
    if (guestDoc.exists) await releaseViewNotificationClaim(guestDoc.id, failedClaims);
    else if (successfulAdminDelivery) await uploadRef.update({ adminViewNotificationSentAt: Timestamp.now() });

    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Public: unsubscribe ─────────────────────────────────────────────────────

router.get('/unsubscribe/:guestId', async (request: Request, response: Response) => {
  try {
    const guestRef = firestore().collection(QR_GUESTS).doc(request.params.guestId);
    const guestDoc = await guestRef.get();

    if (!guestDoc.exists) {
      response.status(404).json({ error: 'Invitat negăsit.' });
      return;
    }

    await guestRef.update({ emailConsent: false });
    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Public: subscribe to gallery updates ───────────────────────────────────

router.post('/:eventSlug/subscribe', async (request: Request, response: Response) => {
  const { eventSlug } = request.params;
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const pin = String(request.body?.pin ?? '').trim().toUpperCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !pin || request.body?.consent !== true) {
    response.status(400).json({ error: 'Adresă de email invalidă.' });
    return;
  }

  try {
    const eventDoc = await getEventBySlug(eventSlug);
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }
    if (eventDoc.data()!.pin !== pin) {
      response.status(403).json({ error: 'PIN incorect.' });
      return;
    }

    const existing = await firestore()
      .collection(QR_GALLERY_SUBSCRIBERS)
      .where('eventSlug', '==', eventSlug)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (existing.empty) {
      await firestore().collection(QR_GALLERY_SUBSCRIBERS).add({
        eventSlug,
        email,
        createdAt: Timestamp.now(),
      });
    }

    response.json({ ok: true });
  } catch (error) {
    console.error(`[qr-moments] gallery subscription failed for ${eventSlug}:`, error);
    response.status(500).json({ error: 'Nu am putut salva abonarea.' });
  }
});

// ─── Admin: list all uploads for event ──────────────────────────────────────

router.get('/admin/:eventSlug/uploads', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    const snapshot = await firestore()
      .collection(QR_UPLOADS)
      .where('eventSlug', '==', request.params.eventSlug)
      .get();

    const uploads = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
    }));

    response.json({ uploads });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.get('/admin/:eventSlug/download', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { eventSlug } = request.params;
  const requestedType = String(request.query.type ?? 'all').toLowerCase();
  const allowedTypes = new Set(['all', 'photo', 'video', 'audio']);

  if (!allowedTypes.has(requestedType)) {
    response.status(400).json({ error: 'Categoria invalidă. Folosește all, photo, video sau audio.' });
    return;
  }

  try {
    const [eventDoc, uploadsSnapshot] = await Promise.all([
      firestore().collection(QR_EVENTS).doc(eventSlug).get(),
      firestore().collection(QR_UPLOADS).where('eventSlug', '==', eventSlug).get(),
    ]);

    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    type DownloadUpload = {
      id: string;
      type?: string;
      createdAt?: unknown;
      originalName?: string;
      fileName?: string;
      bunnyUrl?: string;
    };
    const uploads: DownloadUpload[] = uploadsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as DownloadUpload)
      .filter((upload) => requestedType === 'all' || upload.type === requestedType)
      .sort((first, second) => {
        const firstDate = first.createdAt instanceof Timestamp ? first.createdAt.toMillis() : 0;
        const secondDate = second.createdAt instanceof Timestamp ? second.createdAt.toMillis() : 0;
        return firstDate - secondDate;
      });

    if (uploads.length === 0) {
      response.status(404).json({ error: 'Nu există materiale pentru această categorie.' });
      return;
    }

    const archiveName = `${eventSlug}-qr-moments-${requestedType}.zip`;
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => response.destroy(error));
    archive.pipe(response);

    const usedNames = new Set<string>();
    const categoryFolder = (type: string) => type === 'photo' ? 'foto' : type === 'video' ? 'video' : 'audio';
    const safeName = (value: unknown, fallback: string) => {
      const base = String(value ?? fallback)
        .replace(/[\\/:*?"<>|]/g, '_')
        .split('')
        .filter((character) => character.charCodeAt(0) >= 32)
        .join('')
        .trim() || fallback;
      let name = base;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        const dot = base.lastIndexOf('.');
        name = `${dot > 0 ? base.slice(0, dot) : base}-${suffix}${dot > 0 ? base.slice(dot) : ''}`;
        suffix += 1;
      }
      usedNames.add(name.toLowerCase());
      return name;
    };

    for (const upload of uploads) {
      const type = String(upload.type ?? 'audio');
      const originalName = safeName(upload.originalName ?? upload.fileName, `${upload.id}`);
      const entryName = `${categoryFolder(type)}/${originalName}`;
      try {
        const fileResponse = await fetch(String(upload.bunnyUrl ?? ''));
        if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
        if (fileResponse.body) {
          archive.append(Readable.fromWeb(fileResponse.body as Parameters<typeof Readable.fromWeb>[0]), { name: entryName });
        } else {
          const file = await downloadBunnyOriginal(String(upload.bunnyUrl ?? ''));
          archive.append(file.buffer, { name: entryName });
        }
      } catch (error) {
        console.error(`[qr-moments] download skip ${eventSlug}/${upload.id}:`, error);
        archive.append(`Fișier indisponibil: ${String(upload.originalName ?? upload.fileName ?? upload.id)}\n`, { name: `${categoryFolder(type)}/_erori.txt` });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('[qr-moments] admin materials download failed:', error);
    if (!response.headersSent) response.status(500).json({ error: 'Nu s-au putut arhiva materialele.' });
  }
});

router.get('/admin/events', requireFirebaseAuth, requireSupremeAdmin, async (_request: Request, response: Response) => {
  try {
    const snapshot = await firestore().collection(QR_EVENTS).orderBy('eventDate', 'desc').get();

    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        eventSlug: data.eventSlug ?? doc.id,
        adminEventId: data.adminEventId ?? null,
        bride: data.bride ?? null,
        groom: data.groom ?? null,
        eventType: normalizeQrEventType(data.eventType),
        notificationEmail: data.notificationEmail ?? null,
        pin: data.pin ?? null,
        eventDate: (data.eventDate as Timestamp).toDate().toISOString(),
        createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : null,
      };
    });

    response.json({ events });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.post('/admin/events', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { bride, groom, pin, adminEventId, notificationEmail, eventType, eventDate } = request.body as {
    bride?: string;
    groom?: string;
    pin?: string;
    adminEventId?: string;
    notificationEmail?: string;
    eventType?: string;
    eventDate?: string;
  };
  const normalizedEventType = normalizeQrEventType(eventType);
  const normalizedAdminEventId = adminEventId?.trim() || null;

  try {
    let adminEventDateRaw: Timestamp | string | null = eventDate?.trim() || null;
    if (normalizedAdminEventId) {
      const adminEventDoc = await firestore().collection('adminEvents').doc(normalizedAdminEventId).get();
      if (!adminEventDoc.exists) {
        response.status(404).json({ error: 'Evenimentul selectat nu există.' });
        return;
      }

      const adminEventData = adminEventDoc.data()!;
      if (adminEventData.status !== 'confirmat') {
        response.status(400).json({ error: 'Poți crea QR Moments doar pentru evenimente confirmate.' });
        return;
      }

      adminEventDateRaw = adminEventData.eventDate as Timestamp | string | null;
    }

    const parsedEventDate =
      adminEventDateRaw instanceof Timestamp
        ? adminEventDateRaw.toDate()
        : adminEventDateRaw
        ? new Date(adminEventDateRaw)
        : null;

    if (!parsedEventDate || Number.isNaN(parsedEventDate.getTime())) {
      response.status(400).json({ error: 'Evenimentul selectat nu are o dată validă.' });
      return;
    }

    const normalizedEventSlug = normalizeEventSlug(buildDateSlug(parsedEventDate));
    const eventRef = firestore().collection(QR_EVENTS).doc(normalizedEventSlug);
    const existingEvent = await eventRef.get();

    if (existingEvent.exists) {
      response.status(409).json({ error: 'Există deja un eveniment QR Moments cu acest slug.' });
      return;
    }

    const nextPin = pin?.trim().toUpperCase() || generatePin();
    const normalizedBride = normalizedEventType === 'corporate'
      ? (bride?.trim() || 'ORGANIZATORUL')
      : (bride?.trim() || null);
    const normalizedGroom = normalizedEventType === 'corporate' ? null : (groom?.trim() || null);

    await eventRef.set({
      eventSlug: normalizedEventSlug,
      adminEventId: normalizedAdminEventId,
      // Standalone QR Moments events use their own slug as the Bunny album.
      // Integrated events resolve the album from adminEvents at upload time.
      albumSlug: normalizedAdminEventId ? null : normalizedEventSlug,
      bride: normalizedBride,
      groom: normalizedGroom,
      eventType: normalizedEventType,
      notificationEmail: notificationEmail?.trim().toLowerCase() || null,
      eventDate: Timestamp.fromDate(parsedEventDate),
      pin: nextPin,
      createdAt: Timestamp.now(),
    });

    response.status(201).json({
      ok: true,
      event: {
        id: normalizedEventSlug,
        eventSlug: normalizedEventSlug,
        adminEventId: normalizedAdminEventId,
        bride: normalizedBride,
        groom: normalizedGroom,
        eventType: normalizedEventType,
        notificationEmail: notificationEmail?.trim().toLowerCase() || null,
        pin: nextPin,
        eventDate: parsedEventDate.toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.patch('/admin/:eventSlug', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { bride, groom, eventDate, pin, adminEventId, notificationEmail, eventType } = request.body as {
    bride?: string;
    groom?: string;
    eventDate?: string;
    pin?: string;
    adminEventId?: string;
    notificationEmail?: string;
    eventType?: string;
  };

  const updatePayload: Record<string, unknown> = {};

  if (typeof bride === 'string') updatePayload.bride = bride.trim() || null;
  if (typeof groom === 'string') updatePayload.groom = groom.trim() || null;
  if (typeof eventType === 'string') updatePayload.eventType = normalizeQrEventType(eventType);
  if (typeof pin === 'string') updatePayload.pin = pin.trim().toUpperCase() || generatePin();
  if (typeof adminEventId === 'string') updatePayload.adminEventId = adminEventId.trim() || null;
  if (typeof notificationEmail === 'string') updatePayload.notificationEmail = notificationEmail.trim().toLowerCase() || null;
  if (typeof eventDate === 'string') {
    const parsedEventDate = new Date(eventDate);
    if (Number.isNaN(parsedEventDate.getTime())) {
      response.status(400).json({ error: 'eventDate invalid.' });
      return;
    }
    updatePayload.eventDate = Timestamp.fromDate(parsedEventDate);
  }

  if (Object.keys(updatePayload).length === 0) {
    response.status(400).json({ error: 'Nu există câmpuri de actualizat.' });
    return;
  }

  try {
    const eventRef = firestore().collection(QR_EVENTS).doc(request.params.eventSlug);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    const effectiveEventType = normalizeQrEventType(eventType ?? eventDoc.data()?.eventType);
    if (effectiveEventType === 'corporate') {
      updatePayload.bride = typeof bride === 'string' ? (bride.trim() || 'ORGANIZATORUL') : (eventDoc.data()?.bride || 'ORGANIZATORUL');
      updatePayload.groom = null;
      updatePayload.eventType = effectiveEventType;
    }

    await eventRef.update(updatePayload);
    const refreshedDoc = await eventRef.get();
    const refreshedData = refreshedDoc.data()!;

    response.json({
      ok: true,
      event: {
        id: refreshedDoc.id,
        eventSlug: refreshedData.eventSlug ?? refreshedDoc.id,
        adminEventId: refreshedData.adminEventId ?? null,
        bride: refreshedData.bride ?? null,
        groom: refreshedData.groom ?? null,
        eventType: normalizeQrEventType(refreshedData.eventType),
        notificationEmail: refreshedData.notificationEmail ?? null,
        pin: refreshedData.pin ?? null,
        eventDate: (refreshedData.eventDate as Timestamp).toDate().toISOString(),
        createdAt: refreshedData.createdAt ? (refreshedData.createdAt as Timestamp).toDate().toISOString() : null,
      },
    });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Admin: delete event (cascades uploads, guests, comments) ──────────────

router.delete('/admin/:eventSlug', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { eventSlug } = request.params;

  try {
    const eventRef = firestore().collection(QR_EVENTS).doc(eventSlug);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    const [uploadsSnapshot, guestsSnapshot, commentsSnapshot] = await Promise.all([
      firestore().collection(QR_UPLOADS).where('eventSlug', '==', eventSlug).get(),
      firestore().collection(QR_GUESTS).where('eventSlug', '==', eventSlug).get(),
      firestore().collection(QR_COMMENTS).where('eventSlug', '==', eventSlug).get(),
    ]);

    const accessKey = getBunnyStorageKey();
    await Promise.all(uploadsSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const storedAlbumSlug = data.albumSlug as string | undefined;
      const storageUrl = storedAlbumSlug
        ? buildBunnyUploadUrl(storedAlbumSlug, data.guestId as string, data.fileName as string)
        : buildBunnyStorageUrl('qr-moments', eventSlug, data.guestId as string, data.fileName as string);
      await fetch(storageUrl, { method: 'DELETE', headers: { [BUNNY_ACCESS_KEY_HEADER]: accessKey } }).catch(() => {});
    }));

    const batchDeletes = [
      ...uploadsSnapshot.docs.map((doc) => doc.ref.delete()),
      ...guestsSnapshot.docs.map((doc) => doc.ref.delete()),
      ...commentsSnapshot.docs.map((doc) => doc.ref.delete()),
    ];
    await Promise.all(batchDeletes);
    await eventRef.delete();

    response.json({ ok: true });
  } catch (error) {
    console.error('[qr-moments] delete event failed:', error);
    response.status(500).json({ error: 'Nu s-a putut șterge evenimentul.' });
  }
});

// ─── Admin: list guests for event ───────────────────────────────────────────

router.get('/admin/guests', requireFirebaseAuth, requireSupremeAdmin, async (_request: Request, response: Response) => {
  try {
    const [eventsSnapshot, guestsSnapshot] = await Promise.all([
      firestore().collection(QR_EVENTS).get(),
      firestore().collection(QR_GUESTS).get(),
    ]);

    const eventMap = new Map(eventsSnapshot.docs.map((doc) => [doc.id, doc.data()]));
    type EmailGroup = {
      eventSlug: string;
      coupleLabel: string;
      eventDate: string | null;
      notificationEmail: string | null;
      guests: Array<{
        id: string;
        name: string;
        email: string;
        emailConsent: boolean;
        uploadCount: number;
        createdAt: string | null;
      }>;
    };
    const groups = new Map<string, EmailGroup>();

    for (const doc of guestsSnapshot.docs) {
      const data = doc.data();
      const eventSlug = String(data.eventSlug ?? '');
      const email = String(data.email ?? '').trim().toLowerCase();
      if (!eventSlug || !email) continue;

      const eventData = eventMap.get(eventSlug) ?? {};
      const existing: EmailGroup = groups.get(eventSlug) ?? {
        eventSlug,
        coupleLabel: eventData.bride && eventData.groom ? `${eventData.bride} & ${eventData.groom}` : eventSlug,
        eventDate: eventData.eventDate instanceof Timestamp ? eventData.eventDate.toDate().toISOString() : null,
        notificationEmail: eventData.notificationEmail ?? null,
        guests: [],
      };
      existing.guests.push({
        id: doc.id,
        name: String(data.name ?? 'Anonim'),
        email,
        emailConsent: data.emailConsent !== false,
        uploadCount: Array.isArray(data.uploadIds) ? data.uploadIds.length : 0,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
      });
      groups.set(eventSlug, existing);
    }

    const eventSlugsWithoutGuests = eventsSnapshot.docs
      .filter((doc) => !groups.has(doc.id))
      .map((doc) => {
        const data = doc.data();
        return {
          eventSlug: data.eventSlug ?? doc.id,
          coupleLabel: data.bride && data.groom ? `${data.bride} & ${data.groom}` : data.eventSlug ?? doc.id,
          eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate().toISOString() : null,
          notificationEmail: data.notificationEmail ?? null,
          guests: [],
        };
      });

    response.json({
      groups: [...groups.values(), ...eventSlugsWithoutGuests].sort((first, second) =>
        (second.eventDate ?? '').localeCompare(first.eventDate ?? '')
      ),
    });
  } catch (error) {
    console.error('[qr-moments] admin guests directory failed:', error);
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.get('/admin/:eventSlug/guests', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    const snapshot = await firestore()
      .collection(QR_GUESTS)
      .where('eventSlug', '==', request.params.eventSlug)
      .get();

    const guests = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      email: doc.data().email,
      emailConsent: doc.data().emailConsent,
      uploadCount: ((doc.data().uploadIds as string[]) ?? []).length,
      createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
    }));

    response.json({ guests });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.get('/admin/:eventSlug/comments', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    const [commentsSnapshot, uploadsSnapshot, guestsSnapshot] = await Promise.all([
      firestore().collection(QR_COMMENTS).where('eventSlug', '==', request.params.eventSlug).get(),
      firestore().collection(QR_UPLOADS).where('eventSlug', '==', request.params.eventSlug).get(),
      firestore().collection(QR_GUESTS).where('eventSlug', '==', request.params.eventSlug).get(),
    ]);

    const uploadMap = new Map<string, UploadLookup>(
      uploadsSnapshot.docs.map((doc) => [doc.id, {
        id: doc.id,
        guestId: doc.data().guestId as string,
        bunnyUrl: doc.data().bunnyUrl as string,
        type: doc.data().type as string,
        mimeType: doc.data().mimeType as string,
        originalName: doc.data().originalName as string,
      }]),
    );
    const guestMap = new Map<string, GuestLookup>(
      guestsSnapshot.docs.map((doc) => [doc.id, {
        id: doc.id,
        name: doc.data().name as string,
        email: doc.data().email as string,
      }]),
    );

    const comments = commentsSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const upload = uploadMap.get(data.uploadId as string);
        const guest = upload ? guestMap.get(upload.guestId as string) : null;

        return {
          id: doc.id,
          uploadId: data.uploadId,
          eventSlug: data.eventSlug,
          text: data.text,
          fromHost: data.fromHost,
          createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
          upload: upload
            ? {
                id: upload.id,
                bunnyUrl: upload.bunnyUrl,
                type: upload.type,
                mimeType: upload.mimeType,
                originalName: upload.originalName,
              }
            : null,
          guest: guest
            ? {
                id: guest.id,
                name: guest.name,
                email: guest.email,
              }
            : null,
        };
      })
      .sort((firstComment, secondComment) => secondComment.createdAt.localeCompare(firstComment.createdAt));

    response.json({ comments });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

router.get('/admin/:eventSlug/overview', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(request.params.eventSlug).get();
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    const [uploadsSnapshot, guestsSnapshot, commentsSnapshot] = await Promise.all([
      firestore().collection(QR_UPLOADS).where('eventSlug', '==', request.params.eventSlug).get(),
      firestore().collection(QR_GUESTS).where('eventSlug', '==', request.params.eventSlug).get(),
      firestore().collection(QR_COMMENTS).where('eventSlug', '==', request.params.eventSlug).get(),
    ]);

    const eventData = eventDoc.data()!;
    const guests = guestsSnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      email: doc.data().email,
      gdprConsent: doc.data().gdprConsent,
      emailConsent: doc.data().emailConsent,
      uploadIds: doc.data().uploadIds ?? [],
      createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
    })).sort((firstGuest, secondGuest) => secondGuest.createdAt.localeCompare(firstGuest.createdAt));

    const guestMap = new Map(guests.map((guest) => [guest.id, guest]));

    const uploads = uploadsSnapshot.docs.map((doc) => ({
      id: doc.id,
      eventSlug: doc.data().eventSlug,
      guestId: doc.data().guestId,
      guestName: guestMap.get(doc.data().guestId as string)?.name ?? 'Anonim',
      type: doc.data().type,
      bunnyUrl: doc.data().bunnyUrl,
      fileName: doc.data().fileName,
      originalName: doc.data().originalName,
      visible: doc.data().visible,
      mimeType: doc.data().mimeType,
      createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
    })).sort((firstUpload, secondUpload) => secondUpload.createdAt.localeCompare(firstUpload.createdAt));

    const uploadMap = new Map(uploads.map((upload) => [upload.id, upload]));

    const comments = commentsSnapshot.docs.map((doc) => ({
      id: doc.id,
      uploadId: doc.data().uploadId,
      eventSlug: doc.data().eventSlug,
      text: doc.data().text,
      fromHost: doc.data().fromHost,
      createdAt: (doc.data().createdAt as Timestamp).toDate().toISOString(),
      uploadOriginalName: uploadMap.get(doc.data().uploadId as string)?.originalName ?? null,
      guestName: uploadMap.get(doc.data().uploadId as string)?.guestName ?? 'Anonim',
    })).sort((firstComment, secondComment) => secondComment.createdAt.localeCompare(firstComment.createdAt));

    response.json({
      event: {
        id: eventDoc.id,
        eventSlug: eventData.eventSlug ?? eventDoc.id,
        adminEventId: eventData.adminEventId ?? null,
        bride: eventData.bride ?? null,
        groom: eventData.groom ?? null,
        eventType: normalizeQrEventType(eventData.eventType),
        notificationEmail: eventData.notificationEmail ?? null,
        pin: eventData.pin ?? null,
        eventDate: (eventData.eventDate as Timestamp).toDate().toISOString(),
        createdAt: eventData.createdAt ? (eventData.createdAt as Timestamp).toDate().toISOString() : null,
      },
      guests,
      uploads,
      comments,
    });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Admin: delete upload ────────────────────────────────────────────────────

router.delete('/admin/upload/:uploadId', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    const uploadDoc = await firestore().collection(QR_UPLOADS).doc(request.params.uploadId).get();
    if (!uploadDoc.exists) {
      response.status(404).json({ error: 'Upload negăsit.' });
      return;
    }

    const data = uploadDoc.data()!;
    const accessKey = getBunnyStorageKey();
    const storedAlbumSlug = data.albumSlug as string | undefined;
    const storageUrl = storedAlbumSlug
      ? buildBunnyUploadUrl(storedAlbumSlug, data.guestId as string, data.fileName as string)
      : buildBunnyStorageUrl('qr-moments', data.eventSlug as string, data.guestId as string, data.fileName as string);

    await fetch(storageUrl, {
      method: 'DELETE',
      headers: { [BUNNY_ACCESS_KEY_HEADER]: accessKey },
    });

    await Promise.all([
      firestore().collection(QR_UPLOADS).doc(request.params.uploadId).delete(),
      firestore().collection(QR_GUESTS).doc(data.guestId as string).update({
        uploadIds: FieldValue.arrayRemove(request.params.uploadId),
      }),
      Promise.all(
        (await firestore().collection(QR_COMMENTS).where('uploadId', '==', request.params.uploadId).get()).docs.map((doc) => doc.ref.delete()),
      ),
    ]);

    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Admin: delete ALL uploads from one guest ───────────────────────────────

router.delete('/admin/:eventSlug/guest/:guestId/uploads', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { eventSlug, guestId } = request.params;

  try {
    const uploadsSnapshot = await firestore()
      .collection(QR_UPLOADS)
      .where('eventSlug', '==', eventSlug)
      .where('guestId', '==', guestId)
      .get();

    if (uploadsSnapshot.empty) {
      response.json({ ok: true, deleted: 0 });
      return;
    }

    const uploadIds = uploadsSnapshot.docs.map((doc) => doc.id);
    const accessKey = getBunnyStorageKey();

    // Best-effort binary cleanup — a file already gone from Bunny must not block
    // the Firestore cleanup.
    await Promise.all(uploadsSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const storedAlbumSlug = data.albumSlug as string | undefined;
      const storageUrl = storedAlbumSlug
        ? buildBunnyUploadUrl(storedAlbumSlug, data.guestId as string, data.fileName as string)
        : buildBunnyStorageUrl('qr-moments', eventSlug, data.guestId as string, data.fileName as string);
      await fetch(storageUrl, { method: 'DELETE', headers: { [BUNNY_ACCESS_KEY_HEADER]: accessKey } }).catch(() => {});
    }));

    const commentsSnapshot = await firestore()
      .collection(QR_COMMENTS)
      .where('eventSlug', '==', eventSlug)
      .get();
    const staleComments = commentsSnapshot.docs.filter((doc) => uploadIds.includes(doc.data().uploadId as string));

    await Promise.all([
      ...uploadsSnapshot.docs.map((doc) => doc.ref.delete()),
      ...staleComments.map((doc) => doc.ref.delete()),
      firestore().collection(QR_GUESTS).doc(guestId).update({
        uploadIds: FieldValue.arrayRemove(...uploadIds),
      }).catch(() => {}),
    ]);

    response.json({ ok: true, deleted: uploadIds.length });
  } catch (error) {
    console.error('[qr-moments] bulk delete guest uploads failed:', error);
    response.status(500).json({ error: 'Nu s-au putut șterge upload-urile invitatului.' });
  }
});

// ─── Admin: delete comment ───────────────────────────────────────────────────

router.delete('/admin/comment/:commentId', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  try {
    await firestore().collection(QR_COMMENTS).doc(request.params.commentId).delete();
    response.json({ ok: true });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Admin: reset PIN for event ──────────────────────────────────────────────

router.post('/admin/:eventSlug/pin', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const newPin = Math.random().toString(36).slice(2, 8).toUpperCase();
  try {
    await firestore().collection(QR_EVENTS).doc(request.params.eventSlug).update({ pin: newPin });
    response.json({ pin: newPin });
  } catch {
    response.status(500).json({ error: 'Eroare server.' });
  }
});

// ─── Admin: send gallery access link to any email (e.g. the client) ─────────

router.post('/admin/:eventSlug/send-gallery-email', requireFirebaseAuth, requireSupremeAdmin, async (request: Request, response: Response) => {
  const { eventSlug } = request.params;
  const email = String(request.body?.email ?? '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    response.status(400).json({ error: 'Adresă de email invalidă.' });
    return;
  }

  try {
    const eventDoc = await firestore().collection(QR_EVENTS).doc(eventSlug).get();
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Evenimentul nu există.' });
      return;
    }

    const eventData = eventDoc.data()!;
    const pin = eventData.pin as string | undefined;
    if (!pin) {
      response.status(400).json({ error: 'Evenimentul nu are încă un PIN generat.' });
      return;
    }

    const eventType = normalizeQrEventType(eventData.eventType);
    const bride = (eventData.bride as string | undefined)?.trim();
    const groom = (eventData.groom as string | undefined)?.trim();
    const coupleLabel = bride && groom ? `${bride} & ${groom}` : (bride || groom || getHostsFallbackName(eventType));

    const uploadsSnapshot = await firestore().collection(QR_UPLOADS).where('eventSlug', '==', eventSlug).get();
    const typeCounts = { photo: 0, video: 0, audio: 0 };
    uploadsSnapshot.docs.forEach((doc) => {
      const type = doc.data().type as 'photo' | 'video' | 'audio';
      if (type in typeCounts) typeCounts[type] += 1;
    });
    const uploadLabel = describeUploadCounts(typeCounts);

    const galleryUrl = `${APP_BASE_URL}/qr-moments/${eventSlug}/gallery?pin=${pin}`;

    await sendEmail({
      to: email,
      subject: `📸 Acces galerie QR Moments — ${coupleLabel}`,
      html: `
        <div style="margin:0;padding:24px;background:#f5f1ea;font-family:Arial,sans-serif;color:#241f1a;">
          <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfce;border-radius:18px;padding:28px 24px;box-shadow:0 8px 30px rgba(68,44,16,0.08);">
            <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b7791f;">QR Moments</p>
            <h2 style="color:#241f1a;margin:0 0 8px;font-size:24px;font-weight:600;">Galeria voastră e gata!</h2>
            <p style="color:#6b5b4d;margin:0;line-height:1.5;">
              Aveți acces la galeria evenimentului <strong>${coupleLabel}</strong>, cu ${uploadLabel} încărcate de invitați.
            </p>
            <a href="${galleryUrl}" style="display:inline-block;background:#e0a13b;color:#241f1a;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:700;margin-top:20px;">
              Deschide galeria
            </a>
            <p style="font-size:12px;color:#7b6a5a;margin:18px 0 0;">
              Link-ul include deja codul de acces, așa că se deschide direct — nu mai trebuie introdus niciun PIN.
            </p>
          </div>
        </div>
      `,
    });

    response.json({ ok: true });
  } catch (error) {
    console.error('[qr-moments] send-gallery-email failed:', error);
    response.status(500).json({ error: 'Nu am putut trimite emailul.' });
  }
});

export default router;
