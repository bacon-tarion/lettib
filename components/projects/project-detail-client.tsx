"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Download,
  GitCompare,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { getModelDisplayName } from "@/lib/providers/models";
import { listTeams } from "@/app/(app)/teams/actions";
import {
  archiveProject,
  deleteProject,
  updateProject,
} from "@/app/(app)/projects/actions";
import type { Team } from "@/app/(app)/teams/actions";
import { MemoryForm } from "@/components/memory/memory-form";
import { ProjectFiles } from "@/components/projects/project-files";
import { ProjectNotes } from "@/components/projects/project-notes";
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
  created_at: string;
};

type RecentSynthesis = {
  id: string;
  prompt: string;
  content: string;
  provider: string | null;
  model: string | null;
  tone: string;
  cost_usd: number;
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
  custom_instructions?: string | null;
  icon?: string | null;
  color?: string | null;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "overview";

  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isInboxProject = project.name === "Inbox";

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [customInstructions, setCustomInstructions] = useState(
    project.custom_instructions ?? ""
  );
  const [projectColor, setProjectColor] = useState(project.color ?? "#6366f1");
  const [projectIcon, setProjectIcon] = useState(project.icon ?? "folder");

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
  const [metaSaving, setMetaSaving] = useState(false);

  const [allChats, setAllChats] = useState<RecentChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [chatSort, setChatSort] = useState<"newest" | "oldest" | "activity">(
    "activity"
  );

  const [syntheses, setSyntheses] = useState<RecentSynthesis[]>([]);
  const [synthSearch, setSynthSearch] = useState("");
  const [synthesesLoading, setSynthesesLoading] = useState(true);

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch((err) => console.error("[ProjectDetail] listTeams failed:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChatsLoading(true);
    fetch(`/api/conversations?project_id=${project.id}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAllChats(data.conversations ?? []);
      })
      .catch((err) => {
        console.error("[ProjectDetail] chats load failed:", err);
        if (!cancelled) setAllChats([]);
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
    fetch(`/api/syntheses?project_id=${project.id}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSyntheses(data.syntheses ?? []);
      })
      .catch((err) => {
        console.error("[ProjectDetail] syntheses load failed:", err);
        if (!cancelled) setSyntheses([]);
      })
      .finally(() => {
        if (!cancelled) setSynthesesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    let list = allChats.filter(
      (c) =>
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.model ?? "").toLowerCase().includes(q)
    );
    if (chatSort === "newest") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (chatSort === "oldest") {
      list = [...list].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return list;
  }, [allChats, chatSearch, chatSort]);

  const filteredSynths = useMemo(() => {
    const q = synthSearch.trim().toLowerCase();
    return syntheses.filter(
      (s) =>
        !q ||
        s.prompt.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q)
    );
  }, [syntheses, synthSearch]);

  const recentActivity = useMemo(() => {
    const items: { type: string; title: string; date: string; href: string }[] =
      [];
    for (const c of allChats.slice(0, 5)) {
      items.push({
        type: c.mode,
        title: c.title,
        date: c.updated_at,
        href: `/chat/${c.id}`,
      });
    }
    for (const s of syntheses.slice(0, 5)) {
      items.push({
        type: "synthesis",
        title: s.prompt,
        date: s.created_at,
        href: `/synthesis/${s.id}`,
      });
    }
    return items
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [allChats, syntheses]);

  async function saveMeta() {
    setMetaSaving(true);
    await updateProject(project.id, {
      name: name.trim() || project.name,
      description: description.trim() || null,
      custom_instructions: customInstructions.trim() || null,
      color: projectColor,
      icon: projectIcon,
    });
    setMetaSaving(false);
    router.refresh();
  }

  async function handleTeamChange(value: string) {
    setSelectedTeamId(value);
    setTeamSaving(true);
    await updateProject(project.id, {
      default_team_id: value === "none" ? null : value,
    });
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
      await updateProject(project.id, {
        default_chat_provider: value.slice(0, sep),
        default_chat_model: value.slice(sep + 2),
      });
    }
    setChatSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-6 flex-1 min-w-0">
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chats">Chats</TabsTrigger>
          <TabsTrigger value="syntheses">Syntheses</TabsTrigger>
          <TabsTrigger value="files">Files & Knowledge</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-6 max-w-2xl">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name-inline">Project name</Label>
              <Input
                id="proj-name-inline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveMeta()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc-inline">Description</Label>
              <Textarea
                id="proj-desc-inline"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => void saveMeta()}
                placeholder="What is this project about?"
                className="min-h-[72px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-instructions">Custom Instructions</Label>
              <Textarea
                id="custom-instructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                onBlur={() => void saveMeta()}
                placeholder="Tell the AI about this project, your role, preferred style, or any context it should always remember."
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Injected as system context into every chat in this project.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Default AI Team</Label>
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold tabular-nums">
                  {allChats.filter((c) => c.mode === "chat").length}
                </p>
                <p className="text-xs text-muted-foreground">Chats</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-2xl font-bold tabular-nums">{syntheses.length}</p>
                <p className="text-xs text-muted-foreground">Syntheses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <Badge
                  variant={project.memory_enabled ? "default" : "outline"}
                  className="gap-1"
                >
                  <Brain className="h-3 w-3" />
                  {project.memory_enabled ? "On" : "Off"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">Memory</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-1">
                {recentActivity.map((item, i) => (
                  <Link
                    key={`${item.href}-${i}`}
                    href={item.href}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(item.date)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {metaSaving && (
            <p className="text-xs text-muted-foreground">Saving…</p>
          )}
        </TabsContent>

        {/* Chats */}
        <TabsContent value="chats" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild className="gap-1.5">
              <Link href={`/chat?project=${project.id}`}>
                <Plus className="h-4 w-4" />
                New Chat
              </Link>
            </Button>
            <Button asChild variant="secondary" className="gap-1.5">
              <Link href={`/compare?project=${project.id}`}>
                <GitCompare className="h-4 w-4" />
                New Compare
              </Link>
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Search chats…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select
              value={chatSort}
              onValueChange={(v) =>
                setChatSort(v as typeof chatSort)
              }
            >
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activity">Recent activity</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {chatsLoading ? (
            <p className="text-muted-foreground text-sm py-4">Loading…</p>
          ) : filteredChats.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No conversations yet. Start a New Chat or Compare above.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredChats.map((chat) => {
                const Icon =
                  chat.mode === "compare" ? GitCompare : MessageSquare;
                return (
                  <Link key={chat.id} href={`/chat/${chat.id}`}>
                    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="rounded-md bg-muted p-2 shrink-0">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {chat.title}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {chat.message_count} msg · ${chat.cost_usd.toFixed(4)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          {chat.model && (
                            <Badge variant="secondary" className="text-xs block">
                              {getModelDisplayName(
                                chat.provider ?? "",
                                chat.model
                              )}
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
            </div>
          )}
        </TabsContent>

        {/* Syntheses */}
        <TabsContent value="syntheses" className="mt-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={synthSearch}
              onChange={(e) => setSynthSearch(e.target.value)}
              placeholder="Search syntheses…"
              className="pl-8 h-9 text-sm"
            />
          </div>
          {synthesesLoading ? (
            <p className="text-muted-foreground text-sm py-4">Loading…</p>
          ) : filteredSynths.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No syntheses yet. Run a Compare to generate one.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredSynths.map((s) => (
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
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(s.created_at)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <ProjectFiles projectId={project.id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <ProjectNotes projectId={project.id} />
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <MemoryForm projectId={project.id} autoLoad />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 max-w-md space-y-6">
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-color">Color</Label>
              <Input
                id="proj-color"
                type="color"
                value={projectColor}
                onChange={(e) => setProjectColor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-icon">Icon label</Label>
              <Input
                id="proj-icon"
                value={projectIcon}
                onChange={(e) => setProjectIcon(e.target.value)}
                placeholder="folder"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void saveMeta()}
            disabled={metaSaving}
          >
            Save appearance
          </Button>

          <div className="space-y-1.5">
            <Label>Default model for Chat</Label>
            {chatOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Connect API keys in Settings to pick a default model.
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
                  <SelectValue placeholder="No default" />
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

          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await archiveProject(project.id, true);
                router.refresh();
              }}
            >
              Archive project
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={`/api/projects/export?project_id=${project.id}&format=json`}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export JSON
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href={`/api/projects/export?project_id=${project.id}&format=markdown`}
              >
                Export Markdown
              </a>
            </Button>
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
