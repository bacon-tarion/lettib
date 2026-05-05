import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockUser } from "@/lib/mockData";

const STATS = [
  { label: "Total Users", value: "1" },
  { label: "Signups Today", value: "1" },
  { label: "Syntheses Created", value: "2" },
  { label: "Average Rating", value: "4.5" },
  { label: "Active Projects", value: "4" },
  { label: "Errors Last 24h", value: "0" },
];

export default function AdminPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Internal dashboard — not visible to end users.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1 pt-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Recent Signups</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["User ID", "Email", "Display Name", "Status", "Joined"].map((h) => (
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
              <tr className="border-t">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {mockUser.id}
                </td>
                <td className="px-4 py-3">{mockUser.email}</td>
                <td className="px-4 py-3">{mockUser.display_name}</td>
                <td className="px-4 py-3">
                  <Badge variant="default" className="text-xs">
                    Active
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  May 5, 2026
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
