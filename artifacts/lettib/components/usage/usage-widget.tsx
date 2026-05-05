import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UsageWidgetProps {
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export function UsageWidget({ provider, tokensIn, tokensOut, costUsd }: UsageWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium capitalize">{provider}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tokens in</span>
          <span>{tokensIn.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tokens out</span>
          <span>{tokensOut.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm font-medium">
          <span className="text-muted-foreground">Cost</span>
          <span>${costUsd.toFixed(4)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
