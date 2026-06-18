import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

const cards = [
  ["사용자", "/admin/users", "계정, 역할, 정지 상태"],
  ["작업", "/admin/jobs", "큐 상태와 실패 작업"],
  ["오류", "/admin/errors", "서버 및 워커 오류 로그"],
  ["구독", "/admin/subscriptions", "플랜과 결제 상태"],
  ["사용량", "/admin/usage", "월간 페이지, 토큰, 비용"]
];

export default function AdminPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="운영 콘솔" description="관리자 권한 계정만 접근 가능한 시스템 운영 화면입니다.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(([title, href, body]) => (
            <Card key={title}>
              <Badge tone="violet">admin</Badge>
              <h2 className="mt-4 text-xl font-bold text-white">{title}</h2>
              <p className="mt-2 text-sm text-neutral-400">{body}</p>
              <Button href={href} className="mt-5" variant="secondary">열기</Button>
            </Card>
          ))}
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
