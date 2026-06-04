"use client";

import { useRef, useState, type ReactNode } from "react";
import { Paperclip, X, Loader2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
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
  /** Wrap children in a drag-and-drop upload zone. */
  dropZone?: boolean;
  dropZoneHint?: string;
  children?: ReactNode;
}

export function FileAttachments({
  files,
  onChange,
  disabled,
  selectedModelId,
  className,
  showChips = true,
  showButton = true,
  dropZone = false,
  dropZoneHint = "Drop files here or click to browse",
  children,
}: FileAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  function openPicker() {
    if (disabled || uploading) return;
    inputRef.current?.click();
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      multiple
      disabled={disabled || uploading}
      onChange={(e) => {
        void handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const chips =
    showChips && files.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {files.map((f) => (
          <div
            key={f.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-card",
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
            {(f.status === "ready" || f.status === "error") && (
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className={cn(
                  "ml-0.5",
                  f.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground hover:text-destructive"
                )}
                aria-label={`Remove ${f.name}`}
                title={f.error}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    ) : null;

  const attachButton =
    showButton && !dropZone ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={disabled || uploading}
        onClick={openPicker}
        aria-label="Attach file"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </Button>
    ) : null;

  if (dropZone) {
    return (
      <div className={cn("space-y-2", className)}>
        {chips}
        {visionWarning && (
          <div className="flex items-start gap-2 rounded-md border border-secondary/40 bg-secondary/5 px-3 py-2 text-xs text-secondary">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              The selected model may not support images. Switch to Claude, GPT-4o,
              Gemini, or Grok for vision capabilities.
            </span>
          </div>
        )}
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed transition-colors bg-card/30",
            dragOver
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-muted-foreground/25 hover:border-muted-foreground/40",
            (disabled || uploading) && "opacity-60 pointer-events-none"
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled && !uploading) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOver(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            if (!disabled && !uploading) void handleFiles(e.dataTransfer.files);
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.closest(
                "textarea, input, button, a, [role='combobox'], [contenteditable='true']"
              )
            ) {
              return;
            }
            openPicker();
          }}
        >
          {children}
          <div className="absolute left-2 bottom-2 z-10 flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={disabled || uploading}
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              aria-label="Attach file"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
          </div>
          {!children && (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center pointer-events-none">
              <Upload
                className={cn(
                  "h-6 w-6 mb-2",
                  dragOver ? "text-primary" : "text-muted-foreground"
                )}
              />
              <p className="text-sm font-medium">{dropZoneHint}</p>
            </div>
          )}
          {fileInput}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {chips}

      {visionWarning && (
        <div className="flex items-start gap-2 rounded-md border border-secondary/40 bg-secondary/5 px-3 py-2 text-xs text-secondary">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            The selected model may not support images. Switch to Claude, GPT-4o,
            Gemini, or Grok for vision capabilities.
          </span>
        </div>
      )}

      {fileInput}
      {attachButton}
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
