import 'dotenv/config';
import { devLogger } from "./src/server/utils/devStartup";
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import express from 'express';
import compression from 'compression';
import serveStatic from 'serve-static';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { fileURLToPath, pathToFileURL } from 'url';
import albumRouter from './src/server/routes/album.routes';
import fileRouter from './src/server/routes/file.routes';
import downloadRouter from './src/server/routes/download.routes';
import shareRouter from "./src/server/routes/share.routes";
import eventRouter from "./src/server/routes/event.routes";
import qrMomentRouter from "./src/server/routes/QRMoment.routes";
import assistantChatRouter from "./src/server/routes/assistantChat.routes";
import adminCalendarRouter from "./src/server/routes/adminCalendar.routes";
import publicBookedDatesRouter from "./src/server/routes/publicBookedDates.routes";
import adminEventsRouter from "./src/server/routes/adminEvents.routes";
import chatbotRouter from "./src/server/routes/chatbot.routes";
import uploadRouter from "./src/server/routes/upload.routes";
import blogRouter from "./src/server/routes/blog.routes";
import contractsRouter from "./src/server/routes/contracts.routes";
import handoverRouter from "./src/server/routes/handover.routes";
import inspirationRouter from "./src/server/routes/inspiration.routes";
import mementosRouter from "./src/server/routes/mementos.routes";
import { analyticsPublicRouter, analyticsAdminRouter } from "./src/server/routes/analytics.routes";
import { liveVisitorsPublicRouter, liveVisitorsAdminRouter } from "./src/server/routes/liveVisitors.routes";
import { startLiveVisitorsSweeper } from "./src/server/services/liveVisitors.service";
import moderationRouter from "./src/server/routes/moderation.routes";
import inspirationProposalsRouter from "./src/server/routes/inspiration-proposals.routes";
import monitoringRouter from "./src/server/routes/monitoring.routes";
import expensesRouter from "./src/server/routes/expenses.routes";
import invoicesRouter from "./src/server/routes/invoices.routes";
import bankStatementsRouter from "./src/server/routes/bankStatements.routes";
import contractClauseTemplatesRouter from "./src/server/routes/contractClauseTemplates.routes";
import loginEventsRouter from "./src/server/routes/loginEvents.routes";
import landingRouter from "./src/server/routes/landing.routes";
import instagramProposalsRouter from "./src/server/routes/instagramProposals.routes";
import showcaseZonesRouter from "./src/server/routes/showcase-zones.routes";
import albumSubscriptionsRouter from "./src/server/routes/albumSubscriptions.routes";
import qrMomentsRouter from "./src/server/routes/qrMoments.routes";
import referralRouter from "./src/server/routes/referral.routes";
import contactsRouter from "./src/server/routes/contacts.routes";
import equipmentRouter from "./src/server/routes/equipment.routes";
import accountsRouter from "./src/server/routes/accounts.routes";
import weddingHubRouter from "./src/server/routes/weddingHub.routes";
import weddingHubMockRouter from "./src/server/routes/weddingHubMock.routes";
import weddingChecklistRouter from "./src/server/routes/weddingChecklist.routes";
import weddingTimelineRouter from "./src/server/routes/weddingTimeline.routes";
import weddingRemindersRouter from "./src/server/routes/weddingReminders.routes";
import oferteRouter from "./src/server/routes/oferte.routes";
import seoGeneratorRouter from "./src/server/routes/seoGenerator.routes";
import seoRadarRouter from "./src/server/routes/seoRadar.routes";
import campaignRouter from "./src/server/routes/campaign.routes";
import activityRouter from "./src/server/routes/activity.routes";
import searchConsoleRouter from "./src/server/routes/searchConsole.routes";
import photoCollectionsRouter from "./src/server/routes/photoCollections.routes";
import photoboothRouter from "./src/server/routes/photobooth.routes";
import { startMementosCron } from "./src/server/cron/mementos.cron";
import { startAnalyticsCron } from "./src/server/cron/analytics.cron";
import { startAlbumRetentionCron } from "./src/server/cron/albumRetention.cron";
import { startPostEventBackupCron } from "./src/server/cron/postEventBackupReminder.cron";
import { startErrorsCron } from "./src/server/cron/errors.cron";
import { startRemindersCron } from "./src/server/cron/reminders.cron";
import { startCollaboratorInviteReminderCron } from "./src/server/cron/collaboratorInviteReminder.cron";
import { startAlbumZipCheckCron } from "./src/server/cron/albumZipCheck.cron";
// import { startHealthStepsReminderCron } from "./src/server/cron/healthStepsReminder.cron"; // dezactivat — health tracker nu mai e folosit
import { startPhotoboothNotifyCron } from "./src/server/cron/photoboothNotify.cron";
import { startServerMonitor } from "./src/server/monitoring/serverMonitor";
import { generateSitemapFromDb } from "./src/server/utils/sitemapGenerator";
import healthRouter from "./src/server/routes/health.routes";

// Shared HTTP defaults used by both local development and the production server.
const BODY_PAYLOAD_LIMIT = "20mb";
const DEFAULT_APP_PORT = 1994;
const API_ROUTE_PREFIXES = {
  album: "/api/album",
  files: "/f",
  download: "/api/download",
  share: "/api/share",
  event: "/api/event",
  qrCheck: "/api/urlcheck",
  assistant: "/api/assistant",
  admin: "/api/admin",
  chatbot: "/api/chatbot",
  uploads: "/api",
  blog: "/api/blog",
  contracts: "/api/contracts",
  handover: "/api/handover",
} as const;

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD;
const isProd = process.env.NODE_ENV === 'production';
const isPlaywright = process.env.PLAYWRIGHT === "1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const resolve = (p: string) => path.resolve(__dirname, p);

const getStyleSheets = async () => {
  try {
    const assetpath = resolve('public');
    const files = await fs.readdir(assetpath);
    const cssAssets = files.filter((l) => l.endsWith('.css'));
    const allContent: string[] = [];
    for (const asset of cssAssets) {
      const content = await fs.readFile(path.join(assetpath, asset), 'utf-8');
      allContent.push(`<style type="text/css">${content}</style>`);
    }
    return allContent.join('\n');
  } catch {
    return '';
  }
};

const isAssetRequest = (url: string) => {
  const pathname = url.split("?")[0];
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/public/assets/") ||
    pathname.startsWith("/@") ||          // Vite virtual modules (/@vite/client, @react-refresh, etc.)
    pathname.startsWith("/node_modules/") || // pre-bundled deps
    /\.[a-z0-9]+$/i.test(pathname)
  );
};

async function createServer() {
  const showProgress = !isProd && !isTest;
  const startTime = Date.now();

  if (showProgress) devLogger.header();

  const app = express();

  app.set('trust proxy', true);
  app.use(express.json({ limit: BODY_PAYLOAD_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_PAYLOAD_LIMIT }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  if (showProgress) devLogger.step("Express middleware");

  // --- API routes ---
  const apiUrl = isProd
    ? new URL('./src/server/routes/api.js', import.meta.url)
    : new URL('./src/server/routes/api.ts', import.meta.url);

  const apiModule = await import(apiUrl.href);
  const { triggerEvent } = apiModule;
  if (typeof triggerEvent === 'function') {
    app.post('/triggerEvent', triggerEvent);
  }

  // --- Static assets from /public ---
  const assetsDir = resolve('public');
  const requestHandler = express.static(assetsDir);
  
  app.use(requestHandler);
  app.use('/public', requestHandler);
  app.use(API_ROUTE_PREFIXES.album, albumRouter);
  app.use(API_ROUTE_PREFIXES.files, fileRouter);
  app.use(API_ROUTE_PREFIXES.download, downloadRouter);
  app.use(API_ROUTE_PREFIXES.share, shareRouter);
  app.use(API_ROUTE_PREFIXES.event, eventRouter);
  app.use(API_ROUTE_PREFIXES.qrCheck, qrMomentRouter);
  app.use(API_ROUTE_PREFIXES.assistant, assistantChatRouter);
  app.use(API_ROUTE_PREFIXES.admin, adminCalendarRouter);
  app.use("/api/booked-dates", publicBookedDatesRouter);
  app.use(API_ROUTE_PREFIXES.admin, adminEventsRouter);
  app.use(API_ROUTE_PREFIXES.chatbot, chatbotRouter);
  app.use(API_ROUTE_PREFIXES.uploads, uploadRouter);
  app.use(API_ROUTE_PREFIXES.blog, blogRouter);
  app.use(API_ROUTE_PREFIXES.contracts, contractsRouter);
  app.use(API_ROUTE_PREFIXES.handover, handoverRouter);
  app.use(API_ROUTE_PREFIXES.admin, inspirationRouter);
  app.use(API_ROUTE_PREFIXES.admin, mementosRouter);
  app.use(API_ROUTE_PREFIXES.admin, accountsRouter);
  app.use("/api/admin/seo", seoGeneratorRouter);
  app.use("/api/admin/seo-radar", seoRadarRouter);
  app.use("/api/campaign", campaignRouter);
  app.use("/api/analytics", analyticsPublicRouter);
  app.use("/api/analytics", liveVisitorsPublicRouter);
  app.use(API_ROUTE_PREFIXES.admin, analyticsAdminRouter);
  app.use(API_ROUTE_PREFIXES.admin, liveVisitorsAdminRouter);
  app.use(API_ROUTE_PREFIXES.admin, searchConsoleRouter);
  app.use(API_ROUTE_PREFIXES.admin, activityRouter);
  app.use(API_ROUTE_PREFIXES.admin, photoCollectionsRouter);
  app.use("/api/moderare", moderationRouter);
  app.use("/api/inspiration-proposals", inspirationProposalsRouter);
  app.use("/api/monitoring", monitoringRouter);
  app.use("/api/admin/monitoring", monitoringRouter);
  app.use("/api/admin/expenses", expensesRouter);
  app.use("/api/admin/invoices", invoicesRouter);
  app.use("/api/admin/bank-statements", bankStatementsRouter);
  app.use("/api/admin/contract-clause-templates", contractClauseTemplatesRouter);
  app.use("/api", loginEventsRouter);
  app.use("/api/admin/landing", landingRouter);
  app.use("/api/admin/health", healthRouter);
  app.use("/api/instagram-proposals", instagramProposalsRouter);
  app.use("/api/showcase-zones", showcaseZonesRouter);
  app.use("/api/album-subscriptions", albumSubscriptionsRouter);
  app.use("/api/qr-moments", qrMomentsRouter);
  app.use("/api/wedding-hub", weddingHubRouter);
  app.use("/api/oferte", oferteRouter);
  app.use("/api/mock/wedding-hub", weddingHubMockRouter);
  app.use("/api/wedding-hub/checklist", weddingChecklistRouter);
  app.use("/api/wedding-hub/timeline", weddingTimelineRouter);
  app.use("/api/wedding-hub/reminders", weddingRemindersRouter);
  app.use("/api/photobooth", photoboothRouter);
  app.use("/api/referral", referralRouter);
  app.use("/api/admin/contacts", contactsRouter);
  app.use("/api/admin/equipment", equipmentRouter);

  if (showProgress) devLogger.step("Rute API", "29 rute înregistrate");

  startServerMonitor();
  generateSitemapFromDb().catch(error => console.error("[sitemap] Startup generation failed:", error));
  startMementosCron();
  startAnalyticsCron();
  startAlbumRetentionCron();
  startPostEventBackupCron();
  startErrorsCron();
  startRemindersCron();
  startCollaboratorInviteReminderCron();
  startAlbumZipCheckCron();
  // startHealthStepsReminderCron(); // dezactivat — health tracker nu mai e folosit
  startPhotoboothNotifyCron();
  startLiveVisitorsSweeper();

  if (showProgress) devLogger.step("Cron jobs", "monitor · mementos · analytics · album retention · post-event backup · errors · collaborator invites · photobooth notify");

  let vite: ViteDevServer | undefined;
  let template: string;
  let render: (url: string) => Promise<{ appHtml: string; head: string }>;

  const stylesheetsPromise = getStyleSheets();

  if (!isProd) {
    // ******** DEV MODE (HMR ON) ********
    if (showProgress) devLogger.startSpinner("Vite dev server");

    vite = await createViteServer({
      server: { host: '127.0.0.1', middlewareMode: true, hmr: isPlaywright ? false : undefined },
      appType: 'custom',
      logLevel: isTest ? 'error' : 'warn',
      cacheDir: 'node_modules/.vite-ssr',
    });

    if (showProgress) devLogger.stopSpinner("Vite dev server");

    app.use(vite.middlewares);

    template = await fs.readFile(resolve('index.html'), 'utf-8');
  } else {
    // ******** PROD MODE (NO HMR, NO @vite/client) ********
    app.use(compression());
    app.use(
      serveStatic(resolve('client'), {
        index: false,
      }),
    );

    template = await fs.readFile(resolve('client/index.html'), 'utf-8');

    const prodEntryUrl = pathToFileURL(
      path.join(__dirname, './server/entry-server.js'),
    ).href;
    const prodModule = await import(prodEntryUrl);
    render = prodModule.render;
  }

  // --- Legacy path redirects ---
  // The offer pages live under the singular /oferta/:slug. Links that use the
  // plural /oferte/:slug (e.g. shared by mistake) get permanently redirected.
  app.get(/^\/oferte(\/.*)?$/, (req: Request, res: Response) => {
    const slug = req.path.replace(/^\/oferte\/?/, "").replace(/\/+$/, "");
    const query = req.originalUrl.slice(req.path.length); // preserves ?gclid=… etc.
    res.redirect(301, slug ? `/oferta/${slug}${query}` : `/${query}`);
  });

  // --- SSR handler ---
  app.use('*', async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl;

    if (isAssetRequest(url)) {
      res.status(404).type("text/plain").end("Asset not found");
      return;
    }

    try {
      let htmlTemplate = template;
      let appHtml = "";
      let head = "";
      if (!isProd && vite) {
        // dev: transform html + load entry via Vite
        htmlTemplate = await vite.transformIndexHtml(url, htmlTemplate);
        const devModule = await vite.ssrLoadModule(
          '/src/client/entry-server.tsx',
        );
        ({ appHtml, head } = await devModule.render(url));
      } else {
        // prod: use prebuilt server bundle
        ({ appHtml, head } = await render(url));
      }

      const cssAssets = await stylesheetsPromise;
      const html = htmlTemplate
        .replace(`<!--app-html-->`, appHtml)
        .replace(`<!--head-->`, head + "\n" + cssAssets);

      res
        .status(200)
        .set({
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, max-age=0',
        })
        .end(html);
    } catch (e) {
      if (!isProd && vite && e instanceof Error) {
        vite.ssrFixStacktrace(e);
      }
      console.error(e);
      next(e instanceof Error ? e : new Error("Unknown SSR render error"));
    }
  });

  // error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[express error]', err);
    res.status(500).json({ error: 'internal', message: err?.message ?? 'unknown' });
  });

  const port = process.env.PORT || DEFAULT_APP_PORT;
  const httpServer = app.listen(Number(port), '127.0.0.1', () => {
    if (showProgress) {
      devLogger.ready(Number(port), Date.now() - startTime);
    } else {
      console.log(`App is listening on http://127.0.0.1:${port}`);
    }
  });

  if (!isProd && vite) {
    httpServer.on('upgrade', (req, socket, head) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vite!.ws as any).handleUpgrade(req, socket, head, (client: any) => {
        (vite!.ws as any).emit('connection', client, req);
      });
    });
  }
}

createServer();
