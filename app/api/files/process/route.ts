import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processUploadedFile } from "@/lib/files/extract-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Process a file upload for temporary use in chat/compare/manual-compare.
 * Does not persist to storage — extraction happens server-side only.
 */
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const processed = await processUploadedFile(file);
    return NextResponse.json({
      file: {
        name: processed.name,
        size: processed.size,
        ext: processed.ext,
        mimeType: processed.mimeType,
        text: processed.text ?? null,
        imageBase64: processed.imageBase64 ?? null,
      },
    });
  } catch (err) {
    console.error("[files/process] failed:", err);
    const message = err instanceof Error ? err.message : "File processing failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
