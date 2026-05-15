"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

/**
 * Tiny widget-level error boundary used by the Usage Dashboard so one bad
 * render in (say) the 30-day card cannot poison the whole page. Pure
 * presentation — no telemetry / no retry button; the dashboard is read-only
 * and refreshing the page is the right escape hatch.
 */
type Props = { label: string; children: ReactNode };
type State = { hasError: boolean };

export class UsageWidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[UsageWidgetErrorBoundary]", this.props.label, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">{this.props.label}</span> failed to
            render. Reload the page to try again.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
