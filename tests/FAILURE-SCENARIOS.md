# End-to-end failure scenarios

Written before the E2E suite.

- The distributed tarball imports private app code or contains candles, market data, account data, ingest signing, curve reads, or RPC URLs. Install the tarball in a clean temporary consumer and inspect its complete file list and exports.
- A quote sends cookies, uses the private endpoint, omits fields, drops an abort signal, or retries unexpectedly. Record HTTP requests through a running local fixture server.
- The API returns an invalid token, chain, amount, side, minimum output, fee, snapshot, malformed JSON, or expired quote. Reject it before the wallet signs.
- Wallet sends use server calldata or an incorrect destination. Decode the caller-built transaction and compare its contract, native value, amounts, minimum output, and approval spender.
- A missing wallet, account, wrong chain, or wallet rejection is hidden. Fail before quoting where possible and preserve wallet errors.
- A sell silently grants unlimited allowance. Provide an explicit exact-amount approval helper and never approve as a side effect.
- Minting ignores metadata requirements or creator-fee limits, or sends value to the factory. Validate mint input and decode the actual wallet transaction.
- Launch receipt parsing trusts an event from a different address. Accept only the configured factory's Launched event.
- Documentation routes, search, copy controls, dark/light themes, mobile navigation, or keyboard access break. Exercise the built site and save screenshots and a trace.
- Publishing ships a different package than the tested one. Save the tarball hash and a JSON report with reproduction instructions.
