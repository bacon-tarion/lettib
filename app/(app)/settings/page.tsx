import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGroqBuiltinEnabled } from "@/lib/builtin-providers";
import { listApiKeys } from "./actions";
import { SettingsContent } from "./settings-content";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const connections = await listApiKeys();

  const userEmail = user.email ?? "";
  const userName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "User";

  return (
    <SettingsContent
      initialConnections={connections}
      userEmail={userEmail}
      userName={userName}
      groqBuiltinConfigured={isGroqBuiltinEnabled()}
    />
  );
}
