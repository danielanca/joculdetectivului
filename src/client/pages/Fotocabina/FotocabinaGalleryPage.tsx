import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import FotocabinaServicesPromo from "./FotocabinaServicesPromo";

type PageState = "loading" | "not-found" | "empty" | "ready" | "error";

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp)$/i;

const FotocabinaGalleryPage: React.FC = () => {
  const { slug, shareId } = useParams<{ slug?: string; shareId?: string }>();
  const isShared = Boolean(shareId);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [images, setImages] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
