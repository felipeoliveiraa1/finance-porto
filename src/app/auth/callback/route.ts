import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reserved for future OAuth / magic-link flows. With email+password login the
// session is established directly by signInWithPassword and this route is
// unused — keeping it scaffolded so it's available when we add Google/magic.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}
