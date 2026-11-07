import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http/read-json";
import type { Database } from "@/lib/supabase/database.types";

const SignInSchema = z
  .object({
    action: z.enum(["sign-in", "sign-up"]).optional().default("sign-in"),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

const SignUpSchema = z
  .object({
    action: z.enum(["sign-in", "sign-up"]).optional().default("sign-up"),
    full_name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    company: z.string().trim().max(120).optional().default(""),
    password: z.string().min(8).max(128),
  })
  .strict();

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }

  const value = body.value;
  const action =
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    value.action === "sign-up"
      ? "sign-up"
      : "sign-in";

  if (action === "sign-up") {
    const parsed = SignUpSchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter your name, a valid email, and a password." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let supabase: Awaited<ReturnType<typeof import("@/lib/supabase/session").createSupabaseSessionClient>>;
    try {
      const { createSupabaseSessionClient } = await import("@/lib/supabase/session");
      supabase = await createSupabaseSessionClient();
    } catch {
      console.error("Supabase session client is unavailable.");
      return NextResponse.json(
        { error: "Authentication service is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.full_name,
          company: parsed.data.company?.trim() || "",
          access_level: "client",
        },
      },
    });

    if (error) {
      console.error("Client sign-up failed.", error.message);
      return NextResponse.json(
        { error: "We could not create your account. Please try again." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (data.user) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (url && serviceRoleKey) {
        const adminClient = createClient<Database>(url, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        });

        const profile = {
          user_id: data.user.id,
          full_name: parsed.data.full_name.trim(),
          email: parsed.data.email.toLowerCase(),
        };

        const { data: profileRecord, error: profileError } = await adminClient
          .from("client_profiles")
          .upsert(profile, { onConflict: "user_id" })
          .select("id")
          .single();

        if (profileError) {
          console.error("Client profile could not be saved.", profileError.message);
        } else if (parsed.data.company?.trim()) {
          const companyName = parsed.data.company.trim();
          const { error: companyError } = await adminClient
            .from("client_companies")
            .upsert(
              {
                client_id: profileRecord.id,
                company_name: companyName,
                is_primary: true,
              },
              { onConflict: "client_id,company_name" },
            );

          if (companyError) {
            console.error("Client company could not be saved.", companyError.message);
          }
        }
      }
    }

    if (data.user && data.session) {
      return NextResponse.json(
        { message: "Your account is ready." },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { message: "Check your email to confirm your client account." },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = SignInSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address and password." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase/session").createSupabaseSessionClient>>;
  try {
    const { createSupabaseSessionClient } = await import("@/lib/supabase/session");
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

  const accessLevel =
    data.user.app_metadata?.access_level ?? data.user.app_metadata?.role ?? null;

  if (accessLevel !== "client" && accessLevel !== "client_account") {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Unprivileged client session could not be cleared.");
    }

    return NextResponse.json(
      { error: "Client access is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Signed in." },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase/session").createSupabaseSessionClient>>;
  try {
    const { createSupabaseSessionClient } = await import("@/lib/supabase/session");
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
