import React, { useState } from "react";

interface PhotoboothShareButtonProps {
  slug: string;
}

const PhotoboothShareButton: React.FC<PhotoboothShareButtonProps> = ({ slug }) => {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (): Promise<string | null> => {
    if (link) return link;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/photobooth/by-slug/${encodeURIComponent(slug)}/share`, {
        method: "POST",
      });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !data.path) {
        setError(data.error ?? "Nu s-a putut genera linkul.");
        return null;
      }
      const full = `${window.location.origin}${data.path}`;
      setLink(full);
      return full;
    } catch {
      setError("Eroare de rețea.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    const url = await generate();
    if (!url) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Poze de la fotocabină 📸", url });
        return;
      } catch {
        /* user cancelled — fall through to show the link box */
      }
    }
  };

  const copy = async () => {
    const url = link ?? (await generate());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Nu s-a putut copia linkul.");
    }
  };

  return (
    <div className="max-w-xl mx-auto mb-8">
      <button
        onClick={handleShare}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        )}
        Trimite pozele altcuiva
      </button>

      {link && (
        <div className="mt-3 flex flex-col sm:flex-row items-stretch gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-white/70 text-xs font-mono outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 transition-colors whitespace-nowrap"
            >
              {copied ? "Link copiat!" : "Copiază link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Poze de la fotocabină 📸 ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-500 transition-colors whitespace-nowrap"
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {link && (
        <p className="mt-2 text-white/35 text-xs">
          Cine primește linkul vede doar pozele de la fotocabină, fără acces la restul evenimentului.
        </p>
      )}

      {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
    </div>
  );
};

export default PhotoboothShareButton;
