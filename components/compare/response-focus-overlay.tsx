"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

interface ResponseFocusOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function ResponseFocusOverlay({
  open,
  onOpenChange,
  title,
  children,
}: ResponseFocusOverlayProps) {
  const isMobile = useIsMobile();
  const containerClassName =
    "flex flex-col gap-0 overflow-hidden p-0";
  const contentAreaClassName =
    "min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            containerClassName,
            "h-[100dvh] max-h-[100dvh] rounded-none border-0"
          )}
        >
          <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
            <SheetTitle className="text-base font-medium truncate pr-8">
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className={contentAreaClassName}>
            <div className="h-auto w-full">{children}</div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          containerClassName,
          "h-[90vh] max-h-[90vh] w-full sm:max-w-3xl lg:max-w-4xl"
        )}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle className="text-base font-medium truncate pr-8">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className={contentAreaClassName}>
          <div className="h-auto w-full">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
