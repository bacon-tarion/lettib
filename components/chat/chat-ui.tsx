"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useChat } from "ai/react";
import { Send, Settings } from "lucide-react";
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
import {
  MODELS_CATALOG,
  getProviderLabel,
  getModelById,
} from "@/lib/providers/models";
import type { ChatProject, ChatConnection } from "@/app/(app)/chat/page";

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-amber-500",
  openai: "bg-blue-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  custom: "bg-gray-500",
};

const PROVIDER_INITIALS: Record<string, string> = {
  anthropic: "A",
  openai: "O",
  google: "G",
  xai: "X",
  custom: "C",
};

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
  { value: "simple", label: "Simple" },
  { value: "persuasive", label: "Persuasive" },
];

type ModelOption = {
  value: string;
  label: string;
  provider: string;
  modelId: string;
};

type UsageInfo = {
  tokens_in: number;
  tokens_out: number;
  cost: number;
};

function buildModelOptions(connections: ChatConnection[]): ModelOption[] {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; name: string }[]
  >;

  return connections.flatMap((conn) => {
    if (conn.provider === "custom") {
      const modelId = conn.custom_model_name || "custom";
      return [
        {
          value: `custom::${modelId}`,
          label: `Custom — ${conn.custom_model_name || "Custom Model"}`,
          provider: "custom",
          modelId,
        },
      ];
    }
    const models = catalog[conn.provider] ?? [];
    return models.map((m) => ({
      value: `${conn.provider}::${m.id}`,
      label: `${getProviderLabel(conn.provider)} — ${m.name}`,
      provider: conn.provider,
      modelId: m.id,
    }));
  });
}

interface ChatUIProps {
  projects: ChatProject[];
  connections: ChatConnection[];
}

export function ChatUI({ projects, connections }: ChatUIProps) {
  const modelOptions = buildModelOptions(connections);
  const defaultModel = modelOptions[0];

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [selectedModelValue, setSelectedModelValue] = useState<string>(
    defaultModel?.value ?? ""
  );
  const [selectedTone, setSelectedTone] = useState("professional");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageUsage, setMessageUsage] = useState<Map<string, UsageInfo>>(
    new Map()
  );

  const conversationIdRef = useRef<string | null>(null);
  const lastUserInputRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const parsedModel = selectedModelValue.split("::");
  const selectedProvider = parsedModel[0] ?? "";
  const selectedModel = parsedModel[1] ?? "";

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } =
    useChat({
      api: "/api/chat",
      onFinish: useCallback(
        async (
          message: { id: string; content: string },
          options: { usage?: { promptTokens?: number; completionTokens?: number } }
        ) => {
          const usage = options?.usage;
          const tokensIn = usage?.promptTokens ?? 0;
          const tokensOut = usage?.completionTokens ?? 0;
          const latencyMs = Date.now() - startTimeRef.current;

          const catalog = MODELS_CATALOG as Record<
            string,
            readonly { id: string; cost_in: number; cost_out: number }[]
          >;
          const modelEntry = catalog[selectedProvider]?.find(
            (m) => m.id === selectedModel
          );
          const cost = modelEntry
            ? (modelEntry.cost_in * tokensIn) / 1_000_000 +
              (modelEntry.cost_out * tokensOut) / 1_000_000
            : 0;

          setMessageUsage((prev) =>
            new Map(prev).set(message.id, {
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              cost,
            })
          );

          try {
            const res = await fetch("/api/chat/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversation_id: conversationIdRef.current,
                project_id: selectedProjectId,
                messages: [
                  { role: "user", content: lastUserInputRef.current },
                  { role: "assistant", content: message.content },
                ],
                provider: selectedProvider,
                model: selectedModel,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                latency_ms: latencyMs,
              }),
            });
            const data = await res.json();
            if (data.conversation_id && !conversationIdRef.current) {
              setConversationId(data.conversation_id);
            }
          } catch {
            // save failures are non-fatal
          }
        },
        [selectedProvider, selectedModel, selectedProjectId]
      ),
    });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onModelChange(value: string) {
    setSelectedModelValue(value);
    setConversationId(null);
    setMessages([]);
  }

  function onProjectChange(value: string) {
    setSelectedProjectId(value);
    setConversationId(null);
    setMessages([]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    lastUserInputRef.current = input;
    startTimeRef.current = Date.now();
    handleSubmit(e, {
      body: {
        project_id: selectedProjectId,
        conversation_id: conversationIdRef.current,
        provider: selectedProvider,
        model: selectedModel,
        tone: selectedTone,
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem-2rem)] text-center gap-4">
        <div className="text-4xl">🔑</div>
        <div>
          <p className="font-semibold text-lg">No API keys connected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect an API key in Settings to start chatting.
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <a href="/settings">
            <Settings className="h-4 w-4" />
            Go to Settings
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-2rem)] max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        {projects.length > 0 && (
          <Select value={selectedProjectId} onValueChange={onProjectChange}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedModelValue} onValueChange={onModelChange}>
          <SelectTrigger className="w-56 h-8 text-xs">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTone} onValueChange={setSelectedTone}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            {TONES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-muted-foreground text-sm">
                Start a conversation with{" "}
                {modelOptions.find((o) => o.value === selectedModelValue)
                  ?.label ?? "your selected model"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ⌘Enter to send
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const providerColor =
            PROVIDER_COLORS[selectedProvider] ?? "bg-gray-500";
          const initial = PROVIDER_INITIALS[selectedProvider] ?? "?";
          const usage = messageUsage.get(msg.id);
          const modelEntry = !isUser
            ? getModelById(selectedProvider, selectedModel)
            : null;

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
              <div
                className={`max-w-[80%] space-y-1 flex flex-col ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                <Card
                  className={
                    isUser ? "bg-primary text-primary-foreground border-0" : ""
                  }
                >
                  <CardContent className="py-2.5 px-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </CardContent>
                </Card>
                {!isUser && (
                  <div className="flex items-center gap-2 px-1 flex-wrap">
                    {modelEntry && (
                      <Badge variant="secondary" className="text-xs">
                        {modelEntry.name}
                      </Badge>
                    )}
                    {usage && (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {usage.tokens_in + usage.tokens_out} tok
                        </span>
                        {usage.cost > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ${usage.cost.toFixed(5)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                PROVIDER_COLORS[selectedProvider] ?? "bg-gray-500"
              } text-white`}
            >
              {PROVIDER_INITIALS[selectedProvider] ?? "?"}
            </div>
            <div className="flex items-center gap-1.5 py-3 px-3">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <form onSubmit={onSubmit} className="shrink-0 space-y-2">
        <div className="relative">
          <Textarea
            placeholder="Ask anything… (⌘Enter to send)"
            className="resize-none pr-12 min-h-[80px]"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 bottom-2 h-8 w-8"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-between">
          {isLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Streaming…
            </span>
          )}
          <p className="text-xs text-muted-foreground ml-auto">⌘Enter to send</p>
        </div>
      </form>
    </div>
  );
}
