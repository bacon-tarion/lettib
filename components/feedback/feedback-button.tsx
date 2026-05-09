"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = ["Bug", "Feature Request", "Improvement", "Other"] as const;

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("Bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMessage("");
    setCategory("Bug");
    setDone(false);
    setError(null);
  }

  async function handleSubmit() {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          page: pathname,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        // Allow the close transition to finish before clearing form
        setTimeout(reset, 200);
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
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
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Send feedback
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what&apos;s working, what&apos;s broken, or what you&apos;d like next.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex items-center gap-2 py-6 text-sm">
            <Check className="h-5 w-5 text-green-600" />
            Thanks for your feedback.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened, or what would you like to see?"
                className="resize-none h-28 text-sm"
                maxLength={5000}
                disabled={submitting}
              />
              <p className="text-[11px] text-muted-foreground">
                Page: <code className="font-mono">{pathname}</code>
              </p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        {!done && (
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !message.trim()}
            >
              {submitting && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
