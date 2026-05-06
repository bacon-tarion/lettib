import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Brain } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadProjectMemory } from "@/lib/memory/queries";
import { MemoryForm } from "@/components/memory/memory-form";

export const dynamic = "force-dynamic";

export default async function ProjectMemoryPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { project, memory } = await loadProjectMemory({
    userId: user.id,
    projectId: params.id,
  });
  if (!project) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Back to {project.name}
        </Link>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Project Memory</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Long-term context for {project.name}. Edits save automatically when
          you leave a field.
        </p>
      </div>

      <MemoryForm
        projectId={project.id}
        initialMemory={memory}
        initialEnabled={project.memory_enabled}
      />
    </div>
  );
}
