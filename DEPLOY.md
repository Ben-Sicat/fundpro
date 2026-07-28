# Deploying the mock site to Vercel

This deploys the **mock-driven UI** for the company owners to click through.
It needs no database: all page data comes from `lib/mock/dataset.ts` and auth
from `lib/mock/users.ts`.

## What is and is not exposed

- **All data is synthetic.** Names come from fixed word lists, emails use the
  reserved `.invalid` TLD, and card numbers are masked shapes that were never
  issued. No real donor data reaches the deployment.
- **The real client trackers never ship.** `doc/` and every `*.xlsx` are
  excluded by both `.gitignore` and `.vercelignore` (belt and braces — the CLI
  uploads the working directory, so this is stated explicitly rather than
  inferred).
- **The login page lists the demo accounts on purpose**, so owners can click
  straight in. Anyone with the URL can too. That is an accepted trade-off for a
  synthetic demo — revisit before any real data exists.

## 1. Import the repo

At <https://vercel.com/new>, import **`Ben-Sicat/fundpro`**. Framework detection
should say Next.js; leave the build settings alone.

## 2. Environment variables

Add these under **Settings → Environment Variables** (Production + Preview).
There is deliberately **no `DATABASE_URL`** — nothing in the app imports the
database module while it is mock-driven.

| Variable | Value | Why |
|---|---|---|
| `AUTH_SECRET` | output of `openssl rand -base64 32` | Signs the session JWT. Auth.js refuses to start without it in production. |
| `AUTH_TRUST_HOST` | `true` | Lets Auth.js trust the Vercel-provided host when building callback URLs. |
| `CRON_SECRET` | output of `openssl rand -hex 32` | `/api/cron/[job]` rejects any request without this bearer token. |
| `JOB_DRIVER` | `vercel-cron` | Selects the serverless job driver over the pg-boss stub. |

Generate both secrets locally:

```sh
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

Do **not** reuse the values from `.env.local`; that file is gitignored and its
secrets should stay local-only.

## 3. Deploy

Vercel builds on push to `main`. Every later push redeploys automatically.

## 4. Check it works

- `/` redirects to `/login`
- `/app` while signed out redirects to `/login` (middleware)
- `/api/health` returns `{"status":"ok","dataSource":"mock"}`
- `/api/cron/import.process` with no auth header returns **401**
- Sign in as `admin@fundpro.local` / `demo1234`

## Notes for later

- **When the Python preprocessing API lands:** add `PREPROCESS_API_URL` and
  `PREPROCESS_API_KEY`, then swap the function bodies in `lib/data/index.ts` —
  the single data seam. Validate responses with Zod there; the API is a separate
  deployable and its payload is untrusted input.
- **When Supabase auth lands:** delete `lib/mock/users.ts`, restore the
  credentials `authorize` to query the users table with a bcrypt compare, and add
  `DATABASE_URL` (Supabase requires `?sslmode=require`).
- **Before any real donor data touches this**, the login page must stop printing
  credentials, and access should move behind Vercel Deployment Protection or
  real accounts.
