export type SubjectNode = {
  label: string;
  value?: string;
  children?: SubjectNode[];
};

export const SUBJECT_PATH_SEPARATOR = " > ";

export const DEFAULT_SUBJECT_TREE: SubjectNode[] = [];

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

export function isEnglishSubjectValue(value: string) {
  const text = normalizeSubjectValue(value);
  return /영어|영문|영문법|독해|어휘|듣기|ENGLISH|READING|GRAMMAR|VOCAB|LISTENING/i.test(text);
}

export function buildSubjectTree(extraValues: string[] = []): SubjectNode[] {
  const roots = cloneSubjectNodes(DEFAULT_SUBJECT_TREE);
  for (const rawValue of extraValues) {
    const value = normalizeSubjectValue(rawValue);
    if (!value || hasSubjectValue(roots, value)) continue;
    const path = splitSubjectPath(value);
    if (path.length > 1) {
      ensureSubjectPath(roots, path, value);
    } else {
      roots.push({ label: value, value, children: [] });
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

function ensureSubjectPath(roots: SubjectNode[], path: string[], fullValue: string) {
  let current = ensureRootNode(roots, path[0]);
  for (let index = 1; index < path.length; index += 1) {
    const partialValue = path.slice(0, index + 1).join(SUBJECT_PATH_SEPARATOR);
    current.children = current.children || [];
    let child = current.children.find((node) => normalizeSubjectValue(node.value || node.label) === partialValue || node.label === path[index]);
    if (!child) {
      child = {
        label: path[index],
        value: partialValue,
        children: [],
      };
      current.children.push(child);
    }
    current = child;
  }
  current.value = fullValue;
}

function sortSubjectNode(node: SubjectNode): SubjectNode {
  if (!node.children?.length) return node;
  return {
    ...node,
    children: [...node.children].map(sortSubjectNode).sort((left, right) => left.label.localeCompare(right.label, "ko-KR")),
  };
}
