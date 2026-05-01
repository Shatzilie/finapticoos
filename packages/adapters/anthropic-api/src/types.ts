/**
 * Stable model identifiers FinapticoOS supports through the Anthropic API.
 *
 * Sonnet 4.6 is the default for plugin work — best balance of cost vs.
 * reasoning depth for control-plane decisions.
 *
 * Haiku 4.5 is opt-in for cheap, high-volume tasks where Sonnet would burn
 * budget unnecessarily (cost tracking surfaces this in actions_log).
 */
export const MODELS = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelKey];

export const DEFAULT_MODEL: ModelKey = "sonnet";
export const DEFAULT_MAX_TOKENS = 4096;

/** Public-facing message shape — mirrors the Anthropic SDK without leaking it. */
export interface MessageContentText {
  type: "text";
  text: string;
}

export interface MessageContentToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface MessageContentToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<MessageContentText>;
  is_error?: boolean;
}

export type MessageContent = MessageContentText | MessageContentToolUse | MessageContentToolResult;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string | MessageContent[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface SendMessageOptions {
  /** Defaults to "sonnet" — pass "haiku" to opt into the cheaper model. */
  model?: ModelKey;
  system?: string;
  messages: ConversationMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  /** Plugin slug or pseudo-id — copied into the cost log so we can attribute spend. */
  callerId?: string;
  /** When true (default), system + tools blocks get cache_control: ephemeral. */
  enablePromptCaching?: boolean;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface MessageResult {
  id: string;
  model: ModelId;
  stopReason: string | null;
  content: MessageContent[];
  usage: UsageStats;
  costCents: number;
}

export interface StreamEvent {
  type: "text_delta" | "tool_use_start" | "tool_use_input_delta" | "message_stop";
  textDelta?: string;
  toolUse?: { id: string; name: string };
  toolInputJsonDelta?: string;
}
