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
