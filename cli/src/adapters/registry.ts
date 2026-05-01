import type { CLIAdapterModule } from "@finapticoos/adapter-utils";
import { printAcpxStreamEvent } from "@finapticoos/adapter-acpx-local/cli";
import { printClaudeStreamEvent } from "@finapticoos/adapter-claude-local/cli";
import { printCodexStreamEvent } from "@finapticoos/adapter-codex-local/cli";
import { printCursorStreamEvent } from "@finapticoos/adapter-cursor-local/cli";
import { printGeminiStreamEvent } from "@finapticoos/adapter-gemini-local/cli";
import { printOpenCodeStreamEvent } from "@finapticoos/adapter-opencode-local/cli";
import { printPiStreamEvent } from "@finapticoos/adapter-pi-local/cli";
import { printOpenClawGatewayStreamEvent } from "@finapticoos/adapter-openclaw-gateway/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const claudeLocalCLIAdapter: CLIAdapterModule = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent,
};

const acpxLocalCLIAdapter: CLIAdapterModule = {
  type: "acpx_local",
  formatStdoutEvent: printAcpxStreamEvent,
};

const codexLocalCLIAdapter: CLIAdapterModule = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent,
};

const openCodeLocalCLIAdapter: CLIAdapterModule = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent,
};

const piLocalCLIAdapter: CLIAdapterModule = {
  type: "pi_local",
  formatStdoutEvent: printPiStreamEvent,
};

const cursorLocalCLIAdapter: CLIAdapterModule = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent,
};

const geminiLocalCLIAdapter: CLIAdapterModule = {
  type: "gemini_local",
  formatStdoutEvent: printGeminiStreamEvent,
};

const openclawGatewayCLIAdapter: CLIAdapterModule = {
  type: "openclaw_gateway",
  formatStdoutEvent: printOpenClawGatewayStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [
    acpxLocalCLIAdapter,
    claudeLocalCLIAdapter,
    codexLocalCLIAdapter,
    openCodeLocalCLIAdapter,
    piLocalCLIAdapter,
    cursorLocalCLIAdapter,
    geminiLocalCLIAdapter,
    openclawGatewayCLIAdapter,
    processCLIAdapter,
    httpCLIAdapter,
  ].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? processCLIAdapter;
}
