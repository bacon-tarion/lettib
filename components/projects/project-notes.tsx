"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SynthesisMarkdown } from "@/components/synthesis/synthesis-markdown";

interface ProjectNotesProps {
  projectId: string;
}

export function ProjectNotes({ projectId }: ProjectNotesProps) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/notes?project_id=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setContent(data.content ?? "");
        setLastSaved(data.updated_at ?? null);
      })
      .catch((err) => {
        console.error("[ProjectNotes] load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveNotes = useCallback(async (text: string, showSpinner = true) => {
    if (showSpinner) setSaving(true);
    try {
      const res = await fetch("/api/projects/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setLastSaved(data.updated_at ?? new Date().toISOString());
    } catch (err) {
      console.error("[ProjectNotes] save failed:", err);
    } finally {
      if (showSpinner) setSaving(false);
    }
  }, [projectId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void saveNotes(contentRef.current, false);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [saveNotes]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading notes…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("edit")}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant={mode === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("preview")}
          >
            Preview
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {lastSaved && (
            <span>
              Last saved{" "}
              {new Date(lastSaved).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void saveNotes(content, true)}
          >
            Save now
          </Button>
        </div>
      </div>

      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write notes in markdown — headers, **bold**, _italic_, checklists (- [ ] task)…"
          className="min-h-[320px] font-mono text-sm"
        />
      ) : (
        <div className="min-h-[320px] rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none">
          {content.trim() ? (
            <SynthesisMarkdown content={content} />
          ) : (
            <p className="text-muted-foreground text-sm not-prose">No notes yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
