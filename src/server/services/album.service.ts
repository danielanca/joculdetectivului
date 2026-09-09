import { signBunnyUrl } from "../utils/signBunnyUrl.js";
import { listFiles, checkFileExists } from "./bunny.service.js";
import {
  BUNNY_DEFAULT_ARCHIVE_NAME,
  BUNNY_ACCESS_KEY_HEADER,
  buildBunnyDirectoryUrl,
  getBunnyStorageKey,
} from "../constants/bunny.js";
import { firestore } from "../firestore.js";
import { FieldValue } from "firebase-admin/firestore";
import type { Album } from "./../../client/pages/MediaDownload/AlbumTypes.js";

const storageKey = getBunnyStorageKey();
const FIRESTORE_CACHE_COL = "album_index";
const FIRESTORE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 oră

type BunnyObject = { ObjectName: string };
type AlbumMediaList = string[];
type AlbumVideo = string | null;

// ── In-memory cache (per proces, resetat la restart) ──────────────────────────
const MEM_CACHE_TTL_MS = 5 * 60 * 1000;
const memCache = new Map<string, { album: Album; at: number }>();

function getMemCache(slug: string): Album | null {
  const e = memCache.get(slug);
  if (!e) return null;
  if (Date.now() - e.at > MEM_CACHE_TTL_MS) { memCache.delete(slug); return null; }
  return e.album;
}

function setMemCache(slug: string, album: Album): void {
  memCache.set(slug, { album, at: Date.now() });
}

// ── Firestore cache (persistent, supraviețuiește restart) ─────────────────────
async function getFirestoreCache(slug: string): Promise<Album | null> {
  try {
    const doc = await firestore().collection(FIRESTORE_CACHE_COL).doc(slug).get();
    if (!doc.exists) return null;
    const data = doc.data() as { album: Album; indexedAt: { toMillis: () => number } } | undefined;
    if (!data?.album || !data.indexedAt) return null;
    if (Date.now() - data.indexedAt.toMillis() > FIRESTORE_CACHE_TTL_MS) return null;
    return data.album;
  } catch {
    return null;
  }
}

async function setFirestoreCache(slug: string, album: Album): Promise<void> {
  try {
    await firestore().collection(FIRESTORE_CACHE_COL).doc(slug).set({
      album,
      indexedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn(`[album-cache] Firestore write failed for ${slug}:`, error);
  }
}

export function invalidateAlbumCache(slug: string): void {
  memCache.delete(slug);
  firestore().collection(FIRESTORE_CACHE_COL).doc(slug).delete().catch(() => {});
  console.log(`[album-cache] invalidat: ${slug}`);
}

// ── Slug canonicalizare (8august2026 ⇄ 08august2026) ─────────────────────────
// Ziua din slug poate fi scrisă cu sau fără zero în față. Acceptăm ambele forme
// și le mapăm la folderul care există efectiv în Bunny.
const SLUG_RESOLVE_TTL_MS = 30 * 60 * 1000;
const slugResolveCache = new Map<string, { canonical: string; at: number }>();

function slugDayVariants(slug: string): string[] {
  const match = slug.match(/^(\d{1,2})(\D.*)$/);
  if (!match) return [slug];
  const [, day, rest] = match;
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1 || n > 31) return [slug];
  return [...new Set([slug, `${n}${rest}`, `${String(n).padStart(2, "0")}${rest}`])];
}

async function albumHasPhotos(slug: string): Promise<boolean> {
  try {
    const [preview, photos] = await Promise.all([
      listFiles(`${slug}/photos_preview`),
      listFiles(`${slug}/photos`),
    ]);
    return preview.length > 0 || photos.length > 0;
  } catch {
    return false;
  }
}

/** Întoarce slug-ul real (folderul din Bunny cu poze). Preferă slug-ul cerut. */
export async function resolveAlbumSlug(requested: string): Promise<string> {
  const variants = slugDayVariants(requested);
  if (variants.length === 1) return requested;

  const cached = slugResolveCache.get(requested);
  if (cached && Date.now() - cached.at < SLUG_RESOLVE_TTL_MS) return cached.canonical;

  let canonical = requested;
  for (const variant of variants) {
    if (await albumHasPhotos(variant)) { canonical = variant; break; }
  }
  slugResolveCache.set(requested, { canonical, at: Date.now() });
  return canonical;
}

// ── Bunny helpers ─────────────────────────────────────────────────────────────
async function checkAlbumExists(slug: string): Promise<boolean> {
  try {
    const res = await fetch(buildBunnyDirectoryUrl(encodeURIComponent(slug)), {
      headers: { [BUNNY_ACCESS_KEY_HEADER]: storageKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── loadAlbum: mem cache → Firestore cache → Bunny ────────────────────────────
export async function loadAlbum(slug: string): Promise<Album | null> {
  // 1. In-memory (instant)
  const mem = getMemCache(slug);
  if (mem) { console.log(`[album] cache HIT mem: ${slug}`); return mem; }

  // 2. Firestore cache (~100ms, supraviețuiește restart)
  const fs = await getFirestoreCache(slug);
  if (fs) {
    console.log(`[album] cache HIT firestore: ${slug}`);
    setMemCache(slug, fs);
    return fs;
  }

  // 3. Bunny (lent, ~5-10s pentru albume mari)
  console.log(`[album] cache MISS — fetch Bunny: ${slug}`);
  const t0 = Date.now();

  const loadSection = async (section: string): Promise<AlbumMediaList> => {
    try {
      const objects = await listFiles(`${slug}/${section}`);
      if (!objects.length) return [];
      return objects.map((o: BunnyObject) => signBunnyUrl(`/${slug}/${section}/${o.ObjectName}`));
    } catch { return []; }
  };

  const loadVideo = async (section: string): Promise<AlbumVideo> => {
    try {
      const objects = await listFiles(`${slug}/${section}`);
      if (!objects.length) return null;
      return signBunnyUrl(`/${slug}/${section}/${(objects[0] as BunnyObject).ObjectName}`);
    } catch { return null; }
  };

  const [exists, zipReady, featured, photosPreview, originalPhoto, shortvideo, longvideo] = await Promise.all([
    checkAlbumExists(slug),
    checkFileExists(slug, BUNNY_DEFAULT_ARCHIVE_NAME),
    loadSection("featured"),
    loadSection("photos_preview"),
    loadSection("photos"),
    loadVideo("shortvideo"),
    loadVideo("longvideo"),
  ]);

  if (!exists) { console.warn(`[album] nu există în Bunny: ${slug}`); return null; }

  const photos = photosPreview.length > 0 ? photosPreview : originalPhoto;
  console.log(`[album] Bunny fetch: ${slug} — ${photos.length} poze, ${Date.now() - t0}ms`);

  const album: Album = {
    slug,
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    featured,
    photos,
    originalPhoto,
    shortvideo,
    longvideo,
    zipReady,
  };

  // Salvează în ambele cache-uri (fire-and-forget pentru Firestore)
  setMemCache(slug, album);
  setFirestoreCache(slug, album).catch(() => {});

  return album;
}
