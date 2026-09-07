import loadable from "@loadable/component";
import React from "react";
import { ALL_LOCATION_ROUTES } from "../pages/LocationSEO/locationData";
import { LocationPageWrapper } from "../pages/LocationSEO/LocationPage";
import CitiesHubPage from "../pages/Hubs/CitiesHubPage";
import ServiceHubPage from "../pages/Hubs/ServiceHubPage";
import AncaLoader from "../components/UI/AncaLoader";

const loader = <AncaLoader />;
const opts = (ssr: boolean) => ({ ssr, fallback: loader });

const HomePage = loadable(() => import("../pages/Homepage/HomePage"), opts(true));
const AboutPage = loadable(() => import("../pages/About/AboutPage"), opts(true));
const Portfolio = loadable(() => import("../pages/Portfolio/Portfolio"), opts(true));
const ContactPage = loadable(() => import("../pages/Contact/ContactPage"), opts(true));
const MediaAlbumPage = loadable(() => import("../pages/MediaDownload/MediaAlbumPage"), opts(true));
const SharePage = loadable(() => import("../pages/MediaDownload/SharePage"), opts(true));
const GuestVerificationPage = loadable(() => import("../pages/GuestVerification/GuestVerificationPage"), opts(true));
const InvitationLandingPage = loadable(() => import("../pages/InvitationLanding/InvitationLandingPage"), opts(true));
const QRMomentsPage = loadable(() => import("../pages/QRMoments/QRMomentsPage"), opts(true));
const QRMomentsGalleryPage = loadable(() => import("../pages/QRMoments/QRMomentsGalleryPage"), opts(true));
const QRMomentsUnsubscribePage = loadable(() => import("../pages/QRMoments/QRMomentsUnsubscribePage"), opts(true));
const BioPage = loadable(() => import("../pages/Bio/BioPage"), opts(true));
const CopyrightPage = loadable(() => import("../pages/Copyright/Copyright"), opts(true));
const PrivacyPage = loadable(() => import("../pages/Privacy/Privacy"), opts(true));
const TermsPage = loadable(() => import("../pages/Terms/Terms"), opts(true));
const DeliveryAddressPage = loadable(() => import("../pages/DeliveryAddress/DeliveryAddressPage"), opts(false));
const ContractSignPage = loadable(() => import("../pages/Contract/ContractSignPage"), opts(false));
const HandoverSignPage = loadable(() => import("../pages/Handover/HandoverSignPage"), opts(false));
const PostEventBackupPage = loadable(() => import("../pages/PostEventBackup/PostEventBackupPage"), opts(false));
const BlogList = loadable(() => import("../pages/Blog/BlogList"), opts(true));
const BlogPost = loadable(() => import("../pages/Blog/BlogPost"), opts(true));
const RevinPage = loadable(() => import("../pages/Revin/RevinPage"), opts(false));
const GuestInvitationPage = loadable(() => import("../features/wedding-hub/pages/GuestInvitationPage"), opts(false));
const OfertaPage = loadable(() => import("../pages/OfertaPage"), opts(false));
const EventProgressPage = loadable(() => import("../pages/EventProgress/EventProgressPage"), opts(false));
const FotocabinaPage = loadable(() => import("../pages/Fotocabina/FotocabinaPage"), opts(false));
const FotocabinaGalleryPage = loadable(() => import("../pages/Fotocabina/FotocabinaGalleryPage"), opts(false));

type LayoutType = React.ComponentType | null;
type ComponentType = React.ComponentType;

interface publicRoutesType {
  path: string;
  layout: LayoutType;
  component: ComponentType;
}

const publicRoutes: publicRoutesType[] = [

  /** ============================================================
   *  PAGINI PUBLICE — site principal
   *  Homepage, despre, portofoliu, contact, legal
   * ============================================================ */
  {
    path: "",
    layout: null,
    component: HomePage,
  },
  {
    path: "/despre",
    layout: null,
    component: AboutPage,
  },
  {
    path: "/portofoliu",
    layout: null,
    component: Portfolio,
  },
  {
    path: "/orase",
    layout: null,
    component: CitiesHubPage,
  },
  {
    path: "/contact",
    layout: null,
    component: ContactPage,
  },
  {
    path: "/oferta",
    layout: null,
    component: ContactPage,
  },
  {
    path: "/bio",
    layout: null,
    component: BioPage,
  },
  {
    path: "/privacy",
    layout: null,
    component: PrivacyPage,
  },
  {
    path: "/terms",
    layout: null,
    component: TermsPage,
  },
  {
    path: "/copyright",
    layout: null,
    component: CopyrightPage,
  },
  {
    path: "/blog",
    layout: null,
    component: BlogList,
  },
  {
    path: "/blog/:slug",
    layout: null,
    component: BlogPost,
  },

  {
    path: "/foto-video-nunta",
    layout: null,
    component: () => React.createElement(ServiceHubPage, { serviceSlug: "nunta" }),
  },
  {
    path: "/foto-video-botez",
    layout: null,
    component: () => React.createElement(ServiceHubPage, { serviceSlug: "botez" }),
  },
  {
    path: "/foto-video-majorat",
    layout: null,
    component: () => React.createElement(ServiceHubPage, { serviceSlug: "majorat" }),
  },
  {
    path: "/foto-video-evenimente",
    layout: null,
    component: () => React.createElement(ServiceHubPage, { serviceSlug: "evenimente" }),
  },

  /** ============================================================
   *  CLIENȚI & EVENIMENTE — rute cu parametri dinamici
   *  Albume media, invitații, QR moments, livrare
   * ============================================================ */
  {
    path: "/media/:slug",
    layout: null,
    component: MediaAlbumPage,
  },
  {
    path: "/share/:id",
    layout: null,
    component: SharePage,
  },
  {
    path: "/invitatie/:slug",
    layout: null,
    component: GuestVerificationPage,
  },
  {
    path: "/invitatie/:slug/invitation",
    layout: null,
    component: InvitationLandingPage,
  },
  {
    path: "/qr-moments/unsubscribe/:guestId",
    layout: null,
    component: QRMomentsUnsubscribePage,
  },
  {
    path: "/qr-moments/:eventSlug/gallery",
    layout: null,
    component: QRMomentsGalleryPage,
  },
  {
    path: "/qr-moments/:eventSlug",
    layout: null,
    component: QRMomentsPage,
  },
  {
    path: "/delivery-address/:slug",
    layout: null,
    component: DeliveryAddressPage,
  },
  {
    path: "/contract/:token",
    layout: null,
    component: ContractSignPage,
  },
  {
    path: "/proces-verbal/:token",
    layout: null,
    component: HandoverSignPage,
  },
  {
    path: "/backup/:eventId",
    layout: null,
    component: PostEventBackupPage,
  },
  {
    path: "/revin",
    layout: null,
    component: RevinPage,
  },
  {
    path: "/invite/:token",
    layout: null,
    component: GuestInvitationPage,
  },
  {
    path: "/oferta/:slug",
    layout: null,
    component: OfertaPage,
  },
  {
    path: "/p/:slug",
    layout: null,
    component: OfertaPage,
  },
  {
    path: "/album/:eventId",
    layout: null,
    component: EventProgressPage,
  },
  {
    path: "/fotocabina/:slug",
    layout: null,
    component: FotocabinaPage,
  },
  {
    path: "/fotocabina/:slug/galerie",
    layout: null,
    component: FotocabinaGalleryPage,
  },
  {
    path: "/galerie-fotocabina/:shareId",
    layout: null,
    component: FotocabinaGalleryPage,
  },

  /** ============================================================
   *  ADMIN — rute semi-publice (autentificate în App.tsx via RequireAuth)
   *  Contact admin booking
   * ============================================================ */

  ...ALL_LOCATION_ROUTES.map(({ path, citySlug, serviceSlug, canonicalPath, keywordLabel }) => {
    const Component: React.FC = () =>
      React.createElement(LocationPageWrapper, {
        citySlug,
        serviceSlug,
        canonicalPath,
        keywordLabel,
      });
    Component.displayName = `LocationPage_${serviceSlug}_${citySlug}`;
    return { path, layout: null, component: Component };
  }),

];

export default publicRoutes;
