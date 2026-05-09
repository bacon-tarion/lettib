"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { mockProjects } from "@/lib/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, GitCompare, MessageSquare } from "lucide-react";
import { listTeams } from "@/app/(app)/teams/actions";
import { updateProject } from "@/app/(app)/projects/actions";
import type { Team } from "@/app/(app)/teams/actions";
import { MemoryForm } from "@/components/memory/memory-form";
import { ProjectFiles } from "@/components/projects/project-files";

type RecentChat = {
  id: string;
  title: string;
  mode: "chat" | "compare";
  provider: string | null;
  model: string | null;
  message_count: number;
  cost_usd: number;
  updated_at: string;
};

type RecentSynthesis = {
  id: string;
  prompt: string;
  content: string;
  provider: string | null;
  model: string | null;
  tone: string;
  cost_usd: number;
  source_response_ids: string[];
  score: number | null;
  created_at: string;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const project = mockProjects.find((p) => p.id === params.id) ?? mockProjects[0];

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>(project.default_ai_team ?? "none");
  const [teamSaving, setTeamSaving] = useState(false);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [syntheses, setSyntheses] = useState<RecentSynthesis[]>([]);
  const [synthesesLoading, setSynthesesLoading] = useState(true);

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChatsLoading(true);
    fetch(`/api/conversations?project_id=${params.id}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRecentChats(data.conversations ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecentChats([]);
      })
      .finally(() => {
        if (!cancelled) setChatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    setSynthesesLoading(true);
    fetch(`/api/syntheses?project_id=${params.id}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSyntheses(data.syntheses ?? []);
      })
      .catch(() => {
        if (!cancelled) setSyntheses([]);
      })
      .finally(() => {
        if (!cancelled) setSynthesesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleTeamChange(value: string) {
    setSelectedTeam(value);
    setTeamSaving(true);
    await updateProject(project.id, { default_ai_team: value === "none" ? "solo" : value });
    setTeamSaving(false);
  }

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
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="chats" className="mt-4 space-y-2">
          {chatsLoading ? (
            <p className="text-muted-foreground text-sm py-4">Loading…</p>
          ) : recentChats.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No conversations in this project yet.
            </p>
          ) : (
            <>
              {recentChats.map((chat) => {
                const Icon = chat.mode === "compare" ? GitCompare : MessageSquare;
                return (
                  <Link key={chat.id} href={`/chat/${chat.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2 shrink-0">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{chat.title}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {chat.message_count} msg · ${chat.cost_usd.toFixed(4)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          {chat.model && (
                            <Badge variant="secondary" className="text-xs block">
                              {chat.model}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(chat.updated_at)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
              <div className="pt-2 text-right">
                <Link
                  href={`/projects/${params.id}/chats`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  View all conversations →
                </Link>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="syntheses" className="mt-4 space-y-3">
          {synthesesLoading ? (
            <p className="text-muted-foreground text-sm py-4">Loading…</p>
          ) : syntheses.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No syntheses yet. Run a Compare to generate one.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {syntheses.map((s) => (
                  <Link key={s.id} href={`/synthesis/${s.id}`} className="block">
                    <Card className="hover:shadow-sm transition-shadow h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm leading-snug line-clamp-2">
                          {s.prompt}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {s.content}
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {s.tone}
                          </Badge>
                          {s.model && (
                            <Badge variant="secondary" className="text-[10px]">
                              {s.model}
                            </Badge>
                          )}
                          {s.source_response_ids.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {s.source_response_ids.length} sources
                            </Badge>
                          )}
                          {s.score != null && (
                            <Badge variant="secondary" className="text-[10px]">
                              {s.score}/5
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums pt-1">
                          <span>{formatDate(s.created_at)}</span>
                          <span>${s.cost_usd.toFixed(4)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              <div className="pt-1 text-right">
                <Link
                  href={`/projects/${params.id}/syntheses`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  View all syntheses →
                </Link>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="memory" className="mt-4 space-y-4">
          <MemoryForm projectId={params.id} autoLoad />
          <div className="text-right">
            <Link
              href={`/projects/${params.id}/memory`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Open full memory editor →
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <ProjectFiles projectId={params.id} />
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
            <Select value={selectedTeam} onValueChange={handleTeamChange} disabled={teamSaving}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team (solo mode)</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teams.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create AI Teams on the{" "}
                <a href="/teams" className="underline underline-offset-2">
                  Teams page
                </a>{" "}
                to assign them here.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Memory</Label>
            <p className="text-xs text-muted-foreground">
              Toggle and edit on the{" "}
              <Link
                href={`/projects/${params.id}/memory`}
                className="underline underline-offset-2"
              >
                Memory page
              </Link>
              .
            </p>
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
