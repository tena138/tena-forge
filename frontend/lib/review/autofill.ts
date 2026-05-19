export type ReviewUnitMapEntry = {
  from_page?: number | null;
  to_page?: number | null;
  unit_name?: string | null;
  page_range?: string | null;
};

export type ReviewAutofillInput = {
  batchName?: string | null;
  problemText?: string | null;
  sourcePage?: number | null;
  unitMap?: ReviewUnitMapEntry[] | null;
  subjectCandidates?: string[] | null;
  unitCandidates?: string[] | null;
};

export type ReviewAutofillResult = {
  subject: string | null;
  unit: string | null;
  problem_type: string;
  auto_filled: {
    subject: boolean;
    unit: boolean;
    problem_type: boolean;
  };
};

function compact(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, "");
}

export function inferSubjectFromBatchName(batchName: string | null | undefined) {
  const name = compact(batchName);
  if (!name) return null;

  if (/확통|확률과통계/.test(name)) return "확률과 통계";
  if (/미적|미적분/.test(name)) return "미적분";
  if (/기벡|기하/.test(name)) return "기하";
  if (/수2|수학2|수학Ⅱ|수학II/i.test(name) && !/공통수학2|공수2/.test(name)) return "수학Ⅱ";
  if (/수1|수학1|수학Ⅰ|수학I/i.test(name) && !/공통수학1|공수1/.test(name)) return "수학Ⅰ";
  if (/공통수학1|공수1/.test(name)) return "공통수학1";
  if (/공통수학2|공수2/.test(name)) return "공통수학2";
  return null;
}

function rangeFromEntry(entry: ReviewUnitMapEntry) {
  if (typeof entry.from_page === "number") {
    const toPage = typeof entry.to_page === "number" ? entry.to_page : entry.from_page;
    return { from: Math.min(entry.from_page, toPage), to: Math.max(entry.from_page, toPage) };
  }
  const text = entry.page_range || "";
  const match = text.match(/(\d+)\s*(?:-|~|–|—|부터|to)?\s*(\d+)?/);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2] || match[1]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

export function inferUnitFromPage(sourcePage: number | null | undefined, unitMap: ReviewUnitMapEntry[] | null | undefined) {
  if (!sourcePage || !unitMap?.length) return null;
  for (const entry of unitMap) {
    const range = rangeFromEntry(entry);
    if (!range || !entry.unit_name) continue;
    if (sourcePage >= range.from && sourcePage <= range.to) return entry.unit_name;
  }
  return null;
}

export function inferProblemType(problemText: string | null | undefined) {
  const text = problemText || "";
  if (/보기/.test(text) && /(①|ㄱ\.)/.test(text)) return "객관식·합답형";
  if (/옳은 것|옳지 않은 것|다음 중/.test(text)) return "객관식·5지선다";
  if (/참\s*거짓|옳다[\s\S]*그르다/.test(text)) return "진위형";
  if (/값을 구하시오|구하여라|구하시오/.test(text)) return "주관식·답안형";
  if (/증명하시오|보여라/.test(text)) return "서술형·증명";
  return "주관식·답안형";
}

export function inferReviewAutofill(input: ReviewAutofillInput): ReviewAutofillResult {
  const subject = input.subjectCandidates?.length === 1 ? input.subjectCandidates[0] : inferSubjectFromBatchName(input.batchName);
  const unit = inferUnitFromPage(input.sourcePage, input.unitMap) || (input.unitCandidates?.length === 1 ? input.unitCandidates[0] : null);
  const problemType = inferProblemType(input.problemText);

  return {
    subject,
    unit,
    problem_type: problemType,
    auto_filled: {
      subject: Boolean(subject),
      unit: Boolean(unit),
      problem_type: Boolean(problemType),
    },
  };
}
