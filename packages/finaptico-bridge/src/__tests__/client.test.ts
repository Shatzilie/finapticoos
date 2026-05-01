import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));

import { createBridgeClient } from "../client.js";

const ENV_KEYS = [
  "FINAPTICOOS_BRIDGE_DATABASE_URL",
  "SUPABASE_FINAPTICOOS_URL",
  "DATABASE_URL",
];

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("bridge client URL resolution", () => {
  beforeEach(() => {
    clearEnv();
    postgresMock.mockClear();
  });

  afterEach(() => clearEnv());

  it("prefers explicit url over env vars", () => {
    process.env.DATABASE_URL = "postgres://env";
    createBridgeClient({ url: "postgres://explicit" });
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://explicit");
  });

  it("falls back to FINAPTICOOS_BRIDGE_DATABASE_URL first", () => {
    process.env.FINAPTICOOS_BRIDGE_DATABASE_URL = "postgres://bridge";
    process.env.DATABASE_URL = "postgres://core";
    createBridgeClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://bridge");
  });

  it("uses SUPABASE_FINAPTICOOS_URL when bridge-specific missing", () => {
    process.env.SUPABASE_FINAPTICOOS_URL = "postgres://supa";
    createBridgeClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://supa");
  });

  it("falls back to DATABASE_URL last", () => {
    process.env.DATABASE_URL = "postgres://core";
    createBridgeClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://core");
  });

  it("always passes prepare:false (Supabase pooler compatibility)", () => {
    process.env.DATABASE_URL = "postgres://x";
    createBridgeClient();
    expect(postgresMock.mock.calls[0]?.[1]).toMatchObject({ prepare: false });
  });

  it("throws when no url is configured", () => {
    expect(() => createBridgeClient()).toThrow(/no database URL configured/);
  });
});
