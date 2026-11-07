import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export default async function InquiryPage() {
  let prefill: { name: string; email: string; company: string } | undefined;

  try {
    const supabase = await createSupabaseSessionClient();
    const { data: userData } = await supabase.auth.getUser();

    if (userData.user) {
      const { data: profileData } = await supabase
        .from("client_profiles")
        .select("full_name, email, id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      const { data: companyData } = await supabase
        .from("client_companies")
        .select("company_name")
        .eq("client_id", profileData?.id ?? "")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      prefill = {
        name: profileData?.full_name ?? userData.user.user_metadata?.full_name ?? "",
        email: profileData?.email ?? userData.user.email ?? "",
        company: companyData?.company_name ?? userData.user.user_metadata?.company ?? "",
      };
    }
  } catch {
    prefill = undefined;
  }

  return (
    <section className="inquiry-layout">
      <aside className="inquiry-aside">
        <p className="eyebrow">A good place to begin</p>
        <h1 className="page-title">
          Tell us what you&apos;re <em>thinking.</em>
        </h1>
        <p className="page-description">
          A few details help us understand what you have in mind. We&apos;ll
          never ask you to share anything confidential here.
        </p>
        <p className="privacy-note">
          This is a fictional portfolio demo. Submissions are stored for testing
          and are not monitored as real business inquiries. Demo submissions
          should be deleted within 14 days.
        </p>
      </aside>
      <InquiryForm prefill={prefill} />
    </section>
  );
}
