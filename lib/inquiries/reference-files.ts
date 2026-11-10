import "server-only";

import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  INQUIRY_REFERENCE_BUCKET,
  INQUIRY_REFERENCE_MIME_TYPES,
  MAX_INQUIRY_REFERENCE_BYTES,
  MAX_INQUIRY_REFERENCE_FILES,
  MAX_INQUIRY_REFERENCE_TOTAL_BYTES,
} from "./reference-file-constants";

export {
  INQUIRY_REFERENCE_BUCKET,
  INQUIRY_REFERENCE_MIME_TYPES,
  MAX_INQUIRY_REFERENCE_BYTES,
  MAX_INQUIRY_REFERENCE_FILES,
  MAX_INQUIRY_REFERENCE_TOTAL_BYTES,
};

export const ReferenceFileUploadSchema = z
  .object({
    website: z.string().max(200).optional().default(""),
    files: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(180),
            type: z.enum(INQUIRY_REFERENCE_MIME_TYPES),
            size: z.number().int().min(1).max(MAX_INQUIRY_REFERENCE_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_INQUIRY_REFERENCE_FILES)
      .refine(
        (files) =>
          files.reduce((total, file) => total + file.size, 0) <=
          MAX_INQUIRY_REFERENCE_TOTAL_BYTES,
      ),
  })
  .strict();

export function sanitizeReferenceFileName(name: string) {
  const basename = name.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 180) || "reference-image";
}

export function hasSupportedImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return false;
}

export async function processInquiryReferenceFile(referenceId: string) {
  const supabase = createSupabaseServiceClient();
  const { data: file, error: lookupError } = await supabase
    .from("inquiry_reference_files")
    .select("id, object_path, content_type, byte_size, status")
    .eq("id", referenceId)
    .maybeSingle();

  if (lookupError) {
    throw new Error("Reference image status could not be loaded.");
  }
  if (!file) {
    throw new Error("Reference image does not exist.");
  }
  if (file.status === "ready") {
    return;
  }
  if (file.status === "rejected") {
    const { error: removeError } = await supabase.storage
      .from(INQUIRY_REFERENCE_BUCKET)
      .remove([file.object_path]);
    if (removeError) {
      throw new Error("Rejected reference image could not be removed.");
    }
    return;
  }
  if (file.status !== "queued") {
    throw new Error("Reference image has not been submitted.");
  }

  const { data: image, error: downloadError } = await supabase.storage
    .from(INQUIRY_REFERENCE_BUCKET)
    .download(file.object_path);

  if (downloadError || !image) {
    throw new Error("Reference image could not be downloaded for verification.");
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (
    bytes.byteLength !== file.byte_size ||
    !hasSupportedImageSignature(file.content_type, bytes)
  ) {
    const { error: rejectError } = await supabase
      .from("inquiry_reference_files")
      .update({
        status: "rejected",
        failure_reason: "Image bytes did not match the declared format or size.",
        processed_at: new Date().toISOString(),
      })
      .eq("id", referenceId)
      .eq("status", "queued");
    if (rejectError) {
      throw new Error("Invalid reference image status could not be recorded.");
    }
    const { error: removeError } = await supabase.storage
      .from(INQUIRY_REFERENCE_BUCKET)
      .remove([file.object_path]);
    if (removeError) {
      throw new Error("Invalid reference image could not be removed.");
    }
    return;
  }

  const { error: readyError } = await supabase
    .from("inquiry_reference_files")
    .update({
      status: "ready",
      processed_at: new Date().toISOString(),
    })
    .eq("id", referenceId)
    .eq("status", "queued");

  if (readyError) {
    throw new Error("Verified reference image status could not be saved.");
  }
}
