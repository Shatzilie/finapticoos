import {
  authSessionSchema,
  currentUserProfileSchema,
  type AuthSession,
  type CurrentUserProfile,
  type UpdateCurrentUserProfile,
} from "@finapticoos/shared";

type AuthErrorBody =
  | {
    code?: string;
    message?: string;
    error?: string | { code?: string; message?: string };
  }
  | null;

export class AuthApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(message: string, status: number, body: unknown, code: string | null = null) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function toSession(value: unknown): AuthSession | null {
  const direct = authSessionSchema.safeParse(value);
  if (direct.success) return direct.data;

  if (!value || typeof value !== "object") return null;
  const nested = authSessionSchema.safeParse((value as Record<string, unknown>).data);
  return nested.success ? nested.data : null;
}

function extractAuthError(payload: AuthErrorBody, status: number) {
  const nested =
    payload?.error && typeof payload.error === "object"
      ? payload.error
      : null;
  const code =
    typeof nested?.code === "string"
      ? nested.code
      : typeof payload?.code === "string"
        ? payload.code
        : null;
  const message =
    typeof nested?.message === "string" && nested.message.trim().length > 0
      ? nested.message
      : typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : typeof payload?.error === "string" && payload.error.trim().length > 0
          ? payload.error
          : `Request failed: ${status}`;

  return new AuthApiError(message, status, payload, code);
}

async function authPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return payload;
}

// Sprint 0.1 MFA — typed responses for the better-auth twoFactor plugin
// endpoints. Server returns { totpURI, backupCodes } on enable; the URI
// embeds the TOTP secret + issuer for direct rendering as a QR code.
export type EnableTwoFactorResponse = {
  totpURI: string;
  backupCodes: string[];
};

function parseTotpUri(uri: string): { secret: string | null } {
  try {
    const url = new URL(uri);
    return { secret: url.searchParams.get("secret") };
  } catch {
    return { secret: null };
  }
}

export function extractTotpSecret(uri: string): string | null {
  return parseTotpUri(uri).secret;
}

async function authPatch<T>(path: string, body: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return parse(payload);
}

export const authApi = {
  getSession: async (): Promise<AuthSession | null> => {
    const res = await fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return null;
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Failed to load session (${res.status})`);
    }
    const direct = toSession(payload);
    if (direct) return direct;
    const nested = payload && typeof payload === "object" ? toSession((payload as Record<string, unknown>).data) : null;
    return nested;
  },

  signInEmail: async (input: { email: string; password: string }) => {
    await authPost("/sign-in/email", input);
  },

  signUpEmail: async (input: { name: string; email: string; password: string }) => {
    await authPost("/sign-up/email", input);
  },

  getProfile: async (): Promise<CurrentUserProfile> => {
    const res = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((payload as { error?: string } | null)?.error ?? `Failed to load profile (${res.status})`);
    }
    return currentUserProfileSchema.parse(payload);
  },

  updateProfile: async (input: UpdateCurrentUserProfile): Promise<CurrentUserProfile> =>
    authPatch("/profile", input, (payload) => currentUserProfileSchema.parse(payload)),

  signOut: async () => {
    await authPost("/sign-out", {});
  },

  // Sprint 0.1 MFA. Plugin endpoints live under /api/auth/two-factor/* and
  // are mounted by better-auth at server boot.

  /**
   * Triggers TOTP enrollment. The user must re-confirm their current
   * password — better-auth forces this to prevent attacker-with-cookie
   * scenarios from binding their own authenticator. On success the server
   * returns the TOTP URI (otpauth://...) plus 10 single-use backup codes.
   *
   * The URI must be rendered as a QR (qrcode.react) AND surfaced as a
   * manual fallback secret (so the user can paste it if their app doesn't
   * support camera scan). Backup codes must be stored once-and-only-once
   * by the user (Bitwarden) — server-side they are stored hashed.
   *
   * Important: at this point the user is NOT yet enrolled. Enrollment
   * completes only after the user POSTs `/two-factor/verify-totp` with a
   * valid 6-digit code from their authenticator (proves they correctly
   * scanned the secret).
   */
  enableTwoFactor: async (input: { password: string }): Promise<EnableTwoFactorResponse> => {
    const payload = await authPost("/two-factor/enable", input);
    if (
      payload &&
      typeof payload === "object" &&
      typeof (payload as { totpURI?: unknown }).totpURI === "string" &&
      Array.isArray((payload as { backupCodes?: unknown }).backupCodes)
    ) {
      return payload as EnableTwoFactorResponse;
    }
    throw new AuthApiError(
      "Unexpected enable two-factor response shape",
      200,
      payload,
      "two_factor_enable_unexpected_response",
    );
  },

  /**
   * Verifies a 6-digit TOTP code. Used in two contexts:
   * 1. During enrollment, to confirm the user correctly scanned the secret.
   * 2. After sign-in, when the session response indicates `requiresTwoFactor`.
   *
   * On success, the server flips `user.twoFactorEnabled = true` (case 1) or
   * upgrades the session to fully authenticated (case 2).
   */
  verifyTotp: async (input: { code: string }): Promise<void> => {
    await authPost("/two-factor/verify-totp", input);
  },
};
