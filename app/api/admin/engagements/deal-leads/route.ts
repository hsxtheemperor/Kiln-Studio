import { NextResponse } from "next/server";
import { requireDealLead } from "@/lib/auth/require-deal-lead";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const authorization = await requireDealLead();
  if (!authorization.authorized) return authorization.response;
  if (authorization.accessLevel !== "studio_member") {
    return NextResponse.json(
      { error: "Studio-member access is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });
    if (error) throw error;

    const dealLeads = data.users
      .filter((user) => user.app_metadata.access_level === "deal_lead")
      .map((user) => ({
        id: user.id,
        label:
          (typeof user.user_metadata.full_name === "string" &&
            user.user_metadata.full_name.trim()) ||
          user.email ||
          user.id,
      }));

    return NextResponse.json(
      { items: dealLeads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Deal-lead list could not be loaded.", error);
    return NextResponse.json(
      { error: "The deal-lead list is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
