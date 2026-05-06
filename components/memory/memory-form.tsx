"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  MEMORY_FIELDS,
  type MemoryFieldKey,
  type MemoryRow,
} from "@/lib/memory/fields";

interface MemoryFormProps {
  projectId: string;
  initialMemory?: MemoryRow | null;
  initialEnabled?: boolean;
  /** When false, fetch the data on mount instead of using initial props */
  autoLoad?: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!t || t < 1000) return "never";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MemoryForm({
  projectId,
  initialMemory = null,
  initialEnabled = false,
  autoLoad = false,
}: MemoryFormProps) {
  const [values, setValues] = useState<Record<MemoryFieldKey, string>>(() => {
    const out = {} as Record<MemoryFieldKey, string>;
    for (const f of MEMORY_FIELDS) {
      out[f.key] = (initialMemory?.[f.key] as string | null) ?? "";
    }
    return out;
  });
  const initialValuesRef = useRef<Record<MemoryFieldKey, string>>({ ...values });
  // Per-field monotonic counter — only the latest blur's response is applied,
  // protecting against out-of-order PATCH responses overwriting newer content.
  const writeSeqRef = useRef<Record<MemoryFieldKey, number>>(
    Object.fromEntries(MEMORY_FIELDS.map((f) => [f.key, 0])) as Record<
      MemoryFieldKey,
      number
    >
  );
  const [saveState, setSaveState] = useState<
    Record<MemoryFieldKey, SaveState>
  >(() => {
    const out = {} as Record<MemoryFieldKey, SaveState>;
    for (const f of MEMORY_FIELDS) out[f.key] = "idle";
    return out;
  });
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    initialMemory?.updated_at ?? null
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enabledBusy, setEnabledBusy] = useState(false);
  const [loading, setLoading] = useState(autoLoad);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Optionally fetch on mount (used by the project page tab variant)
  useEffect(() => {
    if (!autoLoad) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/memory/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setGlobalError(data.error);
          return;
        }
        const memory: MemoryRow | null = data.memory;
        const newValues = {} as Record<MemoryFieldKey, string>;
        for (const f of MEMORY_FIELDS) {
          newValues[f.key] = (memory?.[f.key] as string | null) ?? "";
        }
        setValues(newValues);
        initialValuesRef.current = { ...newValues };
        setUpdatedAt(memory?.updated_at ?? null);
        setEnabled(Boolean(data.project?.memory_enabled));
      })
      .catch((err) => {
        if (!cancelled) {
          setGlobalError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoLoad, projectId]);

  function setFieldSaveState(key: MemoryFieldKey, state: SaveState) {
    setSaveState((prev) => ({ ...prev, [key]: state }));
  }

  async function saveField(field: MemoryFieldKey, value: string) {
    if (initialValuesRef.current[field] === value) return;
    const seq = ++writeSeqRef.current[field];
    setFieldSaveState(field, "saving");
    try {
      const res = await fetch(`/api/memory/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      // Stale response — a newer save has been kicked off. Drop this result.
      if (writeSeqRef.current[field] !== seq) return;
      if (!res.ok) throw new Error(data.error || "Save failed");
      initialValuesRef.current = { ...initialValuesRef.current, [field]: value };
      setUpdatedAt(data.memory?.updated_at ?? new Date().toISOString());
      setFieldSaveState(field, "saved");
      setTimeout(() => {
        setSaveState((prev) =>
          prev[field] === "saved" ? { ...prev, [field]: "idle" } : prev
        );
      }, 1800);
    } catch {
      if (writeSeqRef.current[field] !== seq) return;
      setFieldSaveState(field, "error");
    }
  }

  async function toggleEnabled(checked: boolean) {
    setEnabledBusy(true);
    const prev = enabled;
    setEnabled(checked);
    try {
      const { toggleProjectMemory } = await import(
        "@/app/(app)/projects/[id]/actions"
      );
      const result = await toggleProjectMemory(projectId, checked);
      if (result.error) throw new Error(result.error);
    } catch (err) {
      setEnabled(prev);
      setGlobalError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setEnabledBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Project memory</p>
          <p className="text-xs text-muted-foreground">
            When on, every chat &amp; compare in this project is given this
            context as background knowledge.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {enabledBusy && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <Switch
            checked={enabled}
            onCheckedChange={toggleEnabled}
            disabled={enabledBusy}
          />
          <Badge variant={enabled ? "default" : "outline"} className="text-[10px]">
            {enabled ? "On" : "Off"}
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Last updated: {formatRelative(updatedAt)}</span>
        <span>Auto-saves on blur</span>
      </div>

      {globalError && (
        <p className="text-sm text-destructive">{globalError}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading memory…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {MEMORY_FIELDS.map((f) => {
            const state = saveState[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{f.label}</Label>
                  <span className="text-[10px] text-muted-foreground h-4">
                    {state === "saving" && "Saving…"}
                    {state === "saved" && "Saved ✓"}
                    {state === "error" && (
                      <span className="text-destructive">Save failed</span>
                    )}
                  </span>
                </div>
                <Textarea
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  onBlur={(e) => saveField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={f.rows}
                  className="resize-none text-sm"
                  disabled={!enabled && false /* always editable */}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
