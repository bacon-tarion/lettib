import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface BuiltInProviderTileProps {
  label: string;
  initial: string;
  color: string;
  /** Host has configured GROQ_API_KEY */
  configured: boolean;
}

export function BuiltInProviderTile({
  label,
  initial,
  color,
  configured,
}: BuiltInProviderTileProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-xs gap-1 border-primary/40 text-primary"
              >
                <Sparkles className="h-3 w-3" />
                Built-in · no API key
              </Badge>
              {configured ? (
                <Badge
                  variant="outline"
                  className="text-xs border-green-500 text-green-600"
                >
                  Available
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-amber-700 border-amber-400"
                >
                  Not configured
                </Badge>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {configured
            ? "Llama and Mixtral on Groq are included for this workspace. Add Groq models to AI Teams without storing a key."
            : "This host has not set GROQ_API_KEY. Built-in Groq models are unavailable until it is configured."}
        </p>
      </CardContent>
    </Card>
  );
}
