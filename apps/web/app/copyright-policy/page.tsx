import Link from "next/link";
import { Card } from "@/components/ui";

export default function CopyrightPolicyPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Tena Forge</Link>
      <Card className="mt-6">
        <h1 className="text-3xl font-bold text-white">저작권 및 업로드 정책</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-neutral-300">
          <p>업로드하는 자료는 본인이 권리를 보유하거나 이용 권한을 가진 자료여야 합니다.</p>
          <p>시중 교재, 인강 교재, 타 학원 자료, 유료 문제집, 해설, 이미지, 도표 등을 권한 없이 업로드하거나 문항화해 사용하는 것은 제한됩니다.</p>
          <p>권리 침해 신고가 접수되면 Tena Forge는 해당 자료의 처리, 출력, 공유, 계정 이용을 제한하고 필요한 경우 감사 로그를 보존합니다.</p>
        </div>
      </Card>
    </main>
  );
}
