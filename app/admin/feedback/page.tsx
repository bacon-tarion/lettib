import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { ResolveButton } from "./resolve-button";

export const dynamic = "force-dynamic";

interface FeedbackRow {
  id: string;
  user_id: string;
  category: string;
  message: string;
  page: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string;
}

const CATEGORY_TONE: Record<string, string> = {
  Bug: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  "Feature Request":
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Improvement:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Other: "bg-muted text-muted-foreground border-border",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const sb = createServiceClient();

  const { data: rows } = await sb
    .from("feedback")
    .select(
      "id, user_id, category, message, page, resolved, resolved_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const feedback = (rows ?? []) as FeedbackRow[];
  const userIds = Array.from(new Set(feedback.map((f) => f.user_id)));

  let emailById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    emailById = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p.email])
    );
  }

  const open = feedback.filter((f) => !f.resolved).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {feedback.length} total · {open} open
        </p>
      </div>

      {feedback.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-left font-medium px-3 py-2">User</th>
                <th className="text-left font-medium px-3 py-2">Category</th>
                <th className="text-left font-medium px-3 py-2">Message</th>
                <th className="text-left font-medium px-3 py-2">Page</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <tr
                  key={f.id}
                  className="border-t align-top hover:bg-muted/20"
                >
                  <td className="px-3 py-3 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {fmtDate(f.created_at)}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {emailById.get(f.user_id) ?? (
                      <span className="text-muted-foreground">unknown</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_TONE[f.category] ?? ""}`}
                    >
                      {f.category}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 max-w-md">
                    <p className="whitespace-pre-wrap break-words">
                      {f.message}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    <code className="font-mono">{f.page ?? "—"}</code>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <ResolveButton
                      id={f.id}
                      resolved={f.resolved}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
