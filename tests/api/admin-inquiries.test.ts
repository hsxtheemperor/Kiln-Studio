import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireStudioMember: vi.fn(),
}));

vi.mock("@/lib/auth/require-studio-member", () => ({
  requireStudioMember: mocks.requireStudioMember,
}));

import { PATCH } from "../../app/api/admin/inquiries/[id]/route";
import { GET } from "../../app/api/admin/inquiries/route";

describe("GET /api/admin/inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PATCH /api/admin/inquiries/[id]", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("explains that engagement review and assignment are required before acceptance", async () => {
      const inquiryId = "30000000-0000-4000-8000-000000000001";
      const query = {
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "23514",
            message: "An inquiry must be marked suitable and assigned to a deal lead before acceptance.",
          },
        }),
        select: vi.fn(),
        update: vi.fn(),
      };
      query.eq.mockReturnValue(query);
      query.select.mockReturnValue(query);
      query.update.mockReturnValue(query);
      const supabase = { from: vi.fn().mockReturnValue(query) };
      mocks.requireStudioMember.mockResolvedValue({
        authorized: true,
        supabase,
      });

      const response = await PATCH(
        new Request(`https://kiln-studio.test/api/admin/inquiries/${inquiryId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        }),
        { params: Promise.resolve({ id: inquiryId }) },
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error:
          "Mark the inquiry suitable and assign it to a deal lead in Engagements before accepting it.",
      });
    });
  });

  it("returns the authorization response before querying private inquiries", async () => {
    mocks.requireStudioMember.mockResolvedValue({
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      ),
    });

    const response = await GET(
      new Request("https://kiln-studio.test/api/admin/inquiries"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication is required.",
    });
    expect(mocks.requireStudioMember).toHaveBeenCalledOnce();
  });
});
