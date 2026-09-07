import { useEffect, useMemo, useReducer, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import useAuth from "../../features/admin/auth/useAuth";
import BunnyPhotoGallery from "../Portfolio/BunnyPhotoGallery";
import styles from "./MediaAlbumPage.module.scss";
import type { Album } from "./AlbumTypes";
import AlbumNotFound from "./AlbumNotFound";
import AlbumPager from "../Portfolio/AlbumPager";
import DeliveryForm from './DeliveryForm';
import DeliveryAddressModal from "../DeliveryAddress/AddressList";
import PhotoLightbox from "./PhotoLightbox";
import OnboardingWizard from "./Onboardingwizard";
import MediaConsentModal, { MediaRetentionReminder } from "./MediaConsentModal";
import AncaLoader from "../../components/UI/AncaLoader";
import AncaVisualsPromo from "./AncaVisualsPromo";
import { OFFER_SERVICES } from "../../../shared/offers/offerServices";

// ── TYPES ────────────────────────────────────────────────────────────────────

type AlbumWithPrint = Album & {
  print?: string[];
};

type GalleryMode = "none" | "print" | "download";

type GalleryState = {
  mode: GalleryMode;
  browsePage: number;
  printPage: number;
  downloadPage: number;
  selectedPrint: Set<string>;
  selectedDownload: Set<string>;
  shareUrl: string | null;
  shareError: string | null;
};

type GalleryAction =
  | { type: "SET_MODE"; payload: GalleryMode }
  | { type: "SET_PAGE"; mode: GalleryMode; page: number }
  | { type: "TOGGLE_PHOTO"; mode: "print" | "download"; name: string }
  | { type: "SELECT_PAGE"; mode: "print" | "download"; names: string[]; selectAll: boolean }
  | { type: "SET_SELECTED_PRINT"; payload: Set<string> }
  | { type: "SET_SHARE_URL"; url: string | null; error: string | null }
  | { type: "CLOSE_MODE"; currentPage: number }
  | { type: "OPEN_PRINT_MODE"; initial: Set<string>; currentPage: number }
  | { type: "OPEN_DOWNLOAD_MODE"; currentPage: number }
  | { type: "HYDRATE"; payload: Partial<GalleryState> };

type PersistedStateV3 = {
  v: 3;
  mode: GalleryMode;
  browsePage: number;
  printPage: number;
  downloadPage: number;
  selectedPrint: string[];
  selectedDownload: string[];
};

type ShareCreateResponse = {
  id?: string;
};

type AdminAccount = {
  uid: string;
  email: string;
  displayName: string;
};

type CollaboratorInvitation = {
  id: string;
  email: string;
  albumSlug: string;
  status: "active" | "completed" | "cancelled";
  reminderCount: number;
  nextReminderAt: string | null;
  completedAt: string | null;
  completedActionType: "instagram" | "moderation" | null;
};

type AdminWindow = Window & {
  adminClickCount?: number;
  adminClickTimeout?: number | null;
};

// ── REDUCER ──────────────────────────────────────────────────────────────────

const initialGalleryState: GalleryState = {
  mode: "none",
  browsePage: 1,
  printPage: 1,
  downloadPage: 1,
  selectedPrint: new Set(),
  selectedDownload: new Set(),
  shareUrl: null,
  shareError: null,
};

function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.payload };

    case "SET_PAGE": {
      if (action.mode === "download") return { ...state, downloadPage: action.page };
      if (action.mode === "print") return { ...state, printPage: action.page };
      return { ...state, browsePage: action.page };
    }

    case "TOGGLE_PHOTO": {
      const setKey = action.mode === "print" ? "selectedPrint" : "selectedDownload";
      const next = new Set(state[setKey]);
      next.has(action.name) ? next.delete(action.name) : next.add(action.name);
      return { ...state, [setKey]: next };
    }

    case "SELECT_PAGE": {
      const setKey = action.mode === "print" ? "selectedPrint" : "selectedDownload";
      const next = new Set(state[setKey]);
      if (action.selectAll) action.names.forEach((name) => next.delete(name));
      else action.names.forEach((name) => next.add(name));
      return { ...state, [setKey]: next };
    }

    case "SET_SELECTED_PRINT":
      return { ...state, selectedPrint: action.payload };

    case "SET_SHARE_URL":
      return { ...state, shareUrl: action.url, shareError: action.error };

    case "CLOSE_MODE":
      return { ...state, mode: "none", browsePage: action.currentPage, shareUrl: null, shareError: null };

    case "OPEN_PRINT_MODE":
      return { ...state, mode: "print", selectedPrint: action.initial, printPage: action.currentPage, shareUrl: null, shareError: null };

    case "OPEN_DOWNLOAD_MODE":
      return { ...state, mode: "download", selectedDownload: new Set(), downloadPage: action.currentPage, shareUrl: null, shareError: null };

    case "HYDRATE":
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

const isMobileNow = () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false);

const storageKeyFor = (slug: string) => `av:album:${slug}:state`;

const safeParse = (raw: string | null): PersistedStateV3 | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedStateV3;
  } catch {
    return null;
  }
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const fmtBytes = (n: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let value = n;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const fileNameFromUrl = (src: string) => {
  try {
    const pathname = new URL(src).pathname;
    const last = pathname.split("/").pop() || "";
    return decodeURIComponent(last);
  } catch {
    const clean = src.split("?")[0].split("#")[0];
    const last = clean.split("/").pop() || clean;
    return decodeURIComponent(last);
  }
};

const mediaKeyFromUrl = (src: string) => {
  const fileName = fileNameFromUrl(src);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
};

type DeliveryAddressData = {
  swissLink?: string;
  deliveryAddress?: { fullName?: string };
};

const getDeliveryData = async (slug: string): Promise<DeliveryAddressData> => {
  const response = await fetch(`/api/album/${slug}/delivery-address`);
  if (response.ok) {
    const json = await response.json() as { data?: DeliveryAddressData };
    return json.data ?? {};
  }
  return {};
};

// ── MOBILE COLUMNS TOGGLE ────────────────────────────────────────────────────

function MobileColumnsToggle({
  mobileColumns,
  onMobileColumnsChange,
}: {
  mobileColumns: 1 | 2;
  onMobileColumnsChange: (columns: 1 | 2) => void;
}) {
  return (
    <div className={styles.gridToggle}>
      <button
        className={`${styles.gridBtn} ${mobileColumns === 1 ? styles.gridBtnActive : ""}`}
        type="button"
        onClick={() => onMobileColumnsChange(1)}
        aria-label="1 coloană"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      </button>
      <button
        className={`${styles.gridBtn} ${mobileColumns === 2 ? styles.gridBtnActive : ""}`}
        type="button"
        onClick={() => onMobileColumnsChange(2)}
        aria-label="2 coloane"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="8" height="16" rx="2" />
          <rect x="13" y="4" width="8" height="16" rx="2" />
        </svg>
      </button>
    </div>
  );
}

// ── COMPONENT ────────────────────────────────────────────────────────────────


export default function MediaAlbumPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { auth } = useAuth();

  const [moderationMode, setModerationMode] = useState(false);
  const isModerationMode = moderationMode;

  const pageFromUrl = Number(searchParams.get("page") ?? "1");

  const [album, setAlbum] = useState<AlbumWithPrint | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [gallery, dispatch] = useReducer(galleryReducer, initialGalleryState);

  const [savingPrint, setSavingPrint] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [showAdminButton, setShowAdminButton] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [swissLink, setSwissLink] = useState<string | null>(null);
  const [hasDeliveryAddress, setHasDeliveryAddress] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareMode, setShareMode] = useState<"selected" | "all">("selected");
  const [customUrl, setCustomUrl] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mobileColumns, setMobileColumns] = useState<1 | 2>(2);

  const [selectedModeration, setSelectedModeration] = useState<Set<string>>(new Set());
  const [showModerationSubmitModal, setShowModerationSubmitModal] = useState(false);
  const [moderationNote, setModerationNote] = useState("");
  const [submittingModeration, setSubmittingModeration] = useState(false);
  const [moderationSubmitResult, setModerationSubmitResult] = useState<string | null>(null);

  type InstagramProposal = {
    id: string;
    photoUrl: string;
    fileName: string;
    proposedBy: string;
    proposedAt: string;
    status: "pending" | "accepted" | "rejected" | "archived";
    destinations?: string[];
    mediaAssetServiceIds?: string[];
  };
  const [subscribers, setSubscribers] = useState<{ email: string; subscribedAt?: string }[]>([]);
  const [igProposals, setIgProposals] = useState<InstagramProposal[]>([]);
  const [igProposeMode, setIgProposeMode] = useState(false);
  const [selectedIgPropose, setSelectedIgPropose] = useState<Set<string>>(new Set());
  const [proposalDestinations, setProposalDestinations] = useState<Set<"instagram" | "media_assets">>(new Set(["instagram"]));
  const [proposalMediaServices, setProposalMediaServices] = useState<Set<string>>(new Set(["photo"]));
  const [submittingIgPropose, setSubmittingIgPropose] = useState(false);
  const [igProposeResult, setIgProposeResult] = useState<string | null>(null);
  const [igUpdatingId, setIgUpdatingId] = useState<string | null>(null);
  const [videoImportOpen, setVideoImportOpen] = useState(false);
  const [videoImportServices, setVideoImportServices] = useState<Set<string>>(new Set(["video"]));
  const [videoImporting, setVideoImporting] = useState(false);
  const [videoImportResult, setVideoImportResult] = useState<string | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [albumInvitations, setAlbumInvitations] = useState<CollaboratorInvitation[]>([]);
  const [selectedInviteEmail, setSelectedInviteEmail] = useState("");
  const [inviteForInstagram, setInviteForInstagram] = useState(true);
  const [inviteForModeration, setInviteForModeration] = useState(true);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);


  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [showSaveWarning, setShowSaveWarning] = useState(false);
  const saveWarningTimerRef = useRef<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tutorialPrintPhotos, setTutorialPrintPhotos] = useState<string[]>([]);

  const photosTopRef = useRef<HTMLDivElement | null>(null);
  const shareBoxRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const dimTapCountRef = useRef(0);
  const dimTapTimerRef = useRef<number | null>(null);

  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  const [stats, setStats] = useState<null | {
    photosCount: number;
    photosBytesTotal: number;
    shortVideoBytes: number;
    longVideoBytes: number;
    bytesTotalAll: number;
  }>(null);

  const [qrMoments, setQrMoments] = useState<{
    photos: string[];
    videos: string[];
    audio: string[];
    eventSlug?: string | null;
    galleryUrl?: string | null;
  } | null>(null);

  const [photobooth, setPhotobooth] = useState<{
    photos: string[];
    galleryUrl?: string | null;
  } | null>(null);

  // ── DERIVED STATE ──────────────────────────────────────────────────────────

  const { mode, browsePage, printPage, downloadPage, selectedPrint, selectedDownload, shareUrl, shareError } = gallery;

  const totalPhotos = album?.photos?.length ?? 0;
  const hasPhotos = totalPhotos > 0;
  const pageSize = isMobile ? 20 : 30;
  const totalPages = Math.max(1, Math.ceil(totalPhotos / pageSize));

  const activePage = mode === "download" ? downloadPage : mode === "print" ? printPage : pageFromUrl;
  const safePage = clamp(activePage, 1, totalPages);

  const emptySelected = useMemo(() => new Set<string>(), []);
  const activeSelected = mode === "print" ? selectedPrint : mode === "download" ? selectedDownload : emptySelected;

  const pagePhotos = useMemo(() => {
    if (!album?.photos?.length) return [];
    const start = (safePage - 1) * pageSize;
    return album.photos.slice(start, start + pageSize);
  }, [album?.photos, safePage, pageSize]);

  const galleryPhotos = pagePhotos;

  const originalByName = useMemo(() => {
    const map = new Map<string, string>();
    (album?.originalPhoto ?? []).forEach((url) => map.set(fileNameFromUrl(url), url));
    return map;
  }, [album?.originalPhoto]);

  const originalByMediaKey = useMemo(() => {
    const map = new Map<string, string>();
    (album?.originalPhoto ?? []).forEach((url) => map.set(mediaKeyFromUrl(url), url));
    return map;
  }, [album?.originalPhoto]);

  const previewByName = useMemo(() => {
    const map = new Map<string, string>();
    (album?.photos ?? []).forEach((url) => map.set(fileNameFromUrl(url), url));
    return map;
  }, [album?.photos]);

  const resolveOriginalPhoto = useCallback((url: string) => {
    return originalByName.get(fileNameFromUrl(url)) ?? originalByMediaKey.get(mediaKeyFromUrl(url)) ?? url;
  }, [originalByName, originalByMediaKey]);

  const galleryOrgPhotos = useMemo(() => {
    if (!galleryPhotos.length) return [];
    if (!album?.originalPhoto?.length) return galleryPhotos;
    return galleryPhotos.map(resolveOriginalPhoto);
  }, [galleryPhotos, album?.originalPhoto, resolveOriginalPhoto]);

  const featuredOrgPhotos = useMemo(() => {
    const featured = album?.featured ?? [];
    if (!featured.length) return [];
    if (!album?.originalPhoto?.length) return featured;
    return featured.map(resolveOriginalPhoto);
  }, [album?.featured, album?.originalPhoto, resolveOriginalPhoto]);

  const lightboxPhotos = useMemo(() => {
    const photos = album?.photos ?? [];
    if (!photos.length) return [];
    if (!album?.originalPhoto?.length) return photos;
    return photos.map(resolveOriginalPhoto);
  }, [album?.photos, album?.originalPhoto, resolveOriginalPhoto]);

  const printPhotos = useMemo(() => {
    return (album?.print ?? []).map((item) => {
      const fileName = fileNameFromUrl(item);
      return { fileName, src: previewByName.get(fileName) ?? item };
    });
  }, [album?.print, previewByName]);

  const pageNames = useMemo(() => pagePhotos.map(fileNameFromUrl), [pagePhotos]);
  const allOnPageSelected = mode !== "none" && pageNames.length > 0 && pageNames.every((name) => activeSelected.has(name));
  const printCount = useMemo(() => album?.print?.length ?? 0, [album?.print]);
  const downloadCount = selectedDownload.size;

  // ── EFFECTS ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;
    const savedKey = localStorage.getItem(`adminKey_${slug}`);
    if (savedKey) { setAdminKey(savedKey); setIsAdmin(true); }
  }, [slug]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  // Verifică dacă primul URL de imagine e accesibil după ce albumul se încarcă
  useEffect(() => {
    if (!album?.photos?.length) return;
    const firstUrl = album.photos[0];
    const img = new window.Image();
    img.onload = () => setImageLoadError(null);
    img.onerror = () => {
      const msg = `URL inaccesibil: ${firstUrl.slice(0, 80)}...`;
      console.error("[album] Prima imagine nu s-a putut încărca:", firstUrl);
      setImageLoadError(msg);
    };
    img.src = firstUrl;
  }, [album?.photos]);

  // Trimite email admin automat când diagnosticul apare
  useEffect(() => {
    if (!slug || !album) return;
    const photosEmpty = !album.photos?.length;
    if (!photosEmpty && !imageLoadError) return;
    fetch(`/api/album/${slug}/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photosCount: album.photos?.length ?? 0,
        errorMessage: imageLoadError ?? "Array photos gol (0 poze)",
        pageUrl: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toLocaleString("ro-RO"),
      }),
    }).catch(() => {});
  }, [album, imageLoadError, slug]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/album/${slug}/stats`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, [slug]);


  useEffect(() => {
    if (!slug) return;
    fetch(`/api/album/${slug}/qr-moments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setQrMoments(data))
      .catch(() => setQrMoments(null));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/album/${slug}/photobooth`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPhotobooth(data))
      .catch(() => setPhotobooth(null));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getDeliveryData(slug);
        if (!cancelled) {
          setSwissLink(data.swissLink || null);
          setHasDeliveryAddress(!!data.deliveryAddress?.fullName);
        }
      } catch (error) {
        console.error("Failed to load delivery data", error);
        if (!cancelled) { setSwissLink(null); setHasDeliveryAddress(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    photosTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [safePage]);

  useEffect(() => {
    if (shareUrl) shareBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shareUrl]);

  useEffect(() => {
    if (mode === "download") dispatch({ type: "SET_PAGE", mode: "download", page: safePage });
    else if (mode === "print") dispatch({ type: "SET_PAGE", mode: "print", page: safePage });
    else dispatch({ type: "SET_PAGE", mode: "none", page: safePage });
  }, [mode, safePage]);

  useEffect(() => {
    if (mode !== "download") {
      setSharePanelOpen(false);
      setShareMode("selected");
    }
  }, [mode]);

  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    hydratedRef.current = false;
    const raw = window.localStorage.getItem(storageKeyFor(slug));
    const data = safeParse(raw);
    if (data?.v === 3) {
      dispatch({
        type: "HYDRATE",
        payload: {
          mode: data.mode,
          browsePage: data.browsePage,
          printPage: data.printPage,
          downloadPage: data.downloadPage,
          selectedPrint: new Set(data.selectedPrint),
          selectedDownload: new Set(data.selectedDownload),
          shareUrl: null,
          shareError: null,
        },
      });
    }
    hydratedRef.current = true;
  }, [slug]);

  useEffect(() => {
    if (!slug || typeof window === "undefined" || !hydratedRef.current) return;
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const payload: PersistedStateV3 = {
        v: 3, mode, browsePage, printPage, downloadPage,
        selectedPrint: Array.from(selectedPrint),
        selectedDownload: Array.from(selectedDownload),
      };
      try { window.localStorage.setItem(storageKeyFor(slug), JSON.stringify(payload)); } catch {}
    }, 120);
  }, [slug, mode, browsePage, printPage, downloadPage, selectedPrint, selectedDownload]);

  // Arată mesaj după 8s dacă tot se încarcă
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setLoadingSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Trimite raport admin dacă albumul durează >8s să se încarce
  useEffect(() => {
    if (!loadingSlow || !slug) return;
    fetch(`/api/album/${slug}/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorMessage: "Albumul durează mai mult de 8 secunde să se încarce",
        pageUrl: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toLocaleString("ro-RO"),
      }),
    }).catch(() => {});
  }, [loadingSlow, slug]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      console.log(`[album] fetch /api/album/${slug}`);
      try {
        const response = await fetch(`/api/album/${slug}`);
        console.log(`[album] status: ${response.status}`);
        if (!response.ok) {
          console.warn(`[album] răspuns non-ok (${response.status}) pentru slug="${slug}"`);
          setAlbum(null); setLoading(false); return;
        }
        const data = await response.json();
        console.log(`[album] date primite:`, {
          title: data?.title,
          photos: data?.photos?.length ?? 0,
          featured: data?.featured?.length ?? 0,
          albumSlug: data?.albumSlug,
          zipReady: data?.zipReady,
        });
        if (!data?.photos?.length) {
          console.warn(`[album] ⚠ pozele sunt goale (photos=[]) pentru slug="${slug}". Verifică folderul Bunny: ${slug}/photos/ sau ${slug}/photos_preview/`);
        }
        setAlbum(data);
        setLoading(false);
      } catch (error) {
        console.error(`[album] eroare fetch:`, error);
        setAlbum(null); setLoading(false);
      }
    })();
  }, [slug]);

  // ── HANDLERS ───────────────────────────────────────────────────────────────

  const setPage = (updater: (p: number) => number) => {
    const nextPage = updater(safePage);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("page", String(nextPage));
      return params;
    }, { replace: false });
    if (mode === "download") dispatch({ type: "SET_PAGE", mode: "download", page: nextPage });
    else if (mode === "print") dispatch({ type: "SET_PAGE", mode: "print", page: nextPage });
  };

  const toggleSelectPage = () => {
    if (mode !== "print" && mode !== "download") return;
    dispatch({ type: "SELECT_PAGE", mode, names: pageNames, selectAll: allOnPageSelected });
  };

  const openPrintMode = () => {
    const initial = new Set<string>((album?.print ?? []).map(fileNameFromUrl));
    dispatch({ type: "OPEN_PRINT_MODE", initial, currentPage: safePage });
  };

  const openDownloadMode = () => dispatch({ type: "OPEN_DOWNLOAD_MODE", currentPage: safePage });
  const closeMode = () => dispatch({ type: "CLOSE_MODE", currentPage: safePage });

  const togglePhoto = (src: string) => {
    if (mode !== "print" && mode !== "download") return;
    dispatch({ type: "TOGGLE_PHOTO", mode, name: fileNameFromUrl(src) });
  };

  const onDimmedTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "none") return;
    const element = event.target as HTMLElement | null;
    if (!element) return;
    dimTapCountRef.current += 1;
    if (dimTapTimerRef.current) window.clearTimeout(dimTapTimerRef.current);
    dimTapTimerRef.current = window.setTimeout(() => {
      dimTapCountRef.current = 0;
      dimTapTimerRef.current = null;
    }, 1200);
    if (dimTapCountRef.current >= 3) {
      dimTapCountRef.current = 0;
      if (dimTapTimerRef.current) window.clearTimeout(dimTapTimerRef.current);
      dimTapTimerRef.current = null;
      closeMode();
    }
  };

  const scrollToPhoto = useCallback((src: string) => {
    const photoElement = document.querySelector<HTMLElement>(`[data-photo-src="${CSS.escape(src)}"]`);
    if (photoElement) {
      photoElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const openLightbox = useCallback((src: string) => {
    if (mode !== "none") return;
    const index = album?.photos?.indexOf(src) ?? -1;
    if (index !== -1) setLightboxIndex(index);
  }, [mode, album?.photos]);

  const closeLightbox = useCallback(() => {
    if (lightboxIndex === null || !album?.photos) return;

    const absoluteIndex = lightboxIndex;
    const targetPage = Math.ceil((absoluteIndex + 1) / pageSize);
    const targetSrc = album.photos[absoluteIndex];

    setLightboxIndex(null);

    if (targetPage !== safePage) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set("page", String(targetPage));
        return params;
      }, { replace: false });
    }

    setTimeout(() => scrollToPhoto(targetSrc), 120);
  }, [lightboxIndex, album?.photos, pageSize, safePage, setSearchParams, scrollToPhoto]);

  const downloadAllPhotos = () => {
    if (!slug || !album?.photos?.length) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/album/${slug}/download-all`;
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const downloadSelected = () => {
    if (!slug || selectedDownload.size === 0) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/album/${slug}/download-selected`;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "items";
    input.value = JSON.stringify(Array.from(selectedDownload));
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const downloadPrintDynamic = () => {
    if (!slug || !printCount) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/album/${slug}/download-print-dynamic`;
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const savePrintSelection = async () => {
    if (!slug) return;
    setSavingPrint(true);
    try {
      const response = await fetch(`/api/album/${slug}/print-selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Array.from(selectedPrint) }),
      });
      if (response.ok) {
        const refreshed = await fetch(`/api/album/${slug}`).then((res) => res.json());
        setAlbum(refreshed);
        dispatch({ type: "SET_MODE", payload: "none" });
      }
    } finally {
      setSavingPrint(false);
    }
  };

  const removeFromPrint = async (fileName: string) => {
    if (!album || !slug) return;
    const newPrintUrls = (album.print ?? []).filter((url) => fileNameFromUrl(url) !== fileName);
    setAlbum((prev) => (prev ? { ...prev, print: newPrintUrls } : null));
    try {
      await fetch(`/api/album/${slug}/print-selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newPrintUrls.map(fileNameFromUrl) }),
      });
    } catch {
      const refreshed = await fetch(`/api/album/${slug}`).then((res) => res.json());
      setAlbum(refreshed);
    }
  };

  const resetAllPrint = async () => {
    if (!album || !slug || !window.confirm("Sigur vrei să elimini TOATE pozele din selecția de imprimare?")) return;
    setAlbum((prev) => (prev ? { ...prev, print: [] } : null));
    try {
      await fetch(`/api/album/${slug}/print-selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] }),
      });
    } catch {
      const refreshed = await fetch(`/api/album/${slug}`).then((res) => res.json());
      setAlbum(refreshed);
    }
  };

  const deletePhoto = async (signedUrl: string) => {
    if (!slug || !isAdmin) return;
    const fileName = fileNameFromUrl(signedUrl);
    if (!window.confirm(`ȘTERGI DEFINITIV POZA:\n\n"${fileName}"\n\n• Fișierul va fi șters fizic de pe server\n• Va dispărea din toate secțiunile\n• Acțiunea este IREVERSEBILĂ!\n\nConfirmi?`)) return;
    try {
      const response = await fetch(`/api/album/${slug}/delete-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ filename: fileName }),
      });
      if (response.ok) {
        setAlbum(await response.json());
      } else {
        const error = await response.json().catch(() => ({}));
        alert(error.error || "Acces interzis sau eroare la ștergere.");
        setIsAdmin(false);
        setAdminKey("");
        localStorage.removeItem(`adminKey_${slug}`);
      }
    } catch {
      alert("Eroare de conexiune.");
    }
  };

  const createShareLink = async (mode: "selected" | "all" = "selected") => {
    if (!slug || selectedDownload.size === 0) return;
    setCreatingShare(true);
    dispatch({ type: "SET_SHARE_URL", url: null, error: null });
    try {
      const priorityItems = Array.from(selectedDownload);
      const allItems = mode === "all" ? (album?.photos ?? []).map(fileNameFromUrl) : undefined;
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          items: priorityItems,
          ...(mode === "all" && allItems ? { allItems, showAll: true } : {}),
        }),
      });
      const text = await response.text().catch(() => "");
      if (!response.ok) {
        dispatch({ type: "SET_SHARE_URL", url: null, error: `Share failed (${response.status})` });
        return;
      }
      let data: ShareCreateResponse;
      try { data = JSON.parse(text); } catch {
        dispatch({ type: "SET_SHARE_URL", url: null, error: "Invalid response" });
        return;
      }
      if (!data?.id) {
        dispatch({ type: "SET_SHARE_URL", url: null, error: "Missing id" });
        return;
      }
      const url = `${window.location.origin}/share/${data.id}`;
      dispatch({ type: "SET_SHARE_URL", url, error: null });
    } finally {
      setCreatingShare(false);
    }
  };

  const saveLink = async () => {
    const url = customUrl.trim();
    try {
      const response = await fetch(`/api/album/${slug}/swisslink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: url }),
      });
      if (response.ok) setShowUrlModal(false);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!auth.authorise || !auth.accessToken || !slug) return;
    fetch(`/api/instagram-proposals/album/${slug}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data) => { if (data.proposals) setIgProposals(data.proposals); })
      .catch(() => {});
    fetch(`/api/album-subscriptions/list/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data: { subscribers?: { email: string; subscribedAt?: string }[] }) => {
        if (data.subscribers) setSubscribers(data.subscribers);
      })
      .catch(() => {});
  }, [auth.authorise, auth.accessToken, slug]);

  useEffect(() => {
    if (!auth.authorise || !auth.accessToken || !slug) return;

    fetch("/api/admin/accounts", {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data: { users?: AdminAccount[] }) => {
        const users = data.users ?? [];
        setAdminAccounts(users);
        if (!selectedInviteEmail && users.length > 0) {
          setSelectedInviteEmail(users[0].email);
        }
      })
      .catch(() => {});

    fetch("/api/admin/account-invitations", {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((response) => response.json())
      .then((data: { invitations?: CollaboratorInvitation[] }) => {
        const invites = (data.invitations ?? []).filter((invite) => invite.albumSlug === slug);
        setAlbumInvitations(invites);
      })
      .catch(() => {});
  }, [auth.authorise, auth.accessToken, slug, selectedInviteEmail]);

  const toggleIgPhoto = (src: string) => {
    const fileName = fileNameFromUrl(src);
    setSelectedIgPropose((prev) => {
      const next = new Set(prev);
      next.has(fileName) ? next.delete(fileName) : next.add(fileName);
      return next;
    });
  };

  const submitIgProposals = async () => {
    if (!slug || !auth.accessToken || selectedIgPropose.size === 0 || !album) return;
    if (proposalDestinations.has("media_assets") && proposalMediaServices.size === 0) return;
    setSubmittingIgPropose(true);
    try {
      const previews = album.photos ?? [];
      const originals = album.originalPhoto ?? [];
      const originalByMediaKey = new Map(originals.map(url => [mediaKeyFromUrl(url), url]));
      const toPropose = previews
        .filter(url => selectedIgPropose.has(fileNameFromUrl(url)))
        .map(previewUrl => originalByMediaKey.get(mediaKeyFromUrl(previewUrl)) ?? previewUrl);
      const results = await Promise.all(
        toPropose.map((photoUrl) =>
          fetch("/api/instagram-proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
            body: JSON.stringify({
              albumSlug: slug,
              photoUrl,
              fileName: fileNameFromUrl(photoUrl),
              destinations: Array.from(proposalDestinations),
              mediaAssetServiceIds: Array.from(proposalMediaServices),
            }),
          }).then((r) => r.json())
        )
      );
      const added = results.filter((r) => r.ok && !r.alreadyProposed);
      setIgProposals((prev) => [
        ...added.map((r, i) => ({
          id: r.id,
          photoUrl: toPropose[i],
          fileName: fileNameFromUrl(toPropose[i]),
          proposedBy: auth.user?.email ?? "",
          proposedAt: new Date().toISOString(),
          status: "pending" as const,
          destinations: Array.from(proposalDestinations),
          mediaAssetServiceIds: Array.from(proposalMediaServices),
        })),
        ...prev,
      ]);
      const destinationLabel =
        proposalDestinations.size === 2
          ? "Instagram + Media Assets"
          : proposalDestinations.has("media_assets")
            ? "Media Assets"
            : "Instagram";
      setIgProposeResult(`${added.length} ${added.length === 1 ? "poză propusă" : "poze propuse"} pentru ${destinationLabel}.`);
      setSelectedIgPropose(new Set());
      setIgProposeMode(false);
    } catch {
    } finally {
      setSubmittingIgPropose(false);
    }
  };

  const submitVideoImport = async () => {
    if (!album?.shortvideo || !auth.accessToken || videoImportServices.size === 0) return;
    setVideoImporting(true);
    setVideoImportResult(null);
    try {
      const videoUrl = album.shortvideo;
      const fileName = fileNameFromUrl(videoUrl);
      await Promise.all(Array.from(videoImportServices).map(serviceId =>
        fetch("/api/oferte/admin/media-assets/import-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
          body: JSON.stringify({ items: [{ url: videoUrl, fileName }], serviceId, sourceAlbumSlug: slug }),
        })
      ));
      setVideoImportResult(`Video importat în ${videoImportServices.size === 1 ? "1 serviciu" : `${videoImportServices.size} servicii`}.`);
      setVideoImportOpen(false);
    } catch {
      setVideoImportResult("Eroare la import.");
    } finally {
      setVideoImporting(false);
    }
  };

  const updateIgStatus = async (id: string, status: "accepted" | "rejected") => {
    if (!auth.accessToken) return;
    setIgUpdatingId(id);
    try {
      await fetch(`/api/instagram-proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ status }),
      });
      setIgProposals((previous) => previous.map((proposal) => proposal.id === id ? { ...proposal, status } : proposal));
    } catch {
    } finally {
      setIgUpdatingId(null);
    }
  };

  const deleteIgProposal = async (id: string) => {
    if (!auth.accessToken) return;
    setIgUpdatingId(id);
    try {
      await fetch(`/api/instagram-proposals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      setIgProposals((previous) => previous.filter((proposal) => proposal.id !== id));
    } catch {
    } finally {
      setIgUpdatingId(null);
    }
  };


  const handleSubscribe = async () => {
    if (!subscribeEmail.trim()) return;
    setSubscribeStatus("loading");
    try {
      const response = await fetch("/api/album-subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumSlug: slug, email: subscribeEmail.trim() }),
      });
      const data = await response.json() as { ok?: boolean };
      setSubscribeStatus(data.ok ? "success" : "error");
    } catch {
      setSubscribeStatus("error");
    }
  };

  const showImageSaveWarning = () => {
    setShowSaveWarning(true);
    if (saveWarningTimerRef.current) window.clearTimeout(saveWarningTimerRef.current);
    saveWarningTimerRef.current = window.setTimeout(() => setShowSaveWarning(false), 5000);
  };

  const toggleModerationPhoto = (src: string) => {
    const filename = fileNameFromUrl(src);
    setSelectedModeration((previous) => {
      const next = new Set(previous);
      next.has(filename) ? next.delete(filename) : next.add(filename);
      return next;
    });
  };

  const submitModeration = async () => {
    if (!slug || selectedModeration.size === 0) return;
    setSubmittingModeration(true);
    try {
      const response = await fetch("/api/moderare/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({
          albumSlug: slug,
          photos: Array.from(selectedModeration),
          note: moderationNote.trim(),
        }),
      });
      const data = await response.json() as { ok?: boolean; submitted?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Eroare server");
      setModerationSubmitResult(`${data.submitted} poze trimise spre moderare. Administratorul a fost notificat.`);
      setSelectedModeration(new Set());
      setModerationNote("");
      setShowModerationSubmitModal(false);
    } catch (err) {
      alert(`Eroare: ${(err as Error).message}`);
    } finally {
      setSubmittingModeration(false);
    }
  };

  const sendAlbumInvite = async () => {
    if (!auth.accessToken || !slug || !selectedInviteEmail) return;
    if (!inviteForInstagram && !inviteForModeration) {
      setInviteError("Alege cel puțin un tip de review.");
      return;
    }
    setInviteSending(true);
    setInviteFeedback(null);
    setInviteError(null);
    try {
      const response = await fetch("/api/admin/account-invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({
          email: selectedInviteEmail,
          albumSlug: slug,
          inviteInstagram: inviteForInstagram,
          inviteModeration: inviteForModeration,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setInviteError(data.error ?? "Invitația nu a putut fi trimisă.");
        return;
      }

      const invitationsResponse = await fetch("/api/admin/account-invitations", {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const invitationsData = await invitationsResponse.json() as { invitations?: CollaboratorInvitation[] };
      setAlbumInvitations((invitationsData.invitations ?? []).filter((invite) => invite.albumSlug === slug));
      setInviteFeedback("Invitația a fost trimisă instant. Timerul reminderelor pentru acest album a pornit acum.");
    } catch {
      setInviteError("Invitația nu a putut fi trimisă.");
    } finally {
      setInviteSending(false);
    }
  };

  const formatInviteDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString("ro-RO", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <AncaLoader />
      {loadingSlow && (
        <div style={{ textAlign: "center", padding: "0 24px" }}>
          <p style={{ color: "#555", fontSize: 14, margin: "0 0 6px" }}>
            Se încarcă albumul... câteva secunde
          </p>
          <p style={{ color: "#333", fontSize: 12, margin: 0 }}>
            Serverul procesează un număr mare de fotografii
          </p>
        </div>
      )}
    </div>
  );
  if (!album) return <AlbumNotFound />;

  // ── DIAGNOSTIC PANEL — vizibil clientei când pozele nu apar ───────────────
  const hasNoPhotos = !album.photos?.length;
  const showDiagnostic = hasNoPhotos || !!imageLoadError;
  const DiagnosticPanel = showDiagnostic ? (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "#0a0a0a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>
        Pozele nu se pot încărca momentan
      </p>
      <p style={{ color: "#aaa", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6, maxWidth: 380 }}>
        Facem un screenshot la acest ecran și trimitem fotografului — el va rezolva problema.
      </p>
      <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: "16px 20px", maxWidth: 420, width: "100%", textAlign: "left" }}>
        <p style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>Detalii eroare (screenshot)</p>
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>Album:</span> {slug}
        </p>
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>Titlu:</span> {album.title}
        </p>
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>Poze în server:</span> {album.photos?.length ?? 0}
        </p>
        {imageLoadError && (
          <p style={{ color: "#f87171", fontSize: 12, margin: "0 0 5px" }}>
            <span style={{ color: "#555" }}>Eroare imagine:</span> {imageLoadError}
          </p>
        )}
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>Featured:</span> {album.featured?.length ?? 0}
        </p>
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>URL:</span> {typeof window !== "undefined" ? window.location.href : ""}
        </p>
        <p style={{ color: "#ccc", fontSize: 12, margin: "0 0 5px" }}>
          <span style={{ color: "#555" }}>Browser:</span> {typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : ""}
        </p>
        <p style={{ color: "#ccc", fontSize: 12, margin: 0 }}>
          <span style={{ color: "#555" }}>Ora:</span> {new Date().toLocaleString("ro-RO")}
        </p>
      </div>
      <button
        onClick={() => { /* Allow dismiss to still see page */ (document.getElementById("diagnostic-overlay") as HTMLElement | null)?.remove(); }}
        style={{ marginTop: 20, padding: "10px 24px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#666", fontSize: 13, cursor: "pointer" }}
      >
        Încearcă totuși să accesezi albumul
      </button>
    </div>
  ) : null;

  return (
    <>
    {DiagnosticPanel}
    {showSaveWarning && (
      <div
        onClick={() => setShowSaveWarning(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.94)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "32px", textAlign: "center", cursor: "pointer",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "18px" }}>📷</div>
        <p style={{ color: "#facc15", fontSize: "21px", fontWeight: 700, margin: "0 0 14px", lineHeight: 1.4, maxWidth: "480px", letterSpacing: "0.01em" }}>
          Pozele afișate sunt de <strong>calitate mai slabă</strong>
        </p>
        <p style={{ color: "#bbb", fontSize: "15px", margin: "0 0 26px", maxWidth: "460px", lineHeight: 1.7 }}>
          Descărcarea directă a imaginii este dezactivată pentru a nu salva varianta WebP optimizată pentru browser.<br />
          Pentru pozele la <strong style={{ color: "#fff" }}>calitate completă</strong>, folosește{" "}
          <strong style={{ color: "#facc15" }}>butonul de download de pe fiecare fotografie</strong> sau{" "}
          <strong style={{ color: "#facc15" }}>„Descarcă toate pozele”</strong>.
        </p>
        <span style={{ color: "#555", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Atinge oriunde pentru a închide</span>
      </div>
    )}
    <div className={styles.page}>
      <div className={styles.container}>

        {slug && typeof window !== "undefined" && window.location.hostname !== "localhost" && (
          <MediaConsentModal
            slug={slug}
            retention={album?.retention ?? null}
            isAdmin={isAdmin || auth.authorise}
            onAccepted={() => {
              setConsentGiven(true);
              if (hasPhotos && !isAdmin && !auth.authorise && !localStorage.getItem('av:onboarding:done')) {
                setTimeout(() => setShowOnboarding(true), 500);
              }
            }}
          />
        )}

        <OnboardingWizard
          forceShow={showOnboarding}
          onStart={() => {
            if (!album?.photos?.length) return;
            const candidates = [...album.photos].sort(() => Math.random() - 0.5).slice(0, 15);
            Promise.all(
              candidates.map(url => new Promise<{ url: string; landscape: boolean }>(resolve => {
                const img = new Image();
                const timer = setTimeout(() => resolve({ url, landscape: false }), 3000);
                img.onload = () => { clearTimeout(timer); resolve({ url, landscape: img.naturalWidth > img.naturalHeight }); };
                img.onerror = () => { clearTimeout(timer); resolve({ url, landscape: false }); };
                img.src = url;
              }))
            ).then(results => {
              const landscape = results.filter(r => r.landscape).map(r => r.url);
              setTutorialPrintPhotos(landscape.length >= 3 ? landscape.slice(0, 3) : candidates.slice(0, 3));
            });
          }}
          onClose={() => { setShowOnboarding(false); setTutorialPrintPhotos([]); }}
        />


        {lightboxIndex !== null && lightboxPhotos.length > 0 && album?.photos && (
          <PhotoLightbox
            photos={lightboxPhotos}
            currentIndex={lightboxIndex}
            onClose={closeLightbox}
            onNext={() => setLightboxIndex((prev) => (prev !== null ? Math.min(lightboxPhotos.length - 1, prev + 1) : 0))}
            onPrev={() => setLightboxIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : 0))}
            selectedPrint={selectedPrint}
            onTogglePrint={(fileName) => dispatch({ type: "TOGGLE_PHOTO", mode: "print", name: fileName })}
            getFileName={(src, index) => fileNameFromUrl(album.photos[index] ?? src)}
            protectImages={true}
            onProtectedContextMenu={showImageSaveWarning}
          />
        )}


        {isAdmin && (
          <button
            className={styles.adminExitBtn}
            onClick={() => {
              setIsAdmin(false);
              setAdminKey("");
              localStorage.removeItem(`adminKey_${slug}`);
              window.location.reload();
            }}
            aria-label="Ieși din modul admin"
            title="Ieși din modul admin"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {showAdminButton && !isAdmin && !auth.authorise && (
          <div className={styles.adminTempButton}>
            <button
              className={styles.adminTempBtn}
              onClick={() => { window.location.href = `/login?redirect=/media/${slug}`; }}
            >
              🔑 Acces administrare
            </button>
          </div>
        )}

        <h1
          className={styles.title}
          style={{ cursor: "pointer" }}
          onClick={() => {
            const adminWindow = window as AdminWindow;
            if (!adminWindow.adminClickCount) {
              adminWindow.adminClickCount = 0;
              adminWindow.adminClickTimeout = null;
            }
            adminWindow.adminClickCount += 1;
            if (adminWindow.adminClickTimeout) clearTimeout(adminWindow.adminClickTimeout);
            adminWindow.adminClickTimeout = window.setTimeout(() => {
              adminWindow.adminClickCount = 0;
            }, 3000);
            if (adminWindow.adminClickCount >= 10) {
              if (isAdmin) {
                setIsAdmin(false);
                setAdminKey("");
                localStorage.removeItem(`adminKey_${slug}`);
                window.location.reload();
              } else if (auth.authorise) {
                setIsAdmin(true);
                localStorage.setItem(`adminKey_${slug}`, "firebase");
                window.location.reload();
              } else {
                setShowAdminButton(true);
              }
              adminWindow.adminClickCount = 0;
            }
          }}
        >
          {album.title}
        </h1>

        <p className={styles.meta}>
          {album.photos?.length ?? 0} fotografii
          {album.shortvideo ? " · video scurt" : ""}
          {album.longvideo ? " · film complet" : ""}
        </p>

        {!isModerationMode && (
          <div className={styles.actionButtons}>
            <button className={styles.fillAction} onClick={() => setIsFormOpen(true)}>
              Completează adresa de livrare
            </button>
            {hasDeliveryAddress && (
              <button className={styles.viewAction} onClick={() => setShowDeliveryModal(true)}>
                Vezi adresa de livrare
              </button>
            )}
            {!isAdmin && hasPhotos && (
              <button
                type="button"
                onClick={() => { localStorage.removeItem('av:onboarding:done'); setShowOnboarding(true); }}
                style={{ padding: "9px 22px", background: "#fef08a", border: "1px solid #ca8a04", borderRadius: "999px", color: "#713f12", fontSize: "13px", cursor: "pointer", letterSpacing: "0.05em", fontWeight: 700, boxShadow: "0 2px 10px rgba(250,204,21,0.2)" }}
              >
                ? CUM FUNCȚIONEAZĂ?
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className={styles.actionButtons}>
            <button type="button" className={styles.viewAction} onClick={() => setShowUrlModal(true)}>
              Adaugă link Swiss Transfer
            </button>
            {printCount > 0 && (
              <button type="button" className={styles.pickBtn} onClick={downloadPrintDynamic}>
                ⬇ Descarcă selecția de imprimat ({printCount})
              </button>
            )}
          </div>
        )}

        {isFormOpen && (
          <DeliveryForm albumId={slug || "hello"} onClose={() => setIsFormOpen(false)} onSuccess={() => setIsFormOpen(false)} />
        )}

        {showDeliveryModal && (
          <DeliveryAddressModal slug={slug || ""} isOpen={showDeliveryModal} onClose={() => setShowDeliveryModal(false)} />
        )}

        {showUrlModal && (
          <div className={styles.modalOverlay} onClick={() => setShowUrlModal(false)}>
            <div className={styles.urlModal} onClick={(event) => event.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>Link descărcare</h3>
                <button className={styles.closeBtn} onClick={() => setShowUrlModal(false)} aria-label="Închide">×</button>
              </div>
              <div className={styles.modalBody}>
                <p className={styles.modalHint}>Lipește sau editează link-ul direct de descărcare:</p>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                  placeholder="https://example.com/file.mp4"
                  className={styles.urlInput}
                  autoFocus
                />
                <div className={styles.modalFooter}>
                  <button className={styles.btnSecondary} onClick={() => setShowUrlModal(false)}>Anulează</button>
                  <button className={styles.btnPrimary} onClick={saveLink} disabled={!customUrl.trim()}>Salvează link</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={styles.divider} />

        {album.featured?.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Selectate</h2>
            <BunnyPhotoGallery orgPhoto={featuredOrgPhotos} photos={album.featured} variant="plain" protectImages={true} onProtectedContextMenu={showImageSaveWarning} />
          </>
        )}

        {mode === "none" && subscribeStatus !== "success" && (
          <div data-onboarding="subscribe" style={{ margin: "0 0 16px", padding: "12px 16px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ color: "#888", fontSize: "13px", margin: 0 }}>
              🔔 Notifică-mă când fotograful adaugă poze noi
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="email"
                value={subscribeEmail}
                onChange={(event) => setSubscribeEmail(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleSubscribe(); }}
                placeholder="adresa@email.com"
                style={{ flex: 1, minWidth: 0, padding: "8px 12px", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#ccc", fontSize: "13px", outline: "none" }}
              />
              <button
                onClick={handleSubscribe}
                disabled={subscribeStatus === "loading" || !subscribeEmail.trim()}
                style={{ padding: "8px 14px", background: subscribeEmail.trim() ? "#fff" : "#222", color: subscribeEmail.trim() ? "#000" : "#555", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: subscribeEmail.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {subscribeStatus === "loading" ? "..." : "Abonează-te"}
              </button>
            </div>
            {subscribeStatus === "error" && (
              <p style={{ color: "#f87171", fontSize: "12px", margin: 0 }}>A apărut o eroare. Încearcă din nou.</p>
            )}
          </div>
        )}

        {mode === "none" && subscribeStatus === "success" && (
          <div style={{ margin: "0 0 16px", padding: "12px 16px", background: "#052e16", border: "1px solid #166534", borderRadius: "8px" }}>
            <p style={{ color: "#4ade80", fontSize: "13px", fontWeight: 600, margin: 0 }}>✓ Te-ai abonat! Vei primi un email când fotograful adaugă poze noi.</p>
          </div>
        )}

        {auth.authorise && mode === "none" && !igProposeMode && !moderationMode && (
          <div style={{ margin: "0 0 14px", padding: "14px 16px", background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              onClick={() => setInvitePanelOpen((prev) => !prev)}
              style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
            >
              <div>
                <p style={{ color: "#fff", fontSize: "13px", fontWeight: 700, margin: 0 }}>Invită colaborator pe albumul acesta</p>
                {!isMobile && (
                  <p style={{ color: "#777", fontSize: "12px", margin: "4px 0 0" }}>
                    Email instant acum, apoi reminder-e automate la 24h, 72h, 7 zile, 14 zile și 30 zile.
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "#555", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Album: {slug}</span>
                <span style={{ color: "#888", fontSize: "16px", lineHeight: 1 }}>{invitePanelOpen ? "−" : "+"}</span>
              </div>
            </button>

            {invitePanelOpen && (
              <>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={selectedInviteEmail}
                    onChange={(event) => setSelectedInviteEmail(event.target.value)}
                    style={{ flex: "1 1 280px", minWidth: "220px", padding: "8px 12px", background: "#111", border: "1px solid #333", borderRadius: "6px", color: "#ddd", fontSize: "13px" }}
                  >
                    <option value="">Alege colaboratorul</option>
                    {adminAccounts.map((user) => (
                      <option key={user.uid} value={user.email}>{user.email}</option>
                    ))}
                  </select>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ccc", fontSize: "12px" }}>
                    <input type="checkbox" checked={inviteForInstagram} onChange={() => setInviteForInstagram((prev) => !prev)} />
                    Instagram / Media Assets
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ccc", fontSize: "12px" }}>
                    <input type="checkbox" checked={inviteForModeration} onChange={() => setInviteForModeration((prev) => !prev)} />
                    Propuneri ștergere
                  </label>
                  <button
                    type="button"
                    onClick={sendAlbumInvite}
                    disabled={inviteSending || !selectedInviteEmail}
                    style={{ padding: "8px 14px", background: selectedInviteEmail ? "#c9a96e" : "#232323", border: "none", borderRadius: "6px", color: selectedInviteEmail ? "#111" : "#666", fontSize: "12px", fontWeight: 700, cursor: selectedInviteEmail ? "pointer" : "not-allowed" }}
                  >
                    {inviteSending ? "Se trimite..." : "Trimite notificarea"}
                  </button>
                </div>

                {inviteError && <p style={{ color: "#f87171", fontSize: "12px", margin: 0 }}>{inviteError}</p>}
                {inviteFeedback && <p style={{ color: "#4ade80", fontSize: "12px", margin: 0 }}>{inviteFeedback}</p>}

                {albumInvitations.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
                    {albumInvitations.map((invite) => (
                      <div key={invite.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", padding: "8px 10px", background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: "8px" }}>
                        <div>
                          <p style={{ color: "#ddd", fontSize: "12px", margin: 0 }}>{invite.email}</p>
                          <p style={{ color: "#666", fontSize: "11px", margin: "3px 0 0" }}>
                            {invite.status === "completed"
                              ? `A acționat la ${formatInviteDate(invite.completedAt)}`
                              : `Următorul reminder: ${formatInviteDate(invite.nextReminderAt)}`}
                            {" · "}Reminder-e trimise: {invite.reminderCount}
                          </p>
                        </div>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: 700,
                          background: invite.status === "completed" ? "#14532d" : "#3f2b09",
                          color: invite.status === "completed" ? "#86efac" : "#fcd34d",
                        }}>
                          {invite.status === "completed"
                            ? invite.completedActionType === "moderation" ? "A propus ștergere" : "A propus media"
                            : "În așteptare"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {auth.authorise && mode === "none" && !igProposeMode && !moderationMode && (
          <div style={{ display: "flex", gap: "8px", margin: "0 0 12px", flexWrap: "wrap" }}>
            <button
              onClick={() => window.open("/admin/image-optimizer", "_blank")}
              style={{ padding: "7px 16px", background: "#1a2a1a", border: "1px solid #166534", borderRadius: "6px", color: "#4ade80", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              🖼️ Optimizare Poze
            </button>
            <button
              onClick={() => { setIgProposeMode(true); setIgProposeResult(null); setProposalDestinations(new Set(["instagram"])); setProposalMediaServices(new Set(["photo"])); }}
              style={{ padding: "7px 16px", background: "linear-gradient(135deg,#f58529,#dd2a7b,#8134af)", border: "none", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              📸 Propune Instagram / Media Assets
              {igProposals.filter((p) => p.status === "pending").length > 0 && (
                <span style={{ marginLeft: "6px", background: "rgba(0,0,0,0.3)", borderRadius: "999px", padding: "1px 7px", fontSize: "11px" }}>
                  {igProposals.filter((p) => p.status === "pending").length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setModerationMode(true); }}
              style={{ padding: "7px 16px", background: "#92400e", border: "none", borderRadius: "6px", color: "#fcd34d", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              🗑️ Propune ștergere
            </button>
            {(igProposeResult || moderationSubmitResult) && (
              <span style={{ alignSelf: "center", color: "#4ade80", fontSize: "12px" }}>
                {igProposeResult || moderationSubmitResult}
              </span>
            )}
          </div>
        )}

        {auth.authorise && mode === "none" && igProposeMode && (
          <div style={{ margin: "0 0 12px", padding: "12px 14px", background: "#0d0d1f", border: "1px solid #3730a3", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "#a5b4fc", fontSize: "12px", fontWeight: 600, marginRight: "4px" }}>Destinație:</span>
              {(["instagram", "media_assets"] as const).map((destination) => {
                const active = proposalDestinations.has(destination);
                return (
                  <button key={destination} type="button"
                    onClick={() => setProposalDestinations((prev) => { const next = new Set(prev); next.has(destination) ? next.delete(destination) : next.add(destination); if (next.size === 0) next.add("instagram"); return next; })}
                    style={{ padding: "4px 12px", background: active ? "#312e81" : "transparent", border: "1px solid #3730a3", borderRadius: "999px", color: active ? "#c7d2fe" : "#818cf8", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    {destination === "instagram" ? "Instagram" : "Media Assets"}
                  </button>
                );
              })}
            </div>
            {proposalDestinations.has("media_assets") && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "#5eead4", fontSize: "12px", fontWeight: 600, marginRight: "4px" }}>Serviciu:</span>
                {OFFER_SERVICES.map((service) => {
                  const active = proposalMediaServices.has(service.id);
                  return (
                    <button key={service.id} type="button"
                      onClick={() => setProposalMediaServices((prev) => { const next = new Set(prev); next.has(service.id) ? next.delete(service.id) : next.add(service.id); return next; })}
                      style={{ padding: "4px 10px", background: active ? "#0f766e" : "transparent", border: "1px solid #134e4a", borderRadius: "999px", color: active ? "#99f6e4" : "#5eead4", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      {service.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={submitIgProposals}
                disabled={submittingIgPropose || selectedIgPropose.size === 0 || (proposalDestinations.has("media_assets") && proposalMediaServices.size === 0)}
                style={{ padding: "6px 14px", background: selectedIgPropose.size > 0 ? "linear-gradient(135deg,#f58529,#dd2a7b,#8134af)" : "#1e1b4b", border: "none", borderRadius: "6px", color: selectedIgPropose.size > 0 ? "#fff" : "#4338ca", fontSize: "13px", fontWeight: 600, cursor: selectedIgPropose.size > 0 ? "pointer" : "not-allowed" }}
              >
                {submittingIgPropose ? "Se trimite..." : `Trimite propunere (${selectedIgPropose.size})`}
              </button>
              <button onClick={() => { setIgProposeMode(false); setSelectedIgPropose(new Set()); setProposalDestinations(new Set(["instagram"])); setProposalMediaServices(new Set(["photo"])); }}
                style={{ padding: "6px 12px", background: "none", border: "1px solid #3730a3", borderRadius: "6px", color: "#6366f1", fontSize: "13px", cursor: "pointer" }}
              >
                Anulează
              </button>
              {igProposeResult && <span style={{ color: "#4ade80", fontSize: "12px" }}>{igProposeResult}</span>}
            </div>
          </div>
        )}

        {auth.authorise && mode === "none" && moderationMode && (
          <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "#1c1200", border: "1px solid #92400e", borderRadius: "8px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setShowModerationSubmitModal(true)}
              disabled={selectedModeration.size === 0}
              style={{ padding: "6px 14px", background: selectedModeration.size > 0 ? "#d97706" : "#374151", border: "none", borderRadius: "6px", color: selectedModeration.size > 0 ? "#fff" : "#6b7280", fontSize: "13px", fontWeight: 600, cursor: selectedModeration.size > 0 ? "pointer" : "not-allowed" }}
            >
              {`Trimite spre moderare (${selectedModeration.size})`}
            </button>
            <button onClick={() => { setModerationMode(false); setSelectedModeration(new Set()); }}
              style={{ padding: "6px 12px", background: "none", border: "1px solid #92400e", borderRadius: "6px", color: "#d97706", fontSize: "13px", cursor: "pointer" }}
            >
              Anulează
            </button>
            {moderationSubmitResult && <span style={{ color: "#4ade80", fontSize: "12px" }}>{moderationSubmitResult}</span>}
          </div>
        )}

        {album.photos?.length > 0 && (
          <>
            <div className={styles.sectionRow} ref={photosTopRef}>
              <h2 className={styles.sectionTitle}>Fotografii ({album.photos.length})</h2>

              {mode === "none" ? (
                <div className={styles.rowActions}>
                  {totalPhotos > 0 && !isModerationMode && (
                    <button className={styles.pickBtn} type="button" onClick={openPrintMode} data-onboarding="print-btn">
                      Modifică selecția pentru imprimare
                    </button>
                  )}
                  {!isModerationMode && (
                    <button className={styles.pickBtnSecondary} type="button" onClick={openDownloadMode}>
                      Selectează poze pentru descărcare
                    </button>
                  )}
                  {!isModerationMode && (
                    album.zipReady ? (
                      <button className={styles.pickBtnSecondary} type="button" onClick={downloadAllPhotos} data-onboarding="download-btn">
                        {"DESCARCĂ TOATE POZELE" + (stats ? ` (${fmtBytes(stats.photosBytesTotal)})` : "")}
                      </button>
                    ) : (
                      <span data-onboarding="download-btn" style={{ fontSize: "13px", color: "#666", padding: "6px 0", display: "inline-block" }}>
                        Descărcarea tuturor pozelor nu este disponibilă momentan
                      </span>
                    )
                  )}
                </div>
              ) : (
                <div className={styles.rowActions}>
                  <button className={styles.pickBtnSecondary} type="button" onClick={closeMode}>Închide</button>
                  {mode === "print" ? (
                    <button className={styles.pickBtn} type="button" onClick={savePrintSelection} disabled={savingPrint}>
                      {savingPrint ? "Se salvează..." : `Salvează selecția (${selectedPrint.size})`}
                    </button>
                  ) : (
                    <>
                      <button className={styles.pickBtn} type="button" onClick={downloadSelected} disabled={downloadCount === 0}>
                        Descarcă selecția
                      </button>
                      <button
                        className={styles.pickBtnSecondary}
                        type="button"
                        disabled={downloadCount === 0}
                        onClick={() => {
                          setSharePanelOpen(true);
                          dispatch({ type: "SET_SHARE_URL", url: null, error: null });
                        }}
                      >
                        📤 Trimite pozele ({downloadCount})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {mode === "download" && (sharePanelOpen || shareUrl || shareError) && (
              <div ref={shareBoxRef} className={styles.shareBox}>
                <div className={styles.shareTitle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Trimite pozele</span>
                  <button
                    type="button"
                    onClick={() => { setSharePanelOpen(false); dispatch({ type: "SET_SHARE_URL", url: null, error: null }); }}
                    style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 2px" }}
                    aria-label="Închide"
                  >×</button>
                </div>

                {!shareUrl && !shareError && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {[
                        { value: "selected" as const, label: `Trimite doar aceste ${downloadCount} ${downloadCount === 1 ? "poză" : "poze"} selectate` },
                        { value: "all" as const, label: `Trimite toate pozele evenimentului (${totalPhotos}), cu cele selectate primele` },
                      ].map(({ value, label }) => (
                        <label
                          key={value}
                          style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "13px", color: shareMode === value ? "#fff" : "#888", lineHeight: 1.4 }}
                        >
                          <input
                            type="radio"
                            name="shareMode"
                            value={value}
                            checked={shareMode === value}
                            onChange={() => setShareMode(value)}
                            style={{ marginTop: "2px", accentColor: "#c9a96e", flexShrink: 0 }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.pickBtn}
                      onClick={() => void createShareLink(shareMode)}
                      disabled={creatingShare}
                      style={{ width: "fit-content" }}
                    >
                      {creatingShare ? "Se generează..." : "Generează link de share"}
                    </button>
                  </div>
                )}

                {shareError && <div className={styles.shareError}>{shareError}</div>}

                {shareUrl && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div className={styles.shareRow}>
                      <input className={styles.shareInput} value={shareUrl} readOnly />
                      <button className={styles.shareBtn} type="button" onClick={() => navigator.clipboard.writeText(shareUrl!)}>Copiază</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator.share === "function") {
                          void navigator.share({ title: "Poze eveniment", url: shareUrl });
                        } else {
                          void navigator.clipboard.writeText(shareUrl!);
                        }
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        padding: "13px 20px",
                        background: "#25D366",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: "pointer",
                        width: "100%",
                        letterSpacing: "0.02em",
                      }}
                    >
                      📤 {typeof navigator !== "undefined" && typeof navigator.share === "function"
                        ? "Trimite prin WhatsApp / SMS / Email..."
                        : "Copiază linkul"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <AlbumPager
              mode={mode}
              currentPage={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalPhotos}
              shownCount={galleryPhotos.length}
              allOnPageSelected={allOnPageSelected}
              onFirst={() => setPage(() => 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              onLast={() => setPage(() => totalPages)}
              onGoTo={(p) => setPage(() => p)}
              onToggleSelectPage={toggleSelectPage}
              data-onboarding="pager"
              mobileColumns={mobileColumns}
              onMobileColumnsChange={setMobileColumns}
            />

            <div className={styles.photosScroller}>
              {igProposeMode && mode === "none" ? (
                <BunnyPhotoGallery
                  key={`${slug}:${safePage}:ig`}
                  photos={galleryPhotos}
                  orgPhoto={galleryOrgPhotos}
                  variant="plain"
                  selectable={true}
                  selected={selectedIgPropose}
                  getKey={fileNameFromUrl}
                  onToggle={toggleIgPhoto}
                  mobileColumns={mobileColumns}
                  protectImages={true}
                  onProtectedContextMenu={showImageSaveWarning}
                />
              ) : isModerationMode && mode === "none" ? (
                <BunnyPhotoGallery
                  key={`${slug}:${safePage}:mod`}
                  photos={galleryPhotos}
                  orgPhoto={galleryOrgPhotos}
                  variant="plain"
                  selectable={true}
                  selected={selectedModeration}
                  getKey={fileNameFromUrl}
                  onToggle={toggleModerationPhoto}
                  mobileColumns={mobileColumns}
                  protectImages={true}
                  onProtectedContextMenu={showImageSaveWarning}
                />
              ) : isAdmin && mode === "none" ? (
                <div className={styles.adminGalleryGrid} data-columns={mobileColumns}>
                  {galleryPhotos.map((src) => {
                    const fileName = fileNameFromUrl(src);
                    return (
                      <div key={src} className={styles.adminPhotoWrapper}>
                        <img
                          src={src}
                          alt={fileName}
                          className={styles.adminPhotoImg}
                          loading="lazy"
                          onClick={() => openLightbox(src)}
                          style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                          draggable={false}
                          onContextMenu={(e) => { e.preventDefault(); showImageSaveWarning(); }}
                          onDragStart={(e) => e.preventDefault()}
                          data-photo-src={src}
                          {...(galleryPhotos.indexOf(src) === 0 ? { 'data-onboarding': 'photo' } : {})}
                        />
                        <button
                          className={styles.deletePhotoBtn}
                          onClick={() => deletePhoto(src)}
                          aria-label="Șterge definitiv"
                          title="Șterge definitiv din album"
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <BunnyPhotoGallery
                  key={`${slug}:${safePage}`}
                  photos={galleryPhotos}
                  orgPhoto={galleryOrgPhotos}
                  variant="plain"
                  selectable={mode !== "none"}
                  selected={activeSelected}
                  getKey={fileNameFromUrl}
                  onToggle={togglePhoto}
                  onPhotoClick={mode === "none" ? openLightbox : undefined}
                  mobileColumns={mobileColumns}
                  protectImages={true}
                  onProtectedContextMenu={showImageSaveWarning}
                />
              )}
            </div>

            <AlbumPager
              mode={mode}
              currentPage={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalPhotos}
              shownCount={galleryPhotos.length}
              allOnPageSelected={allOnPageSelected}
              onFirst={() => setPage(() => 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              onLast={() => setPage(() => totalPages)}
              onGoTo={(p) => setPage(() => p)}
              onToggleSelectPage={toggleSelectPage}
              mobileColumns={mobileColumns}
              onMobileColumnsChange={setMobileColumns}
            />

          </>
        )}

        {!isModerationMode && <div className={mode !== "none" ? styles.dimmedArea : undefined} onPointerDown={onDimmedTap}>
          <div data-onboarding="print-section">
            <div className={styles.sectionRow} data-onboarding="print-zone">
              <h2 className={styles.sectionTitle}>Poze de imprimat{printCount ? ` (${printCount})` : ""}</h2>
              <div className={styles.rowActions}>
                {totalPhotos > 0 && (
                  <button className={styles.pickBtn} type="button" onClick={openPrintMode}>
                    Modifică selecția pentru imprimare
                  </button>
                )}
                {printCount > 0 && (
                  <button type="button" className={styles.resetAllPrintBtn} onClick={resetAllPrint}>
                    Resetează toate pozele pentru imprimare
                  </button>
                )}
              </div>
            </div>

            {printCount > 0 ? (
              <>
                <MobileColumnsToggle mobileColumns={mobileColumns} onMobileColumnsChange={setMobileColumns} />
                <div className={styles.printPhotosGrid} data-columns={mobileColumns}>
                  {printPhotos.map(({ fileName, src }) => (
                    <div key={fileName} className={styles.printPhotoWrapper}>
                      <img src={src} alt={`Poză pentru imprimare: ${fileName}`} className={styles.printPhotoImg} loading="lazy" />
                      <button
                        className={styles.removePrintBtn}
                        onClick={() => removeFromPrint(fileName)}
                        aria-label={`Elimină ${fileName} din lista de imprimare`}
                        title="Elimină din lista de imprimare"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <MobileColumnsToggle mobileColumns={mobileColumns} onMobileColumnsChange={setMobileColumns} />
              </>
            ) : tutorialPrintPhotos.length > 0 ? (
              <>
                <div style={{ margin: "0 0 10px", padding: "8px 14px", background: "#1a1000", border: "1px solid #ca8a04", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px" }}>🎓</span>
                  <p style={{ color: "#fbbf24", fontSize: "12px", margin: 0 }}>Exemplu tutorial — pozele tale selectate vor apărea aici</p>
                </div>
                <div className={styles.printPhotosGrid} data-columns={mobileColumns}>
                  {tutorialPrintPhotos.map((src) => (
                    <div key={src} className={styles.printPhotoWrapper} style={{ opacity: 0.6 }}>
                      <img src={src} alt="Exemplu poză imprimare" className={styles.printPhotoImg} loading="lazy" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.emptyPrint}>Nu ai selectat încă poze pentru imprimat.</p>
            )}
          </div>

          {printCount > 0 && (
            <button type="button" className={styles.pickBtnSecondary} onClick={downloadPrintDynamic}>
              Descarcă pozele pentru imprimare
            </button>
          )}

          {album.shortvideo && (
            <>
              <h2 className={styles.sectionTitle}>Video scurt</h2>
              <div className={styles.mediaCenter}>
                <div className={styles.videoWrap}>
                  <video className={styles.video} controls playsInline preload="metadata" src={album.shortvideo} />
                </div>
              </div>
              <div className={styles.actions}>
                <a className={styles.downloadBtn} href={swissLink!}>
                  {"DESCARCĂ VIDEO" + (stats?.shortVideoBytes ? ` (${fmtBytes(stats.shortVideoBytes)})` : "")}
                </a>
              </div>
              {auth.authorise && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }}>
                  {videoImportResult && (
                    <span style={{ fontSize: "12px", color: "#6ee7b7" }}>{videoImportResult}</span>
                  )}
                  {videoImportOpen ? (
                    <>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {OFFER_SERVICES.map(service => {
                          const active = videoImportServices.has(service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => setVideoImportServices(prev => {
                                const next = new Set(prev);
                                next.has(service.id) ? next.delete(service.id) : next.add(service.id);
                                return next;
                              })}
                              style={{ padding: "5px 10px", background: active ? "#0f766e" : "transparent", border: "1px solid #134e4a", borderRadius: "999px", color: active ? "#99f6e4" : "#5eead4", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                            >
                              {service.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={submitVideoImport}
                          disabled={videoImporting || videoImportServices.size === 0}
                          style={{ padding: "6px 14px", background: "#0f766e", border: "none", borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                          {videoImporting ? "Se importă..." : "Importă în Media Assets"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoImportOpen(false)}
                          style={{ padding: "6px 12px", background: "none", border: "1px solid #374151", borderRadius: "6px", color: "#9ca3af", fontSize: "12px", cursor: "pointer" }}
                        >
                          Anulează
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setVideoImportOpen(true); setVideoImportResult(null); setVideoImportServices(new Set(["video"])); }}
                      style={{ padding: "6px 14px", background: "#134e4a", border: "1px solid #0f766e", borderRadius: "6px", color: "#5eead4", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Adaugă în Media Assets
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {swissLink && (
            <>
              <h2 className={styles.sectionTitle}>Film complet</h2>
              <div className={styles.mediaCenter}>
                <div className={styles.videoWrap}>
                  <img src="https://img.youtube.com/vi/sA8VXDYePwA/maxresdefault.jpg" alt="Static video frame" className={styles.video} />
                </div>
              </div>
              <div className={styles.actions}>
                <a className={styles.downloadBtn} href={swissLink!}>
                  {"DESCARCĂ FILMUL COMPLET" + (stats?.longVideoBytes ? ` (${fmtBytes(stats.longVideoBytes)})` : "")}
                </a>
              </div>
            </>
          )}

        {qrMoments && (qrMoments.photos.length > 0 || qrMoments.videos.length > 0 || qrMoments.audio.length > 0) && (
            <>
              <h2 className={styles.sectionTitle}>
                QR Moments ({qrMoments.photos.length + qrMoments.videos.length + qrMoments.audio.length})
              </h2>

              {qrMoments.galleryUrl && (
                <div style={{ margin: "0 0 16px", padding: "14px 16px", background: "#111111", border: "1px solid #2f2f2f", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: "#f5f5f5", fontWeight: 600, fontSize: "13px", margin: 0 }}>Mirii pot comenta direct la upload-uri</p>
                    <p style={{ color: "#8b8b8b", fontSize: "12px", margin: "4px 0 0" }}>
                      Deschide galeria QR Moments pentru comentarii la poze, video și mesaje vocale.
                    </p>
                  </div>
                  <a
                    href={qrMoments.galleryUrl}
                    className={styles.downloadBtn}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    COMENTEAZĂ ÎN QR MOMENTS
                  </a>
                </div>
              )}

              {qrMoments.photos.length > 0 && (
                <>
                  <p className={styles.meta}>Poze de la invitați ({qrMoments.photos.length})</p>
                  <div className={styles.printPhotosGrid} data-columns={mobileColumns}>
                    {qrMoments.photos.map((src) => (
                      <div key={src} className={styles.printPhotoWrapper}>
                        <img src={src} alt="QR Moment" className={styles.printPhotoImg} loading="lazy" />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {qrMoments.videos.length > 0 && (
                <>
                  <p className={styles.meta}>Video-uri de la invitați ({qrMoments.videos.length})</p>
                  <div className={styles.mediaCenter} style={{ flexDirection: "column", gap: "16px" }}>
                    {qrMoments.videos.map((src) => (
                      <div key={src} className={styles.videoWrap}>
                        <video className={styles.video} controls playsInline preload="metadata" src={src} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {qrMoments.audio.length > 0 && (
                <>
                  <p className={styles.meta}>Mesaje vocale de la invitați ({qrMoments.audio.length})</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "0 0 12px" }}>
                    {qrMoments.audio.map((src, i) => (
                      <div key={src} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <audio controls src={src} style={{ height: "36px", flex: 1, minWidth: 0 }} aria-label={`Mesaj vocal ${i + 1}`} />
                        <a
                          href={src}
                          download
                          className={styles.pickBtnSecondary}
                          style={{ fontSize: "12px", padding: "4px 10px", whiteSpace: "nowrap" }}
                          aria-label={`Descarcă mesajul vocal ${i + 1}`}
                        >
                          ↓
                        </a>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: "16px" }}>
                    <button
                      type="button"
                      className={styles.pickBtnSecondary}
                      onClick={() => {
                        qrMoments.audio.forEach((src, i) => {
                          const a = document.createElement("a");
                          a.href = src;
                          a.download = `mesaj-vocal-${i + 1}`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                        });
                      }}
                    >
                      Descarcă toate mesajele vocale ({qrMoments.audio.length})
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {photobooth && photobooth.photos.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>
                Poze fotocabină ({photobooth.photos.length})
              </h2>

              {photobooth.galleryUrl && (
                <div style={{ margin: "0 0 16px", padding: "14px 16px", background: "#111111", border: "1px solid #2f2f2f", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: "#f5f5f5", fontWeight: 600, fontSize: "13px", margin: 0 }}>Galeria de la fotocabină</p>
                    <p style={{ color: "#8b8b8b", fontSize: "12px", margin: "4px 0 0" }}>
                      Toate pozele făcute la fotocabină în timpul evenimentului.
                    </p>
                  </div>
                  <a
                    href={photobooth.galleryUrl}
                    className={styles.downloadBtn}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    DESCHIDE GALERIA FOTOCABINĂ
                  </a>
                </div>
              )}

              <div className={styles.printPhotosGrid} data-columns={mobileColumns}>
                {photobooth.photos.map((src) => (
                  <div key={src} className={styles.printPhotoWrapper}>
                    <img src={src} alt="Poză fotocabină" className={styles.printPhotoImg} loading="lazy" />
                    <a
                      href={src}
                      download
                      className={styles.pickBtnSecondary}
                      style={{ position: "absolute", bottom: 6, right: 6, fontSize: "12px", padding: "4px 10px" }}
                      aria-label="Descarcă poza"
                    >
                      ↓
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}

          <MediaRetentionReminder slug={slug || ""} retention={album?.retention ?? null} />
        </div>}
      </div>
    </div>

    <AncaVisualsPromo />


    {auth.authorise && igProposals.length > 0 && (
      <div style={{ background: "#0a0a0a", borderTop: "1px solid #1a1a1a", padding: "32px 32px 48px", marginTop: "16px" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <span style={{ fontSize: "18px" }}>📸</span>
            <h2 style={{ color: "#fff", fontSize: "16px", fontWeight: 500, margin: 0 }}>
              Propuneri Instagram
            </h2>
            <span style={{ background: "#831843", color: "#fda4af", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>
              {igProposals.filter((proposal) => proposal.status === "pending").length} în așteptare
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
            {igProposals.map((proposal) => (
              <div key={proposal.id} style={{ position: "relative", borderRadius: "10px", overflow: "hidden", border: "1px solid #222", background: "#111" }}>
                <img
                  src={proposal.photoUrl}
                  alt={proposal.fileName}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
                <div style={{ padding: "8px 10px" }}>
                  <p style={{ color: "#aaa", fontSize: "11px", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {proposal.proposedBy}
                  </p>
                  <span style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: "999px",
                    background: proposal.status === "accepted" ? "#14532d" : proposal.status === "rejected" ? "#450a0a" : "#1e1b4b",
                    color: proposal.status === "accepted" ? "#4ade80" : proposal.status === "rejected" ? "#f87171" : "#a5b4fc",
                  }}>
                    {proposal.status === "accepted" ? "Acceptat" : proposal.status === "rejected" ? "Respins" : proposal.status === "archived" ? "Arhivat" : "În așteptare"}
                  </span>
                  {proposal.destinations && proposal.destinations.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
                      {proposal.destinations.map((destination) => (
                        <span
                          key={destination}
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "999px",
                            background: destination === "media_assets" ? "#0f3d3a" : "#3b1d4d",
                            color: destination === "media_assets" ? "#99f6e4" : "#f5b3ff",
                          }}
                        >
                          {destination === "media_assets" ? "Media Assets" : "Instagram"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {auth.user?.email === "ancadaniel1994@gmail.com" && (
                  <div style={{ display: "flex", gap: "4px", padding: "0 10px 10px" }}>
                    {proposal.status !== "accepted" && (
                      <button
                        onClick={() => updateIgStatus(proposal.id, "accepted")}
                        disabled={igUpdatingId === proposal.id}
                        style={{ flex: 1, padding: "4px 0", fontSize: "10px", background: "#166534", color: "#4ade80", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                      >
                        Acceptă
                      </button>
                    )}
                    {proposal.status !== "rejected" && (
                      <button
                        onClick={() => updateIgStatus(proposal.id, "rejected")}
                        disabled={igUpdatingId === proposal.id}
                        style={{ flex: 1, padding: "4px 0", fontSize: "10px", background: "#450a0a", color: "#f87171", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                      >
                        Respins
                      </button>
                    )}
                    <button
                      onClick={() => deleteIgProposal(proposal.id)}
                      disabled={igUpdatingId === proposal.id}
                      style={{ padding: "4px 8px", fontSize: "10px", background: "#1a1a1a", color: "#555", border: "none", borderRadius: "6px", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {auth.authorise && subscribers.length > 0 && (
      <div style={{ background: "#0a0a0a", borderTop: "1px solid #1a1a1a", padding: "24px 32px 36px", marginTop: "8px" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{ fontSize: "16px" }}>🔔</span>
            <h2 style={{ color: "#fff", fontSize: "15px", fontWeight: 500, margin: 0 }}>
              Abonați la notificări
            </h2>
            <span style={{ background: "#1e3a5f", color: "#93c5fd", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>
              {subscribers.length}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {subscribers.map((subscriber) => (
              <a
                key={subscriber.email}
                href={`mailto:${subscriber.email}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#111827", border: "1px solid #1f2937", borderRadius: "999px", padding: "5px 12px", color: "#93c5fd", fontSize: "12px", textDecoration: "none" }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                {subscriber.email}
              </a>
            ))}
          </div>
        </div>
      </div>
    )}

    {showModerationSubmitModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
        <div style={{ background: "#111", borderRadius: "12px", padding: "24px", maxWidth: "440px", width: "100%", border: "1px solid #222" }}>
          <h2 style={{ color: "#fff", fontSize: "17px", fontWeight: 400, margin: "0 0 6px" }}>Trimite spre moderare</h2>
          <p style={{ color: "#666", fontSize: "13px", margin: "0 0 16px" }}>
            {selectedModeration.size} poze selectate din albumul <strong style={{ color: "#999" }}>{slug}</strong>
          </p>
          <textarea
            value={moderationNote}
            onChange={(event) => setModerationNote(event.target.value)}
            placeholder="Notă opțională pentru administrator..."
            rows={3}
            style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "6px", color: "#ccc", fontSize: "13px", padding: "10px 12px", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
            <button
              onClick={() => setShowModerationSubmitModal(false)}
              disabled={submittingModeration}
              style={{ padding: "8px 16px", border: "1px solid #2a2a2a", borderRadius: "6px", background: "none", color: "#888", fontSize: "13px", cursor: "pointer" }}
            >
              Anulează
            </button>
            <button
              onClick={submitModeration}
              disabled={submittingModeration}
              style={{ padding: "8px 16px", background: "#d97706", border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: submittingModeration ? "not-allowed" : "pointer" }}
            >
              {submittingModeration ? "Se trimite..." : "Confirmă trimiterea"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
