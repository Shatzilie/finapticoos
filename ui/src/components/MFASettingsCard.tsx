import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { ShieldCheck, ShieldAlert, RefreshCw, Trash2, CheckCircle2, Copy } from "lucide-react";
import { authApi } from "@/api/auth";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sprint 0.1 MFA — Settings card embedded in /instance/settings/profile.
 *
 * Two states:
 *   1. Not enrolled — link to /auth/mfa-enroll. Strict enforcement (MFAGate
 *      in CloudAccessGate) means the user actually never sees this state in
 *      practice once we deploy: any signed-in user without enrollment is
 *      forced through enrol before reaching profile. Kept for completeness
 *      / dev mode.
 *   2. Enrolled — two destructive-ish actions:
 *      - "Regenerate recovery codes" — invalidates the old 10 codes and
 *        shows 10 fresh ones once. Must be saved to Bitwarden.
 *      - "Disable MFA" — clears the enrollment row and flips the user back
 *        to no-MFA. Strict enforcement immediately re-redirects to enrol on
 *        the next route change, so this is in practice "rotate to a new
 *        authenticator app" rather than "remove MFA permanently".
 *
 * Both actions require re-confirming the current password. Regenerate
 * shows a results dialog (codes once); Disable just closes on success.
 */
type Props = {
  twoFactorEnabled: boolean;
};

export function MFASettingsCard({ twoFactorEnabled }: Props) {
  const queryClient = useQueryClient();
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const resetState = () => {
    setPassword("");
    setError(null);
  };

  const regenerateMutation = useMutation({
    mutationFn: () => authApi.generateBackupCodes({ password }),
    onSuccess: (data) => {
      setError(null);
      setPassword("");
      setNewCodes(data.backupCodes);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to regenerate codes");
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.disableTwoFactor({ password }),
    onSuccess: async () => {
      setError(null);
      setPassword("");
      setDisableOpen(false);
      // Strict enforcement (MFAGate) will redirect to /auth/mfa-enroll on
      // next route change once the session query reflects the new state.
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to disable MFA");
    },
  });

  const handleCopyCodes = async () => {
    if (!newCodes) return;
    try {
      await navigator.clipboard.writeText(newCodes.join("\n"));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 1500);
    } catch {
      // Clipboard API may be unavailable on insecure origins.
    }
  };

  const closeRegenerate = () => {
    setRegenerateOpen(false);
    setNewCodes(null);
    resetState();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        {twoFactorEnabled ? (
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-500" />
        )}
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        {twoFactorEnabled ? (
          <>
            <p className="text-sm text-foreground">
              <span className="font-medium">Active.</span> Sign-in requires a
              6-digit code from your authenticator app.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lost your authenticator? Use one of the backup codes from
              Bitwarden, then regenerate a fresh set below.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetState();
                  setRegenerateOpen(true);
                }}
              >
                <RefreshCw className="size-4" />
                Regenerate recovery codes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetState();
                  setDisableOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Disable MFA
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground">
              <span className="font-medium">Not configured.</span> FinapticoOS
              requires MFA. Set up your authenticator now.
            </p>
            <div className="mt-4">
              <Button asChild>
                <Link to="/auth/mfa-enroll">Set up MFA</Link>
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Regenerate dialog */}
      <Dialog
        open={regenerateOpen}
        onOpenChange={(open) => {
          if (!open) closeRegenerate();
        }}
      >
        <DialogContent>
          {newCodes ? (
            <>
              <DialogHeader>
                <DialogTitle>New recovery codes</DialogTitle>
                <DialogDescription>
                  Save these to Bitwarden now. The old codes are no longer
                  valid. You won't see these codes again.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-card p-3 font-mono text-xs space-y-1">
                {newCodes.map((code) => (
                  <div key={code} className="tabular-nums">
                    {code}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopyCodes}
                className="text-xs text-muted-foreground inline-flex items-center gap-1.5 hover:underline self-start"
              >
                {copiedCodes ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy all codes
                  </>
                )}
              </button>
              <DialogFooter>
                <Button onClick={closeRegenerate}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Regenerate recovery codes</DialogTitle>
                <DialogDescription>
                  Confirm your password. The old 10 codes will be invalidated
                  and a fresh set generated.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (regenerateMutation.isPending) return;
                  if (password.length === 0) {
                    setError("Password is required.");
                    return;
                  }
                  regenerateMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="regen-password">Current password</Label>
                  <Input
                    id="regen-password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeRegenerate}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={regenerateMutation.isPending}>
                    {regenerateMutation.isPending ? "Working…" : "Regenerate"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog
        open={disableOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDisableOpen(false);
            resetState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              FinapticoOS requires MFA. After disabling, you will be redirected
              to set it up again on the next page load. To rotate to a different
              authenticator app, disable here then enrol fresh.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (disableMutation.isPending) return;
              if (password.length === 0) {
                setError("Password is required.");
                return;
              }
              disableMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="disable-password">Current password</Label>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDisableOpen(false);
                  resetState();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={disableMutation.isPending}>
                {disableMutation.isPending ? "Working…" : "Disable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
