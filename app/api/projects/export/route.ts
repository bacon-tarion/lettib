import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("project_id");
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: project } = await serviceClient
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [{ data: conversations }, { data: syntheses }] = await Promise.all([
    serviceClient
      .from("conversations")
      .select("id, title, mode, provider, model, created_at, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .is("deleted_at", null),
    serviceClient
      .from("syntheses")
      .select("id, prompt, content, tone, provider, model, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id),
  ]);

  const convIds = (conversations ?? []).map((c) => (c as { id: string }).id);
  let messages: unknown[] = [];
  if (convIds.length > 0) {
    const { data: msgs } = await serviceClient
      .from("messages")
      .select("conversation_id, role, content, created_at")
      .in("conversation_id", convIds);
    messages = msgs ?? [];
  }

  const payload = {
    project,
    exported_at: new Date().toISOString(),
    conversations: conversations ?? [],
    messages,
    syntheses: syntheses ?? [],
  };

  if (format === "markdown") {
    const p = project as { name: string; description?: string | null };
    let md = `# ${p.name}\n\n`;
    if (p.description) md += `${p.description}\n\n`;
    md += `Exported ${payload.exported_at}\n\n## Chats\n\n`;
    for (const c of conversations ?? []) {
      const row = c as { title: string; mode: string };
      md += `### ${row.title} (${row.mode})\n\n`;
    }
    md += `\n## Syntheses\n\n`;
    for (const s of syntheses ?? []) {
      const row = s as { prompt: string; content: string };
      md += `### ${row.prompt}\n\n${row.content}\n\n---\n\n`;
    }
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${p.name.replace(/[^\w.-]/g, "_")}-export.md"`,
      },
    });
  }

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="project-export.json"`,
    },
  });
}
