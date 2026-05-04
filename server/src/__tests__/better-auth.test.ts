import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { getCookies } from "better-auth/cookies";
import {
  buildBetterAuthAdvancedOptions,
  createBetterAuthInstance,
  deriveAuthCookiePrefix,
  deriveAuthTrustedOrigins,
} from "../auth/better-auth.js";

const ORIGINAL_INSTANCE_ID = process.env.PAPERCLIP_INSTANCE_ID;

afterEach(() => {
  if (ORIGINAL_INSTANCE_ID === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
  else process.env.PAPERCLIP_INSTANCE_ID = ORIGINAL_INSTANCE_ID;
});

describe("Better Auth cookie scoping", () => {
  it("derives an instance-scoped cookie prefix", () => {
    expect(deriveAuthCookiePrefix("default")).toBe("paperclip-default");
    expect(deriveAuthCookiePrefix("PAP-1601-worktree")).toBe("paperclip-PAP-1601-worktree");
  });

  it("uses PAPERCLIP_INSTANCE_ID for the Better Auth cookie prefix", () => {
    process.env.PAPERCLIP_INSTANCE_ID = "sat-worktree";

    const advanced = buildBetterAuthAdvancedOptions({ disableSecureCookies: false });

    expect(advanced).toEqual({
      cookiePrefix: "paperclip-sat-worktree",
    });
    expect(getCookies({ advanced } as BetterAuthOptions).sessionToken.name).toBe(
      "paperclip-sat-worktree.session_token",
    );
  });

  it("keeps local http auth cookies non-secure while preserving the scoped prefix", () => {
    process.env.PAPERCLIP_INSTANCE_ID = "pap-worktree";

    expect(buildBetterAuthAdvancedOptions({ disableSecureCookies: true })).toEqual({
      cookiePrefix: "paperclip-pap-worktree",
      useSecureCookies: false,
    });
  });

  it("adds hostname port variants for authenticated mode on non-default ports", () => {
    const trustedOrigins = deriveAuthTrustedOrigins({
      deploymentMode: "authenticated",
      authBaseUrlMode: "auto",
      authPublicBaseUrl: undefined,
      allowedHostnames: ["Board.Example.Test"],
      port: 3101,
    } as Parameters<typeof deriveAuthTrustedOrigins>[0]);

    expect(trustedOrigins).toEqual(expect.arrayContaining([
      "https://board.example.test",
      "http://board.example.test",
      "https://board.example.test:3101",
      "http://board.example.test:3101",
    ]));
  });

  it("prefers an explicit resolved listen port over the configured port", () => {
    const trustedOrigins = deriveAuthTrustedOrigins({
      deploymentMode: "authenticated",
      authBaseUrlMode: "auto",
      authPublicBaseUrl: undefined,
      allowedHostnames: ["board.example.test"],
      port: 3100,
    } as Parameters<typeof deriveAuthTrustedOrigins>[0], { listenPort: 3101 });

    expect(trustedOrigins).toEqual(expect.arrayContaining([
      "https://board.example.test:3101",
      "http://board.example.test:3101",
    ]));
    expect(trustedOrigins).not.toContain("https://board.example.test:3100");
    expect(trustedOrigins).not.toContain("http://board.example.test:3100");
  });
});

describe("Better Auth two-factor plugin (Sprint 0.1 MFA)", () => {
  const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-deterministic";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
  });

  it("registers the twoFactor plugin and exposes its endpoints", () => {
    // Db is unused at construction time (only at request time). Pass an
    // empty stub typed as the real Db — Better Auth captures the reference
    // for later, no eager queries here.
    const db = {} as unknown as Parameters<typeof createBetterAuthInstance>[0];
    const config = {
      authBaseUrlMode: "auto",
      authPublicBaseUrl: undefined,
      authDisableSignUp: true,
      deploymentMode: "authenticated",
      allowedHostnames: ["finapticoos.finaptico.com"],
      port: 3100,
    } as unknown as Parameters<typeof createBetterAuthInstance>[1];

    const auth = createBetterAuthInstance(db, config, [
      "https://finapticoos.finaptico.com",
    ]);

    // Endpoints exposed by the plugin live under `auth.api`. We expect at
    // least `enableTwoFactor`, `disableTwoFactor`, `verifyTOTP` and
    // `verifyBackupCode` per better-auth/plugins/two-factor docs.
    const api = auth.api as Record<string, unknown>;
    expect(api).toHaveProperty("enableTwoFactor");
    expect(api).toHaveProperty("disableTwoFactor");
    expect(api).toHaveProperty("verifyTOTP");
    expect(api).toHaveProperty("verifyBackupCode");
  });
});
