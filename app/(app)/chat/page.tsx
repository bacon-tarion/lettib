import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ChatUI } from "@/components/chat/chat-ui";

export const dynamic = "force-dynamic";

export type ChatProject = {
  id: string;
  name: string;
  default_chat_provider?: string | null;
  default_chat_model?: string | null;
  custom_instructions?: string | null;
};

export type ChatConnection = {
  provider: string;
  status: string;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  const [{ data: projects }, { data: connections }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, default_chat_provider, default_chat_model, custom_instructions")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("name"),
    serviceClient
      .from("api_connections")
      .select("provider, status, custom_base_url, custom_model_name")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
  ]);

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">
          Loading chat…
        </div>
      }
    >
      <ChatUI
        projects={(projects ?? []) as ChatProject[]}
        connections={(connections ?? []) as ChatConnection[]}
      />
    </Suspense>
  );
}
