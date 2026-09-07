import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import useAuth from "../../features/admin/auth/useAuth";
import FotocabinaServicesPromo from "./FotocabinaServicesPromo";

type PageState = "loading" | "not-found" | "empty" | "ready" | "error";

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp)$/i;

interface AdminFile {
  name: string;
  url: string;
}

const FotocabinaGalleryPage: React.FC = () => {
  const { slug, shareId } = useParams<{ slug?: string; shareId?: string }>();
  const [searchParams] = useSearchParams();
  const { auth } = useAuth();
  const isShared = Boolean(shareId);
  const adminMode = Boolean(slug) && !isShared && searchParams.has("admin") && auth.authorise === true;

  const [pageState, setPageState] = useState<PageState>("loading");
  const [images, setImages] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Admin management state
  const [eventId, setEventId] = useState<string | null>(null);
  const [adminFiles, setAdminFiles] = useState<AdminFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adminLoading, setAdminLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    const filesUrl = shareId
      ? `/api/photobooth/share/${encodeURIComponent(shareId)}/files`
      : slug
        ? `/api/photobooth/by-slug/${encodeURIComponent(slug)}/files`
        : null;
    if (!filesUrl) { setPageState("not-found"); return; }
    fetch(filesUrl)
      .then((response) => {
        if (response.status === 404) { setPageState("not-found"); return null; }
        if (!response.ok) throw new Error("server error");
        return response.json();
      })
      .then((data: { urls: string[]; count: number } | null) => {
        if (!data) return;
        const filtered = (data.urls ?? []).filter((url) => IMAGE_EXTENSIONS.test(url));
        if (filtered.length === 0) {
          setPageState("empty");
        } else {
          setImages(filtered);
          setPageState("ready");
        }
      })
      .catch(() => setPageState("error"));
  }, [slug, shareId]);

  const loadAdminFiles = useCallback(async () => {
    if (!adminMode || !slug || !auth.accessToken) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const meta = await fetch(`/api/photobooth/by-slug/${encodeURIComponent(slug)}`).then((r) => r.json());
      const id = meta?.eventId as string | undefined;
      if (!id) { setAdminError("Evenimentul nu a fost găsit."); return; }
      setEventId(id);
      const response = await fetch(`/api/admin/events/${id}/photobooth-files`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const data = (await response.json()) as { files?: AdminFile[]; error?: string };
      if (!response.ok) { setAdminError(data.error ?? "Eroare la încărcare."); return; }
      setAdminFiles(data.files ?? []);
      setSelected(new Set());
    } catch {
      setAdminError("Eroare de rețea.");
    } finally {
      setAdminLoading(false);
    }
  }, [adminMode, slug, auth.accessToken]);

  useEffect(() => { void loadAdminFiles(); }, [loadAdminFiles]);

  const download = (url: string) => {
    const fileName = url.split("/").pop() ?? "foto.jpg";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const currentIndex = lightboxUrl ? images.indexOf(lightboxUrl) : -1;

  const goLightbox = (direction: "prev" | "next") => {
    if (currentIndex < 0) return;
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < images.length) setLightboxUrl(images[newIndex]);
  };

  useEffect(() => {
    if (!lightboxUrl) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goLightbox("prev");
      if (event.key === "ArrowRight") goLightbox("next");
      if (event.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxUrl, currentIndex]);

  // ── Admin management view ──────────────────────────────────────────────────
  if (adminMode) {
    const allSelected = adminFiles.length > 0 && selected.size === adminFiles.length;

    const toggle = (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
      });
    };

    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(adminFiles.map((f) => f.name)));

    const deleteSelected = async () => {
      if (selected.size === 0 || !eventId || !auth.accessToken) return;
      if (!window.confirm(`Ștergi definitiv ${selected.size} ${selected.size === 1 ? "poză" : "poze"}? Acțiunea nu poate fi anulată.`)) return;
      setDeleting(true);
      setAdminError(null);
      try {
        const response = await fetch(`/api/admin/events/${eventId}/photobooth-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
          body: JSON.stringify({ filenames: Array.from(selected) }),
        });
        const data = (await response.json()) as { deleted?: number; failed?: string[]; error?: string };
        if (!response.ok) { setAdminError(data.error ?? "Eroare la ștergere."); return; }
        if (data.failed && data.failed.length > 0) setAdminError(`${data.failed.length} poze nu au putut fi șterse.`);
        await loadAdminFiles();
      } catch {
        setAdminError("Eroare de rețea la ștergere.");
      } finally {
        setDeleting(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#080808]">
        <div className="sticky top-0 z-20 bg-[#080808]/95 backdrop-blur border-b border-white/10 px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
            <div>
              <p className="text-white text-sm font-semibold">Manager fotocabină</p>
              <p className="text-white/40 text-xs">
                {adminFiles.length} {adminFiles.length === 1 ? "poză" : "poze"}
                {selected.size > 0 ? ` · ${selected.size} selectate` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                onClick={toggleAll}
                disabled={adminFiles.length === 0}
                className="text-xs text-white/70 hover:text-white border border-white/15 hover:border-white/40 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                {allSelected ? "Deselectează tot" : "Selectează tot"}
              </button>
              <button
                onClick={loadAdminFiles}
                disabled={adminLoading}
                className="text-xs text-white/70 hover:text-white border border-white/15 hover:border-white/40 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Reîncarcă
              </button>
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0 || deleting}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                {deleting ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                )}
                Șterge{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
              <a
                href={`/fotocabina/${slug}/galerie`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Vezi galeria publică ↗
              </a>
            </div>
          </div>
          {adminError && <p className="max-w-6xl mx-auto text-red-400 text-xs mt-2">{adminError}</p>}
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          {adminLoading ? (
            <p className="text-white/40 text-sm">Se încarcă…</p>
          ) : adminFiles.length === 0 ? (
            <p className="text-white/40 text-sm">Nu există poze în galeria de fotocabină.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {adminFiles.map((file) => {
                const isSel = selected.has(file.name);
                return (
                  <button
                    key={file.name}
                    onClick={() => toggle(file.name)}
                    className={`relative block rounded-lg overflow-hidden border-2 transition-colors ${isSel ? "border-red-500" : "border-transparent hover:border-white/30"}`}
                  >
                    <img src={file.url} alt={file.name} loading="lazy" className={`w-full h-40 object-cover transition-opacity ${isSel ? "opacity-50" : ""}`} />
                    <span className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border flex items-center justify-center text-xs ${isSel ? "bg-red-500 border-red-500 text-white" : "bg-black/50 border-white/50 text-transparent"}`}>
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }

  if (pageState === "not-found") {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center max-w-xs">
          <p className="text-5xl mb-5">📷</p>
          <h1 className="text-white text-lg font-semibold mb-2">Galeria nu a fost găsită</h1>
          <p className="text-white/40 text-sm leading-relaxed">
            Linkul poate fi incorect sau galeria nu a fost creată încă.
          </p>
          <p className="text-white/20 text-xs mt-6 font-mono">{isShared ? `/galerie-fotocabina/${shareId}` : `/fotocabina/${slug}/galerie`}</p>
        </div>
      </div>
    );
  }

  if (pageState === "empty") {
    return (
      <div className="min-h-screen bg-[#080808]">
        <div className="px-4 pt-16 pb-6">
          <div className="text-center max-w-xs mx-auto">
            <p className="text-5xl mb-5">⏳</p>
            <h1 className="text-white text-lg font-semibold mb-2">Pozele nu sunt disponibile încă</h1>
            <p className="text-white/40 text-sm leading-relaxed">
              Revino mai târziu — pozele vor apărea automat de îndată ce sunt uploadate.
            </p>
          </div>
        </div>
        <FotocabinaServicesPromo />
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center max-w-xs">
          <p className="text-5xl mb-5">⚠️</p>
          <h1 className="text-white text-lg font-semibold mb-2">A apărut o eroare</h1>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-5 py-2.5 bg-white/10 text-white text-sm rounded-xl hover:bg-white/20 transition-colors"
          >
            Încearcă din nou
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl leading-none z-10"
            onClick={() => setLightboxUrl(null)}
            aria-label="Închide"
          >
            ×
          </button>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl disabled:opacity-30 transition-colors"
            onClick={(event) => { event.stopPropagation(); goLightbox("prev"); }}
            disabled={currentIndex <= 0}
            aria-label="Anterior"
          >
            ‹
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl disabled:opacity-30 transition-colors"
            onClick={(event) => { event.stopPropagation(); goLightbox("next"); }}
            disabled={currentIndex >= images.length - 1}
            aria-label="Următor"
          >
            ›
          </button>
          <button
            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm rounded-full transition-colors"
            onClick={(event) => { event.stopPropagation(); download(lightboxUrl); }}
          >
            Descarcă poza
          </button>
        </div>
      )}

      <div className="min-h-screen bg-[#080808] px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <p className="text-3xl mb-4">📸</p>
            <h1 className="text-white text-xl font-bold tracking-tight mb-1">Galeria fotocabina</h1>
            <p className="text-white/35 text-sm">{images.length} {images.length === 1 ? "poză" : "poze"} disponibile · caută-le pe ale tale și descarcă-le</p>
          </div>

          <div className="columns-2 sm:columns-3 gap-2 space-y-2">
            {images.map((url, index) => (
              <div key={url} className="break-inside-avoid relative group">
                <button
                  className="w-full rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
                  onClick={() => setLightboxUrl(url)}
                  aria-label={`Poza ${index + 1}`}
                >
                  <img
                    src={url}
                    alt={`Poza ${index + 1}`}
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                </button>
                <button
                  onClick={() => download(url)}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity bg-black/70 hover:bg-amber-400 hover:text-black text-white text-xs px-2.5 py-1.5 rounded-full font-medium"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>

        </div>

        <FotocabinaServicesPromo shareSlug={!isShared ? slug : undefined} />

        <p className="text-center text-white/15 text-xs mt-10">AncaVisuals · ancavisuals.ro</p>
      </div>
    </>
  );
};

export default FotocabinaGalleryPage;
