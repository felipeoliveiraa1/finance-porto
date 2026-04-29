import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require authentication.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

// API routes that authenticate by themselves (e.g. webhooks signed with a shared secret).
const PUBLIC_API_PREFIXES = ["/api/webhooks/"];

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // Webhook endpoints handle their own auth — never gate them.
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If Supabase env vars aren't set yet (local dev), skip auth so the app
  // still boots. In production both are required.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not place any logic between createServerClient and getUser.
  // getUser refreshes tokens and writes new cookies — anything in between can
  // skip the refresh and end up with stale auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/login";
    // Wipe any inherited query params before composing the redirect — only `next` should carry over.
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname + (url.search || ""));
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user hitting /login → bounce them to home.
  if (user && pathname === "/login") {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
