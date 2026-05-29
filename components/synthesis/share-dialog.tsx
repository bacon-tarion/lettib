"use client";

import { useState } from "react";
import Link from "next/link";
import { Share2, Copy, Check, Globe, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canUseShareLinks,
  shareLinkTierError,
} from "@/lib/subscription/tier";

interface ShareDialogProps {
  synthesisId: string;
  initialIsPublic: boolean;
  initialShareToken: string | null;
  userTier: string;
}

function buildUrl(token: string | null) {
  if (!token) return "";
  if (typeof window === "undefined") return `/share/${token}`;
  return `${window.location.origin}/share/${token}`;
}

export function ShareDialog({
  synthesisId,
  initialIsPublic,
  initialShareToken,
  userTier,
}: ShareDialogProps) {
  const canShare = canUseShareLinks(userTier);
  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [shareToken, setShareToken] = useState<string | null>(
    initialShareToken
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = buildUrl(shareToken);

  function handleShareClick() {
    if (!canShare) {
      setUpgradeOpen(true);
      return;
    }
    setOpen(true);
  }

  async function makePublic() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/syntheses/${synthesisId}/share`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enable sharing");
      setIsPublic(true);
      setShareToken(data.share_token ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable sharing");
    } finally {
      setBusy(false);
    }
  }

  async function makePrivate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/syntheses/${synthesisId}/unshare`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disable sharing");
      setIsPublic(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable sharing");
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(next: boolean) {
    if (busy) return;
    if (next) await makePublic();
    else await makePrivate();
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function handleCopyClick() {
    if (!isPublic || !shareToken) {
      await makePublic();
      return;
    }
    await handleCopy();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleShareClick}
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade to share</DialogTitle>
            <DialogDescription>{shareLinkTierError()}</DialogDescription>
          </DialogHeader>
          <Button asChild className="w-full">
            <Link href="/pricing">View plans</Link>
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share this synthesis
            </DialogTitle>
            <DialogDescription>
              Anyone with the link can view this synthesis. No sign-in required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="h-4 w-4 text-green-600" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="space-y-0.5">
                  <Label htmlFor="public-toggle" className="text-sm font-medium">
                    {isPublic ? "Public" : "Private"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isPublic
                      ? "Link is live — anyone with it can view."
                      : "Only you can see this synthesis."}
                  </p>
                </div>
              </div>
              <Switch
                id="public-toggle"
                checked={isPublic}
                disabled={busy}
                onCheckedChange={onToggle}
              />
            </div>

            {isPublic && url && (
              <div className="space-y-1.5">
                <Label htmlFor="share-url" className="text-xs">
                  Share link
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="text-xs font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="gap-1.5 shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            {!isPublic && (
              <Button
                variant="default"
                className="w-full gap-1.5"
                onClick={handleCopyClick}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Generate share link
              </Button>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
