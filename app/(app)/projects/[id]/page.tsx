"use client";

import { mockProjects, mockSyntheses } from "@/lib/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Brain, MessageSquare } from "lucide-react";

const MEMORY_FIELDS = [
  "Project Goal",
  "Important Decisions",
  "User Preferences",
  "Key Facts",
  "Open Questions",
  "Next Steps",
];

const MOCK_MEMORY_VALUES: Record<string, string> = {
  "Project Goal": "Build the LettiB multi-AI workspace SaaS to production.",
  "Important Decisions": "Next.js App Router, Supabase for auth + DB, Vercel AI SDK.",
  "User Preferences": "Prefers concise technical answers. No fluff.",
  "Key Facts": "Solo founder. Target market: AI power users.",
  "Open Questions": "Pricing model — per-seat vs. usage-based?",
  "Next Steps": "Finish shell, wire Supabase, implement real AI calls.",
};

const MOCK_CHATS = [
  { id: "c-1", title: "Best tech stack for solo SaaS", model: "claude-opus-4-7", preview: "TypeScript with Next.js is the strongest default…", updated_at: "2026-05-05T09:00:00Z" },
  { id: "c-2", title: "Server vs client components", model: "claude-sonnet-4-6", preview: "Use server components by default, client only when…", updated_at: "2026-05-04T11:00:00Z" },
  { id: "c-3", title: "Supabase RLS strategy", model: "gpt-5.4", preview: "Enable RLS on every table. Use policies tied to auth.uid()…", updated_at: "2026-05-03T15:30:00Z" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const project = mockProjects.find((p) => p.id === params.id) ?? mockProjects[0];
  const syntheses = mockSyntheses.filter((s) => s.project_id === project.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <Badge variant={project.memory_enabled ? "default" : "outline"} className="gap-1">
            <Brain className="h-3 w-3" />
            Memory {project.memory_enabled ? "On" : "Off"}
          </Badge>
        </div>
        {project.description && (
          <p className="text-muted-foreground text-sm">{project.description}</p>
        )}
      </div>

      <Tabs defaultValue="chats">
        <TabsList>
          <TabsTrigger value="chats">Chats</TabsTrigger>
          <TabsTrigger value="syntheses">Syntheses</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="chats" className="mt-4 space-y-2">
          {MOCK_CHATS.map((chat) => (
            <Card key={chat.id} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="rounded-md bg-muted p-2 shrink-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{chat.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{chat.preview}</p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <Badge variant="secondary" className="text-xs block">{chat.model}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(chat.updated_at)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="syntheses" className="mt-4">
          {syntheses.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No syntheses in this project yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {syntheses.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm leading-snug">{s.question}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground line-clamp-3">{s.content}</p>
                    <div className="flex gap-1 flex-wrap">
                      {s.models_used.map((m) => (
                        <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MEMORY_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs font-medium">{field}</Label>
                <Textarea
                  readOnly
                  value={MOCK_MEMORY_VALUES[field] ?? ""}
                  className="resize-none text-xs text-muted-foreground h-20 bg-muted/30"
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <p className="text-muted-foreground text-sm py-4">Notes coming soon.</p>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 max-w-md space-y-6">
          <div className="space-y-1.5">
            <Label>Project Name</Label>
            <Input defaultValue={project.name} />
          </div>
          <div className="space-y-1.5">
            <Label>Default AI Team</Label>
            <Input defaultValue={project.default_ai_team} />
          </div>
          <div className="space-y-1.5">
            <Label>Memory</Label>
            <div className="flex items-center gap-2">
              <Badge variant={project.memory_enabled ? "default" : "outline"}>
                {project.memory_enabled ? "Enabled" : "Disabled"}
              </Badge>
              <span className="text-xs text-muted-foreground">Toggle coming soon</span>
            </div>
          </div>
          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium text-destructive">Danger Zone</p>
            <Button variant="destructive" disabled size="sm">
              Delete Project
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
