import Link from "next/link";
import { Card } from "@/components/ui";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Tena Forge</Link>
      <Card className="mt-6">
        <h1 className="text-3xl font-bold text-white">개인정보 처리방침</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-neutral-300">
          <p>계정 정보, 워크스페이스 정보, 업로드 파일 메타데이터, 결제 상태, 사용량 로그, 오류 로그를 서비스 제공과 보안 목적으로 처리합니다.</p>
          <p>업로드 파일은 Supabase Storage에 저장되며 AI 처리, PDF 렌더링, 사용량 산정 과정에서 지정된 처리자에게 전달될 수 있습니다.</p>
          <p>사용자는 데이터 삭제 요청을 할 수 있으며, 법령 또는 결제·보안 감사에 필요한 항목은 정해진 기간 동안 보관됩니다.</p>
        </div>
      </Card>
    </main>
  );
}
