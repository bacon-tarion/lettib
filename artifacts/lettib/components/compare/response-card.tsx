import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResponseCardProps {
  provider: string;
  model: string;
  content: string;
  tokensUsed?: number;
}

export function ResponseCard({ provider, model, content, tokensUsed }: ResponseCardProps) {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{model}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {provider}
          </Badge>
        </div>
        {tokensUsed !== undefined && (
          <p className="text-xs text-muted-foreground">{tokensUsed} tokens</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </CardContent>
    </Card>
  );
}
