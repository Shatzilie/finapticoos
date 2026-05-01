/**
 * FinapticoOS Sprint 0 Bloque 9 — caso prueba inaugural.
 *
 * Smoke end-to-end del stack completo Sprint 0 sobre el prospect inaugural
 * Marta Bellot (id 411ebb54-c7f8-44a1-9096-27d4b7c97912 en BD CRM,
 * sincronía con fixture Berta V1 run d9b18e6f-e256-4951-90b0-8ea6d95da07b).
 *
 * Ejecuta los 8 pasos del plan (sprint0_finapticoos.md L292-304):
 *   1. Lee prospect Marta + dossier (interactions + meetings) via @finapticoos/bridge.
 *   2. Construye prompt "resume perfil 3 líneas" con el dossier.
 *   3. Llama Sonnet 4.6 via @finapticoos/adapter-anthropic-api con prompt caching.
 *   4. Escribe el resumen a crm.agent_shared_memory scope `prospect:marta-bellot`
 *      (OpenAI text-embedding-3-small, vector 1536 dims).
 *   5. Encola aprobación humana en crm.finapticoos_approvals.
 *   6. Polling: espera hasta que la aprobación pase a status='approved'
 *      (manual SQL UPDATE en Supabase Dashboard).
 *   7. Ejecuta acción ficticia (log a stdout — Sprint 0 no toca CRM real).
 *   8. Reporta audit log entry en crm.finapticoos_actions_log con
 *      tokens + cost + model.
 *
 * Trigger: `pnpm --filter @finapticoos/smoke smoke:marta` desde la Console
 * del container Easypanel (con env vars ya configurados — Bloque 6 + 7a).
 *
 * Verificación: < 30s end-to-end (excluyendo la espera humana del paso 6,
 * que se descuenta del timer). Trazabilidad completa con timestamps + ms
 * por paso.
 */
import { eq } from "drizzle-orm";
import { createBridgeClient, getProspectDossier } from "@finapticoos/bridge";
import {
  createAnthropicClient,
  type MessageResult,
} from "@finapticoos/adapter-anthropic-api";
import { logAnthropicAction } from "@finapticoos/adapter-anthropic-api/server";
import {
  createMemoryClient,
  createEmbeddingsClient,
  createMemoryHelpers,
  finapticoosApprovals,
} from "@finapticoos/memory";

const MARTA_PROSPECT_ID = "411ebb54-c7f8-44a1-9096-27d4b7c97912";
const MEMORY_SCOPE = "prospect:marta-bellot";
const PLUGIN_SLUG = "finapticoos-smoke";
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const APPROVAL_POLL_INTERVAL_MS = 5_000;

const SYSTEM_PROMPT = `Eres un analista CFO de Finaptico. Genera resúmenes
breves, precisos y accionables sobre prospects para que el agente de Berta
los use al preparar reuniones de descubrimiento. No inventes datos que no
estén en el dossier; si falta información, dilo.`;

interface StepLog {
  step: number;
  label: string;
  startedAt: number;
  durationMs: number;
  excludedFromTotal?: boolean;
}

const stepLogs: StepLog[] = [];

function logStep(step: number, label: string): { done: (extra?: Partial<StepLog>) => void } {
  const startedAt = Date.now();
  console.log(`[smoke step ${step}] ${label}…`);
  return {
    done(extra) {
      const durationMs = Date.now() - startedAt;
      stepLogs.push({ step, label, startedAt, durationMs, ...extra });
      console.log(`[smoke step ${step}] ${label} ✓ ${durationMs} ms`);
    },
  };
}

function buildPrompt(dossier: NonNullable<Awaited<ReturnType<typeof getProspectDossier>>>): string {
  const interactions = dossier.interactions
    .slice(0, 10)
    .map((row, idx) => {
      const date = row.interactionDate?.toISOString().split("T")[0] ?? "?";
      const summary = row.summary ?? row.notes ?? "(sin resumen)";
      return `${idx + 1}. ${date} · ${row.interactionType ?? "?"} · ${summary}`;
    })
    .join("\n");
  const meetings = dossier.meetings
    .slice(0, 5)
    .map((row, idx) => {
      const date = row.meetingDate?.toISOString().split("T")[0] ?? "?";
      return `${idx + 1}. ${date} · ${row.meetingType ?? "?"} · ${row.title ?? "(sin título)"}`;
    })
    .join("\n");
  return `## Prospect (crm.prospects)
- id: ${dossier.prospect.id}
- org_id: ${dossier.prospect.orgId}
- origin: ${dossier.prospect.origin ?? "?"}
- status: ${dossier.prospect.status ?? "?"}
- first_contact_date: ${dossier.prospect.firstContactDate ?? "?"}
- preferred_language: ${dossier.prospect.preferredLanguage ?? "?"}

## Interactions (newest first, max 10)
${interactions || "(ninguna)"}

## Meetings (newest first, max 5)
${meetings || "(ninguna)"}

Resume el perfil de este prospect en exactamente 3 líneas, en español,
optimizado para que un agente lo lea antes de una reunión.`;
}

async function waitForApproval(
  client: ReturnType<typeof createMemoryClient>,
  approvalId: string,
): Promise<{ status: string; durationMs: number }> {
  const startedAt = Date.now();
  let lastStatus = "pending";
  while (Date.now() - startedAt < APPROVAL_TIMEOUT_MS) {
    const rows = await client.db
      .select({
        status: finapticoosApprovals.status,
      })
      .from(finapticoosApprovals)
      .where(eq(finapticoosApprovals.id, approvalId))
      .limit(1);
    lastStatus = rows[0]?.status ?? "missing";
    if (lastStatus === "approved" || lastStatus === "rejected") {
      return { status: lastStatus, durationMs: Date.now() - startedAt };
    }
    await new Promise((resolve) => setTimeout(resolve, APPROVAL_POLL_INTERVAL_MS));
  }
  return { status: `timeout:${lastStatus}`, durationMs: Date.now() - startedAt };
}

async function main(): Promise<void> {
  const overallStart = Date.now();
  console.log(`[smoke] FinapticoOS Sprint 0 Bloque 9 — caso Marta Bellot`);
  console.log(`[smoke] prospect_id=${MARTA_PROSPECT_ID}`);
  console.log("");

  // Paso 1 — bridge dossier
  const bridge = createBridgeClient();
  const step1 = logStep(1, "bridge.getProspectDossier(marta)");
  const dossier = await getProspectDossier(bridge, MARTA_PROSPECT_ID);
  step1.done();
  if (!dossier) {
    throw new Error(`Prospect ${MARTA_PROSPECT_ID} no encontrado en crm.prospects. Verificar BD.`);
  }
  console.log(
    `[smoke] dossier: ${dossier.interactions.length} interactions, ${dossier.meetings.length} meetings\n`,
  );

  // Paso 2 — build prompt (instantáneo, lo logueamos para trazabilidad)
  const step2 = logStep(2, "build prompt 3-líneas");
  const userPrompt = buildPrompt(dossier);
  step2.done();

  // Paso 3 — Anthropic Sonnet 4.6
  const anthropic = createAnthropicClient();
  const step3 = logStep(3, "Sonnet 4.6 sendMessage");
  const message: MessageResult = await anthropic.sendMessage({
    model: "sonnet",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 400,
    callerId: PLUGIN_SLUG,
  });
  step3.done();
  const summary = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  console.log(`[smoke] summary (${message.usage.outputTokens} tokens out, ${message.costCents}¢):`);
  console.log(summary);
  console.log("");

  // Paso 4 — escribir a memoria semántica
  const memoryClient = createMemoryClient();
  const embeddings = createEmbeddingsClient();
  const memory = createMemoryHelpers({ client: memoryClient, embeddings });
  const step4 = logStep(4, "memory.writeMemory(prospect:marta-bellot)");
  const { id: memoryId } = await memory.writeMemory({
    scope: MEMORY_SCOPE,
    content: summary,
    createdBy: PLUGIN_SLUG,
    metadata: {
      prospectId: MARTA_PROSPECT_ID,
      run: "sprint-0-bloque-9-smoke",
      generatedBy: "claude-sonnet-4-6",
    },
  });
  step4.done();
  console.log(`[smoke] agent_shared_memory.id=${memoryId}\n`);

  // Paso 5 — encolar aprobación
  const step5 = logStep(5, "encolar aprobación humana");
  const inserted = await memoryClient.db
    .insert(finapticoosApprovals)
    .values({
      actionType: "smoke.publish_summary",
      payload: {
        prospectId: MARTA_PROSPECT_ID,
        memoryId,
        summary,
        run: "sprint-0-bloque-9-smoke",
      },
      requestedBy: PLUGIN_SLUG,
    })
    .returning({ id: finapticoosApprovals.id });
  const approvalId = inserted[0]?.id;
  if (!approvalId) {
    throw new Error("crm.finapticoos_approvals insert returned no id");
  }
  step5.done();
  console.log(`[smoke] approval_id=${approvalId}`);
  console.log(`[smoke] APROBAR EJECUTANDO EN SUPABASE SQL EDITOR:`);
  console.log(
    `        UPDATE crm.finapticoos_approvals SET status='approved', decided_at=now() WHERE id='${approvalId}';\n`,
  );

  // Paso 6 — polling aprobación (excluido del timer total porque depende del humano)
  const step6 = logStep(6, "esperar aprobación (excl. del total)");
  const approval = await waitForApproval(memoryClient, approvalId);
  step6.done({ excludedFromTotal: true });
  if (approval.status !== "approved") {
    throw new Error(
      `Aprobación no concedida (status=${approval.status} tras ${approval.durationMs} ms). Smoke abortado.`,
    );
  }
  console.log(`[smoke] aprobación concedida en ${approval.durationMs} ms\n`);

  // Paso 7 — acción ficticia (Sprint 0 no toca CRM real, solo log a stdout)
  const step7 = logStep(7, "acción ficticia (stdout-only)");
  console.log(`[smoke] >>> [Bloque 9] acción ficticia ejecutada para prospect Marta Bellot`);
  console.log(`[smoke] >>> resumen disponible en crm.agent_shared_memory.${memoryId}`);
  console.log(`[smoke] >>> Sprint 1 (Editors) reemplazará este log por POST real CRM via 7b webhook`);
  step7.done();
  console.log("");

  // Paso 8 — audit log
  const step8 = logStep(8, "audit log finapticoos_actions_log");
  const { id: actionsLogId } = await logAnthropicAction(memoryClient, {
    actionType: "smoke.summarise_prospect",
    approvalId,
    payload: { prospectId: MARTA_PROSPECT_ID, memoryId },
    result: { summary, memoryId, status: "completed" },
    status: "completed",
    message,
  });
  step8.done();
  console.log(`[smoke] actions_log.id=${actionsLogId}\n`);

  // Cierre
  await Promise.all([memoryClient.close(), bridge.close()]);

  const totalMs = Date.now() - overallStart;
  const billableMs = stepLogs
    .filter((entry) => !entry.excludedFromTotal)
    .reduce((sum, entry) => sum + entry.durationMs, 0);

  console.log("========== RESUMEN ==========");
  for (const entry of stepLogs) {
    const tag = entry.excludedFromTotal ? " (excl)" : "";
    console.log(
      `  step ${entry.step}: ${entry.label.padEnd(45)} ${entry.durationMs.toString().padStart(6)} ms${tag}`,
    );
  }
  console.log(`  ────────────────────────────────────────────────────────────`);
  console.log(`  total billable (excl espera humana):${billableMs.toString().padStart(7)} ms`);
  console.log(`  total wall-clock:                  ${totalMs.toString().padStart(7)} ms`);
  console.log(`  budget Sprint 0 < 30s:              ${billableMs < 30_000 ? "✓ PASS" : "✗ FAIL"}`);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exitCode = 1;
});
