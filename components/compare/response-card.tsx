import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROVIDER_STYLES: Record<string, { border: string; bg: string; initial: string }> = {
  anthropic: { border: "border-l-amber-500", bg: "bg-amber-500", initial: "A" },
  openai: { border: "border-l-blue-500", bg: "bg-blue-500", initial: "O" },
  google: { border: "border-l-green-500", bg: "bg-green-500", initial: "G" },
  xai: { border: "border-l-purple-500", bg: "bg-purple-500", initial: "X" },
};

interface ResponseCardProps {
  provider: string;
  model: string;
  content: string;
  latencyMs?: number;
  tokenCount?: number;
}

export function ResponseCard({
  provider,
  model,
  content,
  latencyMs = 842,
  tokenCount = 324,
}: ResponseCardProps) {
  const style = PROVIDER_STYLES[provider] ?? {
    border: "border-l-gray-400",
    bg: "bg-gray-400",
    initial: "?",
  };

  return (
    <Card className={cn("flex flex-col h-full border-l-4", style.border)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
              style.bg
            )}
          >
            {style.initial}
          </div>
          <span className="text-sm font-medium flex-1 truncate">{model}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {latencyMs}ms
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-72">
        <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
      </CardContent>
      <CardFooter className="border-t pt-3">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted-foreground">{tokenCount} tokens</span>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
