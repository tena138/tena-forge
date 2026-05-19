export function isEditableClipboardTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName;
  return element.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function getClipboardImageFiles(data: DataTransfer | null) {
  if (!data) return [];

  const files = Array.from(data.files || []).filter((file) => file.type.startsWith("image/"));
  if (files.length) return files;

  return Array.from(data.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function imageFileDisplayName(file: File, index = 0) {
  const name = file.name?.trim();
  if (name) return name;
  return index ? `clipboard-image-${index + 1}.png` : "clipboard-image.png";
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read clipboard image."));
    reader.readAsDataURL(file);
  });
}
