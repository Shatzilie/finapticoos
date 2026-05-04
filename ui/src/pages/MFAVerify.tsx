import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { getRememberedInvitePath } from "../lib/invite-memory";
import { Button } from "@/components/ui/button";
import { OTPInput } from "@/components/ui/otp-input";
import { Sparkles } from "lucide-react";

/**
 * Sprint 0.1 MFA — Post-login challenge page (`/auth/mfa-verify`).
 *
 * Flow:
 * - User has signed in with email + password.
 * - Server replied with `{ twoFactorRedirect: true }` because their account
 *   has MFA enrolled. The session is NOT yet established.
 * - This page accepts a 6-digit TOTP code; on success the server upgrades
 *   the partial session to fully authenticated.
 * - Fallback: link to `/auth/mfa-recovery` for users who lost their
 *   authenticator and need to spend one of the 10 backup codes.
 *
 * Note: this page is reached via redirect from `Auth.tsx` after a sign-in
 * that returns `mfaRequired: true`. Direct visits without a partial session
 * cookie will simply fail verification and surface the error. We do NOT
 * gate access via a route guard — better-auth is the source of truth.
 */
export function MFAVerifyPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(
    () => searchParams.get("next") || getRememberedInvitePath() || "/",
    [searchParams],
  );

  const verifyMutation = useMutation({
    mutationFn: () => authApi.verifyTotp({ code: otp }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Verification failed");
      setOtp("");
    },
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-y-auto">
      <div className="w-full max-w-md px-8 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">FinapticoOS</span>
        </div>

        <h1 className="text-xl font-semibold">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the current 6-digit code from your authenticator app.
        </p>

        <form
          className="mt-6 space-y-4"
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
          <Button
            type="submit"
            disabled={verifyMutation.isPending || otp.length !== 6}
            className="w-full"
          >
            {verifyMutation.isPending ? "Verifying…" : "Verify"}
          </Button>
        </form>

        <div className="mt-6 text-sm text-muted-foreground">
          Lost access to your authenticator?{" "}
          <Link
            to={`/auth/mfa-recovery${searchParams.get("next") ? `?next=${encodeURIComponent(searchParams.get("next") ?? "")}` : ""}`}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Use a recovery code
          </Link>
        </div>
      </div>
    </div>
  );
}
