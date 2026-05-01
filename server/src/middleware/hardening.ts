import helmet from "helmet";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * FinapticoOS Sprint 0 Bloque 8 — security headers.
 *
 * - HSTS 1y + includeSubDomains + preload (Easypanel Traefik issues LE TLS;
 *   the headers below are at the app layer so they survive any reverse-proxy
 *   reconfig).
 * - X-Frame-Options: DENY (no embed in iframes).
 * - X-Content-Type-Options: nosniff.
 * - Referrer-Policy: strict-origin-when-cross-origin.
 * - CSP: 'self' for everything except scripts and styles where Paperclip's
 *   inherited UI relies on inline tags. `'unsafe-inline'` accepted as
 *   provisional Sprint 0 trade-off — TODO Sprint 1 audit and tighten by
 *   moving inline scripts to nonces or extracted bundles.
 */
export function createSecurityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // TODO Sprint 1: audit inline script/style usage and replace with
        // nonces or extracted assets so we can drop 'unsafe-inline'.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false, // not strictly required and breaks some assets
  });
}

/**
 * Rate limit for unauthenticated public endpoints. 100 req/min/IP per spec
 * Bloque 8. Authenticated routes are NOT covered — actorMiddleware admits
 * the call regardless of this limiter once the session cookie is valid.
 *
 * Apply with `app.use("/path", createPublicRateLimit())` on each public
 * surface (sign-in, invite handler, health endpoint).
 */
export function createPublicRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Easypanel + Traefik forward client IP via X-Forwarded-For. Express must
    // trust the proxy for req.ip to resolve correctly. Set in app.ts via
    // `app.set("trust proxy", 1)` — this limiter inherits it.
    message: { error: "rate_limited", retryAfterSeconds: 60 },
  });
}
