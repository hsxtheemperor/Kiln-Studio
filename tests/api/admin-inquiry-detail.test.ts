// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireStudioMember: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-studio-member", () => ({
  requireStudioMember: mocks.requireStudioMember,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));

import { GET } from "../../app/api/admin/inquiries/[id]/route";

const inquiryId = "41000000-0000-4000-8000-000000000001";

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("GET /api/admin/inquiries/[id]", () => {
  const supabase = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    mocks.requireStudioMember.mockResolvedValue({
      authorized: true,
      supabase,
    });
  });

  it("returns an explicit service error when the inquiry brief cannot be loaded", async () => {
    const inquiry = query({
      data: {
        id: inquiryId,
        similarity_matches: [],
      },
      error: null,
    });
    const brief = query({
      data: null,
      error: { message: "database unavailable" },
    });
    supabase.from.mockReturnValueOnce(inquiry).mockReturnValueOnce(brief);

    const response = await GET(
      new Request(`https://kiln-studio.test/api/admin/inquiries/${inquiryId}`),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Inquiry priority details are temporarily unavailable.",
    });
    expect(mocks.createSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
