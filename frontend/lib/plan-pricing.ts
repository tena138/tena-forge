export type PlanType = "free" | "basic" | "pro" | "enterprise";
export type PaidPlanType = "basic" | "pro";
export type BillingCycle = "monthly" | "annual";
export type PackageGroup = "ai" | "storage" | "student" | "processing";
export type SubjectEngineCode = "math" | "korean";

export type PlanSpecs = {
  monthlyAiCredits: number | "custom";
  dailyAiLimit: number | "custom";
  problemDb: number | "custom";
  fileStorageGb: number | "custom";
  studentKeys: number | "custom";
  cloudProcessing: boolean | "custom";
  processingSpeed: "Standard" | "Fast" | "Custom";
  concurrentJobs: number | "custom";
  concurrentPdfExtractions: number | "custom" | false;
  marketplace: boolean | "custom";
};

export type PlanConfig = {
  id: PlanType;
  name: string;
  audience: string;
  positioning: string;
  baseMonthlyPrice: number;
  cta: string;
  specs: PlanSpecs;
  cardSpecs: string[];
};

export type PackageOption = {
  id: string;
  group: PackageGroup;
  name: string;
  label: string;
  monthlyPriceDelta: number;
  specs: Partial<PlanSpecs>;
  description: string;
};

export type SelectedPackageIds = Partial<Record<PackageGroup, string>>;

export const BILLING = {
  annualDiscountPercent: 20,
} as const;

export const STUDENT_KEY_MONTHLY_ADDON = 8_000;

export const SUBJECT_ENGINES: Array<{
  code: SubjectEngineCode;
  label: string;
  version: string;
  description: string;
}> = [
  {
    code: "math",
    label: "수학",
    version: "1.0",
    description: "수식, 객관식, 정답, 해설을 수학 문항 구조로 추출합니다.",
  },
  {
    code: "korean",
    label: "국어",
    version: "beta",
    description: "긴 지문, 공통 지문 묶음, 선택지를 국어형 구조로 추출합니다.",
  },
];

export const PLANS: Record<PlanType, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    audience: "무료 시작 플랜",
    positioning: "PDF 추출과 AI 정리를 먼저 체험해보는 무료 시작 플랜",
    baseMonthlyPrice: 0,
    cta: "무료로 시작하기",
    specs: {
      monthlyAiCredits: 30,
      dailyAiLimit: 5,
      problemDb: 100,
      fileStorageGb: 0.3,
      studentKeys: 0,
      cloudProcessing: true,
      processingSpeed: "Standard",
      concurrentJobs: 1,
      concurrentPdfExtractions: false,
      marketplace: false,
    },
    cardSpecs: [
      "학생 키 0개",
      "월 AI 30 credits",
      "일 AI 한도 5 credits",
      "문제 DB 100문항",
      "파일 저장공간 300MB",
      "PDF 추출 가능, AI credits 차감",
    ],
  },
  basic: {
    id: "basic",
    name: "Basic",
    audience: "개인 과외 교습자",
    positioning: "개인 과외 교습자를 위한 실사용 플랜",
    baseMonthlyPrice: 48_000,
    cta: "Basic 구성하기",
    specs: {
      monthlyAiCredits: 400,
      dailyAiLimit: 50,
      problemDb: 5_000,
      fileStorageGb: 20,
      studentKeys: 5,
      cloudProcessing: true,
      processingSpeed: "Standard",
      concurrentJobs: 1,
      concurrentPdfExtractions: false,
      marketplace: false,
    },
    cardSpecs: [
      "학생 키 기본 제공",
      "PDF 추출 가능, AI credits 차감",
      "개인 문제 DB",
      "학생별 과제 배포 가능",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    audience: "전문 교습자, 학원, 콘텐츠팀",
    positioning: "전문 교습자, 학원, 콘텐츠팀을 위한 고사양 플랜",
    baseMonthlyPrice: 108_000,
    cta: "Pro 구성하기",
    specs: {
      monthlyAiCredits: 923,
      dailyAiLimit: 150,
      problemDb: 30_000,
      fileStorageGb: 100,
      studentKeys: 10,
      cloudProcessing: true,
      processingSpeed: "Fast",
      concurrentJobs: 3,
      concurrentPdfExtractions: 3,
      marketplace: true,
    },
    cardSpecs: [
      "대량 AI credits",
      "대용량 문제 DB",
      "학생 키 대량 운영",
      "여러 PDF 동시 추출 가능",
      "마켓플레이스 사용 가능",
      "저작권 자료 전산화 판매 가능",
      "문항 공모 참여 가능",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    audience: "대형 학원, 출판사, 기관",
    positioning: "AI 사용량, 문제 DB, 저장공간, 학생 키, 처리 구조를 맞춤 설계합니다.",
    baseMonthlyPrice: 0,
    cta: "도입 문의하기",
    specs: {
      monthlyAiCredits: "custom",
      dailyAiLimit: "custom",
      problemDb: "custom",
      fileStorageGb: "custom",
      studentKeys: "custom",
      cloudProcessing: "custom",
      processingSpeed: "Custom",
      concurrentJobs: "custom",
      concurrentPdfExtractions: "custom",
      marketplace: "custom",
    },
    cardSpecs: [],
  },
};

function createStudentKeyOptions(plan: PaidPlanType, includedKeys: number, maxKeys: number): PackageOption[] {
  const planLabel = plan === "basic" ? "Basic" : "Pro";
  return Array.from({ length: maxKeys - includedKeys + 1 }, (_, index) => includedKeys + index).map((studentKeys) => {
    const monthlyPriceDelta = (studentKeys - includedKeys) * STUDENT_KEY_MONTHLY_ADDON;
    return {
      id: studentKeys === includedKeys ? `${plan}-student` : `${plan}-student-${studentKeys}`,
      group: "student" as const,
      name: `${planLabel} Student ${studentKeys}`,
      label: monthlyPriceDelta ? `+₩${monthlyPriceDelta.toLocaleString("ko-KR")} / 월` : "포함",
      monthlyPriceDelta,
      specs: { studentKeys },
      description: `${studentKeys} student keys · 추가 키 1명당 ₩8,000 / 월`,
    };
  });
}

export const PACKAGE_GROUPS: Record<PaidPlanType, Partial<Record<PackageGroup, PackageOption[]>>> = {
  basic: {
    ai: [
      { id: "basic-ai", group: "ai", name: "Basic AI", label: "포함", monthlyPriceDelta: 0, specs: { monthlyAiCredits: 400, dailyAiLimit: 50 }, description: "400 monthly AI credits, 50 daily AI limit" },
      { id: "basic-ai-plus", group: "ai", name: "AI Plus", label: "+₩28,000 / 월", monthlyPriceDelta: 28_000, specs: { monthlyAiCredits: 700, dailyAiLimit: 70 }, description: "700 monthly AI credits, 70 daily AI limit" },
      { id: "basic-ai-max", group: "ai", name: "AI Max", label: "+₩48,000 / 월", monthlyPriceDelta: 48_000, specs: { monthlyAiCredits: 1_000, dailyAiLimit: 100 }, description: "1,000 monthly AI credits, 100 daily AI limit" },
    ],
    storage: [
      { id: "basic-storage", group: "storage", name: "Basic Storage", label: "포함", monthlyPriceDelta: 0, specs: { problemDb: 5_000, fileStorageGb: 20 }, description: "5,000 questions, 20GB file storage" },
      { id: "basic-storage-plus", group: "storage", name: "Storage Plus", label: "+₩10,000 / 월", monthlyPriceDelta: 10_000, specs: { problemDb: 10_000, fileStorageGb: 50 }, description: "10,000 questions, 50GB file storage" },
      { id: "basic-storage-max", group: "storage", name: "Storage Max", label: "+₩24,000 / 월", monthlyPriceDelta: 24_000, specs: { problemDb: 20_000, fileStorageGb: 100 }, description: "20,000 questions, 100GB file storage" },
    ],
    student: createStudentKeyOptions("basic", 5, 10),
  },
  pro: {
    ai: [
      { id: "pro-ai", group: "ai", name: "Pro AI", label: "포함", monthlyPriceDelta: 0, specs: { monthlyAiCredits: 923, dailyAiLimit: 150 }, description: "923 monthly AI credits, 150 daily AI limit" },
      { id: "pro-ai-plus", group: "ai", name: "Pro AI Plus", label: "+₩39,000 / 월", monthlyPriceDelta: 39_000, specs: { monthlyAiCredits: 1_500, dailyAiLimit: 250 }, description: "1,500 monthly AI credits, 250 daily AI limit" },
      { id: "pro-ai-max", group: "ai", name: "Pro AI Max", label: "+₩89,000 / 월", monthlyPriceDelta: 89_000, specs: { monthlyAiCredits: 3_000, dailyAiLimit: 500 }, description: "3,000 monthly AI credits, 500 daily AI limit" },
    ],
    storage: [
      { id: "pro-storage", group: "storage", name: "Pro Storage", label: "포함", monthlyPriceDelta: 0, specs: { problemDb: 30_000, fileStorageGb: 100 }, description: "30,000 questions, 100GB file storage" },
      { id: "pro-storage-plus", group: "storage", name: "Storage Plus", label: "+₩29,000 / 월", monthlyPriceDelta: 29_000, specs: { problemDb: 100_000, fileStorageGb: 300 }, description: "100,000 questions, 300GB file storage" },
      { id: "pro-storage-max", group: "storage", name: "Storage Max", label: "+₩79,000 / 월", monthlyPriceDelta: 79_000, specs: { problemDb: 300_000, fileStorageGb: 1_024 }, description: "300,000 questions, 1TB file storage" },
    ],
    student: createStudentKeyOptions("pro", 10, 100),
  },
};

export const PACKAGE_LABELS: Record<PackageGroup, string> = {
  ai: "AI Pack",
  storage: "Storage Pack",
  student: "Student Pack",
  processing: "Processing Pack",
};

export function formatKRW(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDefaultSelections(plan: PaidPlanType): Record<PackageGroup, string> {
  const groups = PACKAGE_GROUPS[plan];
  return {
    ai: groups.ai?.[0]?.id || "",
    storage: groups.storage?.[0]?.id || "",
    student: groups.student?.[0]?.id || "",
    processing: groups.processing?.[0]?.id || "",
  };
}

export function getPackageOption(plan: PaidPlanType, group: PackageGroup, packageId?: string) {
  const options = PACKAGE_GROUPS[plan][group] || [];
  return options.find((option) => option.id === packageId) || options[0] || null;
}

export function resolveSelectedPackages(plan: PaidPlanType, selectedPackageIds: SelectedPackageIds) {
  const defaults = getDefaultSelections(plan);
  const selected: Partial<Record<PackageGroup, PackageOption>> = {};
  for (const group of Object.keys(PACKAGE_GROUPS[plan]) as PackageGroup[]) {
    const option = getPackageOption(plan, group, selectedPackageIds[group] || defaults[group]);
    if (!option) throw new Error(`Invalid package group: ${group}`);
    selected[group] = option;
  }
  return selected;
}

export function normalizeSubjectEngines(value: unknown): SubjectEngineCode[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const engines: SubjectEngineCode[] = [];
  for (const item of rawItems) {
    const normalized = String(item || "").trim().toLowerCase();
    const engine = normalized === "korean" || normalized === "kor" || normalized === "국어" ? "korean" : normalized === "math" || normalized === "수학" ? "math" : null;
    if (engine && !engines.includes(engine)) engines.push(engine);
  }
  return engines.length ? engines : ["math"];
}

export function stringifySubjectEngines(enabledSubjectEngines: SubjectEngineCode[]) {
  return normalizeSubjectEngines(enabledSubjectEngines).join(",");
}

export function subjectEngineLabel(code: string) {
  const engine = SUBJECT_ENGINES.find((item) => item.code === code);
  return engine ? `${engine.label} ${engine.version}` : code;
}

export function calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice: number, enabledSubjectEngines: SubjectEngineCode[]) {
  return Math.max(normalizeSubjectEngines(enabledSubjectEngines).length - 1, 0) * singleEngineMonthlyPrice;
}

function applySubjectEngineCapacity(specs: PlanSpecs, enabledSubjectEngines: SubjectEngineCode[]): PlanSpecs {
  const multiplier = Math.max(normalizeSubjectEngines(enabledSubjectEngines).length, 1);
  if (multiplier <= 1) return specs;
  return {
    ...specs,
    monthlyAiCredits: typeof specs.monthlyAiCredits === "number" ? specs.monthlyAiCredits * multiplier : specs.monthlyAiCredits,
    dailyAiLimit: typeof specs.dailyAiLimit === "number" ? specs.dailyAiLimit * multiplier : specs.dailyAiLimit,
    problemDb: typeof specs.problemDb === "number" ? specs.problemDb * multiplier : specs.problemDb,
    fileStorageGb: typeof specs.fileStorageGb === "number" ? specs.fileStorageGb * multiplier : specs.fileStorageGb,
  };
}

export function calculateSingleEngineMonthlyPrice(plan: PaidPlanType, selectedPackageIds: SelectedPackageIds) {
  const selected = resolveSelectedPackages(plan, selectedPackageIds);
  return Object.values(selected).reduce((total, option) => total + (option?.monthlyPriceDelta || 0), PLANS[plan].baseMonthlyPrice);
}

export function calculateMonthlyPrice(plan: PaidPlanType, selectedPackageIds: SelectedPackageIds, enabledSubjectEngines: SubjectEngineCode[] = ["math"]) {
  const singleEngineMonthlyPrice = calculateSingleEngineMonthlyPrice(plan, selectedPackageIds);
  return singleEngineMonthlyPrice + calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice, enabledSubjectEngines);
}

export function calculateAnnualPrice(monthlyPrice: number) {
  const discountedMonthly = Math.round(monthlyPrice * (1 - BILLING.annualDiscountPercent / 100));
  return {
    discountedMonthly,
    annualTotal: discountedMonthly * 12,
    discountAmount: monthlyPrice * 12 - discountedMonthly * 12,
  };
}

export function calculateChargeAmount(plan: PaidPlanType, selectedPackageIds: SelectedPackageIds, billingCycle: BillingCycle, enabledSubjectEngines: SubjectEngineCode[] = ["math"]) {
  const monthly = calculateMonthlyPrice(plan, selectedPackageIds, enabledSubjectEngines);
  if (billingCycle === "annual") return calculateAnnualPrice(monthly).annualTotal;
  return monthly;
}

export function getResolvedSpecs(plan: PaidPlanType, selectedPackageIds: SelectedPackageIds, enabledSubjectEngines: SubjectEngineCode[] = ["math"]): PlanSpecs {
  const selected = resolveSelectedPackages(plan, selectedPackageIds);
  const specs = Object.values(selected).reduce<PlanSpecs>(
    (specs, option) => ({ ...specs, ...(option?.specs || {}) }),
    { ...PLANS[plan].specs }
  );
  return applySubjectEngineCapacity(specs, enabledSubjectEngines);
}

export function parseSelectedPackageIds(value: string | null): SelectedPackageIds {
  if (!value) return {};
  const selected: SelectedPackageIds = {};
  for (const part of value.split(",")) {
    const [group, id] = part.split(":");
    if (group && id && ["ai", "storage", "student", "processing"].includes(group)) {
      selected[group as PackageGroup] = id;
    }
  }
  return selected;
}

export function stringifySelectedPackageIds(selectedPackageIds: SelectedPackageIds) {
  return (Object.entries(selectedPackageIds) as Array<[PackageGroup, string]>)
    .filter(([, value]) => Boolean(value))
    .map(([group, id]) => `${group}:${id}`)
    .join(",");
}

export function validatePlanSelection(plan: unknown, billingCycle: unknown, selectedPackageIds: unknown): {
  plan: PaidPlanType;
  billingCycle: BillingCycle;
  selectedPackageIds: SelectedPackageIds;
} {
  if (plan !== "basic" && plan !== "pro") throw new Error("Invalid plan");
  if (billingCycle !== "monthly" && billingCycle !== "annual") throw new Error("Invalid billing cycle");
  const selected = typeof selectedPackageIds === "object" && selectedPackageIds ? selectedPackageIds as SelectedPackageIds : {};
  resolveSelectedPackages(plan, selected);
  return { plan, billingCycle, selectedPackageIds: selected };
}
