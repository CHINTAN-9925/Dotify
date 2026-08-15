# Split.io

Production-oriented multiplayer rewrite of the `splitio.html` feel prototype. The original file remains the behavioral reference; production code is TypeScript and server-authoritative.

## Architecture

```text
React HUD + PixiJS renderer
          │ validated inputs (20 Hz)
          ▼
 Colyseus authoritative room ──► Supabase Auth/Postgres
          │ state patches + seeded gameplay events
          ▼
 client interpolation + visual-only particles/audio
```

- `apps/client` — browser/PWA client and Capacitor host.
- `apps/server` — Colyseus arena, authentication boundary, checkpoints.
- `packages/config` — versioned seconds-based authoritative tuning.
- `packages/protocol` — validated messages and event contracts.
- `packages/simulation` — deterministic fixed-tick simulation and spatial hash.
- `supabase/migrations` — protected account/progression schema.

## Local development

Requirements: Node.js 24 LTS and pnpm 10.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:5173`. When Supabase variables are absent, the server permits development identities. Production mode always requires a verified access token.

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Prime Hotspots

Three gold Prime Cores occupy food-cluster centers and create shared objectives across the arena:

- Eating or chain-popping food in a Prime's cluster adds one shared charge.
- At 18 charges, the Prime arms for eight seconds and becomes vulnerable to fragments.
- The first fragment to touch it claims a 24-fragment gold detonation and gains `+3` chain.
- An unclaimed Prime erupts neutrally when its fuse expires.
- The spent core fades out for 12 seconds, then relocates to a different unoccupied cluster.

Charge arcs, armed countdowns, warning rings, a minimap, shockwaves, camera kick, and event banners make the objective readable without changing the server-authoritative rules.

## Mobile

After the web build succeeds:

```bash
pnpm --filter @split/client add @capacitor/android @capacitor/ios
pnpm --filter @split/client build
pnpm --filter @split/client exec cap add android
pnpm --filter @split/client exec cap add ios
pnpm --filter @split/client exec cap sync
```

Native platform directories are generated artifacts and intentionally ignored until the signing/build pipeline is configured.

## Security model

- Clients send direction and burst intent only.
- The server owns movement limits, mass, cooldowns, collisions, chains, death, and rewards.
- Supabase service credentials exist only on the server.
- Progress writes use a unique idempotency key.
- Gameplay protocol and configuration are independently versioned.
- Anonymous users can later link Google, Apple, or email without changing their player ID.

## Production rollout

1. Deploy the client to a static CDN and the server container to a staging Asia region.
2. Apply the Supabase migration, enable anonymous sign-in/manual linking, and configure OAuth redirect URLs.
3. Run a closed alpha, then load test 50 rooms / 1,200 simulated clients.
4. Require p95 room ticks below 12 ms, average traffic below 40 KB/s/client, and zero duplicate checkpoint records.
5. Add Redis presence/driver when deploying more than one Colyseus process; Colyseus Cloud manages this automatically.

## Remaining release work

This repository establishes the production vertical slice. Before public release, complete the audio and haptics pass, add generated schema client types, implement cosmetics/profile screens, add Sentry and analytics environment integrations, run device QA, and create signed App Store/Play Store projects.
