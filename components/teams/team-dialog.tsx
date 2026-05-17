"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTeam, updateTeam } from "@/app/(app)/teams/actions";
import type { Team } from "@/app/(app)/teams/actions";
import type { ApiConnection } from "@/app/(app)/settings/actions";
import { MODELS_CATALOG, getProviderLabel, getModelDisplayName } from "@/lib/providers/models";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "simple",       label: "Simple"       },
  { value: "academic",     label: "Academic"      },
  { value: "friendly",     label: "Friendly"      },
  { value: "technical",    label: "Technical"     },
  { value: "persuasive",   label: "Persuasive"    },
  { value: "custom",       label: "Custom"        },
];

interface TeamDialogProps {
  open: boolean;
  team?: Team | null;
  connectedProviders: ApiConnection[];
  onSave: () => void;
  onCancel: () => void;
}

type SelectedModel = { provider: string; model: string };

type ProviderGroup = {
  provider: string;
  label: string;
  models: Array<{ modelId: string; modelName: string }>;
};

export function TeamDialog({
  open,
  team,
  connectedProviders,
  onSave,
  onCancel,
}: TeamDialogProps) {
  const isEditing = !!team;

  const [name, setName]                   = useState("");
  const [tone, setTone]                   = useState("professional");
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);
  const [primaryModel, setPrimaryModel]   = useState("");
  const [error, setError]                 = useState<string | null>(null);
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setTone(team?.default_tone ?? "professional");
      setSelectedModels(
        team?.members.map((m) => ({ provider: m.provider, model: m.model })) ?? []
      );
      setPrimaryModel(team?.primary_model ?? "");
      setError(null);
      setLoading(false);
    }
  }, [open, team]);

  const pickerConnections = useMemo(
    () =>
      connectedProviders.filter(
        (c) => c.status === "connected" || c.status === "untested"
      ),
    [connectedProviders]
  );

  const providerGroups = useMemo((): ProviderGroup[] => {
    const catalog = MODELS_CATALOG as Record<
      string,
      readonly { id: string; name: string }[]
    >;
    const seenProviders = new Set<string>();
    return pickerConnections
      .map((conn): ProviderGroup | null => {
        const providerKey = conn.provider.toLowerCase();
        if (seenProviders.has(providerKey)) return null;
        seenProviders.add(providerKey);

        if (providerKey === "custom") {
          return {
            provider: "custom",
            label: getProviderLabel("custom"),
            models: [
              { modelId: "custom", modelName: conn.custom_model_name ?? "Custom Model" },
            ],
          };
        }

        const models = (catalog[providerKey] ?? []).map((m) => ({
          modelId: m.id,
          modelName: m.name,
        }));
        return {
          provider: providerKey,
          label: getProviderLabel(providerKey),
          models,
        };
      })
      .filter((g): g is ProviderGroup => g !== null && g.models.length > 0);
  }, [pickerConnections]);

  function toggleModel(provider: string, modelId: string) {
    setSelectedModels((prev) => {
      const exists = prev.some((m) => m.provider === provider && m.model === modelId);
      if (exists) {
        if (primaryModel === modelId) setPrimaryModel("");
        return prev.filter((m) => !(m.provider === provider && m.model === modelId));
      }
      return [...prev, { provider, model: modelId }];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Team name is required."); return; }
    if (name.trim().length > 50) { setError("Name must be 50 chars or fewer."); return; }
    if (selectedModels.length < 2) { setError("Select at least 2 models."); return; }
    if (!primaryModel) { setError("Select a primary model."); return; }

    const primaryProvider = selectedModels.find((m) => m.model === primaryModel)?.provider ?? "";

    setLoading(true);
    setError(null);

    const input = {
      name: name.trim(),
      default_tone: tone,
      members: selectedModels.map((m, i) => ({
        provider: m.provider,
        model: m.model,
        position: i,
      })),
      primary_provider: primaryProvider,
      primary_model: primaryModel,
    };

    const result = isEditing
      ? await updateTeam(team.id, input)
      : await createTeam(input);

    setLoading(false);

    if (result.success) {
      onSave();
    } else {
      setError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Team" : "New Team"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Team Name */}
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="e.g. Research Team"
            />
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <Label>
              Add Models{" "}
              <span className="text-muted-foreground font-normal">(select at least 2)</span>
            </Label>

            {providerGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No connected providers found. Add API keys in Settings first.
              </p>
            )}

            {providerGroups.map((group) => (
              <div key={group.provider} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.models.map(({ modelId, modelName }) => {
                    const isSelected = selectedModels.some(
                      (m) => m.provider === group.provider && m.model === modelId
                    );
                    return (
                      <button
                        key={modelId}
                        type="button"
                        onClick={() => toggleModel(group.provider, modelId)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-foreground hover:text-foreground bg-background"
                        }`}
                      >
                        {modelName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Primary Model */}
          <div className="space-y-1.5">
            <Label>Primary Model</Label>
            <Select
              value={primaryModel}
              onValueChange={setPrimaryModel}
              disabled={selectedModels.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select primary model…" />
              </SelectTrigger>
              <SelectContent>
                {selectedModels.map(({ provider, model }) => (
                  <SelectItem key={`${provider}:${model}`} value={model}>
                    {getModelDisplayName(provider, model)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default Tone */}
          <div className="space-y-1.5">
            <Label>Default Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : isEditing ? "Save Changes" : "Create Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
