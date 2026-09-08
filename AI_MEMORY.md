# AI_MEMORY — ancavisuals
# Context operațional shared între Claude, Codex și orice alt agent AI.
# NU este documentație pentru useri.
# Actualizează după orice schimbare structurală.
# Dacă faci schimbări relevante în repo, notează-le în #RECENT.

## CONVENȚIE FIȘIER — citește asta primul

Acest fișier este structurat cu tag-uri `#TAG` la finalul fiecărei linii relevante.
Scopul: orice agent poate extrage doar secțiunea de care are nevoie cu un singur `rg`,
fără să citească tot fișierul și fără să consume tokeni inutil.

**Regulă pentru orice agent care actualizează acest fișier:**
- Fiecare linie de informație utilă trebuie să aibă `#TAG` la final (ex: `#BLOG`, `#PITFALL`, `#RECENT`)
- Când adaugi o secțiune nouă, adaug-o și în RG CHEATSHEET de mai jos, cu comanda exactă
- Intrările în `#RECENT` se adaugă sus în secțiune (cele mai noi primele)
- Nu șterge tag-urile existente când editezi o linie — sunt indexul fișierului

**De ce rg și nu grep?**
`rg` (ripgrep) este mai rapid și mai practic pe codebase-uri mari.
Același principiu se aplică și pentru căutări în codul sursă:
- `rg -n "pattern" src` în loc de `grep -rn`
- `rg --files | rg "pattern"` pentru găsit fișiere după nume

---

## RG CHEATSHEET — caută fără să citești tot fișierul

#   rg -n "#STACK"    AI_MEMORY.md   → stack și entry points
#   rg -n "#CMD"      AI_MEMORY.md   → comenzi utile
#   rg -n "#PITFALL"  AI_MEMORY.md   → capcane cunoscute
#   rg -n "#BLOG"     AI_MEMORY.md   → sistemul de blog
#   rg -n "#SSR"      AI_MEMORY.md   → comportament SSR
#   rg -n "#LOCATION" AI_MEMORY.md   → SEO pagini per oraș/serviciu
#   rg -n "#NOTIFY"   AI_MEMORY.md   → notificări și trigger events
#   rg -n "#MEDIA"    AI_MEMORY.md   → media download
#   rg -n "#QR"       AI_MEMORY.md   → QR Moments
#   rg -n "#ENV"      AI_MEMORY.md   → variabile de mediu
#   rg -n "#CI"       AI_MEMORY.md   → CI / GitHub Actions
#   rg -n "#THEME"    AI_MEMORY.md   → culori și constante UI
#   rg -n "#DEBUG"    AI_MEMORY.md   → debugging rapid
#   rg -n "#RECENT"   AI_MEMORY.md   → modificări recente
#   rg -n "#ATTRIBUTION" AI_MEMORY.md → tracking surse AI/UTM și notificări email
#   rg -n "#ADMIN"    AI_MEMORY.md   → admin dashboard, events, contracte
#   rg -n "#WH"       AI_MEMORY.md   → Wedding Hub — miri, invitați, mese, RSVP
#   rg -n "#CAMPAIGN" AI_MEMORY.md   → landing pages de campanie / ofertă

---

## STACK #STACK

#STACK  Nume: ancavisuals
#STACK  Limbaj: TypeScript
#STACK  Frontend: React 18 + Vite (SSR mode)
#STACK  Backend: Express
#STACK  Teste: Vitest
#STACK  Stilizare: Tailwind CSS + SCSS
#STACK  DB/Storage: Firebase + Firebase Admin
#STACK  Entry server: server.ts
#STACK  Entry SSR client: src/client/entry-server.tsx
#STACK  Onboarding agent: AGENTS.md
#STACK  Routes client: src/client/routes/publicRoutes.tsx
#STACK  src/client       → pagini React, componente, hooks, SSR entry
#STACK  src/server       → routes, controllers, services, notificări, utils
#STACK  tests/vitest     → teste Vitest (client + server)
#STACK  tests/e2e        → teste Playwright E2E
#STACK  reports/         → artefacte generate (coverage, playwright, test-results)
#STACK  public           → asset-uri statice
#STACK  data/blog        → articole Markdown pentru blog
#STACK  data/            → fișiere de date statice (blogManifest.ts, prices.json etc.)

---

## COMENZI #CMD

#CMD  dev:                npm run dev
#CMD  dev server:         npm run dev:server
#CMD  dev server browser: `npm run dev:server` pornește serverul și deschide automat `http://localhost:1994` după ce portul răspunde, prin `scripts/start-dev-server.cjs`. #CMD
#CMD  typecheck:          npm run typecheck
#CMD  test:               npm test
#CMD  test:e2e:           npm run test:e2e
#CMD  test:e2e headed:    npm run test:e2e:headed
#CMD  test:e2e report:    npm run test:e2e:report
#CMD  coverage open:      npm run coverage:open
#CMD  build:              npm run build
#CMD  înainte de build:    npm install apoi npm run build, ca să se prindă dependențe noi sau lockfile changes în scripts #CMD
#CMD  lint:               npm run lint
#CMD  pm2 serve:          npm run serve:pm2
#CMD  fișiere după pat:   rg --files src | rg 'pattern'
#CMD  referințe în cod:   rg -n "pattern" src server.ts
#CMD  fișiere git:        git ls-files | rg 'pattern'
#CMD  stare repo:         git status --short
#PITFALL  `dev:server` folosește `tsx watch --exclude '**/*.timestamp-*.mjs' server.ts`; fără excludere, Vite generează `vite.config.ts.timestamp-*.mjs`, watcher-ul repornește serverul în loop și ajunge la `EADDRINUSE` pe portul 1994. #PITFALL

---

## BLOG #BLOG

#BLOG  Articole:       data/blog/*.md  (frontmatter YAML + Markdown)
#BLOG  Index static:   data/blogManifest.ts  ← sursă de adevăr pentru SSR meta tags
#BLOG  Utilitar:       src/server/utils/blogUtils.ts
#BLOG  API route:      src/server/routes/blog.routes.ts  → GET /api/blog, GET /api/blog/:slug
#BLOG  Pagina listă:   src/client/pages/Blog/BlogList.tsx  → /blog
#BLOG  Pagina post:    src/client/pages/Blog/BlogPost.tsx  → /blog/:slug
#BLOG  Accent color:   src/client/utils/theme.ts  → constanta ACCENT
#BLOG  Adaugă articol: 1) data/blog/<slug>.md cu frontmatter  2) intrare în blogManifest.ts
#BLOG  Editor admin: `/admin/blog` importă articolele `.md` în Firestore `blogPosts`, permite Markdown + draft/publicare; API-ul public preferă versiunile publicate din Firestore și păstrează `.md` ca fallback. #BLOG #ADMIN
#BLOG  Filtrare oraș: editorul Admin și lista publică `/blog` au filtru după `city`; articolele pot fi organizate pe oraș fără a pierde categoriile de serviciu/intentie. #BLOG

---

## SSR #SSR

#SSR  renderToString este SINCRON — fetch async nu funcționează în SSR
#SSR  Soluție: importă static din TS/JSON (ex: blogManifest.ts, locationData.ts)
#SSR  Dev: Vite în middleware mode, transformă index.html la fiecare request
#SSR  Prod: servește dist/client, entry SSR din dist/server/entry-server.js
#SSR  Helmet (react-helmet-async) funcționează în SSR — titlu/meta sunt în HTML-ul inițial

---

## LOCATION SEO #LOCATION

#LOCATION  Date:     src/client/pages/LocationSEO/locationData.ts
#LOCATION  Pagina:   src/client/pages/LocationSEO/LocationPage.tsx
#LOCATION  Rute:     generate programatic în publicRoutes.tsx din ALL_LOCATION_ROUTES
#LOCATION  Pattern:  /foto-video-{serviciu}-{oras}, /fotograf-{serviciu}-{oras} etc.

---

## NOTIFICĂRI / TRIGGER EVENTS #NOTIFY

#NOTIFY  Template email:  src/server/notifications/templates/triggerTemplate.ts
#NOTIFY  Mailer:          src/server/notifications/mailer.ts
#NOTIFY  Controller:      src/server/controllers/triggerEvent.controller.ts
#NOTIFY  Funcții:         src/server/functions/eventFuncs.ts
#NOTIFY  IP util:         src/server/utils/ipinfo.ts  ← casing exact, nu ipInfo
#NOTIFY  `/oferta/olx` are deja notificare dedicată prin `POST /api/oferte/:slug/view`; `useVisitorNotification` trebuie să ignore ruta pentru a nu trimite suplimentar emailul generic „Vizitator NOU”. #NOTIFY
#NOTIFY  404 pe link greșit (reclamă greșită) → email admin via `POST /api/monitoring/not-found`, declanșat de `pages/NotFoundPage.tsx` pe catch-all `path="*"`. Throttle 1/path/6h; scannerele sunt filtrate. #NOTIFY
#NOTIFY  `PhoneNumberReveal` (folosit peste tot: footer, `AncaVisualsPromo`, `MediaPromoFooter`, `FotocabinaServicesPromo`, `AlbumNotFound`, campanii): după „AFIȘEAZĂ NUMĂRUL" apare și un icon de copy-to-clipboard lângă număr (`handleCopy` cu `preventDefault`/`stopPropagation` ca să nu declanșeze `tel:`). `AncaVisualsPromo compact` (doar pe `/contact`) NU mai are butonul mailto „Contact" — rămân WhatsApp + telefon. #NOTIFY

---

## MEDIA DOWNLOAD #MEDIA

#MEDIA  Pagina:     src/client/pages/MediaDownload/MediaAlbumPage.tsx
#MEDIA  Onboarding: src/client/pages/MediaDownload/Onboardingwizard.tsx  ← casing exact
#MEDIA  Galerie album: grid-ul browse rămâne pe `photos_preview`/WebP pentru performanță, dar lightbox-ul cu navigare stânga/dreapta trebuie să folosească `originalPhoto`; mapează preview→original după basename, nu după extensie, fiindcă preview-ul poate fi `.webp` iar originalul `.jpg/.jpeg/.png` #MEDIA
#MEDIA  În `BunnyPhotoGallery` și `PhotoLightbox`, albumele publice cu `protectImages` blochează long-press/context menu/drag pe thumbnail și fotografia mărită și afișează mesajul că download-ul se face prin butonul individual sau „Descarcă toate pozele”; originalele rămân folosite de butoanele de download. #MEDIA
#MEDIA  `protectImages` în `MediaAlbumPage.tsx` este acum HARDCODAT `true` la toate instanțele `BunnyPhotoGallery` + `PhotoLightbox` (2026-09-07) — click-dreapta/long-press blocat pentru TOȚI, inclusiv admin/colaboratori (înainte era `!isAdmin && !auth.authorise`, motiv pentru care fotografului „îi mergea” click-dreapta când era logat). Grid-ul admin cu buton de ștergere (`isAdmin && mode==="none"`, `styles.adminPhotoImg`) are și el `onContextMenu`+`pointer/touch-callout` guard. Salvarea reală = butonul de download per poză (dă originalul). #MEDIA
#MEDIA  Formularul de adresă de livrare din `/media/:slug` colectează acum județul obligatoriu, oraș/localitate și Easybox/Locker opțional; `county` este compatibil cu adresele vechi care nu îl aveau. #MEDIA
#MEDIA  Poze fotocabină: `MediaAlbumPage.tsx` fetch-uiește `GET /api/album/:slug/photobooth` (listează `{slug}/photobooth/` semnat) și randează secțiunea „Poze fotocabină (N)” lângă QR Moments; upload-ul se face din admin (`EventCard` → `PhotoboothUploader`), nu din pagina publică. Galeria publică pentru invitați rămâne `/fotocabina/:slug/galerie`. #MEDIA

---

## QR MOMENTS #QR

#QR  Route:   src/server/routes/QRMoment.routes.ts  ← casing exact
#QR  Route nou: src/server/routes/qrMoments.routes.ts  ← flux public + galerie + admin QR Moments
#QR  Service: src/server/services/qrMoment.service.ts
#QR  Admin UI: src/client/features/admin/components/QRMomentsAdminPage.tsx  → /admin/qr-moments
#QR  Debugging upload: QRMomentsPage raportează explicit eșecurile de register/upload către `/api/monitoring/client-error`, cu context (eventSlug, guestId, fișiere, userAgent, ultimele console warn/error); monitoring trimite email imediat pentru mesajele prefixate `[QR DEBUG]`. #QR #DEBUG
#QR  Teste:   tests/vitest/server/services/QRMoment.services.test.ts, tests/vitest/client/pages/QRMoments/QRMomentsPage.test.tsx, tests/vitest/server/routes/qrMomentsUploadCompat.test.ts
#QR  PITFALL nginx: `/etc/nginx/conf.d/ancavisuals.conf` NU avea `client_max_body_size` setat → default nginx de 1MB respingea (413) orice poză/video peste 1MB înainte să ajungă la aplicație, indiferent de limita din multer (200MB). Fix aplicat pe server: `client_max_body_size 220m;` în blocul `server{}`, urmat de `nginx -t && systemctl reload nginx`. Verifică mereu asta primul dacă cineva raportează upload-uri blocate/eșuate pe orice rută cu fișiere (QR Moments, photobooth, album). #QR #PITFALL
#QR  Upload per-fișier: `QRMomentsPage.tsx` trimite fiecare fișier selectat ca request XHR separat (nu mai bundle-uiește toate fișierele într-un singur POST), cu `uploadProgress` state (id → status/progress/error) pentru progres vizual per poză/video și retry doar pe cele eșuate; fișierele reușite sunt scoase din `selectedFiles` după fiecare încercare. #QR
#QR  HEIC: `qrMoments.routes.ts` are `convertHeicIfNeeded()` (export) care convertește HEIC/HEIF → JPEG la upload folosind `heic-convert` cu fallback la `sharp`, apoi fallback final la bytes originali dacă ambele eșuează (nu pierde niciodată fișierul). Același pattern ca în `weddingHub.routes.ts`. Uploadurile vechi (dinainte de acest fix) rămân HEIC în Bunny — galeria le arată cu buton de descărcare în loc de `<img>`, vezi `isHeicUpload()` în QRMomentsGalleryPage.tsx. #QR #PITFALL
#QR  Gallery player: `QRMomentsGalleryPage.tsx` folosește `upload.type` ('photo'/'video'/'audio', calculat server-side de `detectMediaType`) pentru a decide playerul, NU o listă hardcodată de mimeType-uri — vechea listă rata `.mov` (video/quicktime) și orice codec audio cu parametri (`audio/mp4;codecs=...`). #QR #PITFALL
#QR  Director emailuri admin: `GET /api/qr-moments/admin/guests` agregă `qr_guests` pe `eventSlug`; butonul „Emailuri participanți” din `QRMomentsAdminPage` afișează emailurile grupate pe eveniment, inclusiv statutul consimțământului și numărul de upload-uri. #QR
#QR  Notificare upload: după upload, emailul merge la `qr_events.notificationEmail`; dacă acesta lipsește, fallback-ul este `ADMIN_NOTIFICATION_EMAIL`/`SMTP_SENDER_EMAIL` din `.env`. Erorile SMTP sunt logate explicit, fără să invalideze uploadul. #QR #ENV
#QR  Galerie client: adminul copiază linkul unic `/qr-moments/:eventSlug/gallery?pin=...`; pagina îl deschide direct și permite înscrierea opțională la update-uri în `qr_gallery_subscribers`. Abonații primesc email la uploaduri noi, iar vizualizarea unui material notifică invitatul și adminul (`ADMIN_NOTIFICATION_EMAIL`) cu numele ambilor miri. #QR
#QR  Notificarea de vizualizare este deduplicată atomic la nivel de invitat/eveniment (`viewNotificationSentAt` și `adminViewNotificationSentAt` pe `qr_guests`), nu la nivel de upload; astfel 5 materiale ale aceluiași invitat generează maximum un email pentru invitat și unul pentru administrator. Linkul de unsubscribe setează `emailConsent: false`, iar vizualizările ulterioare nu mai notifică invitatul. #QR #NOTIFY
#QR  AssetModal QR Moments: pe mobil folosește `100dvh`, zona centrală scrollabilă și footer separat pentru download/comentarii/navigare; video are max-height `42vh` pe mobil și buton Play vizibil. #QR
#CI  Lint: numele fișierelor din ZIP se curăță fără regex cu control characters; ESLint `no-control-regex` eșua pe `qrMoments.routes.ts` în GitHub Actions. #CI #QR
#QR  Download admin QR Moments: `GET /api/qr-moments/admin/:eventSlug/download?type=all|photo|video|audio` creează ZIP autentificat, cu foldere `foto/`, `video/`, `audio/`; `QRMomentsAdminPage` expune butoane atât în directorul de emailuri, cât și în detaliile evenimentului. #QR
#QR  detectMediaType PITFALL: verifică `mimeType.startsWith('audio/')` ÎNAINTE de orice check pe extensie video — `.webm` e extensie validă și pentru audio (Firefox/Android recorder) și pentru video; ordinea greșită clasifica mesaje vocale webm drept video. #QR #PITFALL
#QR  QR Moments independente: evenimentele create fără selecție `adminEvents` folosesc `eventSlug` ca `albumSlug` Bunny; evenimentele integrate continuă să citească `adminEvents.albumSlug`. #QR

---

## TEMA / UI #THEME

#THEME  Accent principal: amber-200 (variante /70, /80 pentru muted)
#THEME  Constanta ACCENT: src/client/utils/theme.ts  ← folosește în loc de clase hardcodate
#THEME  Folosit în: BlogList.tsx, BlogPost.tsx — de extins treptat

---

## VARIABILE DE MEDIU #ENV

#ENV  Fișier: .env în root
#ENV  Firebase/Admin: necesare în prod, pot lipsi în teste
#ENV  IPINFO_TOKEN: opțional — fetchIpInfo returnează null dacă lipsește
#ENV  Email SMTP: `SMTP_SENDER_EMAIL`, `SMTP_APP_PASSWORD` și opțional `ADMIN_NOTIFICATION_EMAIL` se configurează exclusiv în `.env`; nu există credentiale fallback în cod, iar app password-ul este normalizat prin eliminarea spațiilor. #ENV #PITFALL

---

## CI / GITHUB ACTIONS #CI

#CI  Workflow:  .github/workflows/nodejs.yml
#CI  Versiuni:  actions/checkout@v4, actions/setup-node@v4
#CI  Node:      22 în workflow și `.nvmrc`
#CI  Jobs:      lint, typecheck, test, build ca joburi separate în GitHub Actions
#CI  Atenție:   CI rulează pe Linux — case sensitivity diferă față de macOS

---

## PUSH / PR CHECKLIST #READY

#READY  Când userul cere „pregătește pentru push/PR”, agentul trebuie să consemneze schimbările relevante în AI_MEMORY.md
#READY  Când userul cere „pregătește pentru push/PR”, agentul trebuie să ruleze validările relevante înainte de verdict
#READY  Minim recomandat pentru verdict „ready”: npm run typecheck && npm test && npm run build
#READY  Dacă există script de lint funcțional, rulează și: npm run lint
#READY  Nu spune „gata de push” dacă build-ul nu a fost rulat pentru schimbări care pot afecta bundling, asset paths, SSR sau imports
#READY  Typecheck și testele nu sunt suficiente pentru erori Vite/Rollup; build-ul trebuie rulat explicit
#READY  În răspunsul final, agentul trebuie să spună clar ce comenzi au trecut și ce nu a fost rulat

---

## ADMIN DASHBOARD #ADMIN

#ADMIN  Contractele suportă acum și beneficiari persoane juridice: `clientType` (`PF`/`PJ`), `clientEntityType`, `clientCIF`, `clientRegistrationNumber`, `clientBankName`, `clientIBAN` și date separate pentru `clientRepresentativeName`, `clientRepresentativeRole`, `clientRepresentativeIdSeries`. Pentru PJ, entitatea rămâne BENEFICIAR în PDF și factură, iar delegatul/reprezentantul semnează în numele ei. Factura din contract preia automat CIF/CUI și adresa entității; contractele PF vechi rămân compatibile. #ADMIN #CONTRACTS
#ADMIN  Contractele acceptă `eventDates` (listă exactă de zile ISO) și `eventEndDate`; UI-ul Create/Edit permite adăugarea/eliminarea mai multor zile, iar PDF-ul afișează perioada completă. `eventDate` rămâne prima zi pentru compatibilitate. `expandEventDates` prioritizează lista exactă pentru verificarea conflictelor din calendar. #ADMIN #CONTRACTS

#ADMIN  Rută principală:      /admin → Dashboard (RequireAuth)
#ADMIN  Colecție events:      Firestore `adminEvents` — statusuri: lead | tentativ | confirmat | finalizat | anulat
#ADMIN  Colecție contracte:   Firestore `contracts` — statusuri: draft | sent | signed | expired | anulat
#ADMIN  eventDate nullable:   `ClientEvent.eventDate` este `Date | null` — lead-urile pot fi fără dată
#ADMIN  Lead flow:            AddLeadModal → status "lead" → butoane rapide Tentativ/Confirmă/Renunță în EventCard
#ADMIN  EventList tabs:       Lead-uri (lead+tentativ) | Viitoare (confirmat, dată>=azi) | Trecute | Arhivă (anulat)
#ADMIN  EventList default:    Tab implicit = "Viitoare" (nu Lead-uri)
#ADMIN  Contract routes:      src/server/routes/contracts.routes.ts
#ADMIN  Contract PDF:         src/server/services/pdf.generator.ts (Puppeteer)
#ADMIN  ClauseChecklistEditor reîmprospătează tokenul Firebase și reîncearcă automat requestul după 401, pentru a evita eroarea „Token invalid” la „Generează clauzele”. #ADMIN #PITFALL
#ADMIN  Contract email:       src/server/notifications/templates/contractEmail.ts
#ADMIN  Contract storage:     Firebase Storage `contracts/` folder, signed URL valid până 2099
#ADMIN  Contract editare:     PATCH /api/contracts/:id — blocat dacă status === "signed"; EditContractPage la /admin/contracts/:id/edit
#ADMIN  Contract-event link:  Bidirectional — `contractId` pe eveniment, `eventId` pe contract; POST /api/contracts acceptă eventId și actualizează adminEvents
#ADMIN  Contract fizic:       `attachmentUrls: string[]` pe event (poze/scan) = echivalent cu a avea contract; ascunde "Creează contract", arată C✓
#ADMIN  Admin events routes:  src/server/routes/adminEvents.routes.ts
#ADMIN  Admin calendar:       src/server/routes/adminCalendar.routes.ts → citește bookedDates.json din Storage
#ADMIN  Semnătură canvas:     prestatorSignatureBase64 (admin) + clientSignatureBase64 (client) în Firestore
#ADMIN  Zile ocupate (public): GET /api/booked-dates → src/server/routes/publicBookedDates.routes.ts → adminEvents
#ADMIN  bookedDates.json:     DEFUNCT — nu mai e sursa de adevăr pentru disponibilitate
#ADMIN  Settings Firestore:   `settings/admin` doc conține `goals`, `currency`, `exchangeRate`
#ADMIN  GoalCard:             Editabil (EUR target + date range); 6-luni are `editableRange` prop pentru date picker; titlu "Goal Personalizat"
#ADMIN  FinancialSummary:     Componentă nouă — filtrează confirmat+finalizat, an curent; arată avans încasat, urmează să primești, detaliu pe evenimente
#ADMIN  Financiar > Extrase:  tab nou în `FinancialPage` — upload PDF/imagine extras bancar, AI extrage toate tranzacțiile și încearcă justificare automată prin `invoices` + `expenses`; backend: `src/server/routes/bankStatements.routes.ts`, colecție Firestore `bankStatements` #ADMIN
#ADMIN  MultiFileDropZone:    Componentă nouă — upload multiple fișiere cu thumbnails imagini, progress per fișier, delete individual
#ADMIN  AddLeadModal pricing: Include câmpuri total/avans/rest cu calcul automat; checkbox "avans deja încasat"; backend citește pricing direct din body
#ADMIN  Fiscalizare eveniment: `adminEvents.fiscalized` este boolean; default = `false` (nefiscalizat), iar EventCard/EventList expun marker + toggle + filtru `Toate | Fiscalizate | Nefiscalizate` #ADMIN
#ADMIN  Detalii bancare:      pagină dedicată `/admin/bank-details`; salvează `settings/admin.bankDetails = { beneficiaryName, iban }` și injectează valorile în contracte/PDF/public sign page când `paymentMethod === "Transfer bancar"` #ADMIN
#ADMIN  rg shortcut:          rg -n "#ADMIN" AI_MEMORY.md

---

## WEDDING HUB #WH

#WH  Scop: modul de organizare nuntă pentru miri — invitați, RSVP, plan de mese, invitații digitale
#WH  Trăiește în: src/client/features/wedding-hub/ (client) + src/server/routes/weddingHub.routes.ts (server)
#WH  Admin creează nunți: /admin/wedding-hub → POST /api/wedding-hub/admin/weddings → creează Firebase Auth user + doc Firestore
#WH  Miri se autentifică la: /wedding-hub/login (auth complet separat de /login al fotografului)
#WH  Auth miri: instanță Firebase separată — src/client/features/wedding-hub/firebaseWeddingHub.ts (named app "wedding-hub")
#WH  De ce instanță separată: evită conflictul cu AuthProvider al adminului care setează authorise:true pentru orice user Firebase
#WH  Middleware server: requireCoupleAuth în requireFirebaseAuth.ts — verifică token + caută weddingId după coupleUid
#WH  Colecții Firestore: wh_weddings | wh_guests | wh_tables
#WH  API prefix: /api/wedding-hub/*
#WH  Rute couple (auth): GET /me | PATCH /settings | GET/PATCH /messages/templates | GET /messages/broadcasts | POST /messages/broadcasts | POST /guests | PATCH /guests/:id | POST /guests/bulk-update | DELETE /guests/:id | POST /tables | PATCH /tables/:id | DELETE /tables/:id
#WH  Mock zone separată: /wedding-hub/mock în UI + /api/mock/wedding-hub/* în backend; folosește stare în memorie, gate pe `VITE_WEDDING_HUB_MOCKS=1` / `WEDDING_HUB_MOCKS=1`, pentru simulări RSVP, preview, broadcast queue și istoric per destinatar. #WH
#WH  Rute publice (fără auth): GET /invite/:token | POST /invite/:token/rsvp
#WH  Rute admin (requireSupremeAdmin): POST /admin/weddings | GET /admin/weddings | DELETE /admin/weddings/:id
#WH  Pagini couple: /wedding-hub/dashboard | /wedding-hub/guests | /wedding-hub/seating | /wedding-hub/settings
#WH  Pagina publică invitat: /invite/:token — UI dark rose, complet în română
#WH  Model date invitat: tableId pe guest (nu assignedGuestIds pe table) — tableguestlist derivată pe client cu useMemo
#WH  Meniu copii: câmp separat childrenMenuPreference apare în formularul RSVP când childrenCount > 0
#WH  Token invitație: UUID v4 generat la creare guest, nu conține PII în URL
#WH  State management couple: useReducer+useMemo în WeddingHubContext — acțiuni SET/ADD/UPDATE/REMOVE pentru profile/guests/tables
#WH  Date loading: useWeddingData hook → GET /me returnează profile + guests + tables într-un singur call (Promise.all)
#WH  SSR safe: isBrowser() guard în WeddingHubAuthContext, coupleLoading:true pe server, RequireWeddingAuth arată Loader
#WH  App.tsx routing: WeddingHubAuthWrapper (outer, provide auth) → CheckWeddingAuth/WeddingHubLayout → RequireWeddingAuth → pages
#WH  Evită flash pe refresh: RequireWeddingAuth trebuie să stea înainte de WeddingHubLayout; dacă layout-ul se montează primul, se vede header-ul brut ("Wedding Hub", "Ieși") înainte să se rezolve auth-ul #WH
#WH  Loader Wedding Hub: folosește Loader fullscreen cu label implicit AncaVisuals + subtitle "Wedding Planner" în CheckWeddingAuth/RequireWeddingAuth pentru refresh și auth restore #WH
#WH  Bulk automation: POST /api/wedding-hub/guests/bulk-update actualizează până la 500 invitați într-un singur request (ex: tableId null / asignări în masă / RSVP în masă) și validează ownership-ul pe wedding + mesele referite #WH
#WH  Script local seating: npm run seed:wedding-seating → scripts/seedWeddingSeating.ts; poate crea mese lipsă, reseta seating-ul și repartiza invitații secvențial pentru testare rapidă #WH
#WH  Setări email: `wh_weddings.settings = { emailNotificationsEnabled, notifyOnAccept, notifyOnDecline }`; pagina couple `/wedding-hub/settings` salvează preferințele prin PATCH /api/wedding-hub/settings #WH
#WH  RSVP email notification: la POST /api/wedding-hub/invite/:token/rsvp se trimite email către `coupleEmail` doar dacă email notifications sunt active și bifarea pentru tipul răspunsului (`accept` / `refuz`) este pornită #WH
#WH  RSVP familie: invitația publică acceptă acum `accompanyingAdultNames`, `childrenNames` și `sameTableWithFamily`; copilul / soțul nu sunt așezați automat la aceeași masă, ci doar grupați ca familie în UI și search, iar bifa "Vrem să fim toți împreună la aceeași masă" rămâne doar preferință. #WH
#WH  Mesele au acum și `tableAlias` separat de `tableName`; aliasul poate fi ceva de tip `BFF Mire`, `BFF Mireasa`, `Bunicii`, `Parinti Mire`, `Familie Mireasa` și se poate edita în cardul mesei. #WH
#WH  Tema Wedding Hub: local-only, nu în backend; `WeddingHubThemeProvider` salvează `dark|light` în localStorage key `wedding-hub-theme`, iar `weddingHubTheme.css` face override pentru tema light doar în shell-ul couple-facing #WH
#WH  Admin breadcrumb: "wedding-hub" adăugat în LABELS din Breadcrumb.tsx
#WH  rg shortcut: rg -n "#WH" AI_MEMORY.md

---

## CAPCANE CUNOSCUTE #PITFALL

#PITFALL  Dacă HTML-ul SSR rămâne în cache după deploy, poate referi asset-uri hash-uite vechi; browserul cere JS inexistent, iar fără protecție serverul poate răspunde cu HTML în catch-all (`text/html` în loc de modul JS) #PITFALL
#PITFALL  În development, dacă deschizi UI-ul pe Vite (`127.0.0.1:3000`) fără proxy pentru `/api`, fetch-urile relative primesc `index.html` în loc de JSON. `vite.config.ts` trebuie să proxieze `/api` și `/triggerEvent` către Express (`127.0.0.1:1994`). #PITFALL #QR
#PITFALL  ipinfo.ts ← nu ipInfo.ts  (case sensitivity macOS vs Linux CI)
#PITFALL  QRMoment.routes.ts ← nu qrMoment.routes.ts
#PITFALL  Onboardingwizard.tsx ← nu OnboardingWizard.tsx
#PITFALL  tsconfig: forceConsistentCasingInFileNames: true → pică în CI
#PITFALL  vitest: nu acceptă flag-uri Jest-style (ex: --runInBand)
#PITFALL  SSR: renderToString sincron → nu folosi fetch async pentru date SSR
#PITFALL  blog: articol fără intrare în blogManifest.ts → SSR fără meta tags
#PITFALL  worktree: nu reseta schimbări care nu sunt ale tale fără git status
#PITFALL  Firestore Timestamps: când se citesc din Firestore în backend și se pasează la Puppeteer PDF, apar ca obiecte {_seconds, _nanoseconds}. `new Date(timestamp)` → "Invalid Date", String(timestamp) → "[object Object]". Fix: helper toIsoString() în pdf.generator.ts care detectează _seconds și convertește. #PITFALL #ADMIN
#PITFALL  Nu genera colecții de `<Route>` din funcții apelate direct în render-ul lui `App` pentru zone lazy/protejate (`adminRoutes()`, `weddingHubRoutes()`). Dacă `App` rerandează dintr-un provider/context, React Router poate remonta pagina activă și reaprinde loader-ele. Ține rutele ca constante/module-level exports. #PITFALL #ADMIN #WH
#PITFALL  `npm run dev` nu trebuie să pornească și `vite --config vite.config.ts` separat cât timp `server.ts` creează deja propriul Vite în `middlewareMode`; altfel HMR/WebSocket intră în conflict (`WebSocket server error: Port is already in use`) și UI-ul poate părea că se restartează. Folosește `npm run dev` pentru SSR app pe `:1994`, iar `npm run dev:dual` doar dacă chiar vrei ambele instanțe. #PITFALL #DEBUG

---

## DEBUGGING RAPID #DEBUG

#DEBUG  Cannot find module  → rg --files src | rg '<modul>'  apoi verifică casing
#DEBUG  Trece local, pică CI → suspectează casing / fișier necomis / versiune Node
#DEBUG  Problemă doar în build → importuri ESM, extensii, path-uri generate
#DEBUG  Verificare completă: npm run typecheck && npm test

---

## RECENT CHANGES #RECENT
#RECENT  2026-09-08: Vizitatori live (`/admin/live`), Faza 1 = LIVE TEXT (voce = Faza 2). Client: `hooks/useLiveVisitor.ts` (montat în `App.tsx`) trimite evenimente semantice la `POST /api/analytics/live/event` (+ `/ping` la 10s, `/end` pe `pagehide` via `sendBeacon`): `session_started, page_view, scroll_depth, pricing_viewed, gallery_viewed, gallery_load_more (.pg-load-more-btn), lightbox_opened, section_dwell ([data-track-section]), contact_clicked, whatsapp_clicked, phone_revealed, form_started/submitted, visitor_idle, session_ended`. Fără PII/valori din câmpuri. Sesiunea = `av_sid`/`av_vid` din `utils/visitorSession.ts` (extras din `usePageTracking`). Atribuire Google Ads: `sessionAttribution.ts` are acum `gclid/gad_source/wbraid/gbraid` + `isGoogleAdsSession()`. Server: `services/liveVisitors.service.ts` = store in-memory `Map<sessionId>` + `EventEmitter` + sweeper (timeout 35s, idle 60s) + persist debounced în Firestore `live_sessions`; `routes/liveVisitors.routes.ts` (public `/live/*` + SSE admin `GET /api/admin/analytics/live/stream` cu `requireFirebaseAuth+requireSupremeAdmin`, consumat cu `fetch`+`getReader` ca `AlbumHealthPage`). Retenție 30 zile via `cron/liveSessionsCleanup.cron.ts`. `BOT_UA` mutat în `utils/botUa.ts` (partajat). Fără gating pe consimțământ (ca `siteVisits`). Emailurile critice existente (`/api/analytics/contact-click`, `lead_created`) rămân — `/live/event` doar `logActivity`, nu trimite email. **Dev**: în afara producției (`NODE_ENV!=="production"`) sunt bypass-uite AMBELE filtre server-side (`isAdminRequest` + `isLocalIp`) în `isTrackableRequest` din `liveVisitors.routes.ts`, plus guard-ul client `av_admin` (`isDevHost()` în `useLiveVisitor.ts`) — altfel cookie-ul de admin al ownerului îți respinge propriile evenimente și panoul nu poate fi testat local. Comutarea de tab NU mai închide sesiunea (doar `pagehide`); timeout heartbeat 75s. **Orice click** pe `a/button/[role=button]/input[submit|button]` → event `element_clicked` cu `meta.text` (label buton) / `meta.href` / `meta.tag` (dedupe 1.5s client-side); cele speciale rămân `whatsapp_clicked/phone_revealed/contact_clicked/gallery_load_more`. **Email** către admin (`sendEventEmail` în `liveVisitors.routes.ts`, cooldown 10 min per `sessionId::event`) pentru cele 4 critice — conține vizitator #, sursă, campanie/gclid, locație + **event body JSON**. `element_clicked` NU trimite email. NB posibil dublu-email cu `/api/analytics/contact-click` (footer) — de consolidat dacă deranjează. #RECENT #ANALYTICS #ADMIN
#RECENT  2026-09-08: Alertă email pe 404. Ruta catch-all `path="*"` din `App.tsx` randează acum `pages/NotFoundPage.tsx` (wrapper peste `AlbumNotFound`) care face beacon `POST /api/monitoring/not-found` `{path,referrer,userAgent}`. Endpointul (în `monitoring.routes.ts`, public) sare peste path-uri de scannere (`SCANNER_PATH_PATTERN`: `.php`, `wp-`, `.env`, `.git`…), scrie în `serverErrors` prin `captureClientError` cu prefix `[404]` (apare în `/admin` → Errors) și trimite email adminului cu path + referrer (de unde a venit — reclama greșită) + geo IP. Throttle: 1 email / path / 6h (`notFoundEmailLastSent` Map in-memory). Dedupe client: `Set` de path-uri per sesiune. NB: SSR încă răspunde 200 pentru catch-all (nu s-a atins statusul HTTP). Teste în `monitoring.routes.test.ts`. #RECENT #NOTIFY
#RECENT  2026-09-07: Galerie Photobooth. Admin: în `EventCard.tsx` secțiunea „Fotocabină”, butonul „Crează Galerie Photobooth” apelează `POST /api/admin/events/:id/photobooth-folder` (creează `{albumSlug}/photobooth/.keep` în Bunny) și afișează `PhotoboothUploader.tsx` — drag&drop care urcă pozele în loturi de 8 la `POST /api/admin/events/:id/photobooth-upload` (multer `photoboothUpload.array`, direct în Bunny, fără Firestore). Public: `FotocabinaGalleryPage` afișează `FotocabinaServicesPromo.tsx` (headline rainbow + CTA Sună/WhatsApp/Ofertă/Instagram + `PortfolioGallery`) pe stările `ready` și `empty`. `/media`: `GET /api/album/:slug/photobooth` + secțiune „Poze fotocabină” în `MediaAlbumPage.tsx`. PITFALL teste: orice mock `multer` pentru `adminEvents.routes` are nevoie și de `array` lângă `single`. Validat cu `npm run typecheck`, `npm test`, ESLint. #RECENT #MEDIA #ADMIN
#RECENT  2026-09-07: Manager poze fotocabină = mod admin pe pagina publică. `EventCard.tsx` → butonul „Gestionează pozele ↗” deschide `/fotocabina/:slug/galerie?admin=1` într-un tab nou. `FotocabinaGalleryPage` detectează `adminMode = are ?admin + auth.authorise` (via `useAuth`, `useSearchParams`), rezolvă `eventId` din `/api/photobooth/by-slug/:slug`, apoi randează o vedere full-page cu toolbar sticky: grid selectabil, „Selectează tot”, „Șterge (N)” cu confirm. Endpoints (în `adminEvents.routes.ts`, `requireFirebaseAuth + requireSupremeAdmin`): `GET /api/admin/events/:id/photobooth-files` → `{files:[{name,url}]}` (CDN din `BUNNY_CDN_DOMAIN`); `POST /api/admin/events/:id/photobooth-delete` `{filenames}` → șterge din Bunny (respinge `/ \\ ..`, 404 = deja șters), invalidează cache album. #RECENT #MEDIA #ADMIN
#RECENT  2026-09-07: Share link fotocabină. Butonul „Trimite pozele altcuiva” de lângă headline-ul rainbow (`PhotoboothShareButton.tsx`, montat în `FotocabinaServicesPromo` doar pe starea `ready` a `/fotocabina/:slug/galerie`, NU pe linkul share) apelează `POST /api/photobooth/by-slug/:slug/share` → creează/reia un doc în `photobooth_shares` (id = `crypto.randomBytes(9).hex`, câmp `slug`) și întoarce `/galerie-fotocabina/:shareId`. Ruta publică `/galerie-fotocabina/:shareId` refolosește `FotocabinaGalleryPage` (detectează `shareId` vs `slug` din `useParams`, fetch `GET /api/photobooth/share/:shareId/files`). Linkul hashuit nu expune slug-ul evenimentului; recipienții văd doar pozele de fotocabină. #RECENT #MEDIA
#RECENT  2026-09-02: Landing-ul persistă imediat recunoașterea adminului: la inițializare, dacă există cookie `av_admin=1`, salvează `av_admin_device` în localStorage și folosește starea persistentă după refresh; popup-ul de admin apare doar când adminul interacționează, iar refresh-ul nu reactivează notificările email. #RECENT #CAMPAIGN #ADMIN #NOTIFY
#RECENT  2026-09-02: Excluderea adminului pentru notificările campaign nu mai depinde exclusiv de cookie-ul `av_admin`, care poate fi resetat temporar la refresh de Firebase; login-ul salvează markerul persistent `localStorage.av_admin_device`, landing-ul îl verifică împreună cu cookie-ul, iar logout-ul îl șterge. #RECENT #CAMPAIGN #ADMIN #NOTIFY #PITFALL
#RECENT  2026-09-02: Subiectul emailurilor de interacțiune campaign include acum ora exactă în fusul `Europe/Bucharest`, de forma `👀 Interacțiune landing — Spinner — ora 14:32:05`, atât pentru spinner cât și pentru formular. #RECENT #CAMPAIGN #NOTIFY
#RECENT  2026-09-02: Etichetele spinnerului sunt acum în trei containere SVG separate, rotunjite și spațiate clar în feliile lor: `VIDEOBOOTH` sus-dreapta, `NIMIC` jos, `FOTOCABINĂ` sus-stânga; nu se mai suprapun la rotire. #RECENT #CAMPAIGN #UX
#RECENT  2026-09-02: Textele `VIDEOBOOTH`, `NIMIC`, `FOTOCABINĂ` din spinner sunt acum randate pe arce SVG, în formă curbată/U întors, centrate în cele trei felii și rotite împreună cu roata. #RECENT #CAMPAIGN #UX
#RECENT  2026-09-02: Etichetele din roata spinner (`VIDEOBOOTH`, `NIMIC`, `FOTOCABINĂ`) sunt afișate în badge-uri rotunjite, cu fundal translucid și poziționare centrată în cele 3 felii pentru lizibilitate mai bună. #RECENT #CAMPAIGN #UX
#RECENT  2026-09-02: Headline-ul promoției spinner folosește animația infinită de culoare la 700ms pe fiecare etapă: roșu, galben, verde, albastru. #RECENT #CAMPAIGN #CRO #UX
#RECENT  2026-09-02: Timerul promoției spinner din `/oferta/olx` are acum 15 ore (`15:00:00` la pornire), cu afișare HH:MM:SS și expirare la zero. #RECENT #CAMPAIGN #CRO #UX
#RECENT  2026-09-02: Fix spinner promoțional: `transform: rotate(0deg)` inline suprascria animația inițială CSS, astfel că spinnerul părea nemișcat; transform-ul inline este aplicat doar după primul click, iar starea idle rulează rotația lentă. #RECENT #CAMPAIGN #UX #PITFALL
#RECENT  2026-09-02: Landing-ul campaign trimite notificare email la interacțiunea cu spinnerul și la intrarea/acțiunea în formular (`POST /api/campaign/:slug/interaction`); notificările sunt deduplicate per tip în sessionStorage, iar `lead_created` rămâne emis doar după submit reușit. Endpointul suportă și cazul special `olx`, care este ofertă în colecția `offers`, nu document `campaignPages`. #RECENT #CAMPAIGN #NOTIFY #ANALYTICS
#RECENT  2026-09-02: Spinnerul promoției de pe `/oferta/olx` a fost mărit la 224px (inclusiv emoji/bordură), iar mesajul de câștig și confetti sunt afișate în flux normal, fără suprapunere de text. #RECENT #CAMPAIGN #CRO #UX
#RECENT  2026-09-02: Promoția din landing-ul `/oferta/olx` afișează spinnerul direct, fără buton intermediar; headline-ul este mare și spune „Ai șansa să câștigi fotocabina gratuit”. #RECENT #CAMPAIGN #CRO #UX
#RECENT  2026-09-02: Fix `/oferta/olx`: API-ul campaign nu are document `olx` (404), dar există ofertă individuală (200); `OfertaPage` convertește acum oferta `olx` într-un `CampaignPage` și afișează landing-ul CRO nou, reutilizând imaginile, video-ul și pachetele existente. #RECENT #CAMPAIGN #PITFALL
#RECENT  2026-09-02: `/oferta/:slug` verifică acum întâi `/api/campaign/public/:slug` și abia apoi fallback-ul `/api/oferte/:slug`; anterior un document de ofertă cu același slug (ex. `olx`) intercepta landing-ul campaign și făcea invizibile modificările CRO. #RECENT #CAMPAIGN #PITFALL
#RECENT  2026-09-02: Landing-ul de campanie `/oferta/olx` are formular scurt de disponibilitate imediat după hero (tip eveniment, dată, localitate, nume, telefon/WhatsApp), CTA WhatsApp sub formular, bară sticky pe mobil cu safe-area, dovada „peste 50 de evenimente”, galerie inițială de 8 imagini cu expandare și tracking separat pentru `form_started`, `click_whatsapp`, `click_phone` și `lead_created` doar după submit reușit. #RECENT #CAMPAIGN #CRO #ANALYTICS
#RECENT  2026-09-02: `/oferta/olx` include promoție interactivă cu timer de 15 minute și 3 încercări: prima este neeligibilă, una dintre următoarele două afișează câștigul „fotocabina gratuită” și confetti vizual; mecanismul este UI-side și include mențiunea că oferta se confirmă în limita disponibilității. #RECENT #CAMPAIGN #CRO
#RECENT  2026-09-02: Hotjar poate fi exclus permanent pentru browserul acestui laptop fără IP: `index.html` verifică `localStorage.av_ignore_hotjar === '1'` înainte să încarce scriptul; activare din DevTools: `localStorage.setItem('av_ignore_hotjar', '1'); location.reload()`, dezactivare: `localStorage.removeItem('av_ignore_hotjar'); location.reload()`. #RECENT #ANALYTICS #PRIVACY #PITFALL
#RECENT  2026-09-02: Editorul de blog din `/admin/blog` pornește implicit în modul `PREVIEW`, cu HTML-ul randat vizual; modul `PLAIN` rămâne disponibil pentru editarea sursei HTML/Markdown. #RECENT #BLOG #ADMIN #UX
#RECENT  2026-09-02: Cardurile articolelor din `/admin/blog` au culoare interpolată după vizualizări: verde pentru cel mai vizitat articol, tranziție treptată, roșu pentru articolele fără vizualizări; selecția curentă rămâne evidențiată cu ring amber. #RECENT #BLOG #ADMIN #ANALYTICS #UX
#RECENT  2026-09-01: Cardurile articolelor din categoria selectată în `/admin/blog` folosesc layout pe coloane (`columns-*`), astfel încât ordinea descrescătoare după vizualizări curge de sus în jos în coloana din stânga, apoi continuă în coloana următoare. #RECENT #BLOG #ADMIN #UX
#RECENT  2026-09-01: Articolele din fiecare categorie în `/admin/blog` sunt ordonate descrescător după numărul de vizualizări; regula se aplică atât listei colapsabile, cât și cardurilor din categoria selectată. #RECENT #BLOG #ADMIN #ANALYTICS #UX
#RECENT  2026-09-01: `/admin/blog` încarcă numărul de vizualizări din colecția `siteVisits` prin `/api/blog/admin/views`, asociind vizitele cu slug-ul `/blog/{slug}`; contorul apare lângă fiecare articol în lista pe categorii și în detaliile categoriei selectate. #RECENT #BLOG #ADMIN #ANALYTICS
#RECENT  2026-09-01: `/admin/blog` afișează un donut/pie chart interactiv pentru distribuția articolelor pe categorii; selectarea unei categorii arată orașele asociate și numărul de articole. Lista laterală este grupată pe aceleași categorii în secțiuni collapsable, fără să afecteze filtrul de oraș sau selecția articolului. Validat cu `npm run typecheck`, ESLint și `git diff --check`. #RECENT #BLOG #ADMIN #UX
#RECENT  2026-09-01: `/admin/blog` are toggle `PLAIN`/`PREVIEW` pentru body: PLAIN editează HTML/Markdown brut, iar PREVIEW randează HTML-ul vizual în stilul articolului. Conținutul salvat rămâne neschimbat. Validat cu `npm run typecheck` și ESLint (doar warning existent despre dependența `load`). #RECENT #BLOG #ADMIN #UX
#RECENT  2026-09-01: `generateSitemapFromDb()` include acum automat în sitemap toate documentele `blogPosts` cu `status=published`, pe lângă `sitemapEntries`, cu deduplicare după URL; la startup loghează numărul de articole adăugate. Astfel articolele publicate anterior apar după restart fără backfill manual. #RECENT #BLOG #SEO #PITFALL
#RECENT  2026-09-01: Publicarea unui articol de blog adaugă automat URL-ul `/blog/{slug}` în `sitemapEntries` și regenerează `public/sitemap.xml`; drafturile rămân excluse. Implementat în `src/server/routes/blog.routes.ts` folosind `addSitemapEntry` + `generateSitemapFromDb`. Validat cu `npm run typecheck`, ESLint și `git diff --check`. #RECENT #BLOG #SEO #ADMIN
#RECENT  2026-09-01: Generatorul SEO Radar normalizează canonical-ul fiecărei variante la URL-ul public real de blog (`https://ancavisuals.ro/blog/{slug}`), chiar dacă Claude returnează un canonical vechi de tip landing (`/fotograf-turda`). Promptul JSON folosește aceeași regulă. #RECENT #ADMIN #SEO #BLOG #PITFALL
#RECENT  2026-09-01: SEO Radar are buton „Publică articolul” în editorul variantei; trimite varianta selectată către API-ul existent `/api/blog/admin/posts/:slug` cu status `published`, mapând metadata SEO și body-ul HTML în structura `blogPosts`. Butonul este activ doar cu titlu, slug și body completate. Validat cu `npm run typecheck`, ESLint și `git diff --check`. #RECENT #ADMIN #SEO #BLOG
#RECENT  2026-09-01: Promptul Claude pentru body SEO Radar impune stil scurt, direct și orientat strict pe produse, servicii și feature-uri concrete; interzice textele siropoase, clișeele, metaforele, introducerile lungi și umplutura și păstrează regula de a nu inventa prețuri/promisiuni. #RECENT #ADMIN #SEO #PROMPT
#RECENT  2026-09-01: Parserul răspunsurilor Claude din SEO Radar folosește `jsonrepair` pentru postări și body, deoarece JSON-ul generat poate conține mici abateri (virgule, code fence sau caractere în conținut HTML) și `JSON.parse` direct eșua. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Fix transcript dictare multi-rând în SEO Radar: rezultatele Web Speech sunt acum reconstruite din textul de bază + întreaga sesiune curentă, cu rollover la restartul automat; fragmentele/rândurile anterioare nu mai sunt înlocuite când începe următorul rezultat intermediar. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Ultimul fragment de dictare SEO Radar este salvat acum la oprirea microfonului, la `onend` și la erori, nu doar afișat ca preview intermediar; astfel textul nu se pierde când sesiunea SpeechRecognition se închide. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Dictarea vocală SEO Radar afișează acum transcriptul intermediar live sub waveform și adaugă în textarea doar segmentele finale noi, prevenind atât lipsa feedbackului vizual/textual, cât și repetarea frazelor. #RECENT #ADMIN #SEO #UX
#RECENT  2026-09-01: Fix waveform dictare SEO Radar: `startVoiceWaveform` citea canvas-ul înainte ca React să monteze elementul condiționat. Canvas-ul este acum montat permanent (ascuns când nu se înregistrează), iar referința este citită după `getUserMedia`, astfel waveform-ul apare la pornire. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Fix dictare SEO Radar: transcriptul se duplica deoarece `onresult` adăuga toate rezultatele intermediare la fiecare eveniment. Acum sunt adăugate doar segmentele noi marcate `isFinal`, începând de la `resultIndex`. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Dictarea vocală din editorul SEO Radar rămâne activă după pauze: `SpeechRecognition.continuous=true` și restart la `onend` cât timp utilizatorul nu a apăsat Stop. A fost adăugat waveform live Canvas alimentat prin `getUserMedia` + `AnalyserNode`, inspirat din waveform-ul QR Moments, cu cleanup pentru stream/AudioContext. #RECENT #ADMIN #SEO #UX #PITFALL
#RECENT  2026-09-01: Editorul body SEO Radar are dictare vocală în câmpul de context prin Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`), cu limba browserului implicită; textul transcris este adăugat în input și este trimis către Claude doar la „Generează conținut”. Afișează fallback pentru browsere fără suport și eroare pentru permisiuni refuzate. #RECENT #ADMIN #SEO #UX
#RECENT  2026-09-01: După generarea unei variante SEO, editorul rămâne pe aceeași variantă; nu mai avansează automat la următorul schelet. Navigarea se face exclusiv cu săgețile. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: În editorul SEO Radar, inputul „Context pentru body” este deasupra editorului rich-text și body-ul se generează numai la apăsarea „Generează conținut”; generatorul principal completează metadata fără `bodyHtml`, iar variantele de body se inserează manual după alegere. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Generarea variantelor SEO este secvențială: prima apăsare completează primul schelet gol, următoarea îl completează pe următorul, fără suprascriere; după succes editorul avansează automat. Dacă revii cu săgețile pe o variantă completată, butonul o poate regenera explicit. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Drafturile SEO Radar se salvează automat în localStorage (`ancavisuals:seo-radar:draft`): rezultatul SERP, cele 3 variante, varianta activă și editările body/meta se restaurează după refresh; draftul se șterge la căutare nouă sau resetare explicită. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Editorul SEO Radar are buton „Verifică” lângă URL-ul canonic; endpointul protejat `POST /api/admin/seo-radar/check-canonical` verifică accesibilitatea prin HEAD cu timeout de 10s, raportează statusul HTTP și permite doar URL-uri HTTPS de pe `ancavisuals.ro`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: SEO Radar nu mai generează automat toate cele 3 postări. „Creează postare SEO” deschide un singur editor cu 3 schelete navigabile prin săgeți stânga/dreapta; fiecare variantă are buton propriu „Generează cu Claude”/„Regenerează cu Claude”, iar câmpurile rămân editabile manual. Endpointul `generate-post` acceptă `variantIndex` și generează o singură variantă la cerere. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Timeouturile Anthropic din SEO Radar sunt separate: sugestiile scurte folosesc 30s, iar analiza/postarea/body cu Claude Sonnet folosesc 120s; generatorul de postări complete depășea timeoutul scurt și producea `APIConnectionTimeoutError`. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Fix `KeywordBuilder`: lista de evenimente este flat și se randează cu `options.map`; primele două câmpuri sunt inputuri custom, iar al patrulea este autocomplete pentru orașe din Ardeal cu județ/populație în opțiuni. Aceasta previne runtime-ul `options[0].map is not a function`. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: Al patrulea câmp din constructorul SEO Radar este acum un autocomplete searchable pentru orașele din Ardeal; opțiunile afișează județul și populația disponibilă, sunt sortate descrescător după populația 2021, iar orașul ales se copiază și în locația SERP. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Constructorul SEO Radar folosește dropdown-uri pentru serviciu 1 (fotograf/foto/fotografie), serviciu 2 (videograf/videografie/video/fotografie/foto) și tip eveniment; al patrulea câmp rămâne Custom. „Folosește keyword” transferă toate valorile completate în keyword-ul principal, iar butoanele Claude generează sugestii noi și variante asemănătoare. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Constructorul de keyword din SEO Radar are 4 câmpuri opționale (serviciu 1, serviciu 2, oraș, custom); valorile necompletate sunt ignorate, iar „Folosește keyword” cere cel puțin unul populat și compune textul pentru căutare. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Subiectul emailurilor de notificare pentru vizitatori include acum sursa la final (`- Google`, `- ChatGPT`, `- Claude`, `- Instagram` etc.), folosind aceeași detectare de UTM/referrer ca activitatea din admin. #RECENT #NOTIFY #ATTRIBUTION
#RECENT  2026-09-01: Chatbotul oferă buton direct către WhatsApp (`https://wa.me/40745469907`) cu iconiță WhatsApp; opțiunea este inclusă în răspunsul despre zona de acoperire și în răspunsurile libere generate de Claude. Mesajul precizează că Anca Visuals este din Turda, dar face evenimente oriunde. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #CHATBOT #WHATSAPP
#RECENT  2026-09-01: Chatbotul public răspunde contextual cu Claude la întrebări libere și are context fix: Anca Visuals este bazat în Turda, face evenimente oriunde în România și la cerere în străinătate; întrebările despre Mureș/Turda sunt direcționate explicit către răspunsul de acoperire. După 5 minute de inactivitate, frontendul trimite o singură dată transcriptul către `POST /api/assistant/transcript`, iar serverul îl expediază administratorului prin email. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #CHATBOT #NOTIFY
#RECENT  2026-09-01: SEO Radar are creator de postări SEO cu Claude: `POST /api/admin/seo-radar/generate-post` produce 3 variante complete cu SEO title, slug, canonical, meta description, tags, categorie, body HTML, FAQ și linkuri interne; UI-ul permite alegerea/editarea variantelor și body rich-text (bold, italic, listă). `POST /api/admin/seo-radar/generate-body` produce 3 variante de text din instrucțiunea administratorului și le poate insera în body. Validat cu `npm run typecheck` și ESLint țintit. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: SEO Radar are analiza Claude la cerere prin `POST /api/admin/seo-radar/analyze`; recomandarea include vizibilitate, intenție, prioritate, tip de pagină, URL canonic, titlu/meta, articol blog + outline, acțiuni on-page, linkuri interne și FAQ. API key-ul rămâne server-side. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Panoul SEO Radar schimbă statisticile în funcție de provider: SerpApi afișează căutările rămase, iar DataForSEO afișează soldul USD din `/v3/appendix/user_data`; endpointul backend primește `?provider=`. Validat cu `npm run typecheck`, ESLint țintit și `git diff --check`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: SEO Radar DataForSEO folosește `location_code` în loc de `location_name` (respins în runtime); codul orașului este rezolvat prin endpointul gratuit `/v3/serp/google/locations/ro`, cu fallback la România `2642`. Validat cu `npm run typecheck` și ESLint țintit. #RECENT #ADMIN #SEO #PITFALL
#RECENT  2026-09-01: SEO Radar salvează fiecare captură SerpApi în Firestore (`seoRadarSearches`), compară poziția `ancavisuals.ro` cu captura anterioară și afișează istoricul keyword + oraș; endpointul `/api/admin/seo-radar/stats` expune crediturile SerpApi fără a divulga cheia, iar UI-ul le afișează sus. Validat cu `npm run typecheck`, ESLint țintit, `git diff --check` și `npm run build`. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: SEO Radar permite alegerea providerului `SerpApi` sau `DataForSEO`; DataForSEO folosește `API_LOGIN_DATAFORSEO` și `API_DATAFORSEO_PASSWORD` server-side și normalizează rezultatele în același istoric Firestore. #RECENT #ADMIN #SEO
#RECENT  2026-09-01: Evenimentele OpenAI Pixel `lead_created` (`type: customer_action`) sunt trimise la click pe telefon/WhatsApp/Instagram în footer, în `/oferta/:slug` și în campanii; formularul de contact din campanie trimite evenimentul doar după răspuns API reușit. Helper comun: `src/client/utils/oaiq.ts`. Validat cu `npm run typecheck` și `git diff --check`. #RECENT #ATTRIBUTION #ANALYTICS #CAMPAIGN
#RECENT  2026-09-01: Pixelul OpenAI `oaiq` cu pixelId `EfkfFdccMQc1Dj6pmG7pva` este încărcat din `index.html` doar pe producție și pagini publice (nu `/admin`/`/media`), pentru măsurarea traficului provenit din ChatGPT. Validat cu `npm run build` și `git diff --check`. #RECENT #ATTRIBUTION #ANALYTICS
#RECENT  2026-09-01: Analytics atribuie vizitele venite din ChatGPT, Claude, Gemini, Perplexity și Grok prin `utm_source` sau referrer; atribuirea se păstrează în sesiune, iar `/admin/analytics` afișează „Recomandări AI” cu vizitatori unici pe perioadă. #RECENT #ATTRIBUTION #ANALYTICS #ADMIN
#RECENT  2026-09-01: Formularul de cheltuială acceptă USD și curs Revolut USD→RON; suma fiscală se salvează ca echivalent RON, iar suma/moneda originală și cursul se păstrează în câmpurile `originalAmount`, `originalCurrency`, `exchangeRate`. Conversia este validată și server-side. #RECENT #ADMIN #FINANCE
#RECENT  2026-09-01: Formularul de cheltuială din `FinancialPage` validează monedele scanate AI ca `RON`/`EUR`/`USD`; preview-ul deductibilului are fallback explicit pe `RON`, prevenind afișarea unei monede neacceptate. Validat cu `npm run typecheck`. #RECENT #ADMIN #PITFALL
#RECENT  2026-09-01: Modalul „Modifică” din `EventCard` nu se mai închide la click pe overlay și nu mai are buton separat „Anulează”; închiderea se face prin `X`, iar salvarea păstrează dialogul deschis pentru editări succesive. Validat cu `npm run typecheck`. #RECENT #ADMIN #UX
#RECENT  2026-09-01: Registrul fiscal blochează server-side dublurile de facturi din cheltuieli folosind număr normalizat (acceptă formate precum `123`, `Factura nr. 123`, spații și slash-uri) + furnizor normalizat; protecția hash pentru fișiere identice rămâne activă. Validat cu testele `expenses.routes.test.ts` (9/9) și typecheck. #RECENT #ADMIN #PITFALL
#RECENT  2026-08-27: QR Moments copiază `input.files` în array înainte de eliminarea inputului temporar din DOM; unele browsere mobile pot goli/invalida `FileList` la detach și pierdeau selecția multiplă. Adăugat test de compatibilitate pentru 3 fișiere selectate. Limita efectivă configurată pentru nginx și client este 500 MB per fișier; uploadurile sunt trimise separat. Validat cu testele QRMomentsPage și `npm run typecheck`. #RECENT #QR #PITFALL
#RECENT  2026-08-27: În formularul QR Moments, consimțământul pentru notificări email este opțional; obligatoriu rămâne doar consimțământul GDPR pentru funcționarea serviciului. Butonul de selecție foto/video folosește styling emerald consistent cu AncaVisuals. Validat cu testele QRMomentsPage, `npm run typecheck` și `npm run build:client`. #RECENT #QR
#RECENT  2026-08-27: Ecranul de succes QR Moments face scroll smooth la începutul paginii, afișează titlul mare `MATERIALE ÎNCĂRCATE` și confetti animat; pentru evenimente corporate sunt ascunse sugestiile de urări specifice nunții/botezului. Validat cu testele QRMomentsPage și `npm run typecheck`. #RECENT #QR #UI
#RECENT  2026-08-27: Consimțământul email QR Moments este opțional și la server: înregistrarea publică cere doar GDPR și salvează `emailConsent` exact ca opt-in; emailurile de mulțumire/comentariu și notificarea de vizualizare se trimit doar când valoarea este `true`. Linkul de dezabonare setează `emailConsent=false`. Validat cu 14 teste QR relevante și typecheck. #RECENT #QR #NOTIFY
#RECENT  2026-08-27: Notificările admin pentru uploadurile QR Moments sunt agregate pe `batchId` timp de 15 secunde: selecția multiplă rămâne încărcată prin requesturi separate/retry, dar generează un singur email cu numărul total de poze/video/mesaje. Requesturile vechi fără batchId păstrează fallback-ul de notificare individuală. Validat cu testele QR relevante și typecheck. #RECENT #QR #NOTIFY
#RECENT  2026-08-28: Erorile XHR `onerror`/timeout din QR Moments afișează utilizatorului un mesaj clar despre conexiune instabilă, recomandând un loc cu internet mai stabil și retry; mesajul apare și în eroarea globală când uploadul este parțial. Validat cu testele QRMomentsPage și typecheck. #RECENT #QR #UX
#RECENT  2026-08-28: Fiecare card QR Moments cu upload eșuat are buton funcțional `REÎNCEARCĂ`: retrimite exact fișierul respectiv într-un request nou, îl elimină după succes, iar dacă era ultimul afișează ecranul de succes; retry-ul global pentru eșecuri multiple rămâne disponibil. Validat cu testele QRMomentsPage și typecheck. #RECENT #QR #UX
#RECENT  2026-08-26: Zona `/admin/blog` are acum un UI dark aliniat cu restul adminului: statistici pentru articole/publicate/drafturi/orașe SEO, listă de articole cu status vizibil, formular organizat pe secțiuni și layout responsive. Listările publice/admin unesc cele 60 de articole Markdown cu toate documentele din colecția Firestore `blogPosts` (deduplicate după slug), astfel încât adminul poate afișa și administra toate cele aproximativ 508 înregistrări existente; importul și editarea marchează postările administrate. Editorul are butoane AI 🪄 pentru sugestii selectabile de titlu, descriere SEO și seturi de etichete, prin endpoint-urile protejate `POST /api/blog/admin/title-suggestions` și `POST /api/blog/admin/metadata-suggestions`. Adăugată și zona separată `/admin/seo-pages` pentru listarea, căutarea și filtrarea intrărilor `sitemapEntries` (cele 508 URL-uri SEO), cu endpoint protejat `GET /api/admin/seo/pages`. Funcționalitatea de import, editare și publicare a rămas neschimbată. Validat cu `npm run typecheck`, `npm run lint` și `npm run build`. #RECENT #BLOG #ADMIN #THEME #SEO
#RECENT  2026-08-27: În editorul de blog, linkul `Previzualizare articol` deschide articolul într-un tab nou, iar butonul de salvare a fost mutat în header-ul editorului, lângă status și previzualizare. #RECENT #BLOG #ADMIN
#RECENT  2026-08-25: QR Moments acceptă acum tipul de eveniment `corporate`, cu câmpul „Organizator” în loc de mire/mireasă; dacă nu este completat, serverul salvează și afișează `ORGANIZATORUL`. Galeria și notificările folosesc formularea specifică pentru organizator. Validat cu `npm run typecheck` și testele QR Moments relevante. #RECENT #QR
#RECENT  2026-08-25: Crearea QR Moments nu mai necesită selectarea unui eveniment din `adminEvents`; formularul permite „Fără eveniment existent” și o dată introdusă manual, iar serverul generează slug/PIN și acceptă `adminEventId = null`. #RECENT #QR #ADMIN
#RECENT  2026-08-23: Hotjar nu se mai încarcă pe `/admin`, `/admin/*`, `/media` sau `/media/*`, iar Google Ads/gtag nu se mai încarcă pe `/admin` și `/admin/*`; pe restul producției tracking-ul rămâne activ. #RECENT #ANALYTICS #PRIVACY
#RECENT  2026-08-23: Pagina publică QR Moments folosește acum componenta reală `PortfolioGallery` pentru galeria promoțională afișată după upload; reutilizează masonry-ul responsive, lightbox-ul și endpoint-ul `/api/oferte/portfolio-images` din `/portofoliu`, iar carouselul vechi limitat la 8 imagini Firebase a fost eliminat. Endpoint-ul deduplicatează după `sourceAlbumSlug + sourcePhotoUrl` (URL-urile Bunny pot diferi pentru aceeași fotografie), iar componenta are fallback de deduplicare după URL. #RECENT #QR #MEDIA
#RECENT  2026-08-19: În `ContractActionMenu`, „Semnează tu” este disponibil acum atât pentru contracte `draft`, cât și `sent`; anterior dispărea după trimiterea linkului către client, deși endpoint-ul `POST /api/contracts/:id/prestator-sign` accepta semnătura. Validat cu typecheck și testele ContractList/contracts routes. #RECENT #ADMIN
#RECENT  2026-08-19: Semnarea prestatorului este disponibilă și pentru contracte `signed` care încă nu au semnătura prestatorului; contractele `expired` și `anulat` rămân blocate. Dacă clientul a semnat primul, `POST /api/contracts/:id/prestator-sign` regenerează PDF-ul stocat după salvarea semnăturii. Validat cu typecheck și testele ContractList/contracts routes. #RECENT #ADMIN
#RECENT  2026-08-21: Tracking-ul UTM pentru surse AI recunoaște ChatGPT (`chatgpt.com`), Claude, Gemini și Grok; păstrează atribuirea în sessionStorage, trimite o notificare email dedicată cu sursa/medium/campania și salvează câmpurile UTM în `siteVisits`. Cooldown-ul notificării este separat per IP + sursă, iar emailul se trimite o singură dată per sesiune de browser. Validat cu `npm run typecheck`, `npm test` și `git diff --check`. #RECENT #ATTRIBUTION #NOTIFY #ANALYTICS
#RECENT  2026-08-21: Social proof-ul public este centralizat în `GOOGLE_REVIEW_COUNT = 26`; paginile locale afișează 26 de review-uri și invită vizitatorii să verifice profilul Google Business prin `GOOGLE_BUSINESS_URL`, iar `public/llms.txt` folosește aceeași valoare. #RECENT #SEO
#RECENT  2026-08-21: Adăugat scannerul `scripts/generateImageAlts.ts` + comanda `npm run seo:alts`: navighează sitemap-ul public cu Playwright, extrage imaginile randate (inclusiv galeriile dinamice), generează alt-uri în română prin Claude Vision, cache-uiește rezultatele în `data/imageAltCatalog.json` și le folosește automat în `PortfolioGallery`/`BunnyPhotoGallery` prin `getCatalogImageAlt`. Moduri: `--discover-only`, `--pages N`, `--all`, `--limit N`, `--force`. Scannerul exclude explicit paginile și URL-urile de imagine din `/media`. #RECENT #SEO #MEDIA
#RECENT  2026-08-21: Promptul Claude Vision pentru alt-uri identifică „mire și mireasă” când contextul vizual de nuntă este clar (nu doar pe baza hainelor), cu fallback la descriere neutră; primele 10 imagini au fost regenerate și sunt `generated`, iar următoarele 247 rămân `pending`. #RECENT #SEO
#RECENT  2026-08-21: `scripts/generateImageAlts.ts` are modul `--from-catalog`: filtrează direct intrările cu `/portofoliu` din `data/imageAltCatalog.json`, continuă doar imaginile `pending`/`error` și nu mai scanează sitemap-ul sau paginile; `--limit N` înseamnă următoarele N imagini de procesat. #RECENT #SEO
#RECENT  2026-08-21: Adăugat `scripts/generateImageSitemap.ts` + `npm run seo:image-sitemap`; generează `public/image-sitemap.xml` din catalogul de imagini, cu paginile și URL-urile Bunny CDN, iar `public/robots.txt` declară noul sitemap. Ultima generare: 2 pagini, 514 asocieri imagine-pagină. #RECENT #SEO
#RECENT  2026-08-19: Zona finală de pe `/contact` folosește `AncaVisualsPromo compact`, afișând doar butoanele Contact (email), WhatsApp și Call către `+40745469907`; galeria și promo-ul extins rămân disponibile pe celelalte pagini. #RECENT #CONTACT
#RECENT  2026-08-20: Modalul „Generează factură” din `ContractListPage` permite acum completarea/precompletarea datelor cumpărătorului: nume/denumire, adresă, oraș și județ; acestea sunt trimise către `POST /api/admin/invoices`, unde sunt obligatorii pentru factura/e-Factura. Validat cu typecheck, testul ContractListPage și build. #RECENT #ADMIN
#RECENT  2026-08-19: În `OfertaPage.tsx`, prețurile pachetelor nu mai apar în cardurile de sus; sunt afișate într-o secțiune finală „Prețuri”, după preview-ul serviciilor și imediat înainte de CTA-urile de descărcare/contact. #RECENT #CAMPAIGN
#RECENT  2026-08-19: Vizualizarea publică a ofertelor și campaniilor (`POST /api/oferte/:slug/view`, `POST /api/campaign/:slug/view`) trimite acum notificare email cu IP, geolocație IP (dacă `IPINFO_TOKEN` este configurat), ISP, user-agent interpretat (browser/dispozitiv/OS), user-agent brut, referrer și URL-ul paginii cu parametri UTM. Clientul trimite `window.location.href` + `document.referrer`, iar template-ul nou este `src/server/notifications/offerViewNotification.ts`. #RECENT #NOTIFY #CAMPAIGN
#RECENT  2026-08-18: Scriptul `dev:server` folosește acum `tsx watch server.ts`, astfel încât modificările în endpoint-urile backend (inclusiv salvarea pachetelor ofertelor) sunt încărcate automat fără restart manual al procesului local. #RECENT #CMD #ADMIN
#RECENT  2026-08-18: Landing page-ul ofertelor afișează acum inițial până la 12 poze per categorie în masonry, în loc de 6; butonul `MAI MULTE POZE` rămâne disponibil pentru imaginile suplimentare. #RECENT #ADMIN #MEDIA
#RECENT  2026-08-18: Câmpul `Ce conține` din editorul de pachete pentru oferte este acum o listă structurată de elemente cu checkbox și input text; se pot adăuga sau elimina rânduri, iar elementele debifate nu apar pe landing. Pachetele vechi cu text delimitat sunt normalizate automat în elemente bifate pentru compatibilitate. Validat cu `npm run typecheck`, `npm test`, `npm run build` și `git diff --check`. #RECENT #ADMIN #CAMPAIGN
#RECENT  2026-08-20: Emiterea facturii din lista de contracte are bifa „Generează factura în RON”; când este activă, factura financiară, PDF-ul și XML-ul e-Factura folosesc RON, iar suma facturată poate fi introdusă exact în moneda încasată. Pentru facturile non-RON, XML-ul include și cursul BNR (`TaxExchangeRate`). API-ul validează moneda RON/EUR și suma pozitivă. #RECENT #ADMIN #INVOICE
#RECENT  2026-08-18: Ofertele suportă acum mai multe pachete prin câmpul `packages` (`name`, `headline`, `subheadline`, `includes`, `price`), editabile atât la creare cât și la modificare în `OferteAdminPage`; landing-ul public afișează cardurile cu conținutul în stânga și prețul în dreapta. API-ul păstrează backward compatibility pentru `packageName`/`price` la ofertele vechi. Validat cu `npm run typecheck`, `npm test` și `npm run build`. #RECENT #ADMIN
#RECENT  2026-08-18: Galeriile de imagini din landing-ul public al ofertelor au masonry responsive (2 coloane pe mobile, 3–4 pe ecrane mai mari), afișează inițial 6 poze per categorie și au buton `MAI MULTE POZE` pentru restul; videoclipurile sunt randate separat în player 16:9 cu controale. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN #MEDIA
#RECENT  2026-08-18: Landing page-ul ofertelor nu mai afișează repetitiv placeholder-ul `Pret configurat in oferta` ca headline pentru fiecare serviciu; acesta este ascuns când nu există preț per serviciu, iar prețul total rămâne în cardul principal al ofertei. #RECENT #ADMIN
#RECENT  2026-08-18: Landing page-ul public al unei oferte (`OfertaPage` + `GET /api/oferte/:slug`) folosește acum `displayUrl` pentru asset-urile provenite din albume, deci galeriile pe categorii (foto/video/fotocabină etc.) afișează același preview WebP optimizat ca biblioteca admin, cu fallback la `url`. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN #MEDIA
#RECENT  2026-08-18: Galeria de asset-uri din `/admin/template-oferte/:serviceId` folosește acum masonry columns responsive pentru imaginile selectate și biblioteca disponibilă; imaginile păstrează proporțiile native, iar drag & drop-ul pentru reordonare rămâne activ. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN #MEDIA
#RECENT  2026-08-18: Compresorul manual `src/client/features/admin/components/ImageOptimizerPage.tsx` pornește acum mai agresiv pentru `photos_preview` WebP (preset implicit 1200px / quality 64), iar importul din `SharePage` trimite URL-ul de preview direct către Media Assets în loc să-l convertească înapoi la JPG. Validat cu `npm run typecheck` și `npm run build`. #RECENT #MEDIA #ADMIN
#RECENT  2026-08-18: Media Assets pentru oferte importă acum pozele din album din `photos_preview` (WebP) în loc de `originalPhoto` (JPG), iar importul server-side descarcă direct preview-ul când vine din album. Adăugat și buton în admin pentru reprocessarea importurilor vechi, care migrează asset-urile existente la WebP și actualizează `offer_media_assets` pe baza basename-ului. Validat cu `npm run typecheck`, `npm test` și `npm run build`. #RECENT #MEDIA #ADMIN
#RECENT  2026-08-18: Chatbotul public (`src/client/features/chat/components/AncaChat.tsx`) livrează acum răspunsurile lungi în baloane secvențiale, pe paragrafe/idei, cu delay proporțional și indicator „Scrie un mesaj...”; sugestiile reapar numai după ultimul balon, iar resetarea anulează livrările aflate în curs. Validat cu `npm run typecheck`. #RECENT
#RECENT  2026-08-18: Dezactivat notificarea pe email la acceptarea acordului de descărcare a materialelor (`POST /api/album/:slug/consent` din `src/server/routes/album.routes.ts` returnează `{ ok: true }` fără să mai trimită email la admin). #RECENT #MEDIA #NOTIFY
#RECENT  2026-08-18: Rescris complet pagina de eroare / 404 când un album nu este găsit (`AlbumNotFound.tsx`): afișează sugestie automată către `/media/{slug}` dacă utilizatorul a omis prefixul (ex: acces direct la `/2martie2026`), explicație clară a erorii, sfaturi utile și butoane directe de contact pe WhatsApp și apel telefonic. Adăugat catch-all route `<Route path="*" element={<AlbumNotFound />} />` în `App.tsx`. #RECENT #MEDIA
#RECENT  2026-07-17: Fix critic infra QR Moments: nginx (`/etc/nginx/conf.d/ancavisuals.conf`) nu avea `client_max_body_size` setat, deci default-ul de 1MB respingea (413) orice poză/video real trimis de invitați, indiferent de cod — asta era cauza reală a rapoartelor "QR Moments nu funcționează". Fix: `client_max_body_size 220m;` adăugat + `nginx reload` pe server, verificat live cu upload-uri de test de 1.2MB/5MB/20MB. #RECENT #QR #PITFALL
#RECENT  2026-07-17: QRMomentsPage upload rescris să trimită fiecare fișier ca request XHR separat (nu mai bundle-uiește toate fișierele într-un singur POST): progres vizual per poză/video (bară + %), checkmark la succes, retry doar pe fișierele eșuate (cele reușite dispar din listă). Fix bonus: butonul rămânea blocat pe "Se trimite…" la infinit fără eroare dacă apărea o excepție înainte de trimiterea request-ului — acum orice eroare (timeout, network, status HTTP, excepție neașteptată) e prinsă și afișată vizibil. `src/client/pages/QRMoments/QRMomentsPage.tsx`. Validat cu `npm run typecheck` + teste noi. #RECENT #QR
#RECENT  2026-07-17: Upload QR Moments acceptă acum orice format foto de pe iPhone/Samsung: conversie automată HEIC/HEIF → JPEG pe server (`convertHeicIfNeeded` în `qrMoments.routes.ts`, refolosește pattern-ul `heic-convert` + fallback `sharp` din `weddingHub.routes.ts`), cu fallback final la bytes originali dacă ambele eșuează (nu pierde fișierul niciodată). Galerie (`QRMomentsGalleryPage.tsx`) rescrisă să folosească `upload.type` server-side în loc de o listă hardcodată de mimeType-uri pentru a decide playerul — fix pentru `.mov` (video/quicktime) și orice codec audio care nu mai apărea cu player real; poze HEIC vechi (dinainte de fix) au fallback de descărcare în loc de imagine spartă. Fix bug pre-existent găsit prin teste: `detectMediaType` clasifica mesaje vocale `.webm` (Firefox/Android) drept video în loc de audio. Emailuri: subiectul de "a văzut ce ai trimis" are acum oră:minut:secundă; notificarea admin la upload specifică exact ce s-a trimis (ex: "2 poze și 1 videoclip") în loc de "un fișier nou". Validat cu `npm run typecheck` + `tests/vitest/server/routes/qrMomentsUploadCompat.test.ts` (nou) + `tests/vitest/client/pages/QRMoments/QRMomentsPage.test.tsx` (extins cu test de eșec parțial/retry). #RECENT #QR
#RECENT  2026-07-01: ConfiguratorTeaser (CTAPreview) comentat temporar din homepage — importul și `<CTAPreview />` comentate în `src/client/pages/Homepage/HomePage.tsx` (liniile 9 și 60). De decomentant când se reactiva configuratorul de prețuri. #RECENT #HOMEPAGE #TEMP
#RECENT  2026-07-01: Pagină nouă `/admin/settings` pentru date firmă/PFA (`src/client/features/admin/components/AdminSettingsPage.tsx`). Salvează în Firestore `settings/fiscal` câmpurile: ownerName, cif, address, city, county, postalCode, iban, bank, invoiceSeries. Fix XML e-Factura: `issuerCity/County/PostalCode` acum populate din `settings/fiscal` în `src/server/routes/invoices.routes.ts`. Rută adăugată în adminRoutes.tsx, entry în search Dashboard. #RECENT #ADMIN #INVOICE
#RECENT  2026-07-01: Format număr factură din contracte schimbat în `ADE-0001-12martie2026` (serie-număr-zilunaanan în română). Câmpul `invoiceRef` salvat în Firestore pe documentul facturii. `clientAddress` și `eventDate` transmise acum din InvoiceModal la creare. Backward compatible — facturile vechi fără `invoiceRef` folosesc formatul vechi. `src/server/routes/invoices.routes.ts` + `src/server/services/invoice.pdf.ts` + `ContractListPage.tsx`. #RECENT #INVOICE
#RECENT  2026-07-01: Search admin dashboard rescris cu Levenshtein real + scoring multi-token în `src/client/features/admin/components/Dashboard/index.tsx`. Suportă query-uri cu mai multe cuvinte, fuzzy cu maxDist 1-2 în funcție de lungimea tokenului, penalizare dacă un token nu găsește match. #RECENT #ADMIN #SEARCH
#RECENT  2026-05-25: BlogList și BlogPost afișează acum promo footer-ul Anca Visuals de la finalul paginilor, prin componenta reutilizabilă `src/client/components/Marketing/MediaPromoFooter.tsx`, inserată înainte de footerul normal al site-ului. #RECENT #BLOG #MEDIA
#RECENT  2026-05-13: Zona Financiar are acum tab nou `Extrase cont`: poți încărca un extras bancar PDF/imagine, AI extrage toate entry-urile și încearcă să le justifice automat prin facturile și cheltuielile existente din anul selectat. Implementare: `src/server/routes/bankStatements.routes.ts` + integrare în `src/client/features/admin/components/Financial/FinancialPage.tsx`. Validat cu `npm run typecheck`. #RECENT #ADMIN
#RECENT  2026-05-13: Dev setup fix — `npm run dev` pornește acum doar `dev:server`, deoarece `server.ts` include deja Vite în `middlewareMode`; rularea paralelă cu `dev:client` crea conflict HMR/WebSocket (`Port is already in use`) și putea face UI-ul din `/admin` să pară că se restartează. Script nou `dev:dual` păstrează varianta cu ambele procese doar pentru debugging explicit. #RECENT #DEBUG #PITFALL
#RECENT  2026-05-13: Fix pentru `/admin` care repornea vizual loader-ul în buclă: rutele lazy/protejate pentru admin și Wedding Hub nu mai sunt generate din funcții apelate în render-ul lui `App`, ci exportate ca constante module-level (`adminRoutes`, `weddingHubRoutes`), astfel încât rerender-urile globale să nu mai remonteze dashboard-ul și `AncaLoader`. Validat cu `npm run typecheck`. #RECENT #ADMIN #WH #PITFALL
#RECENT  2026-05-02: RSVP-ul public Wedding Hub permite acum un mesaj liber la confirmare, plus sugestii de text și emoji-uri rapide; mesajul este salvat pe guest și inclus în emailul de notificare către miri. Validat cu `npm run typecheck` și `npm run build`. #RECENT #WH
#RECENT  2026-05-02: Parser-ul pentru importul AI din poză a fost făcut tolerant la JSON imperfect: răspunsul Claude este extras din blocurile markdown/code fence și reparat cu `jsonrepair` înainte de `JSON.parse`, ca să nu mai pice la virgule/lipsă de bracket. Validat cu `npm run typecheck` și `npm run build`. #RECENT #WH
#RECENT  2026-05-02: Importul AI din poză pentru Wedding Hub acceptă acum și HEIC/HEIF direct din iPhone: backend-ul normalizează `image/jpg`, încearcă conversia HEIC prin `heic-convert` și are fallback la `sharp` înainte de apelul către Claude. Validat cu `npm run typecheck` și `npm run build`. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub a primit import AI din poză pentru invitați: `POST /api/wedding-hub/guests/extract-from-image` folosește Claude pentru a extrage nume/telefon/email/notes din screenshot-uri, iar `AddGuestModal` are secțiune `Import din poză` cu preview editabil și `POST /api/wedding-hub/guests/bulk-create` pentru import în bulk cu deduplicare. Validat cu `npm run typecheck` și `npm run build`. #RECENT #WH
#RECENT  2026-05-02: Reminder-ul post-eveniment pentru backup media a fost extins: emailul ajunge la ~24h după evenimentul `finalizat`, apoi se repetă la fiecare 48h până când confirmi backup-ul din linkul din email. Confirmarea setează `postEventBackupConfirmedAt` în `adminEvents`, iar subiectul include data de trimis + numărul reminder-ului ca să nu se grupeze în același thread. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN #NOTIFY #MEDIA
#RECENT  2026-05-02: Adăugat reminder post-eveniment pentru backup media: cron nou `src/server/cron/postEventBackupReminder.cron.ts` trimite un email la `adminUser.email` la ~24h după un eveniment `finalizat`, folosind flag-ul Firestore `postEventBackupReminderSentAt` ca anti-duplicat și link direct către albumul media dacă există `albumSlug`. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN #NOTIFY #MEDIA
#RECENT  2026-05-02: RSVP-ul Wedding Hub poate acum să captureze familie/plus-one separat: invitația publică permite nume pentru adulții și copiii care vin, plus bifa "Vrem să fim toți împreună la aceeași masă" ca preferință, fără auto-seating; listarea invitaților și planul de mese caută și afișează membrii familiei ca grup. Validat cu `npm run typecheck` și `npm run build`. #RECENT #WH
#RECENT  2026-05-02: Mesele Wedding Hub au primit `tableAlias` separat de `tableName`; aliasul e editabil din cardul mesei și poate fi folosit pentru etichete de tip `BFF Mire`, `Bunicii` sau `Familie Mireasa`, fără să pierzi denumirea oficială a mesei. #RECENT #WH
#RECENT  2026-05-02: Adăugată zona separată de mock pentru Wedding Hub: sidebar-ul are acum `Mock`, pagina `/wedding-hub/mock` simulează RSVP + mesaje bulk + preview dry-run + coadă în memorie, iar backend-ul expune `/api/mock/wedding-hub/*` fără să atingă Firestore. Zona e gate-uită explicit de `VITE_WEDDING_HUB_MOCKS=1` și `WEDDING_HUB_MOCKS=1`. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub guests page ajustată incremental pentru UX, fără redesign complet: filtrele și căutarea au rămas în stilul inițial, dar cu target-uri tactice mai bune, stats discrete, empty state mai clar și CTA sticky pe mobil; modalele Add/Edit păstrează look-ul anterior cu mici ajustări de spacing și responsive behavior. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub Mesaje a trecut pe broadcast async cu istoric și șabloane: API-ul are acum GET/PATCH /messages/templates, GET /messages/broadcasts și POST /messages/broadcasts, broadcast-urile se salvează în Firestore cu status queue/processing/sent/partial/failed, iar UI-ul are tab-uri pentru trimitere, șabloane editabile și istoric. Filtrele suportă confirmați, fără/cu masă și tipuri de contact, cu fallback explicit între email și SMS. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub are acum pagina `Mesaje` și endpoint-ul `POST /api/wedding-hub/messages/broadcasts` pentru trimitere bulk către invitații confirmați; mesajul merge pe email și, dacă există telefon valid + SMS configurat, și pe telefon, iar dacă un invitat are ambele contacte primește pe ambele canale. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub settings extinse pentru email RSVP: toggle master + toggle separat pentru acceptări și refuzuri; cuplul poate primi email doar la confirmări, doar la refuzuri sau la ambele. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub are acum dark/light mode pentru zona couple-facing; tema se schimbă din Setări și persistă local în browser, fără modificări în backend. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub automation pentru teste: endpoint nou POST /api/wedding-hub/guests/bulk-update pentru update-uri în masă pe invitați (inclusiv mutări între mese / scoatere din mese) și script nou npm run seed:wedding-seating care poate crea mese lipsă, reseta seating-ul și face asignare secvențială automată. #RECENT #WH
#RECENT  2026-05-02: Fix pentru flash la refresh pe Wedding Hub: în App.tsx, RequireWeddingAuth a fost mutat înainte de WeddingHubLayout ca să nu se mai monteze shell-ul înainte de auth restore; Loader fullscreen suportă acum subtitle și Wedding Hub afișează "Wedding Planner" sub AncaVisuals în stările de încărcare. #RECENT #WH
#RECENT  2026-05-02: Wedding Hub MVP implementat complet — modul dedicat pentru miri, complet separat de /admin. Fișiere noi: src/client/features/wedding-hub/ (16 fișiere: types, auth context, data context, hooks, layout, guards, 5 pagini, 3 componente), src/server/routes/weddingHub.routes.ts, src/client/features/admin/components/WeddingHub/WeddingHubAdminPage.tsx. Modificate: server.ts (înregistrare router), App.tsx (rute + HIDE_CHAT_PREFIXES), requireFirebaseAuth.ts (adăugat requireCoupleAuth + CoupleAuthenticatedRequest), Breadcrumb.tsx (label wedding-hub). Auth couple pe instanță Firebase separată (named app "wedding-hub") pentru izolare față de admin. Colecții Firestore: wh_weddings, wh_guests, wh_tables. Zero erori TypeScript. #RECENT #WH
#RECENT  2026-05-01: Media albums expun acum `retention` derivat din `adminEvents.eventDate + 60 zile` direct în `GET /api/album/:slug`; `MediaConsentModal` afișează countdown live până la expirare, iar cronul nou `src/server/cron/albumRetention.cron.ts` trimite reminder abonaților la 7 zile și 1 zi înainte plus email admin la expirare (album de șters / mutat offline). Starea reminderelor trimise se salvează în `printSelections.retentionNotifications`. Validat cu `npm test` și `npm run build`. #RECENT #MEDIA #NOTIFY #ADMIN
#RECENT  2026-05-01: Dashboard admin — `GoalCard` și `FinancialSummary` sunt acum colapsabile din săgeata din dreapta sus și pornesc compactate pentru a reduce înălțimea secțiunii de obiective și situație financiară. Validat cu `npm test` și `npm run build`. #RECENT #ADMIN
#RECENT  2026-05-01: QR Moments public page afișează acum jos un card promo AncaVisuals pentru viitori miri: mesaj despre QR Moments + servicii (foto, video, fotocabină, video booth 360) + referral cu ședință foto, plus carousel auto/swipe alimentat din `GET /api/admin/landing/gallery` (imagini landing publice existente). Validat cu `npm run typecheck` și `npm run build`. #RECENT #QR #ADMIN
#RECENT  2026-05-01: AddLeadModal poate acum încărca un screenshot/imagine și cere lui Claude să extragă conservator telefonul, numele, data și un tip de eveniment doar dacă este clar; nou endpoint protejat `POST /api/admin/leads/extract-from-image` cu `Authorization: Bearer`, iar UI-ul precompletează doar câmpurile găsite. Validat cu `npm run typecheck` și `npm run build`. #RECENT #ADMIN
#RECENT  2026-05-01: QR Moments upload page afișează acum waveform live în timpul înregistrării vocale, folosind Web Audio API (`AudioContext` + `AnalyserNode`) și `canvas`, cu cleanup explicit pentru stream/context la stop, reset și unmount. Validat cu `npm run typecheck`, `npx vitest run tests/vitest/client/pages/QRMoments/QRMomentsPage.test.tsx` și `npm run build`. #RECENT #QR #PITFALL
#RECENT  2026-04-29: Dev fix pentru QR/admin API calls — `vite.config.ts` proxiează acum `/api` și `/triggerEvent` către Express (`127.0.0.1:1994`), ca paginile deschise pe Vite (`:3000`) să nu mai primească `index.html` la fetch-uri. `QRMomentsAdminPage` detectează și răspunsurile HTML și afișează un mesaj clar de configurare în loc de dump-ul complet din pagina SSR. #RECENT #QR #DEBUG #PITFALL
#RECENT  2026-04-29: Admin QR Moments creează acum evenimente doar din `adminEvents` confirmate, viitoare, afișate în lista din modal ca primele 6 cele mai apropiate. Numele QR Moment-ului se generează automat din data nunții (`21martie2026` etc.), iar modalul are `notificationEmail` opțional: când un invitat încarcă fișiere, se trimite email de notificare către acea adresă. Validat cu `npm run typecheck` și `npm run build`. #RECENT #QR #ADMIN
#RECENT  2026-04-29: QR Moments are debugging explicit pentru eșecuri client-side la register/upload: pagina capturează buffer de `console.error`/`console.warn` și îl trimite în monitoring cu prefix `[QR DEBUG]`; backend-ul salvează eroarea și trimite email imediat către admin cu pagina, IP/geo și contextul JSON al sesiunii. Validat cu `npm run typecheck` și `npm run build`. #RECENT #QR #DEBUG #NOTIFY
#RECENT  2026-04-29: QR Moments hardening/integration — rutele publice `/qr-moments/:eventSlug`, `/qr-moments/:eventSlug/gallery` și `/qr-moments/unsubscribe/:guestId` sunt acum legate cap-coadă; `pass` este cerut server-side și la register/upload, comentariile sunt protejate cu PIN+eventSlug, iar testele client pentru upload/gallery/unsubscribe trec (`npm run typecheck` + `npx vitest run tests/vitest/client/pages/QRMoments/QRMomentsPage.test.tsx`). #RECENT #QR #PITFALL
#RECENT  2026-04-22: Mementos admin — modalul "Memento nou" nu se mai închide la click pe overlay, iar formularul păstrează draft-ul în `localStorage` (`admin:mementos:add-draft`) până la salvare reușită; redeschiderea modalului reîncarcă automat draftul. Validat cu `npm run typecheck`. #RECENT #ADMIN
#RECENT  2026-04-22: FinancialSummary din dashboard a fost aliniat semantic cu cashflow-ul real: progresul este galben, sumarul folosește "Bani primiți" în loc de "Avans încasat", iar detaliul pe evenimente separă sumele deja primite de cele rămase de încasat, pe modelul paginii Goal detail. Validat cu `npm run typecheck`. #RECENT #ADMIN
#RECENT  2026-04-22: Dashboard admin / EventList afișează acum în tab-ul "Viitoare" 3 blocuri pe ani: anul curent rămâne mereu deschis, iar următorii 2 ani (în prezent 2027 și 2028) apar ca secțiuni colapsabile pentru evidența clienților rezervați în avans. Validat cu `npm run typecheck` și Vitest pe helper-ele `partitionEvents` / `groupByMonth`. #RECENT #ADMIN
#RECENT  2026-04-22: Admin are pagină dedicată `/admin/bank-details` pentru detalii bancare. Salvează `beneficiaryName` și `iban` în `settings/admin.bankDetails`, iar contractele folosesc aceste valori la randare: preview PDF, PDF final și pagina publică de semnare afișează beneficiarul + IBAN-ul doar pentru `Transfer bancar`. Validat cu `npm run typecheck`. #RECENT #ADMIN
#RECENT  2026-04-22: Admin events au primit flag-ul `fiscalized` în Firestore/UI. Default-ul este `false` (nefiscalizat), EventCard afișează marker + toggle rapid, AddLeadModal permite setarea la creare, iar EventList are filtru `Toate | Fiscalizate | Nefiscalizate`. Validat cu `npm run typecheck` după actualizarea mock-urilor Vitest pentru `ClientEvent`. #RECENT #ADMIN
#RECENT  2026-04-16: Contract feature extins — editare contract înainte de semnare (EditContractPage la /admin/contracts/:id/edit, amber accent); PATCH /api/contracts/:id blocat dacă status=signed; linking bidirecțional contract↔eveniment via contractId/eventId; CreateContractPage pre-populat din EventCard via location.state; contract fizic (attachmentUrls) = echivalent cu contract digital (C✓, ascunde "Creează contract"). #RECENT #ADMIN
#RECENT  2026-04-16: Fix Firestore Timestamps în PDF generator — Timestamp objects ({_seconds, _nanoseconds}) erau coerced la "[object Object]" în template literals. Adăugat helper toIsoString() în pdf.generator.ts care detectează shape-ul Timestamp și convertește via _seconds*1000. Fix aplicat pe signedDate, contractDate, footer timestamp. #RECENT #ADMIN #PITFALL
#RECENT  2026-04-16: AddLeadModal — câmpuri noi total/avans/rest cu calcul automat și checkbox "avans deja încasat"; fix bug unde avansul apărea ca 0 EUR (backend ignorase pricing din body, onAdded hardcodase zerouri). POST /api/admin/events citește acum pricing direct din body. #RECENT #ADMIN
#RECENT  2026-04-16: FinancialSummary — componentă nouă în Dashboard: filtrează evenimentele confirmat+finalizat din anul curent, arată progres avans încasat vs total contractat, detaliu colapsibil pe evenimente viitoare cu cât urmează să fie primit. #RECENT #ADMIN
#RECENT  2026-04-16: MultiFileDropZone — componentă nouă pentru upload multiple fișiere (contract fizic/poze); progress per fișier, thumbnails pentru imagini, delete individual din Firebase Storage. Folosită în EventCard edit modal. #RECENT #ADMIN
#RECENT  2026-04-16: GoalCard rewrite — editabil EUR target și date range; doar goal-ul de 6 luni are editableRange (date picker); titlu redenumit "Goal Personalizat"; settings salvate în Firestore settings/admin cu exchangeRate. EventList default tab schimbat la "Viitoare". #RECENT #ADMIN
#RECENT  2026-04-16: Zile ocupate unificate — singura sursă de adevăr e acum `adminEvents` (confirmat+finalizat). `GET /api/booked-dates` (public, nou) + `GET /api/admin/booked-dates` citesc ambele din Firestore. BookingWizard și chatbot nu mai citesc din `bookedDates.json` Storage. Fișierul JSON e acum defunct. #RECENT #ADMIN #PITFALL
#RECENT  2026-04-15: Lead management adăugat în admin dashboard. `ClientEvent.eventDate` e acum `Date | null` (lead-urile pot fi create fără dată). Nou component `AddLeadModal.tsx`. `EventList.tsx` are 4 taburi: Lead-uri / Viitoare / Trecute / Arhivă. `EventCard.tsx` arată butoane rapide [Tentativ] [Confirmă] [Renunță] pentru status lead/tentativ. Backend `POST /api/admin/events` nu mai cere `eventDate`. `GoalCard.tsx` are guard pentru eventDate null. #RECENT #ADMIN
#RECENT  2026-04-15: Contract feature complet: creare contract (admin), semnare client via link public (`/contract/:token`), generare PDF Puppeteer, upload Firebase Storage, email cu link PDF. Rute noi: DELETE /:id, GET /:id/preview, POST /:id/cancel, POST /:id/prestator-sign, POST /:id/send. Email trimis la ștergere contract (`sendContractDeletedEmail`). #RECENT #ADMIN #NOTIFY
#RECENT  2026-04-11: `public/sitemap.xml` a fost actualizat pentru rutele publice reale: a fost scos `/orase` din indexare, au fost adăugate `/bio`, `/blog` și toate slug-urile de blog, păstrând doar rutele SEO canonice de tip `/foto-video-{serviciu}-{oras}`. Paginile legale (`/privacy`, `/terms`, `/copyright`) au fost scoase ulterior din sitemap. Validat ca XML parseabil; total 178 URL-uri. #RECENT #LOCATION #BLOG #PITFALL
#RECENT  2026-04-11: Testele au fost reorganizate sub `tests/` și artefactele generate sub `reports/`. Vitest rulează acum din `tests/vitest`, Playwright din `tests/e2e`, coverage merge în `reports/coverage`, iar Playwright HTML/report attachments merg în `reports/playwright` și `reports/test-results`. `npm test` și `npm run typecheck` au trecut după mutare. #RECENT #CMD #DEBUG #PITFALL
#RECENT  2026-04-11: Setup Playwright E2E minimal adăugat: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, scripturi `npm run test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:report`. `server.ts` dezactivează HMR când `PLAYWRIGHT=1` pentru a evita portul websocket suplimentar în rulările E2E. Smoke suite-ul rulează și detectează în prezent că `/contact` și `/portofoliu` nu se hidratează la conținutul așteptat în 15s, în timp ce homepage trece. #RECENT #CMD #DEBUG #SSR #PITFALL
#RECENT  2026-04-11: Fix defensiv pentru asset-uri lipsă după deploy/cache stale. `server.ts` nu mai trimite HTML pentru requesturi de asset ratate (returnează 404 text/plain) și setează `Cache-Control: no-store, max-age=0` pe răspunsurile SSR HTML, ca să nu rămână în cache un `index.html` care referă hash-uri vechi. Validat cu `npm run typecheck` și `npm run build`. #RECENT #PITFALL #SSR
#RECENT  2026-04-11: Stilizarea articolelor de blog nu mai depinde de `prose` din Tailwind. `tailwind.config.cjs` nu are pluginul Typography activ, deci `prose` nu producea layout editorial real. Soluție: `src/client/pages/Blog/BlogPost.tsx` folosește acum clasa globală `blog-article`, definită în `src/client/index.css`, cu spacing, heading-uri, liste, blockquote, code și linkuri stilizate explicit. Validat cu `npm run typecheck` și `npm run build`. #RECENT #BLOG #PITFALL #THEME
#RECENT  2026-04-11: Fix blog API 404 în build/prod. Cauza: blogUtils alegea `dist/data` doar pentru că exista, dar markdown-urile copiate erau în `dist/*.md`. Soluție: `src/server/utils/blogUtils.ts` rezolvă acum directorul de blog doar dintre candidații care conțin efectiv fișiere `.md`. Validat după build: `getPostBySlug('acte-botez-turda')` găsește postul și `getAllPosts()` returnează 60. #RECENT #BLOG #PITFALL

#RECENT  2026-04-11  Adăugat AGENTS.md ca entrypoint scurt pentru agenți; AI_MEMORY.md rămâne sursa principală de context
#RECENT  2026-04-11  Regula nouă pentru push/PR: validare explicită cu typecheck + test + build, și lint când este relevant
#RECENT  2026-04-11  Restructurat AI_MEMORY.md cu tag-uri rg-friendly (#TAG pe fiecare linie)
#RECENT  2026-04-11  Blog SEO: 60 articole Markdown + API /api/blog + pagini /blog și /blog/:slug
#RECENT  2026-04-11  data/blogManifest.ts: index static pentru SSR meta tags
#RECENT  2026-04-11  src/client/utils/theme.ts: constanta ACCENT (amber-200)
#RECENT  2026-04-11  Contact /contact: hero scurtat, BookingWizard mutat direct după hero
#RECENT  2026-04-11  Bugfix importuri: ipinfo.ts, QRMoment.routes, Onboardingwizard
#RECENT  2026-04-11  GitHub Actions actualizat la checkout@v4 + setup-node@v4
#RECENT  2026-04-11  Upgrade Node standard la 22 în `.nvmrc` și `.github/workflows/nodejs.yml` pentru compatibilitate cu Firebase packages
#RECENT  2026-04-11  Workflow CI împărțit în joburi separate: lint, typecheck, test, build
