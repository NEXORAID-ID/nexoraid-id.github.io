# NEXORAID V4 — full-stack foundation
V3 remains the public static storefront. V4 adds a separate Cloudflare Worker and portal with real D1-backed order requests, Discord identity, expiring hashed sessions, customer/worker/seller/owner permissions, first-claim order workflow and audit events. Catalog prices are indicative, not payments. No game passwords, OTPs or payment details are collected. Seller has customer-level access until a separate seller workflow is designed. No invoice, payment gateway, AI, R2 or Discord ticket synchronization is claimed.
## Deployment (owner)
1. Create D1 database named nexoraid-v4 in Cloudflare; copy UUID and account ID.
2. Create Discord application, enable OAuth2 and register exactly PUBLIC_ORIGIN/api/auth/callback. PUBLIC_ORIGIN must be the HTTPS Worker URL or configured custom domain with no trailing slash.
3. In repository Settings > Environments create cloudflare-v4. Add variables CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, PUBLIC_ORIGIN, OWNER_DISCORD_ID (your numeric Discord user ID), DISCORD_CLIENT_ID. Add secrets CLOUDFLARE_API_TOKEN (only required Worker/D1 permissions scoped to your account), DISCORD_CLIENT_SECRET. Never commit them. If using a custom domain, configure it in Cloudflare first or after the initial workers.dev deployment, then update origin and redirect URI.
4. Run Actions > Deploy NEXORAID V4 (manual) on main. Existing V3 workflow remains unchanged. Open PUBLIC_ORIGIN/portal.html after successful deployment.
5. Log in as owner; team members must sign in once before assigning worker/seller roles. Confirm test orders and permissions before accepting real customer requests.
6. Before production: configure rate limits/Turnstile, retention and backup, approve privacy/refund rules, test real Discord OAuth and D1 concurrency, verify domain routing, run security review. Never publish secrets to chat or source.
## Tests
Root npm test includes V4 API, pricing, authorization and SQLite schema tests. These do not prove live OAuth or D1 behavior. Cloudflare deployment is manually triggered to avoid overwriting V3 or incurring accidental costs.
