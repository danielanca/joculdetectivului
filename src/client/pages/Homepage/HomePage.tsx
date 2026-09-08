import React from "react";
import { WWW_ORIGIN } from "../../utils/address";
import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Navbar/Footer";
import SeoPageHead from "../../components/SEO/SeoPageHead";
import Hero from "./Hero";
import Philosophy from "./Philosophy";
import Approach from "./Approach";
// import CTAPreview from "./CTAPreview/CTAPreview";
import FAQPage from "../Faq/FAQPage";
import VideoPreview from "../Videos/VideoPreview";
import AncaVisualsPromo from "../MediaDownload/AncaVisualsPromo";
import { Link } from "react-router-dom";
import { CITIES } from "../LocationSEO/locationData";

const HomePage = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <SeoPageHead
        title="Anca Visuals | Fotograf, Videograf și Foto Video Pentru Nunți, Botezuri și Evenimente"
        description="Anca Visuals oferă fotografie, videografie, pachete foto-video, fotocabină și Video Booth 360 pentru nunți, botezuri, majorate și evenimente în Turda, Cluj, Sibiu, Alba, Arad, Bistrița și împrejurimi."
        canonicalPath="/"
        schema={[
          {
            "@type": "Organization",
            "@id": `${WWW_ORIGIN}/#organization`,
            name: "Anca Visuals",
            url: `${WWW_ORIGIN}/`,
            telephone: "+40745469907",
            sameAs: ["https://instagram.com/ancavisuals", "https://tiktok.com/@ancavisuals"],
          },
          {
            "@type": "ProfessionalService",
            "@id": `${WWW_ORIGIN}/#service`,
            name: "Anca Visuals",
            url: `${WWW_ORIGIN}/`,
            description:
              "Servicii foto, video și foto-video pentru nunți, botezuri, majorate și evenimente private.",
            areaServed: CITIES.map(city => ({ "@type": "City", name: city.name })),
            serviceType: [
              "Fotografie nuntă",
              "Videografie nuntă",
              "Foto video botez",
              "Foto video evenimente",
              "Fotocabină",
              "Video Booth 360",
            ],
          },
        ]}
        keywords={[
          "fotograf turda",
          "videograf cluj",
          "foto video sibiu",
          "fotograf alba iulia",
          "videograf bistrita",
        ]}
      />
      <Navbar />
      <Hero />
      {/* <CTAPreview /> */}
      <AncaVisualsPromo />
      <div data-track-section="video">
      <VideoPreview
        src="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2FBucurestiNunta.mp4?alt=media&token=74d6a5b5-0906-45e1-950c-9632bba7889b"
        poster=""
      />
      <VideoPreview
        src="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2FVideo_Daniel_Ana_instagram.mp4?alt=media&token=e9ca7716-f49b-4dfa-aa11-39fc3bd20cf3"
        poster="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2FVideo_Daniel_Ana_instagram.mp4.jpg?alt=media&token=359882e0-7e12-4925-bb31-bcb5978fa59a"
      />
      <VideoPreview
        src="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2FClaudiu%20Scurt.mp4?alt=media&token=c79e0f29-501f-4efb-be3a-73f52b3d2e38"
        poster="https://firebasestorage.googleapis.com/v0/b/joculdetectivului.appspot.com/o/ancavisuals%2FClaudiu%20Scurt.jpg?alt=media&token=02cc0535-5268-43fb-8a6c-63ede75b2c6f"
      />
      </div>
      <Philosophy />
      <div data-track-section="servicii"><Approach /></div>
      <div data-track-section="întrebări frecvente"><FAQPage /></div>
      <Footer />
    </div>
  );
};

export default HomePage;
