"use client";

import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ClearableTextareaProps = React.ComponentProps<typeof Textarea> & {
  onClear?: () => void;
  clearClassName?: string;
};

export function ClearableTextarea({
  value,
  className,
  onClear,
  onChange,
  clearClassName,
  ...props
}: ClearableTextareaProps) {
  const hasContent = typeof value === "string" && value.length > 0;

  function handleClear() {
    if (onClear) {
      onClear();
      return;
    }
    onChange?.({
      target: { value: "" },
    } as React.ChangeEvent<HTMLTextAreaElement>);
  }

  return (
    <div className="relative">
      <Textarea
        value={value}
        className={cn(hasContent && "pr-10", className)}
        onChange={onChange}
        {...props}
      />
      {hasContent && !props.disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-foreground",
            clearClassName
          )}
          onClick={handleClear}
          aria-label="Clear input"
          tabIndex={-1}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
