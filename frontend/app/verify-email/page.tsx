"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resendVerification, verifyEmailToken } from "@/lib/auth-api";

function VerifyEmailPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [academyName, setAcademyName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    verifyEmailToken(token)
      .then((result) => {
        setAcademyName(result.academy?.academy_name || "");
        setState("success");
        window.setTimeout(() => router.replace("/"), 3000);
      })
      .catch(() => setState("error"));
  }, [router, token]);

  if (state === "loading") {
    return <AuthCard title="이메일 인증 중..." subtitle="잠시만 기다려주세요." />;
  }

  if (state === "success") {
    return (
      <AuthCard title="이메일 인증이 완료되었습니다!" subtitle={`Tena Forge에 오신 것을 환영합니다${academyName ? `, ${academyName}님` : ""}.`}>
        <Link href="/">
          <Button className="h-11 w-full">작업 공간으로 이동</Button>
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="인증 링크가 만료되었습니다" subtitle="새 인증 이메일을 받을 이메일 주소를 입력해주세요.">
      <div className="space-y-3">
        <Input type="email" className="h-11" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="이메일" />
        <Button className="h-11 w-full" onClick={() => email && resendVerification(email)}>새 인증 이메일 받기</Button>
        <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">로그인으로 돌아가기</Link>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCard title="이메일 인증 중..." subtitle="잠시만 기다려주세요." />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
