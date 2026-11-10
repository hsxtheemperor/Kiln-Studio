export const INQUIRY_REFERENCE_BUCKET = "inquiry-references";
export const MAX_INQUIRY_REFERENCE_FILES = 4;
export const MAX_INQUIRY_REFERENCE_BYTES = 8 * 1024 * 1024;
export const MAX_INQUIRY_REFERENCE_TOTAL_BYTES = 24 * 1024 * 1024;
export const INQUIRY_REFERENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
