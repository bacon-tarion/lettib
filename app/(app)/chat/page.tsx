"use client";

import { useState } from "react";
import { Send, Save, GitCompare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockMessages, mockProjects, mockTeams } from "@/lib/mockData";

const PROVIDER_INITIALS: Record<string, string> = {
  anthropic: "A",
  openai: "O",
  google: "G",
  xai: "X",
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-amber-500",
  openai: "bg-blue-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
};

export default function ChatPage() {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-2rem)] max-w-3xl mx-auto">
      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        <Select defaultValue="proj-2">
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            {mockProjects.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="claude-opus-4-7">
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {mockTeams[0].models.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="professional">
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            {["professional", "technical", "friendly", "concise"].map((t) => (
              <SelectItem key={t} value={t} className="text-xs capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {mockMessages.map((msg) => {
          const isUser = msg.role === "user";
          const providerColor = msg.provider
            ? PROVIDER_COLORS[msg.provider] ?? "bg-gray-500"
            : "";
          const initial = msg.provider
            ? PROVIDER_INITIALS[msg.provider] ?? "?"
            : "U";

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isUser
                    ? "bg-muted text-foreground"
                    : `${providerColor} text-white`
                }`}
              >
                {isUser ? "U" : initial}
              </div>
              <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                <Card className={isUser ? "bg-primary text-primary-foreground border-0" : ""}>
                  <CardContent className="py-2.5 px-3">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </CardContent>
                </Card>
                {!isUser && msg.model && (
                  <div className="flex items-center gap-2 px-1">
                    <Badge variant="secondary" className="text-xs">
                      {msg.model}
                    </Badge>
                    {msg.cost_usd > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ${msg.cost_usd.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 space-y-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
            <Save className="h-3.5 w-3.5" />
            Save to Project
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
            <GitCompare className="h-3.5 w-3.5" />
            Compare
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            Create Synthesis
          </Button>
        </div>
        <div className="relative">
          <Textarea
            placeholder="Ask anything… (⌘Enter to send)"
            className="resize-none pr-12 min-h-[80px]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            size="icon"
            className="absolute right-2 bottom-2 h-8 w-8"
            disabled={!input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-right">
          ⌘Enter to send
        </p>
      </div>
    </div>
  );
}
