import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockTeams } from "@/lib/mockData";

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  openai: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  google: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  xai: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
  xai: "xAI",
};

export default function TeamsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Teams</h1>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockTeams.map((team) => (
          <Card key={team.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{team.name}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {team.providers.map((p) => (
                  <span
                    key={p}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROVIDER_COLORS[p] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {PROVIDER_LABELS[p] ?? p}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="default" className="text-xs">
                  Primary: {team.primary_model}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {team.default_tone}
                </Badge>
              </div>
              <div className="pt-1">
                <p className="text-xs text-muted-foreground">
                  {team.models.length} model{team.models.length !== 1 ? "s" : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
