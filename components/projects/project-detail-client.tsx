"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { deleteProject, updateProject } from "@/app/(app)/projects/actions";
import type { Team } from "@/app/(app)/teams/actions";
import { MemoryForm } from "@/components/memory/memory-form";
import { ProjectFiles } from "@/components/projects/project-files";
import {
  buildDefaultChatModelOptions,
  type ProjectConnection,
} from "@/lib/projects/default-chat-model-options";

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

export type ProjectDetailRecord = {
  id: string;
  name: string;
  description: string | null;
  memory_enabled: boolean;
  default_ai_team?: string;
  default_team_id?: string | null;
  default_chat_provider?: string | null;
  default_chat_model?: string | null;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface ProjectDetailClientProps {
  project: ProjectDetailRecord;
  initialTeams: Team[];
  connections: ProjectConnection[];
}

export function ProjectDetailClient({
  project,
  initialTeams,
  connections,
}: ProjectDetailClientProps) {
  const router = useRouter();
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isInboxProject = project.name === "Inbox";
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    project.default_team_id ?? "none"
  );
  const chatOptions = buildDefaultChatModelOptions(connections);
  const chatModelInitial =
    project.default_chat_provider && project.default_chat_model
      ? `${project.default_chat_provider}::${project.default_chat_model}`
      : "";
  const [chatModelValue, setChatModelValue] = useState(chatModelInitial);
  const [teamSaving, setTeamSaving] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
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
    setSelectedTeamId(project.default_team_id ?? "none");
  }, [project.default_team_id]);

  useEffect(() => {
    const next =
      project.default_chat_provider && project.default_chat_model
        ? `${project.default_chat_provider}::${project.default_chat_model}`
        : "";
    setChatModelValue(next);
  }, [project.default_chat_provider, project.default_chat_model]);

  useEffect(() => {
    let cancelled = false;
    setChatsLoading(true);
    fetch(`/api/conversations?project_id=${project.id}&limit=5`)
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
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    setSynthesesLoading(true);
    fetch(`/api/syntheses?project_id=${project.id}&limit=5`)
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
  }, [project.id]);

  async function handleTeamChange(value: string) {
    setSelectedTeamId(value);
    setTeamSaving(true);
    const default_team_id = value === "none" ? null : value;
    await updateProject(project.id, { default_team_id });
    setTeamSaving(false);
    router.refresh();
  }

  async function handleChatModelChange(value: string) {
    setChatModelValue(value);
    setChatSaving(true);
    if (!value) {
      await updateProject(project.id, {
        default_chat_provider: null,
        default_chat_model: null,
      });
    } else {
      const sep = value.indexOf("::");
      const provider = value.slice(0, sep);
      const model = value.slice(sep + 2);
      await updateProject(project.id, {
        default_chat_provider: provider,
        default_chat_model: model,
      });
    }
    setChatSaving(false);
    router.refresh();
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
                  href={`/projects/${project.id}/chats`}
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
                  href={`/projects/${project.id}/syntheses`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  View all syntheses →
                </Link>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="memory" className="mt-4 space-y-4">
          <MemoryForm projectId={project.id} autoLoad />
          <div className="text-right">
            <Link
              href={`/projects/${project.id}/memory`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Open full memory editor →
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <ProjectFiles projectId={project.id} />
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
            <p className="text-xs text-muted-foreground">
              Used for multi-model Compare flows and team-based defaults.
            </p>
            <Select
              value={selectedTeamId}
              onValueChange={(v) => void handleTeamChange(v)}
              disabled={teamSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a team…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team (solo)</SelectItem>
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
            <Label>Default model for Chat</Label>
            <p className="text-xs text-muted-foreground">
              Single-model chats in this project can start with this provider and
              model. You can still change the model on the Chat page anytime.
            </p>
            {chatOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Connect API keys in{" "}
                <a href="/settings" className="underline underline-offset-2">
                  Settings
                </a>{" "}
                to pick a default model.
              </p>
            ) : (
              <Select
                value={chatModelValue || "__none__"}
                onValueChange={(v) =>
                  void handleChatModelChange(v === "__none__" ? "" : v)
                }
                disabled={chatSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No default (choose in Chat)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No default</SelectItem>
                  {chatOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Memory</Label>
            <p className="text-xs text-muted-foreground">
              Toggle and edit on the{" "}
              <Link
                href={`/projects/${project.id}/memory`}
                className="underline underline-offset-2"
              >
                Memory page
              </Link>
              .
            </p>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium text-destructive">Danger Zone</p>
            {deleteError && (
              <p className="text-xs text-destructive">{deleteError}</p>
            )}
            {isInboxProject && (
              <p className="text-xs text-muted-foreground">
                The Inbox project cannot be deleted.
              </p>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isInboxProject || deletePending}
              onClick={() => {
                if (isInboxProject) return;
                if (
                  !confirm(
                    "Delete this project and its chats, memory, and files? This cannot be undone."
                  )
                ) {
                  return;
                }
                setDeleteError(null);
                startDeleteTransition(async () => {
                  const out = await deleteProject(project.id);
                  if (out?.error) setDeleteError(out.error);
                });
              }}
            >
              {deletePending ? "Deleting…" : "Delete Project"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
