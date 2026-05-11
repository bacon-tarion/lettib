"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProject } from "@/app/(app)/projects/actions";
import type { Team } from "@/app/(app)/teams/actions";
import {
  buildDefaultChatModelOptions,
  type ProjectConnection,
} from "@/lib/projects/default-chat-model-options";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create project"}
    </Button>
  );
}

function splitProviderModel(value: string): { provider: string; model: string } {
  const idx = value.indexOf("::");
  return { provider: value.slice(0, idx), model: value.slice(idx + 2) };
}

const initialState = {
  error: undefined as string | undefined,
  id: undefined as string | undefined,
};

interface NewProjectDialogProps {
  teams: Team[];
  connections: ProjectConnection[];
}

export function NewProjectDialog({ teams, connections }: NewProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createProject, initialState);
  const [defaultTeamId, setDefaultTeamId] = useState<string>("none");
  const [defaultChatModelValue, setDefaultChatModelValue] = useState<string>("");

  const chatOptions = useMemo(
    () => buildDefaultChatModelOptions(connections),
    [connections]
  );

  useEffect(() => {
    if (state.id) {
      setOpen(false);
      formRef.current?.reset();
      setDefaultTeamId("none");
      setDefaultChatModelValue("");
      router.refresh();
    }
  }, [state.id, router]);

  useEffect(() => {
    if (!open) return;
    setDefaultTeamId("none");
    setDefaultChatModelValue("");
  }, [open]);

  const chatSplit =
    defaultChatModelValue && defaultChatModelValue !== "__none__"
      ? splitProviderModel(defaultChatModelValue)
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Organise your chats and syntheses with shared memory. Optionally set a
            default AI team and a default single-model preset for Chat.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state?.error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Name</Label>
            <Input
              id="proj-name"
              name="name"
              placeholder="e.g. Market Research"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="proj-desc"
              name="description"
              placeholder="What's this project for?"
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default AI Team</Label>
            <p className="text-xs text-muted-foreground">
              Multi-model team for Compare and team-based workflows.
            </p>
            <Select value={defaultTeamId} onValueChange={setDefaultTeamId}>
              <SelectTrigger id="proj-team">
                <SelectValue placeholder="No team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team (solo)</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {defaultTeamId !== "none" && (
              <input type="hidden" name="default_team_id" value={defaultTeamId} />
            )}
            {teams.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Create teams on the{" "}
                <a href="/teams" className="underline underline-offset-2">
                  Teams
                </a>{" "}
                page first.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Default model for Chat</Label>
            <p className="text-xs text-muted-foreground">
              Single connected provider/model for new chats in this project (optional).
            </p>
            {chatOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Connect keys in{" "}
                <a href="/settings" className="underline underline-offset-2">
                  Settings
                </a>{" "}
                to enable this.
              </p>
            ) : (
              <Select
                value={defaultChatModelValue || "__none__"}
                onValueChange={(v) =>
                  setDefaultChatModelValue(v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger id="proj-chat-model">
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
            {chatSplit && (
              <>
                <input type="hidden" name="default_chat_provider" value={chatSplit.provider} />
                <input type="hidden" name="default_chat_model" value={chatSplit.model} />
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
