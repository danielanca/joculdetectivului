import React from "react";
import { Route, Navigate } from "react-router-dom";
import loadable from "@loadable/component";
import AncaLoader from "../components/UI/AncaLoader";
import RequireAuth from "../features/admin/components/RequireAuth";
import AdminLayout from "../features/admin/components/AdminLayout";
import CheckAuth from "../features/admin/components/CheckAuth";
import WeddingHubAuthWrapper from "../features/wedding-hub/WeddingHubAuthWrapper";

const opts = { fallback: <AncaLoader /> };

const Login = loadable(() => import("../features/admin/components/Login"), opts);
const Dashboard = loadable(() => import("../features/admin/components/Dashboard"), opts);
const AdminBook = loadable(() => import("../pages/Contact/booking/AdminBook"), opts);
const BookedCalendar = loadable(() => import("../features/admin/components/BookedCalendar"), opts);
const CreateEventWedding = loadable(() => import("../features/admin/components/EventDashboard/CreateEvent"), opts);
const ContractListPage = loadable(() => import("../features/admin/components/Contracts/ContractListPage"), opts);
const CreateContractPage = loadable(() => import("../features/admin/components/Contracts/CreateContractPage"), opts);
const EditContractPage = loadable(() => import("../features/admin/components/Contracts/EditContractPage"), opts);
const ContractClauseLibraryPage = loadable(() => import("../features/admin/components/Contracts/ContractClauseLibraryPage"), opts);
const HandoverListPage = loadable(() => import("../features/admin/components/Handover/HandoverListPage"), opts);
const CreateHandoverPage = loadable(() => import("../features/admin/components/Handover/CreateHandoverPage"), opts);
const InspirationPage = loadable(() => import("../features/admin/components/InspirationPage"), opts);
const MementosPage = loadable(() => import("../features/admin/components/MementosPage"), opts);
const MediaActivityPage = loadable(() => import("../features/admin/components/MediaActivityPage"), opts);
const QRMomentsAdminPage = loadable(() => import("../features/admin/components/QRMomentsAdminPage"), opts);
const AnalyticsPage = loadable(() => import("../features/admin/components/AnalyticsPage"), opts);
const LiveVisitorsPage = loadable(() => import("../features/admin/components/LiveVisitorsPage"), opts);
const ImageOptimizerPage = loadable(() => import("../features/admin/components/ImageOptimizerPage"), opts);
const GoalDetailPage = loadable(() => import("../features/admin/components/GoalDetailPage"), opts);
const BankDetailsPage = loadable(() => import("../features/admin/components/BankDetailsPage"), opts);
const ModerationReviewPage = loadable(() => import("../features/admin/components/Moderation/ModerationReviewPage"), opts);
const ErrorsPage = loadable(() => import("../features/admin/components/ErrorsPage"), opts);
const FinancialPage = loadable(() => import("../features/admin/components/Financial/FinancialPage"), opts);
const BankStatementsPage = loadable(() => import("../features/admin/components/Financial/BankStatementsPage"), opts);
const CollaboratorPage = loadable(() => import("../features/collaborator/CollaboratorPage"), opts);
const AccountsPage = loadable(() => import("../features/admin/components/AccountsPage"), opts);
const InstagramProposalsAdminPage = loadable(() => import("../features/admin/components/InstagramProposalsAdminPage"), opts);
const OferteAdminPage = loadable(() => import("../features/admin/components/OferteAdminPage"), opts);
const WeddingHubAdminPage = loadable(() => import("../features/admin/components/WeddingHub/WeddingHubAdminPage"), opts);
const OfferTemplateAdminPage = loadable(() => import("../features/admin/components/OfferTemplateAdminPage"), opts);
const OfferTemplateOrganizerPage = loadable(() => import("../features/admin/components/OfferTemplateOrganizerPage"), opts);
const MediaAssetsAdminPage = loadable(() => import("../features/admin/components/MediaAssetsAdminPage"), opts);
const ShowcaseZoneEditorPage = loadable(() => import("../features/admin/components/ShowcaseZoneEditorPage"), opts);
const SeoGeneratorPage = loadable(() => import("../features/admin/components/SeoGeneratorPage"), opts);
const SeoRadarPage = loadable(() => import("../features/admin/components/SeoRadarPage"), opts);
const SeoPagesAdminPage = loadable(() => import("../features/admin/components/SeoPagesAdminPage"), opts);
const BlogAdminPage = loadable(() => import("../features/admin/components/BlogAdminPage"), opts);
const CampaignAdminPage = loadable(() => import("../features/admin/components/CampaignAdminPage"), opts);
const HealthTrackerPage = loadable(() => import("../features/admin/components/HealthTrackerPage"), opts);
const PhotoCollectionsPage = loadable(() => import("../features/admin/components/PhotoCollectionsPage"), opts);
const AlbumHealthPage = loadable(() => import("../features/admin/components/AlbumHealthPage"), opts);
const SwipeProposalsPage = loadable(() => import("../features/admin/components/SwipeProposalsPage"), opts);
const ProgressListPage = loadable(() => import("../features/admin/components/ProgressListPage"), opts);
const ProgressDetailPage = loadable(() => import("../features/admin/components/ProgressDetailPage"), opts);
const ContactsAdminPage = loadable(() => import("../features/admin/components/ContactsAdminPage"), opts);
const EquipmentAdminPage = loadable(() => import("../features/admin/components/EquipmentAdminPage"), opts);
const AdminSettingsPage = loadable(() => import("../features/admin/components/AdminSettingsPage"), opts);


export const adminRoutes = [
  <Route key="protected" element={<RequireAuth />}>
    <Route element={<AdminLayout />}>
      <Route path="/admin" element={<Dashboard />} />
      <Route path="/admin/calendar" element={<BookedCalendar />} />
      <Route path="/admin/create-event" element={<AdminBook />} />
      <Route path="/admin/create-event-wedding" element={<CreateEventWedding />} />
      <Route path="/admin/contracts" element={<ContractListPage />} />
      <Route path="/admin/contracts/create" element={<CreateContractPage />} />
      <Route path="/admin/contracts/templates" element={<ContractClauseLibraryPage />} />
      <Route path="/admin/contracts/:id/edit" element={<EditContractPage />} />
      <Route path="/admin/handover" element={<HandoverListPage />} />
      <Route path="/admin/handover/new" element={<CreateHandoverPage />} />
      <Route path="/admin/inspiration" element={<InspirationPage />} />
      <Route path="/admin/mementos" element={<MementosPage />} />
      <Route path="/admin/media-activity" element={<MediaActivityPage />} />
      <Route path="/admin/qr-moments" element={<QRMomentsAdminPage />} />
      <Route path="/admin/analytics" element={<AnalyticsPage />} />
      <Route path="/admin/live" element={<LiveVisitorsPage />} />
      <Route path="/admin/image-optimizer" element={<ImageOptimizerPage />} />
      <Route path="/admin/bank-details" element={<BankDetailsPage />} />
      <Route path="/admin/goals/:type" element={<GoalDetailPage />} />
      <Route path="/admin/moderare" element={<ModerationReviewPage />} />
      <Route path="/admin/errors" element={<ErrorsPage />} />
      <Route path="/admin/financial" element={<FinancialPage />} />
      <Route path="/admin/bank-statements" element={<BankStatementsPage />} />
      <Route path="/colaborator" element={<CollaboratorPage />} />
      <Route path="/admin/accounts" element={<AccountsPage />} />
      <Route path="/admin/instagram-proposals" element={<InstagramProposalsAdminPage />} />
      <Route path="/admin/oferte" element={<OferteAdminPage />} />
      <Route path="/admin/media-assets" element={<MediaAssetsAdminPage />} />
      <Route path="/admin/template-oferte" element={<OfferTemplateAdminPage />} />
      <Route path="/admin/template-oferte/:serviceId" element={<OfferTemplateOrganizerPage />} />
      <Route path="/admin/showcase" element={<ShowcaseZoneEditorPage />} />
      <Route path="/admin/seo-generator" element={<SeoGeneratorPage />} />
      <Route path="/admin/seo-radar" element={<SeoRadarPage />} />
      <Route path="/admin/seo-pages" element={<SeoPagesAdminPage />} />
      <Route path="/admin/blog" element={<BlogAdminPage />} />
      <Route path="/admin/campanii" element={<CampaignAdminPage />} />
      <Route path="/admin/sanatate" element={<HealthTrackerPage />} />
      <Route path="/admin/colectii" element={<PhotoCollectionsPage />} />
      <Route path="/admin/album-health" element={<AlbumHealthPage />} />
      <Route path="/admin/swipe-proposals" element={<SwipeProposalsPage />} />
      <Route path="/admin/progress" element={<ProgressListPage />} />
      <Route path="/admin/progress/:eventId" element={<ProgressDetailPage />} />
      <Route path="/admin/contacte" element={<ContactsAdminPage />} />
      <Route path="/admin/echipamente" element={<EquipmentAdminPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/admin/invoices" element={<Navigate to="/admin/financial" replace />} />
      <Route path="/admin/expenses" element={<Navigate to="/admin/financial" replace />} />
      <Route path="/admin/health" element={<Navigate to="/admin/sanatate" replace />} />
      <Route path="/admin/seo" element={<Navigate to="/admin/seo-generator" replace />} />
      <Route element={<WeddingHubAuthWrapper />}>
        <Route path="/admin/wedding-hub" element={<WeddingHubAdminPage />} />
      </Route>
    </Route>
    {/* Full-screen routes — auth protected but NO AdminLayout sidebar */}
    <Route path="/admin/swipe-proposals" element={<SwipeProposalsPage />} />
  </Route>,
  <Route key="login" element={<CheckAuth />}>
    <Route path="/login" element={<Login />} />
  </Route>,
];
