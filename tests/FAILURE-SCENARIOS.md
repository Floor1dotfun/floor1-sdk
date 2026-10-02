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
