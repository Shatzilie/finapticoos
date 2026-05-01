// FinapticoOS Sprint 0 Bloque 2 — Telemetría off (defensa en profundidad).
// Replaces packages/shared/src/telemetry/. All exports preserve the original
// public API so the 17 import sites do not need to change. resolveTelemetryConfig
// always reports disabled, so initTelemetry() in server/cli wrappers returns null
// and trackXxx calls become inert. No network, no disk writes, no install id.

export interface TelemetryState {
  installId: string;
  salt: string;
  createdAt: string;
  firstSeenVersion: string;
}

export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  app?: string;
  schemaVersion?: string;
}

export interface TelemetryEvent {
  name: string;
  occurredAt: string;
  dimensions: Record<string, string | number | boolean>;
}

export interface TelemetryEventEnvelope {
  app: string;
  schemaVersion: string;
  installId: string;
  version: string;
  events: TelemetryEvent[];
}

export type TelemetryEventName =
  | "install.started"
  | "install.completed"
  | "company.imported"
  | "project.created"
  | "routine.created"
  | "routine.run"
  | "goal.created"
  | "agent.created"
  | "skill.imported"
  | "agent.first_heartbeat"
  | "agent.task_completed"
  | "error.handler_crash"
  | `plugin.${string}`;

export class TelemetryClient {
  constructor(_config: TelemetryConfig, _stateFactory: () => TelemetryState, _version: string) {}
  track(_eventName: TelemetryEventName, _dimensions?: Record<string, string | number | boolean>): void {}
  async flush(): Promise<void> {}
  startPeriodicFlush(_intervalMs: number = 60_000): void {}
  stop(): void {}
  hashPrivateRef(_value: string): string {
    return "";
  }
}

export function resolveTelemetryConfig(_fileConfig?: { enabled?: boolean }): TelemetryConfig {
  return { enabled: false };
}

export function loadOrCreateState(_stateDir: string, version: string): TelemetryState {
  return {
    installId: "00000000-0000-0000-0000-000000000000",
    salt: "",
    createdAt: new Date(0).toISOString(),
    firstSeenVersion: version,
  };
}

export function trackInstallStarted(_client: TelemetryClient): void {}
export function trackInstallCompleted(
  _client: TelemetryClient,
  _dims: { adapterType: string },
): void {}
export function trackCompanyImported(
  _client: TelemetryClient,
  _dims: { sourceType: string; sourceRef: string; isPrivate: boolean },
): void {}
export function trackProjectCreated(_client: TelemetryClient): void {}
export function trackRoutineCreated(_client: TelemetryClient): void {}
export function trackRoutineRun(
  _client: TelemetryClient,
  _dims: { source: string; status: string },
): void {}
export function trackGoalCreated(
  _client: TelemetryClient,
  _dims?: { goalLevel?: string | null },
): void {}
export function trackAgentCreated(
  _client: TelemetryClient,
  _dims: { agentRole: string; agentId?: string },
): void {}
export function trackSkillImported(
  _client: TelemetryClient,
  _dims: { sourceType: string; skillRef?: string | null },
): void {}
export function trackAgentFirstHeartbeat(
  _client: TelemetryClient,
  _dims: { agentRole: string; agentId?: string },
): void {}
export function trackAgentTaskCompleted(
  _client: TelemetryClient,
  _dims: { agentRole: string; agentId?: string; adapterType?: string; model?: string },
): void {}
export function trackErrorHandlerCrash(
  _client: TelemetryClient,
  _dims: { errorCode: string },
): void {}
