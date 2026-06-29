export function normalizeProblemSourceLabel(label: string | null | undefined) {
  return (label || "").replace(/(^|[^\d])0{3,}([1-9]\d*)번/g, (_match, prefix: string, number: string) => {
    return `${prefix}${Number(number)}번`;
  });
}
