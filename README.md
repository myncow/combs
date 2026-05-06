# Lattice

Lattice is a greenfield Next.js app for generating public taxonomy maps from guided user prompts. It uses a two-stage server-side generation flow, structured JSON validation, and a generic renderer that turns saved map documents into browseable public pages.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- OpenRouter SDK
- Zod
- Drizzle + Postgres
- Vitest

## Environment

Copy `.env.example` to `.env.local` and set at least:

- `DATABASE_URL` — Postgres connection string (required for dev and production)
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`
- `SERPAPI_API_KEY` (optional; enables SerpApi-backed image examples)

`OPENROUTER_API_KEY` is required for map generation. If it is missing, generation fails closed instead of publishing heuristic fallback maps.

`SERPAPI_API_KEY` enables visual example matrices by proxying Google Images through SerpApi. If it is missing, maps still render, but visual example tiles are hidden.

## Development

Create a Postgres database, point `DATABASE_URL` at it, then apply schema:

```bash
pnpm db:migrate
pnpm dev
```

Other commands:

```bash
pnpm lint
pnpm test
pnpm build
```

### Tests and Postgres

`tests/leaderboard-store.test.ts` truncates store tables, so it only runs when `TEST_DATABASE_URL` is set. Point `TEST_DATABASE_URL` at a disposable database such as `lattice_test`, then apply `pnpm db:migrate` to that database first. If `TEST_DATABASE_URL` is unset, the store integration suite is skipped and `pnpm test` will not touch your dev `DATABASE_URL`.

GitHub Actions (`.github/workflows/ci.yml`) starts Postgres, migrates, then runs tests including the leaderboard suite.

## Notes

- Public browsing is anonymous in v1.
- Generation is rate-limited in memory.
- The API surface includes:
  - `GET /api/maps`
  - `GET /api/maps/[slug]`
  - `GET /api/example-images`
  - `POST /api/example-images`
  - `GET /api/example-prompts` (reads `example_prompts` in Postgres)
- The create flow uses a server action for generation and persistence.
