"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "ai/react";
import type { Message } from "ai";
import { Send, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClearableTextarea } from "@/components/ui/clearable-textarea";
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
import { estimateChatCost, formatCostRange } from "@/lib/cost-estimate";
import type { ChatProject, ChatConnection } from "@/app/(app)/chat/page";
import {
  compareToChatStorageKey,
  type CompareToChatHandoff,
} from "@/lib/compare/to-chat-handoff";
import { RestoreSessionBanner } from "@/components/session/restore-session-banner";
import {
  useWebSearchPreference,
  WebSearchToggle,
} from "@/components/web-search/toggle";
import { LETTIB_STATE_CHAT, SESSION_STATE_TTL_MS } from "@/lib/session/keys";
import {
  FileAttachments,
  type AttachedFile,
  buildFileContextText,
  getImageAttachments,
} from "@/components/chat/file-attachments";
import {
  ChatOrganizer,
  STANDALONE_PROJECT_VALUE,
} from "@/components/chat/chat-organizer";

/** Survives React Strict Mode remount so Compare→Chat handoff is not lost after first read. */
const compareHandoffByNonce = new Map<string, CompareToChatHandoff>();
const compareHandoffSeedSaved = new Set<string>();

function loadCompareHandoffFromSession(nonce: string): CompareToChatHandoff | null {
  let cached = compareHandoffByNonce.get(nonce);
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(compareToChatStorageKey(nonce));
    if (!raw) return null;
    cached = JSON.parse(raw) as CompareToChatHandoff;
    sessionStorage.removeItem(compareToChatStorageKey(nonce));
    compareHandoffByNonce.set(nonce, cached);
    window.setTimeout(() => compareHandoffByNonce.delete(nonce), 120_000);
    return cached;
  } catch {
    return null;
  }
}

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

type ChatStoredStateV1 = {
  v: 1;
  savedAt: number;
  messages: Message[];
  selectedModelValue: string;
  selectedProjectId: string;
  selectedTone: string;
  conversationId: string | null;
};

export function ChatUI({ projects, connections }: ChatUIProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Memoize options so referential identity is stable across renders.
  // Several effects depend on `modelOptions`; without useMemo a fresh array
  // each render makes them refire on every state change.
  const modelOptions = useMemo(() => buildModelOptions(connections), [connections]);
  const defaultModel = modelOptions[0];

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    STANDALONE_PROJECT_VALUE
  );
  const [selectedModelValue, setSelectedModelValue] = useState<string>(
    defaultModel?.value ?? ""
  );
  const [selectedTone, setSelectedTone] = useState("professional");
  const [webSearchEnabled, setWebSearchEnabled] = useWebSearchPreference();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageUsage, setMessageUsage] = useState<Map<string, UsageInfo>>(
    new Map()
  );
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [selectedProjectFileIds, setSelectedProjectFileIds] = useState<string[]>([]);

  const conversationIdRef = useRef<string | null>(null);
  const lastUserInputRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const sessionHydratedRef = useRef(false);
  const urlConversationAttemptedRef = useRef(false);
  const dbHydratedConversationRef = useRef<string | null>(null);

  async function hydrateConversationFromDb(cid: string, showBanner: boolean) {
    if (dbHydratedConversationRef.current === cid) return;
    setLoadingConversation(true);
    try {
      const res = await fetch(`/api/conversations/${cid}`);
      if (!res.ok) {
        console.error("[chat] failed to load conversation:", cid, res.status);
        return;
      }
      const data = (await res.json()) as {
        conversation: {
          mode: string;
          project_id: string | null;
          provider: string | null;
          model: string | null;
        };
        messages: { id: string; role: string; content: string }[];
      };
      if (data.conversation.mode !== "chat") return;

      const msgs: Message[] = (data.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      setMessages(msgs);
      setConversationId(cid);
      dbHydratedConversationRef.current = cid;
      if (
        data.conversation.project_id &&
        projects.some((p) => p.id === data.conversation.project_id)
      ) {
        setSelectedProjectId(data.conversation.project_id);
      } else if (!data.conversation.project_id) {
        setSelectedProjectId(STANDALONE_PROJECT_VALUE);
      }
      const pv =
        data.conversation.provider && data.conversation.model
          ? `${data.conversation.provider}::${data.conversation.model}`
          : null;
      if (pv && modelOptions.some((o) => o.value === pv)) {
        setSelectedModelValue(pv);
      }
      if (showBanner) setShowRestoreBanner(true);
    } catch (err) {
      console.error("[chat] hydrateConversationFromDb error:", err);
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (selectedProjectId === STANDALONE_PROJECT_VALUE) return;
    const p = projects.find((x) => x.id === selectedProjectId);
    if (!p?.default_chat_provider || !p?.default_chat_model) return;
    const v = `${p.default_chat_provider}::${p.default_chat_model}`;
    if (!modelOptions.some((o) => o.value === v)) return;
    setSelectedModelValue(v);
  }, [selectedProjectId, projects, modelOptions]);

  const parsedModel = selectedModelValue.split("::");
  const selectedProvider = parsedModel[0] ?? "";
  const selectedModel = parsedModel[1] ?? "";

  function resolveProjectIdForApi(): string | null {
    return selectedProjectId === STANDALONE_PROJECT_VALUE
      ? null
      : selectedProjectId;
  }

  const isStandalone =
    selectedProjectId === STANDALONE_PROJECT_VALUE ||
    !selectedProjectId;

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput } =
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
                project_id: resolveProjectIdForApi(),
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
              if (isStandalone) setShowOrganizer(true);
            }
          } catch (err) {
            console.error("[chat] save failed:", err);
          }
        },
        [selectedProvider, selectedModel, selectedProjectId, isStandalone]
      ),
    });

  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam && projects.some((p) => p.id === projectParam)) {
      setSelectedProjectId(projectParam);
      setConversationId(null);
      setMessages([]);
      sessionHydratedRef.current = true;
      router.replace("/chat");
    }
  }, [searchParams, projects, router, setMessages]);

  useEffect(() => {
    if (searchParams.get("fromCompare") === "1") return;
    const cid = searchParams.get("conversation");
    if (!cid || urlConversationAttemptedRef.current) return;
    urlConversationAttemptedRef.current = true;
    sessionHydratedRef.current = true;

    void (async () => {
      sessionHydratedRef.current = true;
      await hydrateConversationFromDb(cid, true);
      router.replace("/chat");
    })();
  }, [searchParams, router, projects, modelOptions]);

  useEffect(() => {
    if (searchParams.get("fromCompare") !== "1") return;
    const nonce = searchParams.get("h");
    if (!nonce) {
      router.replace("/chat");
      return;
    }

    const payload = loadCompareHandoffFromSession(nonce);
    if (!payload) {
      router.replace("/chat");
      return;
    }

    const modelValue = `${payload.provider}::${payload.model}`;
    const opts = buildModelOptions(connections);
    if (!opts.some((o) => o.value === modelValue)) {
      router.replace("/chat");
      return;
    }

    setSelectedModelValue(modelValue);
    if (
      payload.projectId &&
      projects.some((p) => p.id === payload.projectId)
    ) {
      setSelectedProjectId(payload.projectId);
    }
    if (payload.tone && TONES.some((t) => t.value === payload.tone)) {
      setSelectedTone(payload.tone);
    }

    const assistantContent =
      payload.pristineCompareThread === true
        ? payload.compareResponse
        : "[Continued from Compare — your original prompt and this model's answer are below.]\n\n" +
          payload.compareResponse;
    const seedMessages: Message[] = [
      {
        id: `compare-${nonce}-user`,
        role: "user",
        content: payload.comparePrompt,
      },
      {
        id: `compare-${nonce}-assistant`,
        role: "assistant",
        content: assistantContent,
      },
    ];

    setMessages((prev) => (prev.length > 0 ? prev : seedMessages));

    if (!compareHandoffSeedSaved.has(nonce)) {
      compareHandoffSeedSaved.add(nonce);
      void (async () => {
        try {
          const res = await fetch("/api/chat/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id: null,
              project_id: payload.projectId || undefined,
              messages: seedMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              provider: payload.provider,
              model: payload.model,
              tokens_in: 0,
              tokens_out: 0,
              latency_ms: 0,
            }),
          });
          const data = await res.json();
          if (data.conversation_id) setConversationId(data.conversation_id);
        } catch {
          /* non-fatal */
        }
      })();
    }

    sessionHydratedRef.current = true;
    router.replace("/chat");
  }, [
    searchParams,
    router,
    connections,
    projects,
    setMessages,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || sessionHydratedRef.current) return;
    if (searchParams.get("fromCompare") === "1") return;
    if (searchParams.get("conversation")) return;
    try {
      const raw = sessionStorage.getItem(LETTIB_STATE_CHAT);
      if (!raw) return;
      const p = JSON.parse(raw) as ChatStoredStateV1;
      if (p.v !== 1 || !Array.isArray(p.messages)) return;
      if (Date.now() - p.savedAt > SESSION_STATE_TTL_MS) {
        sessionStorage.removeItem(LETTIB_STATE_CHAT);
        return;
      }
      sessionHydratedRef.current = true;
      setMessages(p.messages);
      if (p.selectedModelValue && modelOptions.some((o) => o.value === p.selectedModelValue)) {
        setSelectedModelValue(p.selectedModelValue);
      }
      if (p.selectedProjectId && projects.some((x) => x.id === p.selectedProjectId)) {
        setSelectedProjectId(p.selectedProjectId);
      }
      if (p.selectedTone && TONES.some((t) => t.value === p.selectedTone)) {
        setSelectedTone(p.selectedTone);
      }
      setConversationId(p.conversationId ?? null);
      setShowRestoreBanner(true);
      if (p.conversationId) {
        void hydrateConversationFromDb(p.conversationId, false);
      }
    } catch {
      try {
        sessionStorage.removeItem(LETTIB_STATE_CHAT);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams, setMessages, modelOptions, projects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      try {
        const payload: ChatStoredStateV1 = {
          v: 1,
          savedAt: Date.now(),
          messages,
          selectedModelValue,
          selectedProjectId,
          selectedTone,
          conversationId,
        };
        sessionStorage.setItem(LETTIB_STATE_CHAT, JSON.stringify(payload));
      } catch {
        /* quota / private mode */
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    messages,
    selectedModelValue,
    selectedProjectId,
    selectedTone,
    conversationId,
  ]);

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
    setShowOrganizer(false);
    setSelectedProjectFileIds([]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const fileContext = buildFileContextText(attachedFiles);
    lastUserInputRef.current = input.trim() + fileContext;
    startTimeRef.current = Date.now();
    handleSubmit(e, {
      body: {
        project_id: resolveProjectIdForApi(),
        conversation_id: conversationIdRef.current,
        provider: selectedProvider,
        model: selectedModel,
        tone: selectedTone,
        web_search: webSearchEnabled,
        file_context: fileContext || undefined,
        images: getImageAttachments(attachedFiles),
        project_file_ids:
          selectedProjectFileIds.length > 0 ? selectedProjectFileIds : undefined,
      },
    });
    setAttachedFiles([]);
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
      {showRestoreBanner && (
        <div className="mb-3 shrink-0">
          <RestoreSessionBanner
            onDismiss={() => {
              setShowRestoreBanner(false);
              try {
                sessionStorage.removeItem(LETTIB_STATE_CHAT);
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      )}
      {/* Top bar */}
      <div className="flex gap-2 flex-wrap mb-4 shrink-0">
        {projects.length > 0 && (
          <Select value={selectedProjectId} onValueChange={onProjectChange}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STANDALONE_PROJECT_VALUE} className="text-xs">
                No project (standalone)
              </SelectItem>
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
        {loadingConversation && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <p className="text-muted-foreground text-sm">Loading conversation…</p>
          </div>
        )}
        {!loadingConversation && messages.length === 0 && (
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
      {showOrganizer && isStandalone && conversationId && messages.length >= 2 && (
        <ChatOrganizer
          conversationId={conversationId}
          projects={projects}
          onDismiss={() => setShowOrganizer(false)}
        />
      )}
      <form onSubmit={onSubmit} className="shrink-0 space-y-2">
        <WebSearchToggle
          enabled={webSearchEnabled}
          onChange={setWebSearchEnabled}
        />
        <FileAttachments
          files={attachedFiles}
          onChange={setAttachedFiles}
          disabled={isLoading}
          selectedModelId={selectedModel}
          showButton={false}
        />
        <div className="relative">
          <FileAttachments
            files={attachedFiles}
            onChange={setAttachedFiles}
            disabled={isLoading}
            selectedModelId={selectedModel}
            showChips={false}
            className="absolute left-1 bottom-1 z-10"
          />
          <ClearableTextarea
            placeholder="Ask anything… (⌘Enter to send)"
            className="resize-none pr-12 pl-10 min-h-[80px]"
            value={input}
            onChange={handleInputChange}
            onClear={() => setInput("")}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            clearClassName="top-auto bottom-2 right-10"
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {isLoading && <span className="animate-pulse">Streaming…</span>}
            {selectedModel && input.trim().length > 0 && (
              <span className="tabular-nums">
                Estimated: ~
                {formatCostRange(estimateChatCost(input, selectedModel))}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">⌘Enter to send</p>
        </div>
      </form>
    </div>
  );
}
