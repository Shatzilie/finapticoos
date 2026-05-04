import { test, expect } from "@playwright/test";

/**
 * Sprint 0.1 MFA — smoke routes.
 *
 * Verifies that the 3 MFA pages (`/auth/mfa-enroll`, `/auth/mfa-verify`,
 * `/auth/mfa-recovery`) are registered as routes and render their initial
 * static markup without crashing. Does NOT exercise the real flow (TOTP
 * generation, sign-in, etc.) — that requires an authenticated test
 * harness with otpauth secret extraction, deferred to Sprint 1 or
 * captured by manual smoke prod with Fatima's account in C6.
 *
 * The default e2e config runs in `local_trusted` deployment mode, so
 * server-side auth is disabled. The pages can still be reached directly
 * by URL because React Router has them registered. Submitting the forms
 * would fail with 401 from the better-auth endpoints, but we never
 * submit — only assert that the initial render contains the expected
 * heading + key form elements.
 */

test.describe("MFA pages smoke", () => {
  test("/auth/mfa-enroll renders password step", async ({ page }) => {
    await page.goto("/auth/mfa-enroll");

    await expect(
      page.getByRole("heading", { name: "Set up two-factor authentication" }),
    ).toBeVisible({ timeout: 5_000 });

    // Step 1 of the 3-step state machine: password input visible, no QR yet.
    await expect(page.getByLabel("Current password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("/auth/mfa-verify renders 6-digit OTP input", async ({ page }) => {
    await page.goto("/auth/mfa-verify");

    await expect(
      page.getByRole("heading", { name: "Two-factor authentication" }),
    ).toBeVisible({ timeout: 5_000 });

    // OTPInput renders a group with 6 single-character cells.
    const otpGroup = page.getByRole("group", { name: /verification code/i });
    await expect(otpGroup).toBeVisible();
    await expect(otpGroup.locator("input")).toHaveCount(6);

    // Recovery fallback link is present.
    await expect(page.getByRole("link", { name: /recovery code/i })).toBeVisible();
  });

  test("/auth/mfa-recovery renders recovery code input", async ({ page }) => {
    await page.goto("/auth/mfa-recovery");

    await expect(
      page.getByRole("heading", { name: "Use a recovery code" }),
    ).toBeVisible({ timeout: 5_000 });

    await expect(page.getByLabel("Recovery code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    // Cross-link back to TOTP verify.
    await expect(page.getByRole("link", { name: /6-digit code/i })).toBeVisible();
  });
});
