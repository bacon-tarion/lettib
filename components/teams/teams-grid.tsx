"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TeamCard } from "./team-card";
import { TeamDialog } from "./team-dialog";
import { deleteTeam, generateStarterTeams } from "@/app/(app)/teams/actions";
import type { Team } from "@/app/(app)/teams/actions";
import type { ApiConnection } from "@/app/(app)/settings/actions";

interface TeamsGridProps {
  initialTeams: Team[];
  connectedProviders: ApiConnection[];
}

export function TeamsGrid({ initialTeams, connectedProviders }: TeamsGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dialogMode, setDialogMode]   = useState<"create" | "edit" | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const connectedCount = connectedProviders.filter(
    (c) => c.status === "connected" || c.status === "untested"
  ).length;

  function openCreate() {
    setEditingTeam(null);
    setDialogMode("create");
  }

  function handleEdit(team: Team) {
    setEditingTeam(team);
    setDialogMode("edit");
  }

  function handleDeleteRequest(team: Team) {
    setDeletingTeam(team);
    setDeleteError(null);
  }

  function handleSaved() {
    setDialogMode(null);
    setEditingTeam(null);
    router.refresh();
  }

  function handleDeleteConfirm() {
    if (!deletingTeam) return;
    startTransition(async () => {
      const result = await deleteTeam(deletingTeam.id);
      if (result.success) {
        setDeletingTeam(null);
        router.refresh();
      } else {
        setDeleteError(result.error ?? "Failed to delete team.");
      }
    });
  }

  async function handleGenerateStarters() {
    setGenerating(true);
    setGenerateError(null);
    const result = await generateStarterTeams();
    setGenerating(false);
    if (result.error) {
      setGenerateError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Teams</h1>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Team
        </Button>
      </div>

      {/* Empty state: not enough connected providers */}
      {initialTeams.length === 0 && connectedCount < 2 && (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-4">
          <Settings2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <div>
            <p className="font-medium">Connect API keys to create AI Teams</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect at least 2 API keys in Settings to create AI Teams.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </div>
      )}

      {/* Empty state: ready to generate */}
      {initialTeams.length === 0 && connectedCount >= 2 && (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-4">
          <div>
            <p className="font-medium">No teams yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate starter teams based on your connected providers, or create your own.
            </p>
          </div>
          {generateError && <p className="text-sm text-destructive">{generateError}</p>}
          <div className="flex gap-2 justify-center">
            <Button onClick={handleGenerateStarters} disabled={generating}>
              {generating ? "Generating…" : "Generate starter teams"}
            </Button>
            <Button variant="outline" onClick={openCreate}>
              Create manually
            </Button>
          </div>
        </div>
      )}

      {/* Team grid */}
      {initialTeams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialTeams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <TeamDialog
        open={dialogMode !== null}
        team={editingTeam}
        connectedProviders={connectedProviders}
        onSave={handleSaved}
        onCancel={() => {
          setDialogMode(null);
          setEditingTeam(null);
        }}
      />

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deletingTeam !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setDeletingTeam(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete team?</DialogTitle>
            <DialogDescription>
              &ldquo;{deletingTeam?.name}&rdquo; will be permanently removed. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTeam(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
