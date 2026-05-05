import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

export function MessageBubble({ role, content, model }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 max-w-[80%]",
        role === "user" ? "self-end items-end" : "self-start items-start"
      )}
    >
      {model && (
        <span className="text-xs text-muted-foreground px-1">{model}</span>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {content}
      </div>
    </div>
  );
}
