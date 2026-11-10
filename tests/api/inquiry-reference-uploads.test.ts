// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkInquiryUploadRateLimit: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  deleteIn: vi.fn(),
}));

vi.mock("@/lib/rate-limit/inquiry", () => ({
  checkInquiryUploadRateLimit: mocks.checkInquiryUploadRateLimit,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      insert: mocks.insert,
      delete: () => ({ in: mocks.deleteIn }),
    }),
    storage: {
      from: () => ({
        createSignedUploadUrl: mocks.createSignedUploadUrl,
        remove: mocks.remove,
      }),
    },
  }),
}));

import { POST } from "../../app/api/inquiries/reference-uploads/route";

function createRequest(files: unknown, website = ""): Request {
  return new Request("https://kiln-studio.test/api/inquiries/reference-uploads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.15",
    },
    body: JSON.stringify({ files, website }),
  });
}

describe("POST /api/inquiries/reference-uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkInquiryUploadRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: { path: "pending/reference-id", token: "upload-token" },
      error: null,
    });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.deleteIn.mockResolvedValue({ error: null });
  });

  it("rejects unsupported image types before issuing an upload URL", async () => {
    const response = await POST(
      createRequest([{ name: "reference.svg", type: "image/svg+xml", size: 512 }]),
    );

    expect(response.status).toBe(400);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects honeypot uploads before rate limiting or storage access", async () => {
    const response = await POST(
      createRequest(
        [{ name: "moodboard.png", type: "image/png", size: 2048 }],
        "https://spam.example",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.checkInquiryUploadRateLimit).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates private staged metadata and returns a one-use signed upload token", async () => {
    const response = await POST(
      createRequest([{ name: "moodboard.png", type: "image/png", size: 2048 }]),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      uploads: [{ path: "pending/reference-id", token: "upload-token" }],
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        object_path: expect.stringMatching(/^pending\//),
        file_name: "moodboard.png",
        content_type: "image/png",
        byte_size: 2048,
        status: "awaiting_upload",
      }),
    );
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^pending\//),
      { upsert: false },
    );
  });
});
