import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export function createSlackServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Slack persistence is not configured.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function callSlackApi<T>(
  token: string,
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload ?? {}),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Slack API returned HTTP ${response.status}.`);
  }
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    const error =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "unknown_error";
    throw new Error(`Slack API request failed: ${error}.`);
  }
  return result as T;
}

export function safeSlackError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Slack synchronization failed.";
  return message.slice(0, 400);
}

export function getSlackRedirectUri(): string {
  const value = process.env.SLACK_REDIRECT_URI;
  if (!value) throw new Error("SLACK_REDIRECT_URI is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("SLACK_REDIRECT_URI must use HTTPS outside local development.");
  }
  return url.toString();
}

export function getSlackClientCredentials() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Slack OAuth client credentials are not configured.");
  }
  return { clientId, clientSecret };
}
