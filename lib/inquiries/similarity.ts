import "server-only";

import { Index } from "@upstash/vector";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { InquirySimilarityMatch } from "@/lib/supabase/database.types";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const SIMILARITY_NAMESPACE = "inquiry-similarity";
const MAX_MATCHES = 5;

type SimilarityMetadata = { inquiry_id: string };

function getVectorIndex() {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Vector is not configured.");
  }

  return new Index<SimilarityMetadata>({ url, token }).namespace(
    SIMILARITY_NAMESPACE,
  );
}

export function buildInquiryEmbeddingText(input: {
  projectBrief: string;
  designGoal: string;
  brandMessage: string;
  targetAudience: string | null;
  desiredOutcomes: string | null;
}) {
  return [
    ["Project brief", input.projectBrief],
    ["Design goal", input.designGoal],
    ["Brand message", input.brandMessage],
    ["Target audience", input.targetAudience],
    ["Desired outcomes", input.desiredOutcomes],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([label, value]) => `${label}: ${value?.trim()}`)
    .join("\n")
    .slice(0, 8_000);
}

async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API;
  if (!apiKey) {
    throw new Error("OpenAI embeddings are not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("OpenAI embedding request failed.");
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray(payload.data) ||
    typeof payload.data[0] !== "object" ||
    payload.data[0] === null ||
    !("embedding" in payload.data[0]) ||
    !Array.isArray(payload.data[0].embedding)
  ) {
    throw new Error("OpenAI returned an invalid embedding response.");
  }

  const rawEmbedding = payload.data[0].embedding;
  if (rawEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("OpenAI returned an embedding with an invalid dimension.");
  }
  const embedding: number[] = [];
  for (const rawValue of rawEmbedding) {
    const value: unknown = rawValue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("OpenAI returned an embedding with an invalid dimension.");
    }
    embedding.push(value);
  }
  return embedding;
}

function parseMatches(value: unknown): InquirySimilarityMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((match) => {
    if (
      typeof match === "object" &&
      match !== null &&
      "inquiry_id" in match &&
      typeof match.inquiry_id === "string" &&
      "score" in match &&
      typeof match.score === "number" &&
      Number.isFinite(match.score)
    ) {
      return [{ inquiry_id: match.inquiry_id, score: match.score }];
    }
    return [];
  });
}

export async function hasInquirySimilarityConsent(inquiryId: string) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("similarity_opt_in", true)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return Boolean(data);
}

export async function processInquirySimilarity(inquiryId: string) {
  const service = createSupabaseServiceClient();
  const { data: inquiry, error: inquiryError } = await service
    .from("inquiries")
    .select("id, similarity_opt_in, project_brief")
    .eq("id", inquiryId)
    .eq("similarity_opt_in", true)
    .maybeSingle();

  if (inquiryError) {
    throw inquiryError;
  }
  if (!inquiry) {
    await getVectorIndex().delete(inquiryId);
    return;
  }

  const { data: brief, error: briefError } = await service
    .from("inquiry_briefs")
    .select("design_goal, brand_message, target_audience, desired_outcomes")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (briefError) {
    throw briefError;
  }
  if (!brief) {
    throw new Error("Inquiry brief is unavailable for similarity processing.");
  }

  const { data: claimed, error: claimError } = await service
    .from("inquiries")
    .update({ similarity_status: "processing", similarity_matches: [] })
    .eq("id", inquiryId)
    .eq("similarity_opt_in", true)
    .select("id")
    .maybeSingle();
  if (claimError) {
    throw claimError;
  }
  if (!claimed) {
    await getVectorIndex().delete(inquiryId);
    return;
  }

  try {
    const text = buildInquiryEmbeddingText({
      projectBrief: inquiry.project_brief,
      designGoal: brief.design_goal,
      brandMessage: brief.brand_message,
      targetAudience: brief.target_audience,
      desiredOutcomes: brief.desired_outcomes,
    });
    if (!text.trim()) {
      throw new Error("Inquiry text is empty.");
    }

    const embedding = await createEmbedding(text);
    const vectorIndex = getVectorIndex();
    await vectorIndex.upsert({
      id: inquiryId,
      vector: embedding,
      metadata: { inquiry_id: inquiryId },
    });

    const results = await vectorIndex.query({
      vector: embedding,
      topK: MAX_MATCHES + 1,
      includeMetadata: true,
    });
    const matches = parseMatches(
      results
        .filter((result) => result.id !== inquiryId)
        .slice(0, MAX_MATCHES)
        .map((result) => ({
          inquiry_id: result.metadata?.inquiry_id,
          score: result.score,
        })),
    );

    const { data: stillOptedIn, error: consentError } = await service
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId)
      .eq("similarity_opt_in", true)
      .maybeSingle();
    if (consentError) {
      throw consentError;
    }
    if (!stillOptedIn) {
      await vectorIndex.delete(inquiryId);
      return;
    }

    const { error: saveError } = await service
      .from("inquiries")
      .update({ similarity_status: "ready", similarity_matches: matches })
      .eq("id", inquiryId)
      .eq("similarity_opt_in", true);
    if (saveError) {
      throw saveError;
    }
  } catch (error) {
    const { error: updateError } = await service
      .from("inquiries")
      .update({ similarity_status: "failed", similarity_matches: [] })
      .eq("id", inquiryId)
      .eq("similarity_opt_in", true);
    if (updateError) {
      console.error("Similarity processing failure status could not be saved.");
    }
    throw error;
  }
}

export async function disableInquirySimilarity(inquiryId: string) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("inquiries")
    .update({
      similarity_opt_in: false,
      similarity_status: "not_requested",
      similarity_matches: [],
    })
    .eq("id", inquiryId)
    .select("id")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Inquiry was not found while disabling similarity.");
  }

  await getVectorIndex().delete(inquiryId);
}

export async function deleteInquirySimilarityVectors(inquiryIds: string[]) {
  if (inquiryIds.length === 0) {
    return;
  }

  const vectorIndex = getVectorIndex();
  for (let index = 0; index < inquiryIds.length; index += 100) {
    await vectorIndex.delete(inquiryIds.slice(index, index + 100));
  }
}

export function readSimilarityMatches(value: unknown) {
  return parseMatches(value);
}
