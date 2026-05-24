"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Eye, EyeOff, GraduationCap } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { AuthCard, FieldError, FullWidthButton } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/input";
import { checkLoginIdAvailability, completeSocialSignup, updateMe } from "@/lib/auth-api";
import { workspaceHome } from "@/lib/auth-redirect";

const schema = z
  .object({
    login_id: z
      .string()
      .min(3, "아이디는 3자 이상이어야 합니다.")
      .max(32, "아이디는 32자 이하여야 합니다.")
      .regex(/^[a-z0-9][a-z0-9_.-]*$/, "영문 소문자, 숫자, ., _, - 만 사용할 수 있습니다."),
    nickname: z.string().min(2, "닉네임을 입력해주세요.").max(80, "닉네임은 80자 이하여야 합니다."),
    password: z.string().min(8, "8자 이상 입력해주세요."),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해주세요."),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "비밀번호가 일치하지 않습니다." });
    }
  });

type CompleteForm = z.infer<typeof schema>;
type AccountType = "academy" | "student";
type LoginIdStatus = "idle" | "checking" | "available" | "taken" | "error";
const loginIdPattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

function RegisterCompleteContent() {
  const router = useRouter();
  const [signupToken, setSignupToken] = useState("");
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [readyForSetup, setReadyForSetup] = useState(false);
  const [loginIdStatus, setLoginIdStatus] = useState<LoginIdStatus>("idle");
  const form = useForm<CompleteForm>({
    resolver: zodResolver(schema),
    defaultValues: { login_id: "", nickname: "", password: "", confirmPassword: "" },
  });
  const loginId = useWatch({ control: form.control, name: "login_id" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("signup_token") || "";
    const nickname = params.get("nickname") || "";
    setSignupToken(token);
    if (nickname) form.setValue("nickname", nickname.slice(0, 80), { shouldValidate: true });
    window.history.replaceState(null, "", window.location.pathname);
  }, [form]);

  useEffect(() => {
    const normalized = (loginId || "").trim().toLowerCase();
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
  }, [loginId]);

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
    if (!signupToken) {
      setServerError("소셜 인증이 만료되었습니다. 회원가입을 다시 시작해주세요.");
      return;
    }
    try {
      await completeSocialSignup({
        signup_token: signupToken,
        login_id: values.login_id,
        nickname: values.nickname,
        password: values.password,
      });
      setReadyForSetup(true);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) setServerError(detail.map((item) => item?.msg).filter(Boolean).join("\n") || "회원가입에 실패했습니다.");
      else setServerError(typeof detail === "string" ? detail : "회원가입에 실패했습니다.");
    }
  }

  async function finishSetup(accountType: AccountType) {
    const profile = await updateMe({ account_type: accountType });
    router.replace(workspaceHome(profile.account_type));
  }

  return (
    <>
      <AuthCard title="계정 만들기" subtitle="다음 로그인부터는 아이디/비밀번호 또는 소셜 로그인 중 편한 방식을 사용할 수 있습니다.">
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <label className="block text-sm font-semibold text-slate-200">
            아이디
            <Input autoComplete="username" className="mt-1.5 h-11" {...form.register("login_id")} />
            <FieldError message={form.formState.errors.login_id?.message} />
            <LoginIdStatusMessage status={loginIdStatus} />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            닉네임
            <Input autoComplete="nickname" className="mt-1.5 h-11" {...form.register("nickname")} />
            <FieldError message={form.formState.errors.nickname?.message} />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            비밀번호
            <div className="relative mt-1.5">
              <Input type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-11 pr-11" {...form.register("password")} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <FieldError message={form.formState.errors.password?.message} />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            비밀번호 확인
            <Input type="password" autoComplete="new-password" className="mt-1.5 h-11" {...form.register("confirmPassword")} />
            <FieldError message={form.formState.errors.confirmPassword?.message} />
          </label>
          {serverError ? <p className="whitespace-pre-line rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p> : null}
          <FullWidthButton loading={form.formState.isSubmitting} disabled={loginIdStatus === "checking" || loginIdStatus === "taken"}>
            회원가입 완료
          </FullWidthButton>
        </form>
      </AuthCard>

      {readyForSetup ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#090b12] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-bold">시작할 공간을 선택하세요</h2>
            <div className="mt-5 grid gap-2">
              <SetupButton icon={<Building2 className="h-4 w-4" />} title="학원 / 연구실 / 과외 교습자" detail="Basic 7일 무료 체험 시작" onClick={() => finishSetup("academy")} />
              <SetupButton icon={<GraduationCap className="h-4 w-4" />} title="학생 / 학부모" detail="학생용 학습 공간으로 이동" onClick={() => finishSetup("student")} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LoginIdStatusMessage({ status }: { status: LoginIdStatus }) {
  if (status === "idle") return null;
  const styles: Record<LoginIdStatus, string> = {
    idle: "",
    checking: "text-slate-400",
    available: "text-emerald-300",
    taken: "text-red-300",
    error: "text-amber-300",
  };
  const messages: Record<LoginIdStatus, string> = {
    idle: "",
    checking: "확인 중...",
    available: "사용 가능한 아이디입니다.",
    taken: "이미 사용 중인 아이디입니다.",
    error: "중복 확인에 실패했습니다.",
  };
  return <p className={`mt-1.5 text-xs font-semibold ${styles[status]}`}>{messages[status]}</p>;
}

function SetupButton({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-violet-300/50 hover:bg-violet-500/12" onClick={onClick}>
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-400 text-white">{icon}</span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{detail}</span>
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
