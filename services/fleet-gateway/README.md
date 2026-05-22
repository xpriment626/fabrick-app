# fleet-gateway

The public edge for the Coral fleet runtime. Stands between browsers and
`coral-server` so that:

1. **The shared `CORAL_AUTH_TOKEN` never reaches the browser.** It lives only
   in this process. `coral-server` can stay on a private network with no
   public port.
2. **Per-session ownership is enforced.** Coral v1.2 has no per-user authz —
   any valid key reads any session. The gateway only relays a session's event
   stream to a browser holding a JWT minted *for that exact session* by the
   SvelteKit app.

This is the standalone, Docker-free shape of what becomes a container in the
production compose stack later (see `docs/agents-research.md` →
"Production Deployment & Fleet Runtime Architecture"). It ports by adding a
Dockerfile — the code does not change.

## First roll scope

- token custody + WS relay + per-session ownership.
- **Not yet:** server-side archive trigger, cost telemetry. The browser still
  archives for now; those fold into the gateway in the next roll.
- **Still on direct-to-Coral (unchanged this roll):** the `/research/[ns]/[sid]`
  standalone live page and `/api/dev/run`. Only the chat-inline dispatch path
  (`/api/fleet/run`) routes through the gateway so far.

## Run it locally

The gateway reuses deps already installed in the parent app (`ws`, `jose`), so
from `fabrick-app/` you can run it directly:

```bash
# from fabrick-app/
GATEWAY_JWT_SECRET=dev-gateway-secret-change-me \
CORAL_AUTH_TOKEN=local \
CORAL_SERVER_URL=http://localhost:5555 \
bun run services/fleet-gateway/src/index.ts
```

Or as its own package:

```bash
cd services/fleet-gateway
cp .env.example .env   # then edit
bun install
bun run dev            # watch mode
```

`GATEWAY_JWT_SECRET` **must match** the SvelteKit app's `GATEWAY_JWT_SECRET`
(in `fabrick-app/.env`) or the gateway will reject every connection with a
401.

## Local dev topology

```
browser ──ws──► fleet-gateway (:8787) ──ws──► coral-server (:5555, private)
   ▲                                              spawns executable agents
   └── loads app from SvelteKit dev (:5173), which mints the gateway JWT
```

## Verify (devtools)

1. Start coral-server (gradle) + agents as usual, the SvelteKit dev server,
   and this gateway.
2. Dispatch a fleet from a chat. In the Network tab, filter to **WS**:
   - the connection goes to `ws://localhost:8787/events/...?token=<JWT>`, **not**
     to `:5555` — and the token is a short JWT, not `CORAL_AUTH_TOKEN`.
   - the trace renders identically (frames are relayed verbatim).
3. Tamper check: copy the WS URL, change the `sessionId` segment, try to
   connect — the gateway rejects with `403 token scope mismatch`.

## Endpoints

- `GET /healthz` → `{ ok: true, ts }`
- `WS /events/:namespace/:sessionId?token=<jwt>` → relayed Coral event stream

## Config (env)

| Var | Purpose |
|---|---|
| `PORT` | Listen port (default 8787) |
| `CORAL_SERVER_URL` | coral-server base URL (held server-side) |
| `CORAL_AUTH_TOKEN` | shared Coral token — never sent to the browser |
| `GATEWAY_JWT_SECRET` | HMAC secret shared with the SvelteKit app |
