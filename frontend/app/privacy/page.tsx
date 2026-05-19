export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 rounded-[14px] border border-white/10 bg-white/[0.045] p-8 text-sm leading-7 text-slate-300">
      <h1 className="text-3xl font-bold text-white">개인정보 처리방침</h1>
      <p>서비스 제공을 위해 계정 정보, 업로드 파일 메타데이터, 처리 작업 기록, 결제 및 정산 관련 정보를 수집할 수 있습니다.</p>
      <p>업로드 파일은 기본적으로 비공개 저장소에 보관되며, 다운로드는 만료되는 서명 URL을 통해 제공됩니다.</p>
      <p>결제 카드 원문 정보는 직접 저장하지 않으며, 실제 결제 연동 시 Toss Payments, PortOne 등 외부 결제 사업자의 안전한 처리 흐름을 사용합니다.</p>
    </main>
  );
}
