import {
  ALLOWED_EXTENSIONS,
  extOf,
  isImageExt,
  MAX_EXTRACTED_CHARS,
  MAX_FILE_BYTES,
} from "./constants";

export {
  ALLOWED_EXTENSIONS,
  extOf,
  isImageExt,
  MAX_EXTRACTED_CHARS,
  MAX_FILE_BYTES,
  modelSupportsVision,
  TEXT_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from "./constants";

export async function extractTextFromBuffer(
  buf: Buffer,
  ext: string
): Promise<string> {
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    return buf.toString("utf-8");
  }
  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buf);
    return result.text ?? "";
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value ?? "";
  }
  return "";
}

export type ProcessedFile = {
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  text?: string;
  imageBase64?: string;
};

export async function processUploadedFile(file: File): Promise<ProcessedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }
  const ext = extOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file type .${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const base: ProcessedFile = {
    name: file.name,
    size: file.size,
    ext,
    mimeType,
  };

  if (isImageExt(ext)) {
    const b64 = buf.toString("base64");
    const media =
      ext === "jpg" || ext === "jpeg"
        ? "jpeg"
        : ext === "png"
          ? "png"
          : ext === "webp"
            ? "webp"
            : ext === "gif"
              ? "gif"
              : mimeType.split("/")[1] ?? "png";
    return { ...base, imageBase64: `data:image/${media};base64,${b64}` };
  }

  try {
    const raw = await extractTextFromBuffer(buf, ext);
    return { ...base, text: raw.slice(0, MAX_EXTRACTED_CHARS) };
  } catch (err) {
    console.error("[files/extract] text extraction failed:", err);
    throw new Error("Could not extract text from file");
  }
}
