import { CUSTOMER_SUPPORT_EMAIL, SERVICE_INFO } from "@/lib/legal";

const cancellationLimits = [
  "결제 후 서비스 이용이 이미 개시된 경우",
  "회원이 유료 기능, AI 사용량, 파일 업로드, 문항 추출, 자료 생성, 다운로드 등 유료 서비스를 실제로 사용한 경우",
  "회원의 요청에 따라 즉시 제공되는 디지털 콘텐츠 또는 온라인 서비스가 제공된 경우",
  "회사가 청약철회 제한 사실을 사전에 고지하고 회원의 동의를 받은 경우",
];

const sections = [
  {
    title: "1. 배송 안내",
    body: [
      "본 서비스는 디지털 서비스로서 실물 상품이 배송되지 않습니다. 결제 완료 후 즉시 또는 회사가 정한 절차에 따라 계정 내 서비스 이용 권한이 부여됩니다.",
    ],
  },
  {
    title: "2. 교환 안내",
    body: [
      "본 서비스는 디지털 콘텐츠 및 온라인 서비스의 특성상 상품의 교환은 제공되지 않습니다. 서비스 이용 중 오류 또는 장애가 발생한 경우 회사는 해당 문제를 확인한 후 서비스 복구, 이용 기간 조정, 환불 등 합리적인 조치를 취할 수 있습니다.",
    ],
  },
  {
    title: "3. 결제 취소 및 청약철회",
    body: [
      "회원은 결제일로부터 7일 이내에 결제 취소 또는 청약철회를 요청할 수 있습니다. 다만, 다음 각 호에 해당하는 경우에는 전자상거래 등에서의 소비자보호에 관한 법률 등 관련 법령에 따라 청약철회 및 환불이 제한될 수 있습니다.",
    ],
    list: cancellationLimits,
  },
  {
    title: "4. 환불 기준",
    body: [
      "서비스 이용 이력이 없고 결제일로부터 7일 이내에 환불을 요청한 경우 전액 환불을 원칙으로 합니다.",
      "서비스 이용이 개시되었거나 유료 기능을 일부 사용한 경우에는 사용한 기간, 사용량, 제공된 혜택, 결제수수료 등을 고려하여 환불 가능 여부 및 환불 금액을 산정할 수 있습니다.",
      "월간 구독 상품의 경우 이미 결제된 이용 기간에 대한 단순 변심 환불은 제한될 수 있으며, 구독 해지는 다음 결제일부터 적용됩니다.",
    ],
  },
  {
    title: "5. 구독 해지 및 자동결제 취소",
    body: [
      "회원은 다음 결제일 전까지 구독을 해지할 수 있습니다. 구독을 해지하면 다음 결제일부터 자동결제가 중단되며, 이미 결제된 이용 기간 동안에는 서비스를 계속 이용할 수 있습니다.",
      "단, 다음 결제일이 도래한 후 결제가 완료된 경우에는 해당 결제 건에 대한 환불 정책이 적용됩니다.",
    ],
  },
  {
    title: "6. 환불 처리 방법",
    body: [
      `환불 요청은 고객센터 이메일(${CUSTOMER_SUPPORT_EMAIL}) 또는 사이트 내 문의 기능을 통해 접수할 수 있습니다. 회사는 환불 가능 여부를 확인한 후 관련 법령 및 결제대행사 정책에 따라 환불을 처리합니다.`,
      "환불 처리 기간은 결제수단 및 결제대행사의 정책에 따라 달라질 수 있습니다.",
    ],
  },
  {
    title: "7. 회사 귀책 사유로 인한 환불",
    body: [
      "회사의 귀책 사유로 서비스 제공이 불가능하거나 중대한 장애가 발생하여 정상적인 서비스 이용이 어려운 경우, 회사는 이용자에게 서비스 복구, 이용 기간 연장, 결제 취소 또는 환불 등 합리적인 조치를 제공할 수 있습니다.",
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#07080d] px-4 py-12 text-slate-200 sm:px-6">
      <article className="mx-auto max-w-4xl rounded-[14px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-200">Policy</p>
          <h1 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">환불 및 취소 정책</h1>
          <p className="mt-5 text-sm leading-7 text-slate-300">
            본 서비스는 실물 상품이 아닌 온라인 기반 디지털 서비스 및 SaaS 상품입니다. 따라서 별도의 배송 절차는 없으며, 결제 완료 후 계정 활성화 또는 서비스 접근 권한 부여를 통해 서비스가 제공됩니다.
          </p>
          <dl className="mt-6 grid gap-3 rounded-[10px] border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-bold text-slate-500">서비스명</dt>
              <dd className="mt-1 font-semibold text-slate-200">{SERVICE_INFO.serviceName}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500">운영자</dt>
              <dd className="mt-1 font-semibold text-slate-200">{SERVICE_INFO.companyName}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500">시행일</dt>
              <dd className="mt-1 font-semibold text-slate-200">2026년 5월 25일</dd>
            </div>
          </dl>
        </header>

        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-[10px] border border-white/10 bg-black/[0.16] p-5">
              <h2 className="text-lg font-black text-white">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.list ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
