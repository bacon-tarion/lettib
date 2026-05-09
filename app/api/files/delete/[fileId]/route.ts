import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "lettib-files";

export async function DELETE(
  _req: Request,
  { params }: { params: { fileId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  const { data: file, error: fetchError } = await serviceClient
    .from("project_files")
    .select("id, storage_path, user_id")
    .eq("id", params.fileId)
    .single();

  if (fetchError || !file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if ((file as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: storageError } = await serviceClient.storage
    .from(BUCKET)
    .remove([(file as { storage_path: string }).storage_path]);
  // Don't fail the whole request if the object is already gone — still drop the row.
  if (storageError && !/not.?found/i.test(storageError.message)) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { error: deleteError } = await serviceClient
    .from("project_files")
    .delete()
    .eq("id", params.fileId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
