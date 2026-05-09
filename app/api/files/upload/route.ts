import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = ["pdf", "txt", "md", "docx", "csv", "json"] as const;
const BUCKET = "lettib-files";
const MAX_EXTRACTED_CHARS = 32_000; // cap per file to control prompt size

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function extractText(buf: Buffer, ext: string): Promise<string> {
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const projectId = form.get("project_id");
  if (!(file instanceof File) || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "file and project_id are required" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 }
    );
  }
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type .${ext}. Allowed: ${ALLOWED_EXT.join(", ")}` },
      { status: 415 }
    );
  }

  const serviceClient = createServiceClient();

  // Verify project ownership.
  const { data: owned } = await serviceClient
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json(
      { error: "Project not found or not owned by user" },
      { status: 403 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const storagePath = `${user.id}/${projectId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  let extractedText = "";
  try {
    const raw = await extractText(buf, ext);
    extractedText = raw.slice(0, MAX_EXTRACTED_CHARS);
  } catch {
    // Best-effort extraction — file is still stored even if parsing fails.
  }

  const { data: row, error: insertError } = await serviceClient
    .from("project_files")
    .insert({
      project_id: projectId,
      user_id: user.id,
      file_name: file.name,
      file_size: file.size,
      file_type: ext,
      storage_path: storagePath,
      extracted_text: extractedText || null,
    })
    .select("id, file_name, file_size, file_type, created_at")
    .single();

  if (insertError) {
    // Best-effort cleanup of the orphaned object.
    await serviceClient.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ file: row });
}
