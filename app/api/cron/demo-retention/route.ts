import { NextResponse } from "next/server";
import { INQUIRY_REFERENCE_BUCKET } from "@/lib/inquiries/reference-file-constants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || token !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const service = createSupabaseServiceClient();

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

    const { data: staleInquiries, error: inquiryLookupError } = await service
      .from("inquiries")
      .select("id")
      .lt("created_at", cutoff);

    if (inquiryLookupError) {
      throw inquiryLookupError;
    }

    const staleInquiryIds = (staleInquiries ?? []).map((inquiry) => inquiry.id);
    const { data: unattachedFiles, error: unattachedFilesError } = await service
      .from("inquiry_reference_files")
      .select("id, object_path")
      .is("inquiry_id", null)
      .lt("created_at", cutoff);

    if (unattachedFilesError) {
      throw unattachedFilesError;
    }

    const staleReferenceFiles =
      staleInquiryIds.length > 0
        ? await service
            .from("inquiry_reference_files")
            .select("id, object_path")
            .in("inquiry_id", staleInquiryIds)
        : { data: [], error: null };

    if (staleReferenceFiles.error) {
      throw staleReferenceFiles.error;
    }

    const referenceFiles = [
      ...(unattachedFiles ?? []),
      ...(staleReferenceFiles.data ?? []),
    ];
    const uniqueReferenceFiles = [
      ...new Map(referenceFiles.map((file) => [file.id, file])).values(),
    ];

    for (let index = 0; index < uniqueReferenceFiles.length; index += 100) {
      const { error: storageDeleteError } = await service.storage
        .from(INQUIRY_REFERENCE_BUCKET)
        .remove(uniqueReferenceFiles.slice(index, index + 100).map((file) => file.object_path));
      if (storageDeleteError) {
        throw storageDeleteError;
      }
    }

    if (unattachedFiles && unattachedFiles.length > 0) {
      const { error: unattachedDeleteError } = await service
        .from("inquiry_reference_files")
        .delete()
        .in("id", unattachedFiles.map((file) => file.id));
      if (unattachedDeleteError) {
        throw unattachedDeleteError;
      }
    }

    const { data: deletedInquiries, error: inquiryDeleteError } = await service
      .from("inquiries")
      .delete()
      .lt("created_at", cutoff)
      .select("id");

    if (inquiryDeleteError) {
      throw inquiryDeleteError;
    }

    return NextResponse.json({
      deleted: deletedInquiries?.length ?? 0,
      deletedReferenceFiles: uniqueReferenceFiles.length,
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
