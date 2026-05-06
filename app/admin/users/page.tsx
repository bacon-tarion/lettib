import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listAdminUsers } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtMoney(n: number) {
  return `$${n.toFixed(4)}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const search = (searchParams.q ?? "").trim().slice(0, 200);
  const rawPage = parseInt(searchParams.page ?? "1", 10);
  const page = Math.min(
    1000,
    Math.max(1, Number.isFinite(rawPage) ? rawPage : 1)
  );

  const { rows, total } = await listAdminUsers({
    search,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseQs = (newPage: number) => {
    const sp = new URLSearchParams();
    if (search) sp.set("q", search);
    sp.set("page", String(newPage));
    return `?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {total.toLocaleString()} total users
        </p>
      </div>

      <form className="flex gap-2 max-w-md">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Search by email…"
          className="h-9"
        />
        <input type="hidden" name="page" value="1" />
        <Button type="submit" size="sm">
          Search
        </Button>
        {search && (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/admin/users">Clear</Link>
          </Button>
        )}
      </form>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                "Email",
                "Joined",
                "Last active",
                "Convs",
                "Syntheses",
                "Cost",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No users found.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{u.email}</div>
                  {u.display_name && (
                    <div className="text-xs text-muted-foreground">
                      {u.display_name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {fmtDate(u.created_at)}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {fmtDate(u.last_active)}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {u.conversation_count}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {u.synthesis_count}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {fmtMoney(u.total_cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              asChild={page > 1}
              disabled={page <= 1}
              variant="outline"
              size="sm"
            >
              {page > 1 ? <Link href={baseQs(page - 1)}>Previous</Link> : <span>Previous</span>}
            </Button>
            <Button
              asChild={page < totalPages}
              disabled={page >= totalPages}
              variant="outline"
              size="sm"
            >
              {page < totalPages ? <Link href={baseQs(page + 1)}>Next</Link> : <span>Next</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
