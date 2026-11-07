import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseSessionClient } from "../supabase/session";

export type DesignerAuthorization =
  | {
      authorized: true;
      supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;
      user: User;
    }
  | { authorized: false; response: NextResponse };

export async function requireDesigner(): Promise<DesignerAuthorization> {
  let supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;

  try {
    supabase = await createSupabaseSessionClient();
  } catch {
    console.error("Supabase session client is unavailable.");
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication service is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (
      error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.name === "AuthSessionMissingError"
    ) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Authentication is required." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }

    console.error("Supabase could not verify a designer session.");
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication service is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  if (!data.user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Authentication is required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  const accessLevel =
    data.user.app_metadata?.access_level ?? data.user.app_metadata?.role ?? null;

  if (accessLevel !== "designer" && accessLevel !== "studio_member") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Designer access is required." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  return { authorized: true, supabase, user: data.user };
}
