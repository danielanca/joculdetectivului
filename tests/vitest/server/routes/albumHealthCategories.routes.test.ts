/*
 * Purpose: verifies album health categories routes (GET/PUT) that persist
 * category overrides (active/delivered/archived) to Firestore so the cron
 * can filter out archived albums from ZIP-check notifications.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

function createMockResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

type Handler = (req: any, res: any) => Promise<void> | void;

async function loadRouter(options?: {
  categoriesDocExists?: boolean;
  categoriesData?: Record<string, string>;
  setError?: boolean;
}) {
  const categoriesData = options?.categoriesData ?? { "15mai2025": "archived", "10iulie2025": "delivered" };

  const getMock = vi.fn().mockResolvedValue({
    exists: options?.categoriesDocExists ?? true,
    data: () => categoriesData,
  });
  const setMock = options?.setError
    ? vi.fn().mockRejectedValue(new Error("Firestore write error"))
    : vi.fn().mockResolvedValue(undefined);

  const docMock = vi.fn(() => ({ get: getMock, set: setMock }));
  const collectionMock = vi.fn(() => ({ doc: docMock }));

  vi.doMock("src/server/firestore", () => ({
    firestore: () => ({ collection: collectionMock }),
  }));

  vi.doMock("src/server/middleware/requireFirebaseAuth", () => ({
    requireFirebaseAuth: (_req: any, _res: any, next: any) => next(),
    requireSupremeAdmin: (_req: any, _res: any, next: any) => next(),
  }));

  vi.doMock("src/server/constants/bunny", () => ({
    buildBunnyDirectoryUrl: vi.fn(() => "https://storage.bunnycdn.com/zone/"),
    buildBunnyStorageUrl: vi.fn((...segs: string[]) => `https://storage.bunnycdn.com/zone/${segs.join("/")}`),
    getBunnyStorageKey: () => "test-key",
    BUNNY_ACCESS_KEY_HEADER: "AccessKey",
    BUNNY_PHOTOS_FOLDER: "photos",
    BUNNY_QR_MOMENT_FOLDER: "qr-moment",
  }));

  vi.doMock("src/server/constants/credentials", () => ({
    adminUser: { email: "admin@test.com" },
  }));

  vi.doMock("src/server/notifications/mailer", () => ({
    sendEmail: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock("src/server/services/album.service", () => ({
    invalidateAlbumCache: vi.fn(),
  }));

  vi.doMock("src/server/services/albumProcessingJobs", () => ({
    createJob: vi.fn(),
    getJob: vi.fn(() => null),
    getAllJobs: vi.fn(() => []),
    serializeJob: vi.fn(),
    appendJobLog: vi.fn(),
    setJobProgress: vi.fn(),
    finishJob: vi.fn(),
    errorJob: vi.fn(),
  }));

  vi.doMock("sharp", () => ({
    default: vi.fn(() => ({
      resize: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("webp")),
    })),
  }));

  vi.doMock("anthropic", () => ({
    default: vi.fn(() => ({ messages: { create: vi.fn() } })),
  }));

  vi.doMock("@anthropic-ai/sdk", () => ({
    default: vi.fn(() => ({ messages: { create: vi.fn() } })),
  }));

  const multerFn = vi.fn(() => ({
    single: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    array: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  })) as any;
  multerFn.memoryStorage = vi.fn(() => ({}));
  vi.doMock("multer", () => ({ default: multerFn }));

  const mod = await import("src/server/routes/adminEvents.routes");
  const router = mod.default;
  const handlers: Record<string, Handler> = {};

  for (const layer of router.stack) {
    const routeStack = layer.route?.stack ?? [];
    const method: string = routeStack[routeStack.length - 1]?.method?.toUpperCase() ?? "";
    const path: string = layer.route?.path ?? "";
    if (method && path) handlers[`${method} ${path}`] = routeStack[routeStack.length - 1]?.handle;
  }

  return { handlers, getMock, setMock, collectionMock, docMock };
}

describe("albumHealth categories routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  // ── GET /album-health/categories ─────────────────────────────────────────────

  describe("GET /album-health/categories", () => {
    test("returns categories from Firestore when document exists", async () => {
      const { handlers } = await loadRouter({
        categoriesDocExists: true,
        categoriesData: { "15mai2025": "archived", "10iulie2025": "delivered" },
      });
      const handler = handlers["GET /album-health/categories"];
      const res = createMockResponse();

      await handler({}, res);

      expect(res.json).toHaveBeenCalledWith({ "15mai2025": "archived", "10iulie2025": "delivered" });
    });

    test("returns empty object when categories document does not exist", async () => {
      const { handlers } = await loadRouter({ categoriesDocExists: false });
      const handler = handlers["GET /album-health/categories"];
      const res = createMockResponse();

      await handler({}, res);

      expect(res.json).toHaveBeenCalledWith({});
    });

    test("queries the correct Firestore path", async () => {
      const { handlers, collectionMock, docMock } = await loadRouter();
      const handler = handlers["GET /album-health/categories"];
      const res = createMockResponse();

      await handler({}, res);

      expect(collectionMock).toHaveBeenCalledWith("settings");
      expect(docMock).toHaveBeenCalledWith("albumHealthCategories");
    });
  });

  // ── PUT /album-health/categories ──────────────────────────────────────────────

  describe("PUT /album-health/categories", () => {
    test("saves category override with merge:true and returns ok:true", async () => {
      const { handlers, setMock } = await loadRouter();
      const handler = handlers["PUT /album-health/categories"];
      const res = createMockResponse();
      const body = { "20iunie2025": "archived" };

      await handler({ body }, res);

      expect(setMock).toHaveBeenCalledWith(body, { merge: true });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("updates multiple slugs at once", async () => {
      const { handlers, setMock } = await loadRouter();
      const handler = handlers["PUT /album-health/categories"];
      const res = createMockResponse();
      const body = { "20iunie2025": "archived", "5august2025": "delivered" };

      await handler({ body }, res);

      expect(setMock).toHaveBeenCalledWith(body, { merge: true });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    test("returns 500 when Firestore write fails", async () => {
      const { handlers } = await loadRouter({ setError: true });
      const handler = handlers["PUT /album-health/categories"];
      const res = createMockResponse();

      await handler({ body: { "test-slug": "archived" } }, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    test("overwrites an archived album back to active without affecting others", async () => {
      const { handlers, setMock } = await loadRouter();
      const handler = handlers["PUT /album-health/categories"];
      const res = createMockResponse();

      await handler({ body: { "15mai2025": "active" } }, res);

      expect(setMock).toHaveBeenCalledWith({ "15mai2025": "active" }, { merge: true });
    });
  });
});
