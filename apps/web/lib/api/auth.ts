import { NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

export async function requireUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : undefined;
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const supabase = createAnonClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return { user: data.user, accessToken: token, supabase };
}
