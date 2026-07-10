import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from "ai";

type GoogleV2Model = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

type GoogleV2StreamPart = {
  type: string;
  delta?: string;
  finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown";
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  error?: unknown;
};

function mapV1OptionsToV2(options: LanguageModelV1CallOptions) {
  const {
    prompt,
    maxTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    responseFormat,
    seed,
    abortSignal,
    headers,
    providerMetadata,
    mode,
  } = options;

  const tools =
    mode.type === "regular"
      ? mode.tools
      : mode.type === "object-tool"
        ? [mode.tool]
        : undefined;

  const toolChoice = mode.type === "regular" ? mode.toolChoice : undefined;

  const resolvedResponseFormat =
    responseFormat ??
    (mode.type === "object-json"
      ? {
          type: "json" as const,
          schema: mode.schema,
          name: mode.name,
          description: mode.description,
        }
      : undefined);

  return {
    prompt,
    maxOutputTokens: maxTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    responseFormat: resolvedResponseFormat,
    seed,
    abortSignal,
    headers,
    providerOptions: providerMetadata,
    tools,
    toolChoice,
  } as Parameters<GoogleV2Model["doGenerate"]>[0];
}

function mapV2StreamToV1(
  stream: ReadableStream<GoogleV2StreamPart>
): ReadableStream<LanguageModelV1StreamPart> {
  return stream.pipeThrough(
    new TransformStream<GoogleV2StreamPart, LanguageModelV1StreamPart>({
      transform(part, controller) {
        switch (part.type) {
          case "text-delta":
            controller.enqueue({
              type: "text-delta",
              textDelta: part.delta ?? "",
            });
            break;
          case "reasoning-delta":
            controller.enqueue({
              type: "reasoning",
              textDelta: part.delta ?? "",
            });
            break;
          case "finish":
            controller.enqueue({
              type: "finish",
              finishReason: part.finishReason ?? "unknown",
              usage: {
                promptTokens: part.usage?.inputTokens ?? 0,
                completionTokens: part.usage?.outputTokens ?? 0,
              },
            });
            break;
          case "tool-call":
            controller.enqueue({
              type: "tool-call",
              toolCallType: "function",
              toolCallId: part.toolCallId ?? "",
              toolName: part.toolName ?? "",
              args: JSON.stringify(part.input ?? {}),
            });
            break;
          case "error":
            controller.enqueue({ type: "error", error: part.error });
            break;
          default:
            break;
        }
      },
    })
  );
}

function wrapGoogleV2ModelAsV1(v2: GoogleV2Model): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: v2.provider,
    modelId: v2.modelId,
    defaultObjectGenerationMode: "json",
    async doGenerate(options: LanguageModelV1CallOptions) {
      const result = await v2.doGenerate(mapV1OptionsToV2(options));
      const text = result.content
        .filter((part) => part.type === "text")
        .map((part) => ("text" in part ? part.text : ""))
        .join("");
      const toolCalls = result.content
        .filter((part) => part.type === "tool-call")
        .map((part) => {
          const call = part as {
            toolCallId: string;
            toolName: string;
            input: unknown;
          };
          return {
            toolCallType: "function" as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            args: JSON.stringify(call.input),
          };
        });

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
        },
        rawCall: {
          rawPrompt: options.prompt,
          rawSettings: {},
        },
      };
    },
    async doStream(options: LanguageModelV1CallOptions) {
      const result = await v2.doStream(mapV1OptionsToV2(options));
      return {
        stream: mapV2StreamToV1(
          result.stream as ReadableStream<GoogleV2StreamPart>
        ),
        rawCall: {
          rawPrompt: options.prompt,
          rawSettings: {},
        },
      };
    },
  };
}

/** @ai-sdk/google v2 returns LanguageModelV2; ai v4 requires LanguageModelV1. */
export function createGoogleLanguageModel(
  apiKey: string,
  modelId: string
): LanguageModelV1 {
  const v2 = createGoogleGenerativeAI({ apiKey })(modelId);
  return wrapGoogleV2ModelAsV1(v2);
}
