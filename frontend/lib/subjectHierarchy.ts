export type SubjectNode = {
  label: string;
  value?: string;
  children?: SubjectNode[];
};

export const SUBJECT_PATH_SEPARATOR = " > ";

export const DEFAULT_SUBJECT_TREE: SubjectNode[] = [
  {
    label: "국어",
    value: "국어",
    children: [
      { label: "공통국어", value: "공통국어" },
      { label: "독서", value: "독서" },
      { label: "문학", value: "문학" },
      { label: "화법과 작문", value: "화법과 작문" },
      { label: "언어와 매체", value: "언어와 매체" },
    ],
  },
  {
    label: "수학",
    value: "수학",
    children: [
      { label: "공통수학1", value: "공통수학1" },
      { label: "공통수학2", value: "공통수학2" },
      { label: "수학Ⅰ", value: "수학Ⅰ" },
      { label: "수학Ⅱ", value: "수학Ⅱ" },
      { label: "미적분", value: "미적분" },
      { label: "확률과 통계", value: "확률과 통계" },
      { label: "기하", value: "기하" },
    ],
  },
  {
    label: "영어",
    value: "영어",
    children: [
      { label: "공통영어", value: "공통영어" },
      { label: "영어Ⅰ", value: "영어Ⅰ" },
      { label: "영어Ⅱ", value: "영어Ⅱ" },
      { label: "독해", value: "영어 > 독해" },
      { label: "문법", value: "영어 > 문법" },
    ],
  },
  {
    label: "과학",
    value: "과학",
    children: [
      { label: "통합과학", value: "통합과학" },
      { label: "물리학Ⅰ", value: "물리학Ⅰ" },
      { label: "화학Ⅰ", value: "화학Ⅰ" },
      { label: "생명과학Ⅰ", value: "생명과학Ⅰ" },
      { label: "지구과학Ⅰ", value: "지구과학Ⅰ" },
      { label: "물리학Ⅱ", value: "물리학Ⅱ" },
      { label: "화학Ⅱ", value: "화학Ⅱ" },
      { label: "생명과학Ⅱ", value: "생명과학Ⅱ" },
      { label: "지구과학Ⅱ", value: "지구과학Ⅱ" },
    ],
  },
  {
    label: "사회",
    value: "사회",
    children: [
      { label: "통합사회", value: "통합사회" },
      { label: "한국사", value: "한국사" },
      { label: "생활과 윤리", value: "생활과 윤리" },
      { label: "사회문화", value: "사회문화" },
      { label: "한국지리", value: "한국지리" },
      { label: "세계지리", value: "세계지리" },
    ],
  },
];

export function normalizeSubjectValue(value: string | null | undefined) {
  return (value || "")
    .split(/\s*(?:>|\/|›|→)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(SUBJECT_PATH_SEPARATOR);
}

export function splitSubjectPath(value: string | null | undefined) {
  const normalized = normalizeSubjectValue(value);
  return normalized ? normalized.split(SUBJECT_PATH_SEPARATOR) : [];
}

export function makeSubjectPathValue(parent: string, child: string) {
  const parentPath = splitSubjectPath(parent);
  const childPath = splitSubjectPath(child);
  return [...parentPath, ...childPath].filter(Boolean).join(SUBJECT_PATH_SEPARATOR);
}

export function subjectLeafLabel(value: string) {
  const path = splitSubjectPath(value);
  return path[path.length - 1] || value;
}

export function subjectDisplayLabel(value: string) {
  return normalizeSubjectValue(value) || value;
}

export function collectSubjectNodeValues(node: SubjectNode): string[] {
  const values = new Set<string>();
  const visit = (current: SubjectNode) => {
    const normalized = normalizeSubjectValue(current.value);
    if (normalized) values.add(normalized);
    current.children?.forEach(visit);
  };
  visit(node);
  return [...values];
}

export function isKoreanSubjectValue(value: string) {
  const text = normalizeSubjectValue(value);
  return /국어|문학|독서|화법과 작문|언어와 매체/.test(text);
}

export function buildSubjectTree(extraValues: string[] = []): SubjectNode[] {
  const roots = cloneSubjectNodes(DEFAULT_SUBJECT_TREE);
  for (const rawValue of extraValues) {
    const value = normalizeSubjectValue(rawValue);
    if (!value || hasSubjectValue(roots, value)) continue;
    const path = splitSubjectPath(value);
    const inferredParent = path.length > 1 ? path[0] : inferSubjectParent(value);
    if (inferredParent && inferredParent !== value) {
      const parent = ensureRootNode(roots, inferredParent);
      parent.children = parent.children || [];
      parent.children.push({
        label: path.length > 1 ? path[path.length - 1] : value,
        value,
      });
    } else {
      roots.push({ label: value, value });
    }
  }
  return roots.map(sortSubjectNode);
}

function cloneSubjectNodes(nodes: SubjectNode[]): SubjectNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneSubjectNodes(node.children) : undefined,
  }));
}

function hasSubjectValue(nodes: SubjectNode[], value: string): boolean {
  return nodes.some((node) => normalizeSubjectValue(node.value) === value || Boolean(node.children?.length && hasSubjectValue(node.children, value)));
}

function ensureRootNode(roots: SubjectNode[], label: string) {
  const existing = roots.find((node) => normalizeSubjectValue(node.value || node.label) === label || node.label === label);
  if (existing) return existing;
  const next = { label, value: label, children: [] };
  roots.push(next);
  return next;
}

function inferSubjectParent(value: string) {
  if (/공통수학|공통수|수학|수[12ⅠⅡ]|미적분|확률과 통계|확통|기하/.test(value)) return "수학";
  if (/국어|문학|독서|화법|작문|언어와 매체/.test(value)) return "국어";
  if (/영어|독해|문법/.test(value)) return "영어";
  if (/과학|물리|화학|생명|지구/.test(value)) return "과학";
  if (/사회|한국사|윤리|지리|정치|경제/.test(value)) return "사회";
  return "";
}

function sortSubjectNode(node: SubjectNode): SubjectNode {
  if (!node.children?.length) return node;
  return {
    ...node,
    children: [...node.children].sort((left, right) => left.label.localeCompare(right.label, "ko-KR")),
  };
}
