import { createClient } from "@/lib/supabase/server";
import { mockUser } from "@/lib/mockData";
import { listApiKeys } from "./actions";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const connections = await listApiKeys();

  let userEmail = mockUser.email;
  let userName = mockUser.display_name;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userEmail = user.email ?? mockUser.email;
      userName =
        (user.user_metadata?.display_name as string | undefined) ??
        user.email?.split("@")[0] ??
        mockUser.display_name;
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
