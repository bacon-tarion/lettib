"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { rehypeAttributionBadges } from "@/lib/synthesis/rehype-attribution-badges";
import { cn } from "@/lib/utils";
import "highlight.js/styles/atom-one-dark.css";

type Props = {
  content: string;
  className?: string;
};

export function SynthesisMarkdown({ content, className }: Props) {
  return (
    <div
      className={cn(
        "synthesis-md prose prose-sm max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:leading-relaxed prose-li:leading-relaxed",
        "prose-pre:border prose-pre:border-border prose-pre:shadow-sm",
        "prose-pre:rounded-xl prose-pre:px-0 prose-pre:py-3 prose-pre:bg-[#282c34]",
        "prose-pre:text-inherit",
        "prose-code:rounded-md prose-code:bg-muted/70 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em]",
        "prose-code:before:content-none prose-code:after:content-none",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm",
        "[&_.hljs]:bg-transparent",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          rehypeAttributionBadges,
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
