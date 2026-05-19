import Link from "next/link";
import { Card } from "@/components/ui";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">← Tena Forge</Link>
      <Card className="mt-6">
        <h1 className="text-3xl font-bold text-white">서비스 이용약관</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
          <p>사용자는 업로드 파일에 대한 권리 또는 이용 허락을 보유해야 하며, 무단 복제·배포·판매 목적으로 서비스를 사용할 수 없습니다.</p>
          <p>Tena Forge는 자료의 정리, 변환, 아카이빙을 보조하는 도구이며 업로드 자료의 저작권 적법성은 사용자가 책임집니다.</p>
          <p>결제, 환불, 계정 정지, 데이터 삭제 요청, AI 처리 고지는 별도 정책과 관리자 검토 절차를 따릅니다.</p>
        </div>
      </Card>
    </main>
  );
}
