"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isDevFallbackAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.TENA_DEV_AUTH_FALLBACK !== "false";
}

function setSessionCookies(accessToken: string, refreshToken: string) {
  const cookieStore = cookies();
  cookieStore.set("sb-access-token", accessToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  cookieStore.set("sb-refresh-token", refreshToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

function setDevSession(email: string) {
  const safeEmail = email || "local@tenaforge.dev";
  setSessionCookies(`dev-access:${safeEmail}:${Date.now()}`, `dev-refresh:${safeEmail}:${Date.now()}`);
}

export async function loginAction(formData: FormData) {
  const supabase = authClient();
  const redirectTo = String(formData.get("redirect") || "/dashboard");
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  if (!supabase) {
    if (isDevFallbackAllowed()) {
      setDevSession(email);
      redirect(redirectTo);
    }
    redirect("/login?error=missing_env");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    redirect(`/login?error=${encodeURIComponent(error?.message || "login_failed")}`);
  }

  setSessionCookies(data.session.access_token, data.session.refresh_token);
  redirect(redirectTo);
}

export async function signupAction(formData: FormData) {
  const supabase = authClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

  if (!supabase) {
    if (isDevFallbackAllowed()) {
      redirect(`/login?message=${encodeURIComponent("Supabase가 연결되지 않아 개발 모드 로그인을 사용합니다. 아무 이메일과 비밀번호로 로그인하세요.")}`);
    }
    redirect("/signup?message=missing_env");
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl}/dashboard`, data: { full_name: name } }
  });

  if (error) redirect(`/signup?message=${encodeURIComponent(error.message)}`);
  redirect(`/signup?message=${encodeURIComponent("가입 확인 이메일을 발송했습니다. 메일함을 확인해주세요.")}`);
}

export async function forgotPasswordAction(formData: FormData) {
  const supabase = authClient();
  const email = String(formData.get("email") || "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

  if (supabase && email) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/settings/security` });
  }

  redirect(`/forgot-password?message=${encodeURIComponent("재설정 안내 메일을 발송했습니다. 계정 존재 여부와 관계없이 동일하게 안내됩니다.")}`);
}
