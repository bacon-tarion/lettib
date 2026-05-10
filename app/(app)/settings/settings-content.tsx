"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTile } from "@/components/settings/api-key-tile";
import { BuiltInProviderTile } from "@/components/settings/built-in-provider-tile";
import type { ApiConnection } from "./actions";
import { PRICING_USD } from "@/lib/pricing";

const PROVIDERS = [
  { id: "openai",    label: "OpenAI",    color: "bg-blue-500",   initial: "O" },
  { id: "anthropic", label: "Anthropic", color: "bg-amber-500",  initial: "A" },
  { id: "google",    label: "Google",    color: "bg-green-500",  initial: "G" },
  { id: "xai",       label: "xAI (Grok)", color: "bg-violet-600", initial: "X" },
  { id: "custom",    label: "Custom",    color: "bg-slate-500",  initial: "C" },
];

interface SettingsContentProps {
  initialConnections: ApiConnection[];
  userEmail: string;
  userName: string;
  /** Server has GROQ_API_KEY — built-in Groq models work without a user key */
  groqBuiltinConfigured: boolean;
}

export function SettingsContent({
  initialConnections,
  userEmail,
  userName,
  groqBuiltinConfigured,
}: SettingsContentProps) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [displayName, setDisplayName] = useState(userName);

  // Sync when the server re-renders after router.refresh()
  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections]);

  useEffect(() => {
    setDisplayName(userName);
  }, [userName]);

  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        {/* ── API Keys ── */}
        <TabsContent value="api-keys" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROVIDERS.slice(0, 3).map((p) => {
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
                  onUpdate={refresh}
                />
              );
            })}
            <BuiltInProviderTile
              label="Groq"
              initial="Q"
              color="bg-fuchsia-600"
              configured={groqBuiltinConfigured}
            />
            {PROVIDERS.slice(3).map((p) => {
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
              LettiB uses them only to make requests on your behalf. Groq
              (built-in) uses the host&apos;s server key instead of Vault.
            </p>
          </div>
        </TabsContent>

        {/* ── Account ── */}
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

        {/* ── Subscription ── */}
        <TabsContent value="subscription" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Badge className="text-sm px-3 py-1">Free during beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Full access to all features while LettiB is in beta. When billing is
            live, plans are{" "}
            {`Free ($${PRICING_USD.free} forever), Pro ($${PRICING_USD.proMonthly}/month), Power ($${PRICING_USD.powerMonthly}/month), and Lifetime BYOK ($${PRICING_USD.lifetimeByok} one-time).`}{" "}
            See the{" "}
            <Link
              href="/pricing"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              pricing page
            </Link>{" "}
            for details.
          </p>
          <Button variant="outline" asChild>
            <Link href="/pricing">View plans</Link>
          </Button>
        </TabsContent>

        {/* ── Privacy ── */}
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
