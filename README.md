# FinapticoOS

Sovereign fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) tailored for [Finaptico](https://finaptico.com)'s internal AI-agent operations: CFO-facing automations, prospect intelligence, content drafting, and ops orchestration.

This fork lives on its own trajectory — telemetry off, branding ours, integrated with the Finaptico CRM and shared semantic memory. The upstream Paperclip license (MIT) is preserved in [`LICENSE`](./LICENSE) and the full attribution lives in [`NOTICE.md`](./NOTICE.md).

## Quickstart (dev)

```bash
pnpm install
pnpm dev
```

Server + UI on `http://localhost:3100` with embedded Postgres. See `AGENTS.md` for the full repo map and `doc/SPEC-implementation.md` for the underlying control-plane spec.
