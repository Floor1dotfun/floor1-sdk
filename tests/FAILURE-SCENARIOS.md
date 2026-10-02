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

## Search metadata (2 October 2026)

Written before the search metadata change.

- A page keeps a generic title, shares a title or description with another page, or has a title over 65 or a description outside 70–165 characters.
- Canonical, `og:url`, breadcrumb and article URLs disagree, use a trailing-slash form other than the one Vercel serves, or point at localhost or a preview host.
- Structured data is malformed, contains an unescaped `</script>`, or names a publisher other than the Floor1 organization on www.floor1.fun.
- The social image is missing, not 1200×630, or not served from docs.floor1.fun.
- The sitemap lists a URL that is not built, omits a built page, or has `lastmod` values that differ from the visible update date.
- The IndexNow key file is missing or does not contain the key; robots.txt stops allowing crawl or loses the sitemap.
- The 404 page becomes indexable.
- New links to www.floor1.fun guides break, or the page source link points at a branch other than `main`.

## Cut corners (2 October 2026)

Written before the cut-corner restyle.

- A control or surface keeps a rounded corner: buttons, the app and primary links, theme and menu buttons, copy controls, the search trigger, close button and shortcut key, guide cards, code blocks, callouts, endpoints, tables, the search dialog, the version badge, the active sidebar item, inline code or search results.
- A clip-path cuts a border at the corners without a visible diagonal edge or corner accent, so the cut looks like a rendering fault rather than intent.
- Clipping hides the keyboard focus outline, or the focus outline is thicker or a different color than the app's 1px primary outline.
- A clipped element hides content: the hero copy button, table headers, wide tables that scroll horizontally, code that scrolls, or search results.
- The light theme loses contrast on cut edges or accents, or either theme leaves the approved purple palette.
- Corner accents cover text, or a background layer added for the accents replaces a surface's existing background color or gradient.
- Mobile header controls overflow at 390px, or any route gains horizontal page overflow.

## Agent discovery (2 October 2026)

Written before the Market API page, OpenAPI description and Markdown negotiation.

- The Market API page documents a parameter, field, limit, cache lifetime or error that the public API does not serve, or omits one it does. Compare every documented endpoint, parameter and field with the live wire types.
- The OpenAPI description is invalid 3.1, references a missing component, omits a public read, the quote POST or HEAD, or lists a private route.
- The new page is missing from the navigation, sitemap, search index, llms.txt, llms-full.txt or the HTTP reference, or its title and description duplicate another page.
- A page lacks `<link rel="alternate" type="text/markdown">`, or it points at a mirror that is not built.
- A request with `Accept: text/markdown` still receives HTML, a browser request receives Markdown, or the negotiated response lacks `Vary: Accept`, so a shared cache can serve one variant to the other client.
- A Markdown mirror is indexable or names a canonical other than its HTML page; the overview mirror points at a page that does not exist.
- Moving the HTML out of the public paths breaks a route, the 404 page, an asset, or makes the internal copy indexable.
- Static files shadow the content negotiation because a stale build left HTML at the public path.
- The favicon is missing, oversized, or the header logo still downloads the full-size brand image.
- Package keywords are lost, or the change publishes the package.

## MCP server (2 October 2026)

Written before the `@floor1/mcp` server and its E2E suite.

- The private key appears in a tool result, an error message, stdout, stderr or a saved transcript. Search every recorded byte for the key and its unprefixed form.
- The server writes anything other than JSON-RPC to stdout and corrupts the stdio transport.
- A read tool is not marked read-only, or a tool that sends a transaction, approves or uploads is not marked destructive, so the client skips its confirmation.
- The RPC is on another chain and a transaction is signed for it. Check the RPC chain ID before any read or send, and reject anything other than 91342.
- An agent passes an amount as a number, a negative, an exponent, hex, more than 18 decimals, zero, or a value above uint256, and it is silently rounded or reinterpreted. Accept only plain decimal strings and reject the rest before any request.
- A buy exceeds the per-trade ETH cap or the rolling daily cap, slippage exceeds the configured maximum, or the token is outside a configured allowlist, and the transaction still reaches the wallet.
- Two write tools run at once and race on the nonce or the daily cap. Allow one transaction in flight per wallet.
- An agent loops on a tool and floods the public API, the RPC or the uploader. Enforce local buckets for quotes, market reads, transactions and mints, and refuse with a retry time instead of queueing.
- The API answers 429 and the server retries in a loop or ignores Retry-After. Wait once for a short Retry-After, retry once, then surface the error.
- A sell is sent without enough allowance and burns gas on a revert. Check the allowance first and return a clear error; never approve as a side effect.
- A sell or buy reverts and the agent only sees a generic failure. Decode Slippage, NotActive, Paused and the other contract errors, before sending and from a mined receipt.
- A trade result reports the quote instead of the fill. Read the actual amounts from the market's Trade event emitted for this token and trader only.
- Without a key, a write tool fails or signs anything. Return unsigned transactions in prepare-only mode, and refuse uploads that need a signer.
- `dry_run` still sends a transaction or uploads data.
- A mint uploads an image that is too large, not an image, or claims a different type than its bytes; or metadata that the Floor1 app would reject.
- The uploader's free allowance (105 KiB per item, 10 MiB per wallet and 10 MiB per network address, lifetime) cannot cover the launch, and the server pays without permission or uploads half the launch first. Check the wallet's remaining free bytes for both items before the first upload, refuse unless paid uploads are enabled, and explain the caps when the uploader refuses anyway.
- An upload succeeds but the mint fails, and the agent re-uploads on retry. Return the uploaded URIs so a retry can pass the metadata URI directly.
- A mint receipt is parsed from another factory, or a trade fill from another market or trader.
- Market reads expose private routes or send credentials. Use only the public token search and token detail reads, without cookies, and cache identical reads briefly.
- The package bundles private app code, RPC URLs or credentials, or the SDK package starts shipping MCP code.
