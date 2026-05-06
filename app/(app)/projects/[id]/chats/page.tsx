import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listConversationsForUser } from "@/lib/conversations/queries";
import { ChatsListClient } from "./chats-list-client";

export const dynamic = "force-dynamic";

export default async function ProjectChatsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sc = createServiceClient();
  const { data: project } = await sc
    .from("projects")
    .select("id, name, description")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) notFound();
  const proj = project as { id: string; name: string; description: string | null };

  const conversations = await listConversationsForUser({
    userId: user.id,
    projectId: proj.id,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-2">
        <Link
          href={`/projects/${proj.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Back to {proj.name}
        </Link>
        <h1 className="text-2xl font-bold">Chats — {proj.name}</h1>
        <p className="text-sm text-muted-foreground">
          {conversations.length} conversation
          {conversations.length === 1 ? "" : "s"} in this project
        </p>
      </div>

      <ChatsListClient conversations={conversations} />
    </div>
  );
}
