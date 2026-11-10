import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hasSupportedImageSignature,
  sanitizeReferenceFileName,
} from "../../lib/inquiries/reference-files";

describe("inquiry reference images", () => {
  it("checks JPEG, PNG, and WebP signatures rather than trusting filenames", () => {
    expect(
      hasSupportedImageSignature(
        "image/jpeg",
        new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      ),
    ).toBe(true);
    expect(
      hasSupportedImageSignature(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(
      hasSupportedImageSignature(
        "image/webp",
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe(true);
    expect(
      hasSupportedImageSignature("image/png", new Uint8Array([0xff, 0xd8, 0xff])),
    ).toBe(false);
    expect(hasSupportedImageSignature("image/svg+xml", new Uint8Array())).toBe(false);
  });

  it("stores only a clean filename without client-supplied path segments", () => {
    expect(sanitizeReferenceFileName("../../moodboard.png")).toBe("moodboard.png");
    expect(sanitizeReferenceFileName("  ")).toBe("reference-image");
  });
});
