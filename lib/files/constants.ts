export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 32_000;

export const TEXT_EXTENSIONS = ["pdf", "txt", "md", "docx", "csv", "json"] as const;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS] as const;

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isImageExt(ext: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export const VISION_CAPABLE_PATTERNS = [
  /^gpt-4o/,
  /^gpt-5/,
  /^claude-/,
  /^gemini-/,
  /^grok-/,
];

export function modelSupportsVision(modelId: string): boolean {
  return VISION_CAPABLE_PATTERNS.some((p) => p.test(modelId));
}
