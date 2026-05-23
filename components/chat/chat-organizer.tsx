"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const STANDALONE_PROJECT_VALUE = "__standalone__";

interface ChatOrganizerProps {
  conversationId: string | null;
  projects: { id: string; name: string }[];
  onDismiss?: () => void;
}

export function ChatOrganizer({
  conversationId,
  projects,
  onDismiss,
}: ChatOrganizerProps) {
  const router = useRouter();
  const [moveProjectId, setMoveProjectId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!conversationId || done) return null;

  async function moveToProject(projectId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to move chat");
      setDone(true);
      onDismiss?.();
      router.refresh();
    } catch (err) {
      console.error("[ChatOrganizer] move failed:", err);
      setError(err instanceof Error ? err.message : "Failed to move chat");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      const { createProject } = await import("@/app/(app)/projects/actions");
      const result = await createProject(null, form);
      if (result.error || !result.id) {
        throw new Error(result.error ?? "Failed to create project");
      }
      await moveToProject(result.id);
      setCreateOpen(false);
    } catch (err) {
      console.error("[ChatOrganizer] create project failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create project");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 shrink-0">
      <div>
        <p className="text-sm font-medium">Organize this chat</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Keep it standalone, move to a project, or create a new one.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setDone(true);
            onDismiss?.();
          }}
        >
          Keep standalone
        </Button>

        <div className="flex flex-1 gap-2 min-w-0">
          <Select value={moveProjectId} onValueChange={setMoveProjectId}>
            <SelectTrigger className="h-9 text-sm flex-1">
              <SelectValue placeholder="Move to project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !moveProjectId}
            onClick={() => void moveToProject(moveProjectId)}
            className="gap-1.5 shrink-0"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderInput className="h-3.5 w-3.5" />
            )}
            Move
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setCreateOpen(true)}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="org-project-name">Project name</Label>
            <Input
              id="org-project-name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My project"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateProject()} disabled={busy || !newProjectName.trim()}>
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create & move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
