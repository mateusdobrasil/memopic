"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function recordConsent(version: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent");

  const { error } = await supabase.from("consents").insert({
    user_id: user.id,
    kind: "biometric",
    version,
    granted: true,
    ip,
    user_agent: userAgent,
  });
  if (error) throw error;
}
