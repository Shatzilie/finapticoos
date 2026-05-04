import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { getRememberedInvitePath } from "../lib/invite-memory";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

/**
 * Sprint 0.1 MFA — Recovery code fallback (`/auth/mfa-recovery`).
 *
 * Reached via the "Use a recovery code" link in `/auth/mfa-verify` when the
 * user has lost access to their authenticator. They spend one of the 10
 * backup codes generated at enrollment. Each code works exactly once.
 *
 * On success, behaves identically to TOTP verify: invalidates session
 * queries and redirects to the next path. After recovery the user should
 * regenerate fresh codes from /profile (settings UI ships in C4).
 *
 * Format: backup codes are alphanumeric. We don't try to parse/validate
 * them client-side; the server is the source of truth and rejects malformed
 * or already-spent codes.
 */
export function MFARecoveryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(
    () => searchParams.get("next") || getRememberedInvitePath() || "/",
    [searchParams],
  );

  const recoverMutation = useMutation({
    mutationFn: () => authApi.verifyBackupCode({ code: code.trim() }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Invalid recovery code");
      setCode("");
    },
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-y-auto">
      <div className="w-full max-w-md px-8 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">FinapticoOS</span>
        </div>

        <h1 className="text-xl font-semibold">Use a recovery code</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter one of the backup codes you saved at enrollment. Each code
          works only once. After signing in, regenerate the full set from
          your profile.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (recoverMutation.isPending) return;
            if (code.trim().length === 0) {
              setError("Enter a recovery code.");
              return;
            }
            recoverMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="recoveryCode" className="text-xs text-muted-foreground mb-1 block">
              Recovery code
            </label>
            <input
              id="recoveryCode"
              name="recoveryCode"
              type="text"
              autoComplete="one-time-code"
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={recoverMutation.isPending} className="w-full">
            {recoverMutation.isPending ? "Verifying…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-sm text-muted-foreground">
          Have your authenticator?{" "}
          <Link
            to={`/auth/mfa-verify${searchParams.get("next") ? `?next=${encodeURIComponent(searchParams.get("next") ?? "")}` : ""}`}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Use a 6-digit code instead
          </Link>
        </div>
      </div>
    </div>
  );
}
