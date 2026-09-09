/*
 * Purpose: verifies resolveAlbumSlug accepts both "8august2026" and "08august2026"
 * and maps to whichever Bunny folder actually contains photos.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const listFilesMock = vi.fn();

vi.mock("src/server/services/bunny.service", () => ({
  listFiles: (path: string) => listFilesMock(path),
  checkFileExists: vi.fn().mockResolvedValue(false),
}));

vi.mock("src/server/firestore", () => ({
  firestore: () => ({
    collection: () => ({ doc: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) }),
  }),
}));

const loadResolver = async () => {
  const mod = await import("src/server/services/album.service");
  return mod.resolveAlbumSlug;
};

describe("resolveAlbumSlug", () => {
  beforeEach(() => {
    vi.resetModules();
    listFilesMock.mockReset();
  });

  test("maps 8august2026 → 08august2026 when only the padded folder has photos", async () => {
    listFilesMock.mockImplementation((path: string) =>
      path.startsWith("08august2026/") ? Promise.resolve([{ ObjectName: "a.jpg" }]) : Promise.resolve([]),
    );
    const resolveAlbumSlug = await loadResolver();
    expect(await resolveAlbumSlug("8august2026")).toBe("08august2026");
  });

  test("maps 08august2026 → 8august2026 when only the un-padded folder has photos", async () => {
    listFilesMock.mockImplementation((path: string) =>
      path.startsWith("8august2026/") ? Promise.resolve([{ ObjectName: "a.jpg" }]) : Promise.resolve([]),
    );
    const resolveAlbumSlug = await loadResolver();
    expect(await resolveAlbumSlug("08august2026")).toBe("8august2026");
  });

  test("prefers the requested slug when it already has photos", async () => {
    listFilesMock.mockResolvedValue([{ ObjectName: "a.jpg" }]);
    const resolveAlbumSlug = await loadResolver();
    expect(await resolveAlbumSlug("8august2026")).toBe("8august2026");
  });

  test("returns the requested slug unchanged when no variant has photos", async () => {
    listFilesMock.mockResolvedValue([]);
    const resolveAlbumSlug = await loadResolver();
    expect(await resolveAlbumSlug("8august2026")).toBe("8august2026");
  });

  test("leaves non-date slugs untouched without hitting Bunny", async () => {
    const resolveAlbumSlug = await loadResolver();
    expect(await resolveAlbumSlug("cabana2026")).toBe("cabana2026");
    expect(listFilesMock).not.toHaveBeenCalled();
  });
});
