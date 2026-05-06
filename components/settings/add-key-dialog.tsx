"use client";

import { useState } from "react";
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
import { addApiKey } from "@/app/(app)/settings/actions";

const PROVIDER_LINKS: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google: "https://aistudio.google.com/app/apikey",
  xai: "https://console.x.ai",
};

const KEY_PLACEHOLDERS: Record<string, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  xai: "xai-...",
  google: "Your Google API key",
};

interface AddKeyDialogProps {
  provider: string;
  label: string;
  onSuccess: () => void;
  children: React.ReactNode;
}

export function AddKeyDialog({
  provider,
  label,
  onSuccess,
  children,
}: AddKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isCustom = provider === "custom";
  const providerLink = PROVIDER_LINKS[provider];
  const keyPlaceholder = KEY_PLACEHOLDERS[provider] ?? "Your API key";

  function reset() {
    setApiKey("");
    setBaseUrl("");
    setModelName("");
    setError(null);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const keyToStore = isCustom
      ? apiKey.trim() || "no-key"
      : apiKey.trim();

    const result = await addApiKey(
      provider,
      keyToStore,
      isCustom
        ? { baseUrl: baseUrl.trim(), modelName: modelName.trim() }
        : undefined
    );

    setLoading(false);

    if (result.success) {
      reset();
      setOpen(false);
      onSuccess();
    } else {
      setError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {label} key</DialogTitle>
          <DialogDescription>
            {isCustom
              ? "Connect any OpenAI-compatible API — Ollama, LM Studio, Mistral, Perplexity, DeepSeek, and more."
              : `Your key is encrypted immediately on save and never stored in plain text.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {isCustom ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="custom-base-url">
                  Base URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="custom-base-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-ollama-server.com/v1"
                  required
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-model-name">
                  Model Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="custom-model-name"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="llama3, mistral, deepseek-r1"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-api-key">
                  API Key{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="custom-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank if no auth required"
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Works with Ollama, LM Studio, Mistral, Perplexity, DeepSeek,
                or any OpenAI-compatible API.
              </p>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyPlaceholder}
                required
                autoFocus
                autoComplete="new-password"
              />
              {providerLink && (
                <p className="text-xs text-muted-foreground">
                  <a
                    href={providerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                    Get your {label} API key →
                  </a>
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
