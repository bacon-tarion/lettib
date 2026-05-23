"use client";

import { useRef, useState } from "react";
import { Paperclip, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALLOWED_EXTENSIONS,
  modelSupportsVision,
} from "@/lib/files/constants";

export type AttachedFile = {
  id: string;
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  text?: string | null;
  imageBase64?: string | null;
  status: "processing" | "ready" | "error";
  error?: string;
};

let attachId = 0;
function nextId() {
  attachId += 1;
  return `att-${Date.now()}-${attachId}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentsProps {
  files: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
  disabled?: boolean;
  selectedModelId?: string;
  className?: string;
  showChips?: boolean;
  showButton?: boolean;
}

export function FileAttachments({
  files,
  onChange,
  disabled,
  selectedModelId,
  className,
  showChips = true,
  showButton = true,
}: FileAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const hasImages = files.some(
    (f) => f.status === "ready" && f.imageBase64
  );
  const visionWarning =
    hasImages && selectedModelId && !modelSupportsVision(selectedModelId);

  async function handleFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setUploading(true);

    const pending: AttachedFile[] = Array.from(selected).map((f) => ({
      id: nextId(),
      name: f.name,
      size: f.size,
      ext: f.name.split(".").pop()?.toLowerCase() ?? "",
      mimeType: f.type,
      status: "processing" as const,
    }));

    const working = [...files, ...pending];
    onChange(working);

    const results = await Promise.all(
      Array.from(selected).map(async (file, i) => {
        const id = pending[i]!.id;
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/files/process", {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Upload failed");
          return {
            id,
            name: json.file.name as string,
            size: json.file.size as number,
            ext: json.file.ext as string,
            mimeType: json.file.mimeType as string,
            text: json.file.text as string | null,
            imageBase64: json.file.imageBase64 as string | null,
            status: "ready" as const,
          };
        } catch (err) {
          console.error("[FileAttachments] upload failed:", err);
          return {
            ...pending[i]!,
            status: "error" as const,
            error: err instanceof Error ? err.message : "Upload failed",
          };
        }
      })
    );

    const byId = new Map(working.map((f) => [f.id, f]));
    for (const r of results) byId.set(r.id, r);
    onChange(Array.from(byId.values()));
    setUploading(false);
  }

  function removeFile(id: string) {
    onChange(files.filter((f) => f.id !== id));
  }

  const accept = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

  return (
    <div className={cn("space-y-2", className)}>
      {showChips && files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <div
              key={f.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                f.status === "error" && "border-destructive/50 bg-destructive/5",
                f.status === "processing" && "opacity-70"
              )}
            >
              {f.status === "processing" ? (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              ) : null}
              <span className="max-w-[140px] truncate font-medium">{f.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatSize(f.size)}
              </span>
              {f.status === "ready" && (
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {f.status === "error" && (
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-destructive ml-0.5"
                  title={f.error}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {visionWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            The selected model may not support images. Switch to Claude, GPT-4o,
            Gemini, or Grok for vision capabilities.
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        disabled={disabled || uploading}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {showButton && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          aria-label="Attach file"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

/** Build prompt context string from attached text files */
export function buildFileContextText(files: AttachedFile[]): string {
  const textFiles = files.filter((f) => f.status === "ready" && f.text);
  if (textFiles.length === 0) return "";
  return (
    "\n\nAttached files:\n" +
    textFiles
      .map((f) => `<file name="${f.name}">\n${f.text}\n</file>`)
      .join("\n\n")
  );
}

/** Get image attachments ready for vision models */
export function getImageAttachments(
  files: AttachedFile[]
): { name: string; imageBase64: string }[] {
  return files
    .filter((f) => f.status === "ready" && f.imageBase64)
    .map((f) => ({ name: f.name, imageBase64: f.imageBase64! }));
}
