import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || token !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Retention cleanup is not configured." },
      { status: 503 },
    );
  }

  try {
    const service = createClient<Database>(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleProjects, error: projectLookupError } = await service
      .from("projects")
      .select("id")
      .lt("accepted_at", cutoff);

    if (projectLookupError) {
      throw projectLookupError;
    }

    if (staleProjects && staleProjects.length > 0) {
      const projectIds = staleProjects.map((project) => project.id);
      const { error: projectDeleteError } = await service
        .from("projects")
        .delete()
        .in("id", projectIds);

      if (projectDeleteError) {
        throw projectDeleteError;
      }
    }

    const { data: staleInquiries, error: inquiryDeleteError } = await service
      .from("inquiries")
      .delete()
      .lt("created_at", cutoff)
      .select("id");

    if (inquiryDeleteError) {
      throw inquiryDeleteError;
    }

    return NextResponse.json({
      deleted: staleInquiries?.length ?? 0,
      cutoff,
      note: "Old demo inquiries are cleaned up after 14 days.",
    });
  } catch (error) {
    console.error("Demo retention cleanup failed.", error);
    return NextResponse.json(
      { error: "Retention cleanup failed." },
      { status: 500 },
    );
  }
}
