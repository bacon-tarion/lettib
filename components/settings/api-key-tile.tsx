"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { testApiKey, deleteApiKey } from "@/app/(app)/settings/actions";
import { AddKeyDialog } from "./add-key-dialog";
import type { ApiConnection } from "@/app/(app)/settings/actions";

interface ApiKeyTileProps {
  provider: string;
  label: string;
  color: string;
  initial: string;
  connection: ApiConnection | null;
  onUpdate: () => void;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "not_connected") {
    return (
      <Badge variant="outline" className="text-xs">
        Not connected
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge
        variant="outline"
        className="text-xs border-green-500 text-green-600 flex items-center gap-1 w-fit"
      >
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }
  if (status === "untested") {
    return (
      <Badge
        variant="outline"
        className="text-xs text-amber-600 border-amber-400"
      >
        Untested
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-xs border-red-400 text-red-600 flex items-center gap-1 w-fit"
    >
      <AlertCircle className="h-3 w-3" />
      Invalid
    </Badge>
  );
}

export function ApiKeyTile({
  provider,
  label,
  color,
  initial,
  connection,
  onUpdate,
}: ApiKeyTileProps) {
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const isConnected = !!connection;

  async function handleTest() {
    if (!connection) return;
    setTesting(true);
    setTestResult(null);
    const result = await testApiKey(connection.id);
    setTestResult(result);
    setTesting(false);
    onUpdate();
  }

  async function handleDelete() {
    if (!connection) return;
    setDeleting(true);
    await deleteApiKey(connection.id);
    setDeleting(false);
    onUpdate();
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <StatusBadge status={connection?.status ?? null} />
              {connection?.key_last_four && (
                <span className="text-xs text-muted-foreground font-mono">
                  ••••{connection.key_last_four}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Custom model name */}
        {connection?.custom_model_name && (
          <p className="text-xs text-muted-foreground truncate">
            Model: {connection.custom_model_name}
          </p>
        )}

        {/* Test feedback */}
        {testResult && !testResult.success && testResult.error && (
          <p className="text-xs text-red-600 break-words">{testResult.error}</p>
        )}
        {testResult?.success && (
          <p className="text-xs text-green-600">Connection verified!</p>
        )}

        {/* Actions */}
        {!isConnected ? (
          <AddKeyDialog provider={provider} label={label} onSuccess={onUpdate}>
            <Button size="sm" variant="outline" className="w-full">
              Add Key
            </Button>
          </AddKeyDialog>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1"
              onClick={handleTest}
              disabled={testing}
            >
              {testing && <Loader2 className="h-3 w-3 animate-spin" />}
              {testing ? "Testing…" : "Test"}
            </Button>
            <AddKeyDialog provider={provider} label={label} onSuccess={onUpdate}>
              <Button size="sm" variant="outline" className="flex-1">
                Replace
              </Button>
            </AddKeyDialog>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 border-destructive/30 px-2.5"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete key"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
