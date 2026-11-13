import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http/read-json";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

const SignInSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }

  const parsed = SignInSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address and password." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;
  try {
    supabase = await createSupabaseSessionClient();
  } catch {
    console.error("Supabase session client is unavailable.");
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 400 || error.status === 401) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Supabase sign-in is unavailable.");
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessLevel = data.user.app_metadata.access_level;
  if (accessLevel !== "studio_member" && accessLevel !== "deal_lead") {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Unprivileged Supabase session could not be cleared.");
    }

    return NextResponse.json(
      { error: "Private studio access is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Signed in.", accessLevel },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  let supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;
  try {
    supabase = await createSupabaseSessionClient();
  } catch {
    console.error("Supabase session client is unavailable.");
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Supabase sign-out failed.");
    return NextResponse.json(
      { error: "Sign-out could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Signed out." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
