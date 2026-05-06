import { createClient } from "@/lib/supabase/server";
import { mockUser } from "@/lib/mockData";
import { listApiKeys } from "./actions";
import { SettingsContent } from "./settings-content";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const connections = await listApiKeys();
  console.log("[SettingsPage] listApiKeys returned:", JSON.stringify(connections));
  console.log("[SettingsPage] Connection count:", connections.length);

  let userEmail = mockUser.email;
  let userName = mockUser.display_name;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      console.log("[SettingsPage] Settings page loaded for user:", user.id);
      userEmail = user.email ?? mockUser.email;
      userName =
        (user.user_metadata?.display_name as string | undefined) ??
        user.email?.split("@")[0] ??
        mockUser.display_name;
    } else {
      console.log("[SettingsPage] No authenticated user found");
    }
  } catch {
    // Supabase not configured — fall back to mock values
  }

  return (
    <SettingsContent
      initialConnections={connections}
      userEmail={userEmail}
      userName={userName}
    />
  );
}
