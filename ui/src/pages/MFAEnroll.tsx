import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "@/lib/router";
import { authApi, extractTotpSecret, type EnableTwoFactorResponse } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { OTPInput } from "@/components/ui/otp-input";
import { Sparkles, CheckCircle2, Copy } from "lucide-react";

/**
 * Sprint 0.1 MFA — Enrollment page (`/auth/mfa-enroll`).
 *
 * Three-step flow, single page:
 *   1. Password confirmation (better-auth requires it on /two-factor/enable
 *      to prevent cookie-only attackers from enrolling their own device).
 *   2. Show QR + manual secret + 10 backup codes; user scans QR with their
 *      authenticator app (Google Authenticator / Authy / 1Password) and
 *      stores backup codes in Bitwarden.
 *   3. User enters a 6-digit code from the authenticator to confirm
 *      enrollment. On success, redirect home.
 *
 * Strict enforcement (C4) means MFAGate sends every signed-in user without
 * MFA enrolled here, blocking the rest of the UI until enrollment completes.
 *
 * Note: at the end of step 2 the server has already flipped
 * `user.twoFactorEnabled = true` and stored the secret. The verify step in
 * (3) is a sanity check that the user scanned the QR correctly. If the
 * user closes the page after step 2 without verifying, they can still log
 * in normally — the server will require TOTP because the row exists. To
 * recover from that case, MFAGate sends them back here with the verify
 * step pre-loaded (deferred to C4 — initial enrollment is the priority).
 */
type Step = "password" | "show_secret" | "verify";

export function MFAEnrollPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [enrollment, setEnrollment] = useState<EnableTwoFactorResponse | null>(null);
  const [savedAck, setSavedAck] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const enableMutation = useMutation({
    mutationFn: () => authApi.enableTwoFactor({ password }),
    onSuccess: (data) => {
      setError(null);
      setEnrollment(data);
      setStep("show_secret");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to enable two-factor");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => authApi.verifyTotp({ code: otp }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      navigate("/", { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Verification failed");
      setOtp("");
    },
  });

  const handleCopy = async (text: string, target: "secret" | "codes") => {
    try {
      await navigator.clipboard.writeText(text);
      if (target === "secret") {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 1500);
      } else {
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 1500);
      }
    } catch {
      // Clipboard API may be unavailable on insecure origins; ignore.
    }
  };

  const secret = enrollment ? extractTotpSecret(enrollment.totpURI) : null;
  const codesText = enrollment?.backupCodes.join("\n") ?? "";

  return (
    <div className="fixed inset-0 flex bg-background overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto px-8 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">FinapticoOS</span>
        </div>

        {step === "password" && (
          <>
            <h1 className="text-xl font-semibold">Set up two-factor authentication</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              FinapticoOS requires MFA. You'll need an authenticator app
              (Google Authenticator, Authy, 1Password, etc.) and a secure
              place to store backup codes (Bitwarden recommended). Confirm
              your password to begin.
            </p>
            <form
              className="mt-6 space-y-4 max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                if (enableMutation.isPending) return;
                if (password.trim().length === 0) {
                  setError("Password is required.");
                  return;
                }
                enableMutation.mutate();
              }}
            >
              <div>
                <label htmlFor="password" className="text-xs text-muted-foreground mb-1 block">
                  Current password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={enableMutation.isPending} className="w-full">
                {enableMutation.isPending ? "Working…" : "Continue"}
              </Button>
            </form>
          </>
        )}

        {step === "show_secret" && enrollment && (
          <>
            <h1 className="text-xl font-semibold">Scan and save</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan the QR with your authenticator app. Save the backup codes
              in Bitwarden — you won't see them again.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-4 inline-block">
                  <QRCodeSVG value={enrollment.totpURI} size={192} level="M" includeMargin={false} />
                </div>

                {secret && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Manual entry (if camera scan fails)
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(secret, "secret")}
                      className="font-mono text-xs break-all text-foreground inline-flex items-center gap-2 hover:underline"
                    >
                      {secret}
                      {copiedSecret ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Backup codes (10 single-use)
                </p>
                <div className="rounded-lg border border-border bg-card p-3 font-mono text-xs space-y-1">
                  {enrollment.backupCodes.map((code) => (
                    <div key={code} className="tabular-nums">
                      {code}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(codesText, "codes")}
                  className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1.5 hover:underline"
                >
                  {copiedCodes ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Copied to clipboard
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy all codes
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-8 flex items-start gap-3">
              <input
                id="ack"
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={savedAck}
                onChange={(event) => setSavedAck(event.target.checked)}
              />
              <label htmlFor="ack" className="text-sm text-muted-foreground select-none">
                I've saved the backup codes in Bitwarden. I understand they
                won't be shown again.
              </label>
            </div>

            <div className="mt-4">
              <Button
                disabled={!savedAck}
                onClick={() => {
                  setError(null);
                  setStep("verify");
                }}
              >
                Continue to verification
              </Button>
            </div>
          </>
        )}

        {step === "verify" && (
          <>
            <h1 className="text-xl font-semibold">Verify your authenticator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the current 6-digit code from your authenticator app to
              finish setup.
            </p>

            <form
              className="mt-6 space-y-4 max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                if (verifyMutation.isPending) return;
                if (otp.length !== 6) {
                  setError("Enter all 6 digits.");
                  return;
                }
                verifyMutation.mutate();
              }}
            >
              <OTPInput
                value={otp}
                onChange={setOtp}
                onComplete={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={verifyMutation.isPending || otp.length !== 6}>
                  {verifyMutation.isPending ? "Verifying…" : "Verify and finish"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    setOtp("");
                    setStep("show_secret");
                  }}
                >
                  Back
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
