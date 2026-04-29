"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase client for Client Components.
// Reuse a single instance per page to avoid multiple GoTrue listeners.
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!cached) {
    cached = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return cached;
}
