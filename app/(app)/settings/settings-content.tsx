"use client";

import { Suspense, useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, BellRing, Loader2, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTile } from "@/components/settings/api-key-tile";
import type { ApiConnection } from "./actions";
import { updateUsageAlertThresholdCents } from "./actions";
import { SubscriptionTab } from "./subscription-tab";

const PROVIDERS: {
  id: string;
  label: string;
  color: string;
  initial: string;
  consoleUrl: string | null;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    color: "bg-blue-500",
    initial: "O",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    color: "bg-amber-500",
    initial: "A",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google",
    color: "bg-green-500",
    initial: "G",
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "groq",
    label: "Groq",
    color: "bg-fuchsia-600",
    initial: "Q",
    consoleUrl: "https://console.groq.com/keys",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    color: "bg-violet-600",
    initial: "X",
    consoleUrl: "https://console.x.ai",
  },
  {
    id: "custom",
    label: "Custom",
    color: "bg-slate-500",
    initial: "C",
    consoleUrl: null,
  },
];

interface SettingsContentProps {
  initialConnections: ApiConnection[];
  userEmail: string;
  userName: string;
  initialUsageAlertThresholdCents: number;
  subscriptionTier?: string;
  defaultTab?: string;
  showCheckoutSuccess?: boolean;
}

function SettingsContentInner({
  initialConnections,
  userEmail,
  userName,
  initialUsageAlertThresholdCents,
  subscriptionTier = "free",
  defaultTab = "api-keys",
  showCheckoutSuccess = false,
}: SettingsContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState(initialConnections);
  const [displayName, setDisplayName] = useState(userName);
  const [thresholdDollars, setThresholdDollars] = useState<string>(
    (initialUsageAlertThresholdCents / 100).toFixed(2)
  );
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const [thresholdSaving, startThresholdSave] = useTransition();
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections]);

  useEffect(() => {
    setDisplayName(userName);
  }, [userName]);

  useEffect(() => {
    setThresholdDollars((initialUsageAlertThresholdCents / 100).toFixed(2));
  }, [initialUsageAlertThresholdCents]);

  const refresh = useCallback(() => router.refresh(), [router]);

  function handleSaveThreshold() {
    setThresholdError(null);
    setThresholdSaved(false);
    const parsed = Number(thresholdDollars);
    if (!Number.isFinite(parsed)) {
      setThresholdError("Enter a number, e.g. 10");
      return;
    }
    const cents = Math.round(parsed * 100);
    if (cents < 100 || cents > 1_000_000) {
      setThresholdError("Must be between $1 and $10,000.");
      return;
    }
    startThresholdSave(async () => {
      const res = await updateUsageAlertThresholdCents(cents);
      if (!res.success) {
        setThresholdError(res.error ?? "Could not save.");
        return;
      }
      setThresholdSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROVIDERS.map((p) => {
              const connection =
                connections.find((c) => c.provider === p.id) ?? null;
              return (
                <ApiKeyTile
                  key={p.id}
                  provider={p.id}
                  label={p.label}
                  color={p.color}
                  initial={p.initial}
                  connection={connection}
                  consoleUrl={p.consoleUrl}
                  onUpdate={refresh}
                />
              );
            })}
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
            <p>
              Your API keys are encrypted and stored securely using Supabase
              Vault. They are never transmitted to your browser after saving.
              LettiB uses them only to make requests on your behalf.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-4 max-w-sm">
          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <BellRing className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <p>
              We show a toast every time your rolling 30-day spend (across all
              your connected providers) crosses a new multiple of this amount.
              Defaults to $10. Stored per-user, server-side.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usage-alert-threshold">
              Alert me every (USD)
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="usage-alert-threshold"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="10000"
                  step="1"
                  className="pl-6 tabular-nums"
                  value={thresholdDollars}
                  onChange={(e) => {
                    setThresholdDollars(e.target.value);
                    setThresholdSaved(false);
                  }}
                  disabled={thresholdSaving}
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveThreshold}
                disabled={thresholdSaving}
              >
                {thresholdSaving && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                )}
                Save
              </Button>
            </div>
            {thresholdError && (
              <p className="text-xs text-destructive">{thresholdError}</p>
            )}
            {thresholdSaved && !thresholdError && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Min $1, max $10,000. Stored in cents.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              value={userEmail}
              readOnly
              className="text-muted-foreground"
            />
          </div>
          <Button size="sm">Save Changes</Button>
        </TabsContent>

        <TabsContent value="subscription" className="mt-4 space-y-4">
          <SubscriptionTab
            subscriptionTier={subscriptionTier}
            showCheckoutSuccess={showCheckoutSuccess}
          />
        </TabsContent>

        <TabsContent value="privacy" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This
            action cannot be undone.
          </p>
          <Button variant="destructive" disabled>
            Delete all my data
          </Button>
          <p className="text-xs text-muted-foreground">
            Contact support to initiate account deletion during beta.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SettingsContent(props: SettingsContentProps) {
  return (
    <Suspense fallback={<div className="max-w-2xl text-sm text-muted-foreground">Loading settings…</div>}>
      <SettingsContentInner {...props} />
    </Suspense>
  );
}
