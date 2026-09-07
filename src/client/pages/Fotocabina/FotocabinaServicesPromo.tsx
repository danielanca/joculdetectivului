import React from "react";
import PhoneNumberReveal from "../../components/PhoneReveal/PhoneNumberReveal";
import PortfolioGallery from "../Portfolio/PortfolioGallery";
import PhotoboothShareButton from "./PhotoboothShareButton";

interface FotocabinaServicesPromoProps {
  /** When set, shows a "share the photobooth photos" button that generates a hashed link. */
  shareSlug?: string;
}

const PROMO_PHONE = "0745469907";
const PROMO_PHONE_DISPLAY = "0745 469 907";

const rainbowKeyframes = `@keyframes fcRainbow {
  0%, 24.99% { color: #ef4444; }
  25%, 49.99% { color: #facc15; }
  50%, 74.99% { color: #22c55e; }
  75%, 99.99% { color: #3b82f6; }
}
.fc-rainbow-text { animation: fcRainbow 2.8s steps(1, end) infinite; }`;

const ctaBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors";

const FotocabinaServicesPromo: React.FC<FotocabinaServicesPromoProps> = ({ shareSlug }) => {
  return (
    <section className="bg-[#080808] px-4 pt-14 pb-4">
      <style>{rainbowKeyframes}</style>
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-white/30 text-[11px] tracking-[0.3em] uppercase mb-4">AncaVisuals</p>
        <h2 className="fc-rainbow-text text-2xl sm:text-4xl font-bold leading-tight mb-4">
          Cauți servicii foto‑video‑fotocabină‑QR Code?
          <br />
          Suntem aici pentru tine
        </h2>
        <p className="text-white/45 text-sm sm:text-base leading-relaxed mb-8 max-w-xl mx-auto">
          Fotografie și film de eveniment, fotocabină și galerii QR Code pentru invitați — totul
          într-un singur loc, cu livrare rapidă și amintiri care rămân.
        </p>

        {shareSlug && <PhotoboothShareButton slug={shareSlug} />}

        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          <PhoneNumberReveal
            phone={PROMO_PHONE}
            display={PROMO_PHONE_DISPLAY}
            revealedPrefix="Sună — "
            buttonLabel="SUNĂ ACUM"
            context="fotocabina galerie promo"
            className={`${ctaBase} bg-amber-400 text-black hover:bg-amber-300`}
          />
          <a
            href={`https://wa.me/40${PROMO_PHONE.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ctaBase} bg-green-600 text-white hover:bg-green-500`}
          >
            WhatsApp
          </a>
          <a
            href="/oferta"
            target="_blank"
            rel="noopener noreferrer"
            className={`${ctaBase} border border-white/20 text-white/80 hover:border-white/40 hover:text-white`}
          >
            Cere ofertă
          </a>
          <a
            href="https://instagram.com/ancavisuals"
            target="_blank"
            rel="noopener noreferrer"
            className={`${ctaBase} border border-white/20 text-white/80 hover:border-white/40 hover:text-white`}
          >
            Instagram
          </a>
        </div>
      </div>

      <div className="mt-10">
        <PortfolioGallery altBase="fotograf videograf fotocabină eveniment Anca Visuals" />
      </div>
    </section>
  );
};

export default FotocabinaServicesPromo;
