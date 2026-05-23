"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getWebSearchPreference,
  setWebSearchPreference,
} from "@/lib/web-search/preference";

interface WebSearchToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

export function WebSearchToggle({
  enabled,
  onChange,
  className,
}: WebSearchToggleProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Globe
          className={`h-3.5 w-3.5 ${enabled ? "text-primary" : "text-muted-foreground"}`}
        />
        <Label htmlFor="web-search-toggle" className="text-xs cursor-pointer">
          Web Search
        </Label>
        <Switch
          id="web-search-toggle"
          checked={enabled}
          onCheckedChange={(v) => {
            setWebSearchPreference(v);
            onChange(v);
          }}
        />
      </div>
      {enabled && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Web search enabled — additional costs may apply
        </p>
      )}
    </div>
  );
}

export function useWebSearchPreference(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(getWebSearchPreference());
  }, []);

  const update = (v: boolean) => {
    setWebSearchPreference(v);
    setEnabled(v);
  };

  return [enabled, update];
}
