"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Eye, EyeOff, GraduationCap } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { AuthCard, FieldError, FullWidthButton } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/input";
import { checkLoginIdAvailability, checkProfileNameAvailability, completeSocialSignup, updateMe } from "@/lib/auth-api";
import { workspaceHome } from "@/lib/auth-redirect";

const loginIdPattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
const profileNamePattern = /^[a-z0-9][a-z0-9_]{2,31}$/;

const schema = z
  .object({
    login_id: z
      .string()
      .min(3, "아이디는 3자 이상이어야 합니다.")
      .max(32, "아이디는 32자 이하여야 합니다.")
      .regex(loginIdPattern, "영문 소문자, 숫자, ., _, -만 사용할 수 있습니다."),
    nickname: z.string().min(2, "닉네임을 입력해 주세요.").max(80, "닉네임은 80자 이하여야 합니다."),
    profile_name: z
      .string()
      .min(3, "공개 프로필 이름은 3자 이상이어야 합니다.")
      .max(32, "공개 프로필 이름은 32자 이하여야 합니다.")
      .regex(profileNamePattern, "영문 소문자, 숫자, _만 사용할 수 있습니다."),
    password: z.string().min(8, "8자 이상 입력해 주세요."),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해 주세요."),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "비밀번호가 일치하지 않습니다." });
    }
  });

type CompleteForm = z.infer<typeof schema>;
type AccountType = "academy" | "student";
type NameStatus = "idle" | "checking" | "available" | "taken" | "error";

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function normalizeProfileName(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function profileNameFromNickname(value: string) {
  return normalizeProfileName(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function detailMessage(error: any, fallback: string) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join("\n") || fallback;
  if (detail && typeof detail === "object") return detail.message || detail.code || fallback;
  return typeof detail === "string" ? detail : fallback;
}

function RegisterCompleteContent() {
  const [signupToken, setSignupToken] = useState("");
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [readyForSetup, setReadyForSetup] = useState(false);
  const [loginIdStatus, setLoginIdStatus] = useState<NameStatus>("idle");
  const [profileNameStatus, setProfileNameStatus] = useState<NameStatus>("idle");
  const [setupSaving, setSetupSaving] = useState<AccountType | null>(null);
  const [setupError, setSetupError] = useState("");
  const form = useForm<CompleteForm>({
    resolver: zodResolver(schema),
    defaultValues: { login_id: "", nickname: "", profile_name: "", password: "", confirmPassword: "" },
  });
  const loginId = useWatch({ control: form.control, name: "login_id" });
  const profileName = useWatch({ control: form.control, name: "profile_name" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("signup_token") || "";
    const nickname = params.get("nickname") || "";
    setSignupToken(token);
    if (nickname) {
      form.setValue("nickname", nickname.slice(0, 80), { shouldValidate: true });
      const suggestedProfileName = profileNameFromNickname(nickname);
      if (suggestedProfileName.length >= 3) {
        form.setValue("profile_name", suggestedProfileName, { shouldValidate: true });
      }
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [form]);

  useEffect(() => {
    const normalized = normalizeLoginId(loginId || "");
    if (normalized !== loginId) {
      form.setValue("login_id", normalized, { shouldValidate: true });
      return;
    }
    if (!normalized || !loginIdPattern.test(normalized)) {
      setLoginIdStatus("idle");
      return;
    }
    setLoginIdStatus("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkLoginIdAvailability(normalized);
        if (!cancelled) setLoginIdStatus(result.valid && result.available ? "available" : "taken");
      } catch {
        if (!cancelled) setLoginIdStatus("error");
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form, loginId]);

  useEffect(() => {
    const normalized = normalizeProfileName(profileName || "");
    if (normalized !== profileName) {
      form.setValue("profile_name", normalized, { shouldValidate: true });
      return;
    }
    if (!normalized || !profileNamePattern.test(normalized)) {
      setProfileNameStatus("idle");
      return;
    }
    setProfileNameStatus("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkProfileNameAvailability(normalized);
        if (!cancelled) setProfileNameStatus(result.valid && result.available ? "available" : "taken");
      } catch {
        if (!cancelled) setProfileNameStatus("error");
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form, profileName]);

  async function submit(values: CompleteForm) {
    setServerError("");
    if (loginIdStatus === "taken") {
      setServerError("이미 사용 중인 아이디입니다.");
      return;
    }
    if (loginIdStatus === "checking") {
      setServerError("아이디 중복 확인 중입니다.");
      return;
    }
    if (profileNameStatus === "taken") {
      setServerError("이미 사용 중인 공개 프로필 이름입니다.");
      return;
    }
    if (profileNameStatus === "checking") {
      setServerError("공개 프로필 이름 중복 확인 중입니다.");
      return;
    }
    if (!signupToken) {
      setServerError("소셜 인증이 만료되었습니다. 회원가입을 다시 시작해 주세요.");
      return;
    }
    try {
      await completeSocialSignup({
        signup_token: signupToken,
        login_id: normalizeLoginId(values.login_id),
        nickname: values.nickname.trim(),
        profile_name: normalizeProfileName(values.profile_name),
        password: values.password,
      });
      setReadyForSetup(true);
    } catch (error: any) {
      setServerError(detailMessage(error, "회원가입에 실패했습니다."));
    }
  }

  async function finishSetup(accountType: AccountType) {
    if (setupSaving) return;
    setSetupSaving(accountType);
    setSetupError("");
    try {
      const profile = await updateMe({ account_type: accountType });
      const destination = workspaceHome(profile.account_type || accountType);
      window.location.assign(destination);
    } catch (error: any) {
      setSetupError(detailMessage(error, "시작 공간을 저장하지 못했습니다. 다시 선택해 주세요."));
      setSetupSaving(null);
    }
  }

  return (
    <>
      <AuthCard title="계정 만들기" subtitle="로그인 아이디와 공개 프로필 이름을 분리해서 만듭니다. 공개 프로필 이름은 초대에 사용됩니다.">
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <label className="block text-sm font-semibold text-zinc-800">
            로그인 아이디
            <Input autoComplete="username" className="mt-1.5 h-11" {...form.register("login_id")} />
            <FieldError message={form.formState.errors.login_id?.message} />
            <NameStatusMessage status={loginIdStatus} kind="login" />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            표시 이름
            <Input autoComplete="nickname" className="mt-1.5 h-11" {...form.register("nickname")} />
            <FieldError message={form.formState.errors.nickname?.message} />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            공개 프로필 이름
            <div className="mt-1.5 flex h-11 items-center rounded-md bg-zinc-100 px-3 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-black/10">
              <span className="text-sm font-bold text-zinc-500">@</span>
              <input
                autoComplete="off"
                className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold text-zinc-950 outline-none"
                {...form.register("profile_name")}
              />
            </div>
            <FieldError message={form.formState.errors.profile_name?.message} />
            <NameStatusMessage status={profileNameStatus} kind="profile" />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            비밀번호
            <div className="relative mt-1.5">
              <Input type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-11 pr-11" {...form.register("password")} />
              <button type="button" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <FieldError message={form.formState.errors.password?.message} />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            비밀번호 확인
            <Input type="password" autoComplete="new-password" className="mt-1.5 h-11" {...form.register("confirmPassword")} />
            <FieldError message={form.formState.errors.confirmPassword?.message} />
          </label>
          {serverError ? <p className="whitespace-pre-line rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-800">{serverError}</p> : null}
          <FullWidthButton loading={form.formState.isSubmitting} disabled={loginIdStatus === "checking" || loginIdStatus === "taken" || profileNameStatus === "checking" || profileNameStatus === "taken"}>
            회원가입 완료
          </FullWidthButton>
        </form>
      </AuthCard>

      {readyForSetup ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 text-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <h2 className="text-xl font-bold">시작할 공간을 선택하세요</h2>
            <div className="mt-5 grid gap-2">
              <SetupButton
                icon={<Building2 className="h-4 w-4" />}
                title="학원 / 연구소 / 과외 교습소"
                detail={setupSaving === "academy" ? "저장 중..." : "운영 콘솔로 시작"}
                disabled={Boolean(setupSaving)}
                onClick={() => finishSetup("academy")}
              />
              <SetupButton
                icon={<GraduationCap className="h-4 w-4" />}
                title="학생 / 학부모"
                detail={setupSaving === "student" ? "저장 중..." : "학생 학습 공간으로 이동"}
                disabled={Boolean(setupSaving)}
                onClick={() => finishSetup("student")}
              />
            </div>
            {setupError ? <p className="mt-4 rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800">{setupError}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function NameStatusMessage({ status, kind }: { status: NameStatus; kind: "login" | "profile" }) {
  if (status === "idle") return null;
  const styles: Record<NameStatus, string> = {
    idle: "",
    checking: "text-zinc-500",
    available: "text-zinc-800",
    taken: "text-zinc-800",
    error: "text-zinc-800",
  };
  const messages: Record<"login" | "profile", Record<NameStatus, string>> = {
    login: {
      idle: "",
      checking: "확인 중...",
      available: "사용 가능한 아이디입니다.",
      taken: "이미 사용 중인 아이디입니다.",
      error: "중복 확인에 실패했습니다.",
    },
    profile: {
      idle: "",
      checking: "확인 중...",
      available: "사용 가능한 공개 프로필 이름입니다.",
      taken: "이미 사용 중인 공개 프로필 이름입니다.",
      error: "중복 확인에 실패했습니다.",
    },
  };
  return <p className={`mt-1.5 text-xs font-semibold ${styles[status]}`}>{messages[kind][status]}</p>;
}

function SetupButton({ icon, title, detail, disabled, onClick }: { icon: ReactNode; title: string; detail: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-lg bg-zinc-100 p-3 text-left text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-black text-white">{icon}</span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{detail}</span>
      </span>
    </button>
  );
}

export default function RegisterCompletePage() {
  return (
    <Suspense fallback={<AuthCard title="회원가입 준비 중..." />}>
      <RegisterCompleteContent />
    </Suspense>
  );
}
