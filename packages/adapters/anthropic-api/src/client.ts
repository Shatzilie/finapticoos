import Anthropic from "@anthropic-ai/sdk";
import type { Anthropic as AnthropicNs } from "@anthropic-ai/sdk";
import { computeCostCents } from "./cost.js";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  MODELS,
  type ConversationMessage,
  type MessageContent,
  type MessageResult,
  type ModelKey,
  type SendMessageOptions,
  type StreamEvent,
  type ToolDefinition,
  type UsageStats,
} from "./types.js";

export interface CreateAnthropicClientOptions {
  apiKey?: string;
  /** Override the default base URL (mostly for staging/proxies). */
  baseURL?: string;
}

export interface AnthropicAdapterClient {
  sendMessage(options: SendMessageOptions): Promise<MessageResult>;
  streamMessage(
    options: SendMessageOptions,
    onEvent: (event: StreamEvent) => void,
  ): Promise<MessageResult>;
}

function resolveApiKey(explicit?: string): string {
  const value = explicit ?? process.env.ANTHROPIC_API_KEY;
  if (!value || value.trim().length === 0) {
    throw new Error(
      "@finapticoos/adapter-anthropic-api: ANTHROPIC_API_KEY missing. Reuse the Finaptico stack key (do not open a new account).",
    );
  }
  return value.trim();
}

function applyPromptCaching(
  system: string | undefined,
  tools: ToolDefinition[] | undefined,
  enable: boolean,
): {
  system: AnthropicNs.Messages.MessageCreateParams["system"];
  tools: AnthropicNs.Messages.MessageCreateParams["tools"];
} {
  const systemParam = system
    ? enable
      ? [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }]
      : system
    : undefined;

  const toolsParam = tools && tools.length > 0
    ? tools.map((tool, index) => {
        const base = {
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema as AnthropicNs.Messages.Tool.InputSchema,
        };
        // Only the last tool needs the cache_control marker — Anthropic caches
        // every block up to that breakpoint, so a single marker covers them all.
        if (enable && index === tools.length - 1) {
          return { ...base, cache_control: { type: "ephemeral" as const } };
        }
        return base;
      })
    : undefined;

  return { system: systemParam, tools: toolsParam };
}

function adaptMessages(messages: ConversationMessage[]): AnthropicNs.Messages.MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content as AnthropicNs.Messages.MessageParam["content"],
  }));
}

function readUsage(raw: AnthropicNs.Messages.Usage | undefined): UsageStats {
  return {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheCreationInputTokens: raw?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: raw?.cache_read_input_tokens ?? 0,
  };
}

export function createAnthropicClient(
  options: CreateAnthropicClientOptions = {},
): AnthropicAdapterClient {
  const sdk = new Anthropic({
    apiKey: resolveApiKey(options.apiKey),
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });

  function buildBaseRequest(
    options: SendMessageOptions,
  ): { params: AnthropicNs.Messages.MessageCreateParams; modelKey: ModelKey } {
    const modelKey = options.model ?? DEFAULT_MODEL;
    const enableCaching = options.enablePromptCaching ?? true;
    const { system, tools } = applyPromptCaching(options.system, options.tools, enableCaching);
    const params: AnthropicNs.Messages.MessageCreateParams = {
      model: MODELS[modelKey],
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: adaptMessages(options.messages),
      ...(system !== undefined ? { system } : {}),
      ...(tools !== undefined ? { tools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };
    return { params, modelKey };
  }

  return {
    async sendMessage(options) {
      const { params, modelKey } = buildBaseRequest(options);
      const response = (await sdk.messages.create(params)) as AnthropicNs.Messages.Message;
      const usage = readUsage(response.usage);
      return {
        id: response.id,
        model: response.model as MessageResult["model"],
        stopReason: response.stop_reason ?? null,
        content: response.content as MessageContent[],
        usage,
        costCents: computeCostCents(modelKey, usage),
      };
    },

    async streamMessage(options, onEvent) {
      const { params, modelKey } = buildBaseRequest(options);
      const stream = sdk.messages.stream(params);

      stream.on("text", (delta: string) => {
        onEvent({ type: "text_delta", textDelta: delta });
      });

      stream.on("contentBlock", (block: AnthropicNs.Messages.ContentBlock) => {
        if (block.type === "tool_use") {
          onEvent({
            type: "tool_use_start",
            toolUse: { id: block.id, name: block.name },
          });
        }
      });

      const final = (await stream.finalMessage()) as AnthropicNs.Messages.Message;
      onEvent({ type: "message_stop" });
      const usage = readUsage(final.usage);
      return {
        id: final.id,
        model: final.model as MessageResult["model"],
        stopReason: final.stop_reason ?? null,
        content: final.content as MessageContent[],
        usage,
        costCents: computeCostCents(modelKey, usage),
      };
    },
  };
}
