import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireStudioMember: vi.fn(),
}));

vi.mock("@/lib/auth/require-studio-member", () => ({
  requireStudioMember: mocks.requireStudioMember,
}));

import { GET } from "../../app/api/admin/inquiries/route";

describe("GET /api/admin/inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
