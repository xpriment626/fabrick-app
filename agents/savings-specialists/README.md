# Fabrick Savings Specialists

Prototype-runtime Coral agents for Fabrick's USDC savings analysis surface.

These agents only interpret, critique, and narrate Savings MCP data and deterministic Fabrick candidate allocations. They must not own wallet provisioning, signer delegation, transaction construction, transaction submission, savings account CRUD, ledger writes, or memory persistence.

Savings MCP remains the stateless data and metric substrate. Fabrick remains the app authority for users, wallets, account state, and execution.

## Agents

- `fabrick-opp-interpreter`
- `fabrick-rate-quality`
- `fabrick-exit-liquidity`
- `fabrick-capacity-risk`
- `fabrick-exposure`
- `fabrick-strategy-narrator`

## Smoke

Run from `fabrick-app`:

```bash
npm run smoke:coral:savings
```

The smoke command reads `CORAL_API_KEY` from `.env`, starts Savings MCP from `/Users/bambozlor/Desktop/studio/savings-mcp`, awaits the MCP `tools/list` response, checks USDC opportunities, and then creates a Coral session.

Coral Cloud must already be able to see these six custom agents in its registry. If it cannot, the smoke keeps the custom-agent Cloud session as a failure, then runs a built-in `seed`/`echo` fallback to prove Cloud namespace/session/thread plumbing.

For a local or self-hosted Coral Server, expose each specialist directory through `[registry].local_agents`.

If Coral Cloud has a linked source for that server, target it with:

```bash
npm run smoke:coral:savings -- --linked-server=<linked-server-name>
```
