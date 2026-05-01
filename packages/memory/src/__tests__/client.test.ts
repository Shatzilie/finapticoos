import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("postgres", () => ({
  default: postgresMock,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({})),
}));

import { createMemoryClient } from "../client.js";

const ENV_KEYS = [
  "FINAPTICOOS_MEMORY_DATABASE_URL",
  "SUPABASE_FINAPTICOOS_URL",
  "DATABASE_URL",
];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("memory client URL resolution", () => {
  beforeEach(() => {
    clearEnv();
    postgresMock.mockClear();
  });

  afterEach(() => {
    clearEnv();
  });

  it("prefers an explicit url over env vars", () => {
    process.env.DATABASE_URL = "postgres://env";
    createMemoryClient({ url: "postgres://explicit" });
    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://explicit",
      expect.objectContaining({ max: 5, prepare: false }),
    );
  });

  it("falls back to FINAPTICOOS_MEMORY_DATABASE_URL first", () => {
    process.env.FINAPTICOOS_MEMORY_DATABASE_URL = "postgres://memory";
    process.env.SUPABASE_FINAPTICOOS_URL = "postgres://supabase";
    process.env.DATABASE_URL = "postgres://core";
    createMemoryClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://memory");
  });

  it("falls back to SUPABASE_FINAPTICOOS_URL when memory-specific is missing", () => {
    process.env.SUPABASE_FINAPTICOOS_URL = "postgres://supabase";
    process.env.DATABASE_URL = "postgres://core";
    createMemoryClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://supabase");
  });

  it("falls back to DATABASE_URL last", () => {
    process.env.DATABASE_URL = "postgres://core";
    createMemoryClient();
    expect(postgresMock.mock.calls[0]?.[0]).toBe("postgres://core");
  });

  it("throws when no url is configured", () => {
    expect(() => createMemoryClient()).toThrow(/no database URL configured/);
  });
});
