"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { mockUser } from "@/lib/mockData";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", color: "bg-blue-500", initial: "O" },
  { id: "anthropic", label: "Anthropic", color: "bg-amber-500", initial: "A" },
  { id: "google", label: "Google", color: "bg-green-500", initial: "G" },
  { id: "xai", label: "xAI", color: "bg-purple-500", initial: "X" },
];

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState(mockUser.display_name);

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

        <TabsContent value="api-keys" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span>🔐</span>
            Keys are encrypted and stored securely. Never shared.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROVIDERS.map((p) => (
              <Card key={p.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`h-9 w-9 rounded-full ${p.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                    >
                      {p.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.label}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">
                        Not connected
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="w-full">
                    Add Key
                  </Button>
                </CardContent>
              </Card>
            ))}
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
            <Input value={mockUser.email} readOnly className="text-muted-foreground" />
          </div>
          <Button size="sm">Save Changes</Button>
        </TabsContent>

        <TabsContent value="subscription" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Badge className="text-sm px-3 py-1">Free during beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Full access to all features while LettiB is in beta. Pro pricing will
            be announced before launch.
          </p>
          <Button variant="outline">Join waitlist for Pro</Button>
        </TabsContent>

        <TabsContent value="privacy" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action
            cannot be undone.
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
