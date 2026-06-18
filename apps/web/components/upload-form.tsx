"use client";

import { useMemo, useState } from "react";

const sourceTypes = [
  ["self_created", "직접 제작한 자료"],
  ["academy_internal", "우리 학원 내부 자료"],
  ["licensed", "이용 허락을 받은 자료"],
  ["public_domain_or_open", "공개 이용 가능한 자료"],
  ["personal_study_only", "개인 학습용 자료"],
  ["unknown", "기타 / 출처 확인 필요"]
];

export function UploadForm() {
  const [sourceType, setSourceType] = useState("self_created");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [fileName, setFileName] = useState("");
  const restricted = useMemo(() => ["personal_study_only", "unknown"].includes(sourceType), [sourceType]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="forge-panel rounded-[12px] p-5">
        <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-white/15 bg-white/[0.035] p-8 text-center transition hover:border-white/35 hover:bg-white/[0.075]">
          <input
            className="hidden"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
          />
          <span className="text-lg font-bold text-white">PDF 또는 이미지를 업로드하세요</span>
          <span className="mt-2 text-sm text-neutral-400">PDF, PNG, JPG, JPEG. 플랜별 파일 크기 제한이 적용됩니다.</span>
          {fileName && <span className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-neutral-200">{fileName}</span>}
        </label>
      </div>
      <div className="space-y-5">
        <div className="forge-panel rounded-[12px] p-5">
          <h2 className="text-base font-bold text-white">출처 및 권리 확인</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">업로드하는 자료는 본인이 권리를 보유하거나 이용 권한을 가진 자료여야 합니다. 무단 복제, 배포, 판매 목적의 이용은 금지됩니다.</p>
          <div className="mt-4 space-y-2">
            {sourceTypes.map(([value, label]) => (
              <label key={value} className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.06]">
                <input className="accent-white" type="radio" name="source_type" value={value} checked={sourceType === value} onChange={() => setSourceType(value)} />
                {label}
              </label>
            ))}
          </div>
          {restricted && <p className="forge-notice mt-3 rounded-[8px] p-3 text-sm">이 출처 유형은 공개 공유 또는 마켓플레이스 등록이 제한됩니다.</p>}
          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-neutral-300">
            <input className="mt-1 accent-white" type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            본인은 이 자료를 직접 제작했거나, Tena Forge에서 업로드·추출·저장·재구성·출력할 권리를 보유하고 있음을 확인합니다.
          </label>
        </div>
        <button disabled={!fileName || !rightsConfirmed} className="h-11 w-full rounded-[8px] border border-white/80 bg-white text-sm font-bold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.08] disabled:text-neutral-500">
          아카이빙 작업 생성
        </button>
      </div>
    </div>
  );
}
