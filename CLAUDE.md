# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OpenBuild is a digital platform for sharing AI-built products, built live in the browser (see [README.md](README.md)). Two main sections: **BuildLive** (live projects people are actively building, joinable by forking + a cloud coding session) and **IdeaStream** (a discussion feed with AI-summarized threads).

npm workspaces monorepo: `apps/api` (Fastify + Postgres backend) and `apps/web` (React + Vite frontend).

## Commands

Run from repo root unless noted.

```bash
npm run dev          # api + web together (web waits for api to be ready)
npm run dev:api      # apps/api only — tsx watch src/server.ts
npm run dev:web      # apps/web only — vite
npm run build         # builds both workspaces
npm run infra         # docker compose up -d for apps/api (postgres, redis, gitea)
```

Per-app:

```bash
cd apps/api && npm run migrate          # node-pg-migrate up
cd apps/api && npm run migrate:create   # scaffold a new migration
cd apps/web && npm run lint             # eslint
cd apps/web && npm run build            # tsc -b && vite build
```

There is no test suite in this repo.

Local infra (Postgres, Redis, Gitea) is defined in [apps/api/docker-compose.yml](apps/api/docker-compose.yml) and started via `npm run infra`. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env` before running.

## Architecture

### Backend (`apps/api`)

Fastify app ([src/server.ts](apps/api/src/server.ts)) registering one route module per domain under `src/routes/`, each namespaced under `/api` (auth, projects, sessions, ideas, publications, search, messages, notifications, follows, report, trending, settings, pulls) — kept unprefixed so a route's name never collides with an SPA page of the same name (e.g. `/auth`, `/makers`, `/settings` are also client-side routes). `ws` and `session-proxy` stay unprefixed since they're reached directly (native WebSocket, iframe/subdomain proxying) rather than through the browser's `/api` fetch wrapper; `session-subdomain` routes on Host header, not path. In production the built frontend is served from the same Fastify instance (`apps/web/dist`); any unmatched path outside `/api`, `/ws`, `/proxy`, `/health` falls back to `index.html` for client-side routing. In dev, Vite proxies `/api` and `/ws` to the API unchanged (see [apps/web/vite.config.ts](apps/web/vite.config.ts)).

**Auth is dual-mode**: `request.authenticate` first tries a local JWT (`@fastify/jwt`), then falls back to verifying a Firebase ID token and looking up the corresponding `users.firebase_uid` row. Both paths can coexist per deployment.

**Schema management is two-layered**: [src/db/schema.sql](apps/api/src/db/schema.sql) is the baseline schema (loaded into Postgres on first container start via docker-compose), plus `node-pg-migrate` migrations in `src/db/migrations/`. On top of that, `src/db/pool.ts` exports a set of `ensureXColumns()` functions (e.g. `ensureMakerColumns`, `ensureBuildColumns`, `ensureSocialTables`) — idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` blocks, one per feature slice, each named after the project stage it shipped in (S2 Build, S3 Discussion, S4 Publish, etc). These run on every server boot in `server.ts` and are the primary way the schema has evolved — check there before assuming `schema.sql` alone reflects the current schema.

**Coding sessions** (`src/services/session.service.ts`, `src/services/session-process.service.ts`): "Join"ing a project forks its repo on Gitea, then spins up a sandboxed OpenCode coding session — either a Docker container (`SESSION_MODE=docker`, the default `docker.sessionImage`) or a local process (`SESSION_MODE=process`), configurable via `config.sessions` in [src/config/env.ts](apps/api/src/config/env.ts). The session is injected with the user's decrypted provider API key/model/instructions from `user_settings`, clones the fork, and on completion (`completeSession`) commits, rebases onto upstream, force-pushes, and opens a PR back to the original repo via the Gitea API (`src/services/git.service.ts`). This is called out as a "dormant feature" in `.env.example` — don't assume it's exercised in every environment.

**Gitea** is the self-hosted git host backing forks/PRs (`config.gitea`, `GITEA_URL`/`GITEA_ADMIN_TOKEN`). It's optional: `GITEA_AUTO_PROVISION=false` skips account/repo auto-creation entirely so auth and publish flows work without it running.

**Secrets at rest**: `encrypt`/`decrypt` in [src/config/env.ts](apps/api/src/config/env.ts) (AES-256-GCM, keyed by `ENCRYPTION_KEY`, falling back to `JWT_SECRET`) are used for stored Gitea tokens and provider API keys in `user_settings`.

### Frontend (`apps/web`)

React 19 + React Router (`apps/web/src/App.tsx`) + Zustand + Tailwind v4. Routes split into public (`/`, `/auth`) and an authenticated `AppShell` (redirects to `/` if not logged in) wrapping everything else (`/buildlive`, `/ideastream`, `/session/:id`, `/settings`, etc). The landing page (`Landing.tsx`) intentionally never auto-redirects logged-in users pre-launch — see the comment in `Home()`.

`src/lib/api.ts` is the single fetch wrapper: resolves an auth token (stored local JWT first, else waits on Firebase auth state with a 2s timeout), and surfaces API-down errors ("API is not running...") distinctly from other failures. `src/lib/firebase.ts` wraps Firebase client init/auth.

### Deploy

`deploy/deploy.sh` builds both workspaces and rsyncs `apps/api/dist`, `apps/api/node_modules`, `apps/web/dist`, and `deploy/` to `/opt/openbuild` on the target host, then restarts a systemd unit (`deploy/openbuild-api.service`). `Caddyfile` and `cloudflared-config.yml` handle reverse proxy / tunnel at the edge. Firebase is used only for Auth (`firebase.json` configures the local Auth emulator); there's no Firestore/Hosting usage here.
