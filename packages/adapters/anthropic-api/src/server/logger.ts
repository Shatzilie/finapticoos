import { finapticoosActionsLog } from "@finapticoos/memory/schema";
import type { MemoryClient, MemoryDb } from "@finapticoos/memory";
import type { MessageResult } from "../types.js";

export interface ActionLogEntry {
  pluginId?: string | null;
  approvalId?: string | null;
  actionType: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status?: "pending" | "completed" | "failed";
  executedBy?: string | null;
  approvedBy?: string | null;
  message: MessageResult;
}

function resolveDb(input: MemoryClient | MemoryDb): MemoryDb {
  return "db" in input ? (input as MemoryClient).db : (input as MemoryDb);
}

/**
 * Persist a row in `crm.finapticoos_actions_log` summarising one Anthropic
 * call: tokens in/out, cost in cents, model, plus whatever payload/result
 * the caller wants to attach. Keeps the audit trail spec L102 + cost tracking
 * spec L68 satisfied without coupling adapter logic to the DB schema.
 */
export async function logAnthropicAction(
  client: MemoryClient | MemoryDb,
  entry: ActionLogEntry,
): Promise<{ id: string }> {
  const db = resolveDb(client);
  const inserted = await db
    .insert(finapticoosActionsLog)
    .values({
      pluginId: entry.pluginId ?? null,
      approvalId: entry.approvalId ?? null,
      actionType: entry.actionType,
      payload: entry.payload ?? {},
      result: entry.result ?? {},
      status: entry.status ?? "completed",
      executedBy: entry.executedBy ?? null,
      approvedBy: entry.approvedBy ?? null,
      tokensIn: entry.message.usage.inputTokens + entry.message.usage.cacheCreationInputTokens
        + entry.message.usage.cacheReadInputTokens,
      tokensOut: entry.message.usage.outputTokens,
      costCents: entry.message.costCents,
      model: entry.message.model,
    })
    .returning({ id: finapticoosActionsLog.id });
  const id = inserted[0]?.id;
  if (!id) {
    throw new Error("@finapticoos/adapter-anthropic-api: actions_log insert returned no id");
  }
  return { id };
}
