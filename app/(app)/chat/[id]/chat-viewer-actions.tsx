"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChatViewerActionsProps {
  conversationId: string;
  currentProjectId: string | null;
  projects: { id: string; name: string }[];
}

export function ChatViewerActions({
  conversationId,
  currentProjectId,
  projects,
}: ChatViewerActionsProps) {
  const router = useRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    currentProjectId ?? "none"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:
            selectedProjectId === "none" ? null : selectedProjectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to move");
      setMoveOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      // Navigate away — the conversation is now soft-deleted
      if (currentProjectId) {
        router.push(`/projects/${currentProjectId}/chats`);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FolderInput className="h-4 w-4" />
            Move
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move conversation to a project</DialogTitle>
          </DialogHeader>
          <Select
            value={selectedProjectId}
            onValueChange={setSelectedProjectId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a project…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project (Inbox)</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The conversation will be hidden from your history. Messages and
            model responses are kept on the server but no longer visible.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
