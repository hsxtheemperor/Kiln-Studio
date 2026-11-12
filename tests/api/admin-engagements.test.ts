import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDealLead: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/auth/require-deal-lead", () => ({
  requireDealLead: mocks.requireDealLead,
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    auth: { admin: { listUsers: mocks.listUsers } },
  }),
}));

import { GET } from "../../app/api/admin/engagements/route";
import { PATCH } from "../../app/api/admin/engagements/[id]/route";
import { GET as GETDealLeads } from "../../app/api/admin/engagements/deal-leads/route";

function createQuery(result: { data: unknown; error: unknown; count?: number }) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    select: vi.fn(() => query),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return query;
}

describe("admin engagement endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUsers.mockReset();
  });

  it("rejects invalid queue pagination before accessing private data", async () => {
    const response = await GET(
      new Request("https://kiln-studio.test/api/admin/engagements?page=0"),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireDealLead).not.toHaveBeenCalled();
  });

  it("returns the authorization response without querying engagement data", async () => {
    mocks.requireDealLead.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await GET(
      new Request("https://kiln-studio.test/api/admin/engagements"),
    );

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns engagement rows joined with their inquiry and brief", async () => {
    const id = "30000000-0000-4000-8000-000000000001";
    const engagement = {
      id: "40000000-0000-4000-8000-000000000001",
      inquiry_id: id,
      review_state: "pending",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      deal_lead_id: null,
      claimed_at: null,
      created_at: "2026-11-12T00:00:00.000Z",
      updated_at: "2026-11-12T00:00:00.000Z",
    };
    const queries = [
      createQuery({ data: [engagement], error: null, count: 1 }),
      createQuery({
        data: [{
          id,
          name: "Synthetic client",
          email: "client@example.test",
          company: null,
          service: "brand_identity",
          project_brief: "A synthetic project.",
          budget_range: "5k_10k",
          timeline: "Next quarter",
          priority_score: 7,
          status: "new",
          created_at: "2026-11-12T00:00:00.000Z",
        }],
        error: null,
      }),
      createQuery({
        data: [{
          inquiry_id: id,
          design_goal: "Clarify the brand",
          brand_message: "Warm and useful",
          target_audience: null,
          desired_outcomes: null,
        }],
        error: null,
      }),
    ];
    mocks.from.mockImplementation(() => queries.shift());
    const supabase = { from: mocks.from };
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "deal_lead",
      supabase,
    });

    const response = await GET(
      new Request("https://kiln-studio.test/api/admin/engagements"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].inquiry.name).toBe("Synthetic client");
    expect(payload.items[0].brief.design_goal).toBe("Clarify the brand");
  });

  it("returns only provisioned deal leads to studio members", async () => {
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "studio_member",
      supabase: {},
    });
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            email: "lead@example.test",
            app_metadata: { access_level: "deal_lead" },
            user_metadata: { full_name: "Demo Lead" },
          },
          {
            id: "10000000-0000-4000-8000-000000000002",
            email: "designer@example.test",
            app_metadata: { access_level: "designer" },
            user_metadata: { full_name: "Demo Designer" },
          },
        ],
      },
      error: null,
    });

    const response = await GETDealLeads();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{
        id: "10000000-0000-4000-8000-000000000001",
        label: "Demo Lead",
      }],
    });
    expect(mocks.listUsers).toHaveBeenCalledWith({ page: 1, perPage: 100 });
  });

  it("does not list users for deal leads", async () => {
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "deal_lead",
      supabase: {},
    });

    const response = await GETDealLeads();

    expect(response.status).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("reviews an inquiry through the database transition function", async () => {
    const inquiryId = "30000000-0000-4000-8000-000000000001";
    const engagement = { inquiry_id: inquiryId, review_state: "suitable" };
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "deal_lead",
      supabase: { rpc: mocks.rpc },
    });
    mocks.rpc.mockResolvedValue({ data: engagement, error: null });

    const response = await PATCH(
      new Request(`https://kiln-studio.test/api/admin/engagements/${inquiryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "review",
          review_state: "suitable",
          notes: "Fits the studio's current focus.",
        }),
      }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("review_engagement", {
      p_inquiry_id: inquiryId,
      p_review_state: "suitable",
      p_notes: "Fits the studio's current focus.",
    });
  });

  it("denies deal leads the admin-only reassignment action", async () => {
    const inquiryId = "30000000-0000-4000-8000-000000000001";
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "deal_lead",
      supabase: { rpc: mocks.rpc },
    });

    const response = await PATCH(
      new Request(`https://kiln-studio.test/api/admin/engagements/${inquiryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reassign",
          deal_lead_id: "10000000-0000-4000-8000-000000000001",
        }),
      }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a concurrent claim conflict to HTTP 409", async () => {
    const inquiryId = "30000000-0000-4000-8000-000000000001";
    mocks.requireDealLead.mockResolvedValue({
      authorized: true,
      accessLevel: "deal_lead",
      supabase: { rpc: mocks.rpc },
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "Engagement has already been claimed." },
    });

    const response = await PATCH(
      new Request(`https://kiln-studio.test/api/admin/engagements/${inquiryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Engagement has already been claimed.",
    });
  });
});
