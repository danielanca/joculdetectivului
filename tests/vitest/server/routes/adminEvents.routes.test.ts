/*
 * Purpose: Verifies adminEvents routes — CRUD for events, settings, backup flows,
 * media activity, album management — without hitting Firestore, Bunny, or Anthropic.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type Handler = (req: any, res: any, next?: any) => Promise<void> | void;

function createMockResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    flushHeaders: vi.fn(),
    writableEnded: false,
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

function makeTimestamp(date = new Date("2026-06-01")) {
  return {
    toDate: () => date,
    _seconds: date.getTime() / 1000,
  };
}

function makeEventDoc(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    id: "event-123",
    ref: { update: vi.fn().mockResolvedValue(undefined) },
    data: () => ({
      type: "Nuntă",
      status: "confirmat",
      createdAt: makeTimestamp(),
      eventDate: makeTimestamp(new Date("2026-09-20")),
      eventEndDate: null,
      client: { fullName: "Ion Popescu", phone: "0700123456", email: "ion@test.ro" },
      postEventBackupConfirmationToken: "valid-token",
      albumSlug: "nunta-ion-maria",
      ...overrides,
    }),
  };
}

async function loadRouter() {
  const addMock = vi.fn().mockResolvedValue({ id: "new-event-id" });
  const updateMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockResolvedValue(undefined);
  const docGetMock = vi.fn().mockResolvedValue(makeEventDoc());
  const orderByGetMock = vi.fn().mockResolvedValue({ docs: [] });
  const limitGetMock = vi.fn().mockResolvedValue({ docs: [] });
  const getAllJobsMock = vi.fn().mockReturnValue([]);
  const getJobMock = vi.fn().mockReturnValue(null);
  const createJobMock = vi.fn();
  const anthropicCreateMock = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: '{"phone":"+40700123456","fullName":"Maria Ionescu","eventDate":"2026-09-20","eventTypeGuess":"Nuntă"}' }],
  });

  const docMock = vi.fn((id: string) => ({
    get: () => docGetMock(id),
    update: (payload: any) => updateMock(id, payload),
    delete: () => deleteMock(id),
    set: (data: any, opts: any) => setMock(id, data, opts),
  }));

  const collectionMock = vi.fn((_name: string) => ({
    add: addMock,
    doc: docMock,
    orderBy: vi.fn(() => ({
      get: orderByGetMock,
      limit: vi.fn(() => ({ get: limitGetMock })),
      asc: vi.fn().mockReturnThis(),
      desc: vi.fn().mockReturnThis(),
    })),
  }));

  vi.doMock("src/server/middleware/requireFirebaseAuth", () => ({
    requireFirebaseAuth: (_req: any, _res: any, next: () => void) => next(),
    requireSupremeAdmin: (_req: any, _res: any, next: () => void) => next(),
  }));

  vi.doMock("src/server/firestore", () => ({
    firestore: () => ({ collection: collectionMock }),
  }));

  vi.doMock("firebase-admin/firestore", () => {
    class MockTimestamp {
      _date: Date;
      constructor(seconds = 0) { this._date = new Date(seconds * 1000); }
      toDate() { return this._date; }
      toISOString() { return this._date.toISOString(); }
      static now = vi.fn(() => new MockTimestamp(Date.now() / 1000));
      static fromDate = vi.fn((d: Date) => new MockTimestamp(d.getTime() / 1000));
    }
    return { Timestamp: MockTimestamp };
  });

  vi.doMock("src/server/constants/bunny", () => ({
    BUNNY_ACCESS_KEY_HEADER: "AccessKey",
    BUNNY_PHOTOS_FOLDER: "photos",
    BUNNY_QR_MOMENT_FOLDER: "qr-moment",
    getBunnyStorageKey: vi.fn(() => "test-key"),
    buildBunnyStorageUrl: vi.fn((...parts: string[]) => `https://storage.bunnycdn.com/${parts.join("/")}`),
    buildBunnyDirectoryUrl: vi.fn((...parts: string[]) => `https://storage.bunnycdn.com/${parts.filter(Boolean).join("/")}/`),
  }));

  vi.doMock("src/server/services/album.service", () => ({
    invalidateAlbumCache: vi.fn(),
  }));

  vi.doMock("src/server/services/albumProcessingJobs", () => ({
    createJob: createJobMock,
    getJob: getJobMock,
    getAllJobs: getAllJobsMock,
    serializeJob: vi.fn((job: any) => ({ slug: job.slug, status: job.status })),
    appendJobLog: vi.fn(),
    setJobProgress: vi.fn(),
    finishJob: vi.fn(),
    errorJob: vi.fn(),
  }));

  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = { create: anthropicCreateMock };
    },
  }));

  vi.doMock("multer", () => {
    const m = vi.fn(() => ({
      single: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
      array: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
    })) as any;
    m.memoryStorage = vi.fn(() => ({}));
    return { default: m };
  });

  vi.doMock("sharp", () => ({
    default: vi.fn(() => ({
      resize: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("webp")),
    })),
  }));

  const nodeFetchMock = vi.fn();
  vi.doMock("node-fetch", () => ({ default: nodeFetchMock }));

  const module = await import("src/server/routes/adminEvents.routes");
  const router = module.default as any;

  const getHandler = (method: string, path: string): Handler => {
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === path && entry.route.methods?.[method],
    );
    if (!layer) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  };

  return {
    collectionMock,
    docGetMock,
    updateMock,
    deleteMock,
    addMock,
    setMock,
    orderByGetMock,
    limitGetMock,
    getAllJobsMock,
    getJobMock,
    createJobMock,
    anthropicCreateMock,
    getEvents: getHandler("get", "/events"),
    postEvents: getHandler("post", "/events"),
    patchEvent: getHandler("patch", "/events/:id"),
    deleteEvent: getHandler("delete", "/events/:id"),
    getSettings: getHandler("get", "/settings"),
    putSettings: getHandler("put", "/settings"),
    getUiState: getHandler("get", "/ui-state"),
    putUiState: getHandler("put", "/ui-state"),
    getMediaActivity: getHandler("get", "/media-activity"),
    deleteMediaActivity: getHandler("delete", "/media-activity/:id"),
    postConfirmAdmin: getHandler("post", "/events/:id/post-event-backup/confirm-admin"),
    getBackupStatus: getHandler("get", "/events/:id/post-event-backup/status"),
    getBackupConfirm: getHandler("get", "/events/:id/post-event-backup/confirm"),
    postBackupSubmit: getHandler("post", "/events/:id/post-event-backup/submit"),
    postExtractFromImage: getHandler("post", "/leads/extract-from-image"),
    postCreateAlbum: getHandler("post", "/events/:id/create-album"),
    postPhotoboothFolder: getHandler("post", "/events/:id/photobooth-folder"),
    postPhotoboothUpload: getHandler("post", "/events/:id/photobooth-upload"),
    getPhotoboothFiles: getHandler("get", "/events/:id/photobooth-files"),
    postPhotoboothDelete: getHandler("post", "/events/:id/photobooth-delete"),
    postDetectAlbum: getHandler("post", "/events/:id/detect-album"),
    patchAlbum: getHandler("patch", "/events/:id/album"),
    getAlbumHealthJobs: getHandler("get", "/album-health/jobs"),
    getAlbumHealthCategories: getHandler("get", "/album-health/categories"),
    putAlbumHealthCategories: getHandler("put", "/album-health/categories"),
    postAlbumHealthProcess: getHandler("post", "/album-health/:slug/process"),
    nodeFetchMock,
  };
}

describe("adminEvents routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ───────────────── GET /events ─────────────────
  describe("GET /events", () => {
    test("returns empty list when no events exist", async () => {
      const { getEvents, orderByGetMock } = await loadRouter();
      orderByGetMock.mockResolvedValueOnce({ docs: [] });
      const res = createMockResponse();
      await getEvents({}, res);
      expect(res.json).toHaveBeenCalledWith({ events: [] });
    });

    test("returns serialized events", async () => {
      const { getEvents, orderByGetMock } = await loadRouter();
      const docSnap = {
        id: "ev-1",
        data: () => ({
          type: "Nuntă",
          createdAt: makeTimestamp(),
          eventDate: makeTimestamp(),
          eventEndDate: null,
          postEventBackupConfirmedAt: null,
          postEventBackupReminderSentAt: null,
          postEventBackupReminderDueAt: null,
        }),
      };
      orderByGetMock.mockResolvedValueOnce({ docs: [docSnap] });
      const res = createMockResponse();
      await getEvents({}, res);
      const call = (res.json as any).mock.calls[0][0];
      expect(call.events).toHaveLength(1);
      expect(call.events[0].id).toBe("ev-1");
    });

    test("returns 500 on Firestore error", async () => {
      const { getEvents, orderByGetMock } = await loadRouter();
      orderByGetMock.mockRejectedValueOnce(new Error("db down"));
      const res = createMockResponse();
      await getEvents({}, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── POST /events ─────────────────
  describe("POST /events", () => {
    test("returns 400 when required fields are missing", async () => {
      const { postEvents } = await loadRouter();
      const res = createMockResponse();
      await postEvents({ body: { status: "lead" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("creates event and returns 201 with id", async () => {
      const { postEvents, addMock } = await loadRouter();
      const res = createMockResponse();
      await postEvents({
        body: {
          type: "Nuntă",
          client: { fullName: "Ion Popescu" },
          services: [{ name: "foto", price: 1200 }],
          pricing: { advancePaid: true, advanceAmount: 500 },
        },
      }, res);
      expect(addMock).toHaveBeenCalledOnce();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: "new-event-id" });
    });

    test("calculates remainingAmount correctly", async () => {
      const { postEvents, addMock } = await loadRouter();
      const res = createMockResponse();
      await postEvents({
        body: {
          type: "Botez",
          client: { fullName: "Maria" },
          services: [],
          pricing: { total: 2000, advanceAmount: 800, advancePaid: true },
        },
      }, res);
      const saved = addMock.mock.calls[0][0];
      expect(saved.pricing.remainingAmount).toBe(1200);
    });

    test("returns 500 on Firestore error", async () => {
      const { postEvents, addMock } = await loadRouter();
      addMock.mockRejectedValueOnce(new Error("write failed"));
      const res = createMockResponse();
      await postEvents({
        body: { type: "Nuntă", client: { fullName: "Test" } },
      }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── PATCH /events/:id ─────────────────
  describe("PATCH /events/:id", () => {
    test("updates event and returns ok", async () => {
      const { patchEvent, updateMock } = await loadRouter();
      const res = createMockResponse();
      await patchEvent({ params: { id: "ev-1" }, body: { status: "confirmat" } }, res);
      expect(updateMock).toHaveBeenCalledWith("ev-1", expect.objectContaining({ status: "confirmat" }));
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("converts eventDate string to Timestamp", async () => {
      const { patchEvent, updateMock } = await loadRouter();
      const res = createMockResponse();
      await patchEvent({
        params: { id: "ev-1" },
        body: { eventDate: "2026-09-20", status: "confirmat" },
      }, res);
      const updated = updateMock.mock.calls[0][1];
      expect(updated.eventDate).toBeDefined();
      expect(typeof updated.eventDate).not.toBe("string");
    });

    test("sets eventDate to null when explicitly null", async () => {
      const { patchEvent, updateMock } = await loadRouter();
      const res = createMockResponse();
      await patchEvent({
        params: { id: "ev-1" },
        body: { eventDate: null },
      }, res);
      expect(updateMock.mock.calls[0][1].eventDate).toBeNull();
    });

    test("returns 500 on Firestore error", async () => {
      const { patchEvent, updateMock } = await loadRouter();
      updateMock.mockRejectedValueOnce(new Error("write failed"));
      const res = createMockResponse();
      await patchEvent({ params: { id: "ev-1" }, body: { status: "anulat" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── DELETE /events/:id ─────────────────
  describe("DELETE /events/:id", () => {
    test("deletes event and returns ok", async () => {
      const { deleteEvent, deleteMock } = await loadRouter();
      const res = createMockResponse();
      await deleteEvent({ params: { id: "ev-1" } }, res);
      expect(deleteMock).toHaveBeenCalledWith("ev-1");
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("returns 500 on Firestore error", async () => {
      const { deleteEvent, deleteMock } = await loadRouter();
      deleteMock.mockRejectedValueOnce(new Error("delete failed"));
      const res = createMockResponse();
      await deleteEvent({ params: { id: "ev-1" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── GET /settings ─────────────────
  describe("GET /settings", () => {
    test("returns settings document when it exists", async () => {
      const { getSettings, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({
        exists: true,
        data: () => ({ currency: "EUR", exchangeRate: 5.0 }),
      });
      const res = createMockResponse();
      await getSettings({}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ currency: "EUR" }));
    });

    test("returns defaults when document does not exist", async () => {
      const { getSettings, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await getSettings({}, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.currency).toBe("EUR");
      expect(data.goals).toBeDefined();
    });

    test("returns 500 on Firestore error", async () => {
      const { getSettings, docGetMock } = await loadRouter();
      docGetMock.mockRejectedValueOnce(new Error("db down"));
      const res = createMockResponse();
      await getSettings({}, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── PUT /settings ─────────────────
  describe("PUT /settings", () => {
    test("saves settings and returns ok", async () => {
      const { putSettings, docGetMock } = await loadRouter();
      // Set mock via the collection/doc chain — set is called on the doc ref
      const setMock = vi.fn().mockResolvedValue(undefined);
      docGetMock.mockImplementationOnce(() => ({ set: setMock }));
      const res = createMockResponse();
      await putSettings({ body: { currency: "EUR" } }, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("returns 500 on Firestore error", async () => {
      const { putSettings, collectionMock } = await loadRouter();
      collectionMock.mockImplementationOnce(() => ({
        doc: vi.fn(() => ({
          set: vi.fn().mockRejectedValue(new Error("write error")),
        })),
      }));
      const res = createMockResponse();
      await putSettings({ body: { currency: "RON" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── GET /ui-state ─────────────────
  describe("GET /ui-state", () => {
    test("returns state when document exists", async () => {
      const { getUiState, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({
        exists: true,
        data: () => ({ sidebarOpen: true }),
      });
      const res = createMockResponse();
      await getUiState({}, res);
      expect(res.json).toHaveBeenCalledWith({ sidebarOpen: true });
    });

    test("returns empty object when document does not exist", async () => {
      const { getUiState, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await getUiState({}, res);
      expect(res.json).toHaveBeenCalledWith({});
    });
  });

  // ───────────────── PUT /ui-state ─────────────────
  describe("PUT /ui-state", () => {
    test("saves state and returns ok", async () => {
      const { putUiState } = await loadRouter();
      const res = createMockResponse();
      await putUiState({ body: { sidebarOpen: false } }, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  // ───────────────── GET /media-activity ─────────────────
  describe("GET /media-activity", () => {
    test("returns visits list", async () => {
      const { getMediaActivity, limitGetMock } = await loadRouter();
      const ts = makeTimestamp();
      limitGetMock.mockResolvedValueOnce({
        docs: [{
          id: "visit-1",
          data: () => ({ slug: "nunta-test", timestamp: ts, ip: "1.2.3.4", userAgent: "Chrome" }),
        }],
      });
      const res = createMockResponse();
      await getMediaActivity({ query: {} }, res);
      const result = (res.json as any).mock.calls[0][0];
      expect(result.visits).toHaveLength(1);
      expect(result.visits[0].slug).toBe("nunta-test");
    });

    test("respects limit query parameter", async () => {
      const { getMediaActivity, collectionMock } = await loadRouter();
      const limitMock = vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) }));
      const orderByMock = vi.fn(() => ({ limit: limitMock }));
      collectionMock.mockReturnValueOnce({ orderBy: orderByMock });
      const res = createMockResponse();
      await getMediaActivity({ query: { limit: "50" } }, res);
      expect(limitMock).toHaveBeenCalledWith(50);
    });

    test("returns 500 on Firestore error", async () => {
      const { getMediaActivity, limitGetMock } = await loadRouter();
      limitGetMock.mockRejectedValueOnce(new Error("db error"));
      const res = createMockResponse();
      await getMediaActivity({ query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── DELETE /media-activity/:id ─────────────────
  describe("DELETE /media-activity/:id", () => {
    test("deletes visit and returns ok", async () => {
      const { deleteMediaActivity, deleteMock } = await loadRouter();
      const res = createMockResponse();
      await deleteMediaActivity({ params: { id: "visit-abc" } }, res);
      expect(deleteMock).toHaveBeenCalledWith("visit-abc");
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("returns 500 on Firestore error", async () => {
      const { deleteMediaActivity, deleteMock } = await loadRouter();
      deleteMock.mockRejectedValueOnce(new Error("delete failed"));
      const res = createMockResponse();
      await deleteMediaActivity({ params: { id: "visit-abc" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── POST /events/:id/post-event-backup/confirm-admin ─────────────────
  describe("POST /events/:id/post-event-backup/confirm-admin", () => {
    test("confirms backup and returns ok with confirmedAt", async () => {
      const { postConfirmAdmin, docGetMock } = await loadRouter();
      const updateFn = vi.fn().mockResolvedValue(undefined);
      docGetMock.mockResolvedValueOnce({
        exists: true,
        ref: { update: updateFn },
        data: () => ({}),
      });
      const res = createMockResponse();
      await postConfirmAdmin({ params: { id: "ev-1" } }, res);
      expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ postEventBackupConfirmedAt: expect.anything() }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    test("returns 404 when event not found", async () => {
      const { postConfirmAdmin, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await postConfirmAdmin({ params: { id: "nonexistent" } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("returns 500 on Firestore error", async () => {
      const { postConfirmAdmin, docGetMock } = await loadRouter();
      docGetMock.mockRejectedValueOnce(new Error("db error"));
      const res = createMockResponse();
      await postConfirmAdmin({ params: { id: "ev-1" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── GET /events/:id/post-event-backup/status ─────────────────
  describe("GET /events/:id/post-event-backup/status", () => {
    test("returns backup status for valid token", async () => {
      const { getBackupStatus, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc());
      const res = createMockResponse();
      await getBackupStatus({ params: { id: "ev-1" }, query: { token: "valid-token" } }, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.event).toBeDefined();
      expect(data.event.id).toBe("event-123");
    });

    test("returns 403 for invalid token", async () => {
      const { getBackupStatus, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc());
      const res = createMockResponse();
      await getBackupStatus({ params: { id: "ev-1" }, query: { token: "wrong-token" } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("returns 404 when event not found", async () => {
      const { getBackupStatus, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await getBackupStatus({ params: { id: "nonexistent" }, query: { token: "any" } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ───────────────── GET /events/:id/post-event-backup/confirm (redirect) ─────────────────
  describe("GET /events/:id/post-event-backup/confirm", () => {
    test("redirects to backup page with valid token", async () => {
      const { getBackupConfirm, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc());
      const res = createMockResponse();
      await getBackupConfirm({ params: { id: "ev-1" }, query: { token: "valid-token" } }, res);
      expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining("/backup/ev-1"));
    });

    test("returns 403 for invalid token", async () => {
      const { getBackupConfirm, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc());
      const res = createMockResponse();
      await getBackupConfirm({ params: { id: "ev-1" }, query: { token: "bad" } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ───────────────── POST /events/:id/post-event-backup/submit ─────────────────
  describe("POST /events/:id/post-event-backup/submit", () => {
    test("confirms backup without proof file", async () => {
      const { postBackupSubmit, docGetMock } = await loadRouter();
      const doc = makeEventDoc();
      docGetMock.mockResolvedValueOnce(doc);
      const res = createMockResponse();
      await postBackupSubmit({ params: { id: "ev-1" }, body: { token: "valid-token" }, file: undefined }, res);
      expect(doc.ref.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    test("returns 403 for invalid token", async () => {
      const { postBackupSubmit, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc());
      const res = createMockResponse();
      await postBackupSubmit({ params: { id: "ev-1" }, body: { token: "invalid" }, file: undefined }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ───────────────── POST /leads/extract-from-image ─────────────────
  describe("POST /leads/extract-from-image", () => {
    test("returns 400 when imageBase64 or mediaType missing", async () => {
      const { postExtractFromImage } = await loadRouter();
      const res = createMockResponse();
      await postExtractFromImage({ body: { imageBase64: "abc" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("returns 400 for non-image mediaType", async () => {
      const { postExtractFromImage } = await loadRouter();
      const res = createMockResponse();
      await postExtractFromImage({ body: { imageBase64: "abc", mediaType: "application/pdf" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("returns extracted data from Anthropic response", async () => {
      const { postExtractFromImage } = await loadRouter();
      const res = createMockResponse();
      await postExtractFromImage({
        body: { imageBase64: "base64data", mediaType: "image/jpeg" },
      }, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.extracted).toBeDefined();
      expect(data.extracted.fullName).toBe("Maria Ionescu");
      expect(data.extracted.phone).toBe("+40700123456");
      expect(data.extracted.eventDate).toBe("2026-09-20");
      expect(data.extracted.eventTypeGuess).toBe("Nuntă");
    });

    test("sanitizes invalid phone from response", async () => {
      const { postExtractFromImage, anthropicCreateMock } = await loadRouter();
      anthropicCreateMock.mockResolvedValueOnce({
        content: [{ type: "text", text: '{"phone":"abc","fullName":"Ion","eventDate":null,"eventTypeGuess":null}' }],
      });
      const res = createMockResponse();
      await postExtractFromImage({
        body: { imageBase64: "data", mediaType: "image/png" },
      }, res);
      expect((res.json as any).mock.calls[0][0].extracted.phone).toBeNull();
    });

    test("sanitizes invalid eventTypeGuess", async () => {
      const { postExtractFromImage, anthropicCreateMock } = await loadRouter();
      anthropicCreateMock.mockResolvedValueOnce({
        content: [{ type: "text", text: '{"phone":null,"fullName":null,"eventDate":null,"eventTypeGuess":"Concurs"}' }],
      });
      const res = createMockResponse();
      await postExtractFromImage({
        body: { imageBase64: "data", mediaType: "image/jpeg" },
      }, res);
      expect((res.json as any).mock.calls[0][0].extracted.eventTypeGuess).toBeNull();
    });

    test("returns 500 when Anthropic throws", async () => {
      const { postExtractFromImage, anthropicCreateMock } = await loadRouter();
      anthropicCreateMock.mockRejectedValueOnce(new Error("API error"));
      const res = createMockResponse();
      await postExtractFromImage({
        body: { imageBase64: "data", mediaType: "image/jpeg" },
      }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── PATCH /events/:id/album ─────────────────
  describe("PATCH /events/:id/album", () => {
    test("updates albumSlug and albumPin and returns ok", async () => {
      const { patchAlbum, updateMock } = await loadRouter();
      const res = createMockResponse();
      await patchAlbum({
        params: { id: "ev-1" },
        body: { albumSlug: "nunta-test-2026", albumPin: "1234" },
      }, res);
      expect(updateMock).toHaveBeenCalledWith("ev-1", { albumSlug: "nunta-test-2026", albumPin: "1234" });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("only updates provided fields", async () => {
      const { patchAlbum, updateMock } = await loadRouter();
      const res = createMockResponse();
      await patchAlbum({
        params: { id: "ev-1" },
        body: { albumSlug: "nunta-test" },
      }, res);
      const updated = updateMock.mock.calls[0][1];
      expect(updated).toHaveProperty("albumSlug");
      expect(updated).not.toHaveProperty("albumPin");
    });

    test("returns 500 on Firestore error", async () => {
      const { patchAlbum, updateMock } = await loadRouter();
      updateMock.mockRejectedValueOnce(new Error("write failed"));
      const res = createMockResponse();
      await patchAlbum({
        params: { id: "ev-1" },
        body: { albumSlug: "nunta-test" },
      }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── GET /album-health/jobs ─────────────────
  describe("GET /album-health/jobs", () => {
    test("returns all jobs", async () => {
      const { getAlbumHealthJobs, getAllJobsMock } = await loadRouter();
      getAllJobsMock.mockReturnValueOnce([{ slug: "nunta-test", status: "done" }]);
      const res = createMockResponse();
      await getAlbumHealthJobs({}, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.jobs).toHaveLength(1);
      expect(data.jobs[0].slug).toBe("nunta-test");
    });
  });

  // ───────────────── GET /album-health/categories ─────────────────
  describe("GET /album-health/categories", () => {
    test("returns categories when document exists", async () => {
      const { getAlbumHealthCategories, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({
        exists: true,
        data: () => ({ "nunta-test": "wedding", "botez-ion": "baptism" }),
      });
      const res = createMockResponse();
      await getAlbumHealthCategories({}, res);
      expect(res.json).toHaveBeenCalledWith({ "nunta-test": "wedding", "botez-ion": "baptism" });
    });

    test("returns empty object when document does not exist", async () => {
      const { getAlbumHealthCategories, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await getAlbumHealthCategories({}, res);
      expect(res.json).toHaveBeenCalledWith({});
    });

    test("returns 500 on Firestore error", async () => {
      const { getAlbumHealthCategories, docGetMock } = await loadRouter();
      docGetMock.mockRejectedValueOnce(new Error("db error"));
      const res = createMockResponse();
      await getAlbumHealthCategories({}, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── PUT /album-health/categories ─────────────────
  describe("PUT /album-health/categories", () => {
    test("saves categories and returns ok", async () => {
      const { putAlbumHealthCategories } = await loadRouter();
      const res = createMockResponse();
      await putAlbumHealthCategories({ body: { "nunta-test": "wedding" } }, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("returns 500 on Firestore error", async () => {
      const { putAlbumHealthCategories, collectionMock } = await loadRouter();
      collectionMock.mockImplementationOnce(() => ({
        doc: vi.fn(() => ({
          set: vi.fn().mockRejectedValue(new Error("write error")),
        })),
      }));
      const res = createMockResponse();
      await putAlbumHealthCategories({ body: { "nunta-test": "wedding" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── POST /events/:id/create-album ─────────────────
  describe("POST /events/:id/create-album", () => {
    test("returns 400 for invalid slug", async () => {
      const { postCreateAlbum } = await loadRouter();
      const res = createMockResponse();
      await postCreateAlbum({ params: { id: "ev-1" }, body: { slug: "INVALID SLUG!" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("returns 409 when album already exists in Bunny", async () => {
      const { postCreateAlbum, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({ ok: true });
      const res = createMockResponse();
      await postCreateAlbum({ params: { id: "ev-1" }, body: { slug: "nunta-test-2026" } }, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    test("creates album folders and saves slug on event", async () => {
      const { postCreateAlbum, updateMock, nodeFetchMock } = await loadRouter();
      nodeFetchMock
        .mockResolvedValueOnce({ ok: false }) // check — doesn't exist
        .mockResolvedValue({ ok: true });     // all PUT folder placeholders
      const res = createMockResponse();
      await postCreateAlbum({ params: { id: "ev-1" }, body: { slug: "nunta-test-2026" } }, res);
      expect(updateMock).toHaveBeenCalledWith("ev-1", expect.objectContaining({ albumSlug: "nunta-test-2026" }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, slug: "nunta-test-2026" }));
    });

    test("returns 500 when a Bunny folder upload fails", async () => {
      const { postCreateAlbum, nodeFetchMock } = await loadRouter();
      nodeFetchMock
        .mockResolvedValueOnce({ ok: false })  // check — doesn't exist
        .mockResolvedValueOnce({ ok: false }); // first PUT fails
      const res = createMockResponse();
      await postCreateAlbum({ params: { id: "ev-1" }, body: { slug: "nunta-test-2026" } }, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ───────────────── POST /events/:id/photobooth-folder ─────────────────
  describe("POST /events/:id/photobooth-folder", () => {
    test("returns 400 when event has no albumSlug", async () => {
      const { postPhotoboothFolder, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc({ albumSlug: undefined }));
      const res = createMockResponse();
      await postPhotoboothFolder({ params: { id: "ev-1" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("creates folder and returns galleryUrl", async () => {
      const { postPhotoboothFolder, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({ ok: true });
      const res = createMockResponse();
      await postPhotoboothFolder({ params: { id: "ev-1" } }, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, galleryUrl: "/fotocabina/nunta-ion-maria/galerie" }),
      );
    });

    test("returns 404 when event not found", async () => {
      const { postPhotoboothFolder, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce({ exists: false });
      const res = createMockResponse();
      await postPhotoboothFolder({ params: { id: "missing" } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ───────────────── POST /events/:id/photobooth-upload ─────────────────
  describe("POST /events/:id/photobooth-upload", () => {
    test("returns 400 when no files", async () => {
      const { postPhotoboothUpload } = await loadRouter();
      const res = createMockResponse();
      await postPhotoboothUpload({ params: { id: "ev-1" }, files: [] }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("returns 400 when event has no albumSlug", async () => {
      const { postPhotoboothUpload, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc({ albumSlug: undefined }));
      const res = createMockResponse();
      await postPhotoboothUpload({
        params: { id: "ev-1" },
        files: [{ originalname: "a.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x") }],
      }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("uploads images and reports non-images as failed", async () => {
      const { postPhotoboothUpload, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValue({ ok: true });
      const res = createMockResponse();
      await postPhotoboothUpload({
        params: { id: "ev-1" },
        files: [
          { originalname: "a.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x") },
          { originalname: "b.png", mimetype: "image/png", buffer: Buffer.from("x") },
          { originalname: "c.txt", mimetype: "text/plain", buffer: Buffer.from("x") },
        ],
      }, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.uploaded).toBe(2);
      expect(data.failed).toEqual(["c.txt"]);
      expect(data.total).toBe(3);
    });
  });

  // ───────────────── GET /events/:id/photobooth-files ─────────────────
  describe("GET /events/:id/photobooth-files", () => {
    test("returns 400 when event has no albumSlug", async () => {
      const { getPhotoboothFiles, docGetMock } = await loadRouter();
      docGetMock.mockResolvedValueOnce(makeEventDoc({ albumSlug: undefined }));
      const res = createMockResponse();
      await getPhotoboothFiles({ params: { id: "ev-1" } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("lists image files from the photobooth folder", async () => {
      const { getPhotoboothFiles, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { ObjectName: ".keep", IsDirectory: false },
          { ObjectName: "a.jpg", IsDirectory: false },
          { ObjectName: "b.png", IsDirectory: false },
          { ObjectName: "sub", IsDirectory: true },
        ],
      });
      const res = createMockResponse();
      await getPhotoboothFiles({ params: { id: "ev-1" } }, res);
      const data = (res.json as any).mock.calls[0][0];
      expect(data.files.map((f: any) => f.name)).toEqual(["a.jpg", "b.png"]);
    });

    test("returns empty list when Bunny listing fails", async () => {
      const { getPhotoboothFiles, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({ ok: false });
      const res = createMockResponse();
      await getPhotoboothFiles({ params: { id: "ev-1" } }, res);
      expect(res.json).toHaveBeenCalledWith({ files: [] });
    });
  });

  // ───────────────── POST /events/:id/photobooth-delete ─────────────────
  describe("POST /events/:id/photobooth-delete", () => {
    test("returns 400 when no valid filenames", async () => {
      const { postPhotoboothDelete } = await loadRouter();
      const res = createMockResponse();
      await postPhotoboothDelete({ params: { id: "ev-1" }, body: { filenames: ["../evil", "a/b"] } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("deletes selected files and reports counts", async () => {
      const { postPhotoboothDelete, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValue({ ok: true });
      const res = createMockResponse();
      await postPhotoboothDelete({ params: { id: "ev-1" }, body: { filenames: ["a.jpg", "b.jpg"] } }, res);
      expect(res.json).toHaveBeenCalledWith({ deleted: 2, failed: [] });
    });

    test("treats a 404 from Bunny as already deleted", async () => {
      const { postPhotoboothDelete, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValue({ ok: false, status: 404 });
      const res = createMockResponse();
      await postPhotoboothDelete({ params: { id: "ev-1" }, body: { filenames: ["gone.jpg"] } }, res);
      expect(res.json).toHaveBeenCalledWith({ deleted: 1, failed: [] });
    });
  });

  // ───────────────── POST /events/:id/detect-album ─────────────────
  describe("POST /events/:id/detect-album", () => {
    test("returns found:false for invalid slug", async () => {
      const { postDetectAlbum } = await loadRouter();
      const res = createMockResponse();
      await postDetectAlbum({ params: { id: "ev-1" }, body: { slug: "INVALID!" } }, res);
      expect(res.json).toHaveBeenCalledWith({ found: false });
    });

    test("returns found:false when album not in Bunny", async () => {
      const { postDetectAlbum, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({ ok: false });
      const res = createMockResponse();
      await postDetectAlbum({ params: { id: "ev-1" }, body: { slug: "nunta-test-2026" } }, res);
      expect(res.json).toHaveBeenCalledWith({ found: false });
    });

    test("links album to event when found in Bunny", async () => {
      const { postDetectAlbum, updateMock, nodeFetchMock } = await loadRouter();
      nodeFetchMock.mockResolvedValueOnce({ ok: true });
      const res = createMockResponse();
      await postDetectAlbum({ params: { id: "ev-1" }, body: { slug: "nunta-test-2026" } }, res);
      expect(updateMock).toHaveBeenCalledWith("ev-1", { albumSlug: "nunta-test-2026" });
      expect(res.json).toHaveBeenCalledWith({ found: true, slug: "nunta-test-2026" });
    });
  });

  // ───────────────── POST /album-health/:slug/process ─────────────────
  describe("POST /album-health/:slug/process", () => {
    test("starts a new job and returns started status", async () => {
      const { postAlbumHealthProcess, getJobMock, createJobMock } = await loadRouter();
      getJobMock.mockReturnValueOnce(null);
      const res = createMockResponse();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      await postAlbumHealthProcess({ params: { slug: "nunta-test" }, body: {} }, res);
      expect(createJobMock).toHaveBeenCalledWith("nunta-test", 0);
      expect(res.json).toHaveBeenCalledWith({ ok: true, status: "started" });
      vi.unstubAllGlobals();
    });

    test("returns already_running when job is running", async () => {
      const { postAlbumHealthProcess, getJobMock } = await loadRouter();
      getJobMock.mockReturnValueOnce({ status: "running" });
      const res = createMockResponse();
      await postAlbumHealthProcess({ params: { slug: "nunta-test" }, body: {} }, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true, status: "already_running" });
    });
  });
});
