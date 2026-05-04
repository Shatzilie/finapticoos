# MFA rescue — emergency unlock procedure

**Audience**: instance admin who has lost access to their authenticator app **and** all backup recovery codes.

**Effort**: ~30 seconds. Read this once before you ever need it.

**Last updated**: 2026-05-04 (Sprint 0.1 MFA rollout)

---

## When to use this

Strict MFA enforcement (`MFAGate` in `CloudAccessGate`) means a signed-in user without an enrolled second factor is force-redirected to `/auth/mfa-enroll`. If you've enrolled and then lost both:

- the authenticator app (phone wiped, device replaced, app uninstalled), **and**
- the 10 backup recovery codes you saved in Bitwarden at enrollment time

…you cannot complete the TOTP challenge at `/auth/mfa-verify` and you cannot use a recovery code at `/auth/mfa-recovery`. You're locked out.

This procedure deletes the MFA enrollment row from Postgres directly, which flips your account back to "no MFA enrolled". After login, the strict gate sends you straight to `/auth/mfa-enroll` to set up a fresh authenticator + new backup codes.

**This is destructive but recoverable**: nothing else changes. Your sessions, companies, history — all intact.

---

## Prerequisites

You need:

- Access to the **Supabase project** that backs FinapticoOS (project ref `utwhvnafvtardndgkbjn`, Finaptico account on [supabase.com](https://supabase.com)).
- The Supabase service-role key. Stored in Bitwarden under "Supabase Finaptico — service_role".
- Your user `id` (UUID). Find it from Supabase Dashboard:
  1. Open the project → **Database** → **Tables** → `public.user`.
  2. Find the row with your email.
  3. Copy the `id` column (UUID, e.g. `4d8a91e7-...`).

---

## Step-by-step

### 1. Open the SQL Editor

Supabase Dashboard → **SQL Editor** → **New query**.

### 2. Paste this exact query (replace `<YOUR-USER-ID>`)

```sql
BEGIN;

-- 1. Drop the MFA enrollment row.
DELETE FROM "two_factor"
WHERE user_id = '<YOUR-USER-ID>';

-- 2. Reset the flag on the user record so the strict gate detects no
--    enrollment and forces re-enrol on next route change.
UPDATE "user"
SET two_factor_enabled = false
WHERE id = '<YOUR-USER-ID>';

-- Sanity check: should return 0 rows for the two_factor table and
-- twoFactorEnabled = false for the user.
SELECT COUNT(*) AS remaining_two_factor_rows
FROM "two_factor"
WHERE user_id = '<YOUR-USER-ID>';

SELECT id, email, two_factor_enabled
FROM "user"
WHERE id = '<YOUR-USER-ID>';

COMMIT;
```

### 3. Run the query

Click **Run**. The transaction is atomic — both statements succeed or both roll back.

### 4. Verify in the result panel

- `remaining_two_factor_rows` should be `0`.
- `two_factor_enabled` for your user should be `false`.

### 5. Sign in again

Open `https://finapticoos.finaptico.com` (or your local dev URL) and sign in with your normal email + password. You will be redirected automatically to `/auth/mfa-enroll`. Set up your authenticator afresh, save the 10 new backup codes in Bitwarden, and complete the TOTP verification.

---

## Why this works

- The `two_factor` table holds the encrypted TOTP secret + hashed backup codes for each enrolled user. Deleting the row removes both.
- The `user.two_factor_enabled` boolean is the gate signal. The strict gate (`ui/src/components/CloudAccessGate.tsx`) checks `sessionQuery.data.user.twoFactorEnabled === false` and force-redirects to `/auth/mfa-enroll`.
- `better-auth/plugins/two-factor` reads the `two_factor` row to decide whether sign-in returns `twoFactorRedirect: true`. With the row deleted, sign-in returns the normal session response.

---

## What this does NOT do

- It does NOT change your password. You still need it.
- It does NOT log you out of existing sessions on other devices. They remain valid until the cookie expires (30d sliding) or you sign-out.
- It does NOT reset the password — for that, use the (deferred to Sprint 1) password reset flow or recreate the user via SQL.

---

## Bitwarden checklist

Before you ever need this procedure, make sure your Bitwarden vault has:

- [ ] Item "FinapticoOS admin" with email + password
- [ ] Item "FinapticoOS — backup recovery codes" with the 10 codes shown once at enrollment (and any regenerated set)
- [ ] Item "Supabase Finaptico — service_role" with the API key + project URL
- [ ] Bookmark to this rescue doc (or a link to the file in the repo)

If you regenerate backup codes via `/profile`, **immediately** update the Bitwarden item — the old codes are invalidated server-side.

---

## See also

- [Sprint 0.1 MFA implementation summary in CRM `task_tracker.md`](../../FactorIA-CRMFinaptico/implementation/task_tracker.md) (cross-repo, not committed here).
- [Better Auth two-factor plugin docs](https://better-auth.com/docs/plugins/2fa) — upstream reference.
- `server/src/auth/better-auth.ts` — plugin registration, including `issuer: "FinapticoOS"`.
- `ui/src/components/CloudAccessGate.tsx` — the strict gate logic.
- `ui/src/components/MFASettingsCard.tsx` — UI for regenerate / disable from `/profile`.
