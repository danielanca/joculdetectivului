/*
 * Purpose: verifies the DELETE /album-health/:slug/zip route that removes
 * photos.zip from Bunny Storage for a given album slug.
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
  bunnyDeleteStatus?: number;
  bunnyDeleteOk?: boolean;
  bunnyThrows?: boolean;
}) {
  const bunnyDeleteOk = options?.bunnyDeleteOk ?? true;
  const bunnyDeleteStatus = options?.bunnyDeleteStatus ?? 200;

  const fetchMock = options?.bunnyThrows
    ? vi.fn().mockRejectedValue(new Error("Network error"))
    : vi.fn().mockResolvedValue({ ok: bunnyDeleteOk, status: bunnyDeleteStatus });

  vi.stubGlobal("fetch", fetchMock);
  vi.doMock("node-fetch", () => ({ default: fetchMock }));

  vi.doMock("src/server/firestore", () => ({
    firestore: () => ({
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }) })),
      })),
    }),
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

  return { handlers, fetchMock };
}

describe("DELETE /album-health/:slug/zip", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("deletes photos.zip from Bunny and returns ok:true", async () => {
    const { handlers, fetchMock } = await loadRouter({ bunnyDeleteOk: true });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "15mai2025" } }, res);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("15mai2025"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("sends DELETE request with Bunny AccessKey header", async () => {
    const { handlers, fetchMock } = await loadRouter({ bunnyDeleteOk: true });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "nunta-ana" } }, res);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ AccessKey: "test-key" }),
      })
    );
  });

  test("treats Bunny 404 as success (zip already absent)", async () => {
    const { handlers } = await loadRouter({ bunnyDeleteOk: false, bunnyDeleteStatus: 404 });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "album-fara-zip" } }, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("returns 500 when Bunny returns a non-404 error", async () => {
    const { handlers } = await loadRouter({ bunnyDeleteOk: false, bunnyDeleteStatus: 503 });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "15mai2025" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("503") }));
  });

  test("returns 500 on network failure", async () => {
    const { handlers } = await loadRouter({ bunnyThrows: true });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "15mai2025" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test("builds the zip URL from the slug correctly", async () => {
    const { handlers, fetchMock } = await loadRouter({ bunnyDeleteOk: true });
    const handler = handlers["DELETE /album-health/:slug/zip"];
    const res = createMockResponse();

    await handler({ params: { slug: "nunta-ionela-2025" } }, res);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("nunta-ionela-2025");
    expect(calledUrl).toContain("photos.zip");
  });
});
