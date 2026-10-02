import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createPublicClient, createWalletClient, decodeFunctionData, defineChain, encodeFunctionData, erc20Abi, getAddress, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const run = promisify(execFile);
const root = resolve(new URL('../', import.meta.url).pathname);
const out = resolve(root, 'test-results/e2e/mcp');
await mkdir(out, { recursive: true });
const sdk = await import(resolve(root, 'lib/index.js'));
const { giwaSepolia, tradingAbi, mintingAbi, approvalAbi } = sdk;
const agentKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const harnessKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const agent = privateKeyToAccount(agentKey).address;
const harness = privateKeyToAccount(harnessKey);
const checks = [];
const transcript = [];
const stderrLog = [];
const transportErrors = [];
const apiRequests = [];
const turboRequests = [];
const check = async (name, fn) => { await fn(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); };
const children = [];
const servers = [];
const clients = [];
let failure;
let tarball;
let sha256;
let apiMode = 'valid';
let limitedOnce = false;
const free = { remaining: 10 * 1024 * 1024, uploadStatus: 200 };

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));
const body = async req => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };
const reply = (res, status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value)); };

async function startAnvil(chainId) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn('anvil', ['--port', String(port), '--chain-id', String(chainId), '--silent'], { stdio: 'ignore' });
  children.push(child);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }); if (r.ok) return url; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('anvil did not start');
}

try {
  const packed = await run('npm', ['pack', '-w', '@floor1/mcp', '--json', '--pack-destination', out], { cwd: root, maxBuffer: 10_000_000 });
  const manifest = JSON.parse(packed.stdout)[0];
  tarball = resolve(out, manifest.filename);
  sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await check('Packed MCP package ships only the bundled server, README, LICENSE and manifest', async () => {
    assert.deepEqual(manifest.files.map(f => f.path).sort(), ['LICENSE', 'README.md', 'dist/server.js', 'package.json']);
    const bundle = await readFile(resolve(root, 'mcp/dist/server.js'), 'utf8');
    assert(bundle.startsWith('#!/usr/bin/env node'));
    assert(!/sepolia-rpc|INGEST_INTERNAL|SITE_PASSWORD|createIngestClient|candles\(|\/api\/v1\/launch|\/api\/v1\/accounts/.test(bundle));
    const sdkPack = JSON.parse((await run('npm', ['pack', '--dry-run', '--json'], { cwd: root, maxBuffer: 10_000_000 })).stdout)[0];
    assert(sdkPack.files.every(f => !f.path.startsWith('mcp/')));
  });
  const consumer = await mkdtemp(resolve(tmpdir(), 'floor1-mcp-consumer-'));
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const install = await run('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer, maxBuffer: 20_000_000 });
  await writeFile(resolve(out, 'consumer-install.log'), install.stdout + '\n' + install.stderr);
  const bin = resolve(consumer, 'node_modules/.bin/floor1-mcp');

  const build = await run('forge', ['build', resolve(root, 'tests/fixtures/mcp/Fixtures.sol'), '--out', resolve(out, 'forge'), '--cache-path', resolve(out, 'forge-cache'), '--use', '0.8.24'], { cwd: root });
  await writeFile(resolve(out, 'forge.log'), build.stdout + build.stderr);
  const artifact = async name => JSON.parse(await readFile(resolve(out, 'forge/Fixtures.sol', `${name}.json`), 'utf8'));
  const [tokenArtifact, marketArtifact, factoryArtifact] = await Promise.all(['FixtureToken', 'FixtureMarket', 'FixtureFactory'].map(artifact));

  const rpcUrl = await startAnvil(91342);
  const wrongRpcUrl = await startAnvil(1);
  const chain = defineChain({ id: 91342, name: 'Giwa Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  const pub = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
  const wallet = createWalletClient({ account: harness, chain, transport: http(rpcUrl) });
  const rpc = (method, params) => pub.request({ method, params });
  await rpc('anvil_setCode', [giwaSepolia.market, marketArtifact.deployedBytecode.object]);
  await rpc('anvil_setCode', [giwaSepolia.factory, factoryArtifact.deployedBytecode.object]);
  await rpc('anvil_setBalance', [giwaSepolia.market, '0x56BC75E2D63100000']);
  const deployToken = async symbol => { const hash = await wallet.deployContract({ abi: tokenArtifact.abi, bytecode: tokenArtifact.bytecode.object, args: [`Fixture ${symbol}`, symbol, giwaSepolia.market] }); return getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress); };
  const tokenA = await deployToken('FROG');
  const tokenB = await deployToken('DEAD');
  const tokenC = await deployToken('ELSE');
  const marketAbi = parseAbi(['function setInactive(address token, bool value)']);
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: giwaSepolia.market, abi: marketAbi, functionName: 'setInactive', args: [tokenB, true] }) });

  const api = createServer(async (req, res) => {
    const raw = await body(req);
    const url = new URL(req.url, 'http://fixture');
    const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), cookie: req.headers.cookie ?? null, body: raw.length ? JSON.parse(raw.toString()) : null };
    apiRequests.push(entry);
    if (apiMode === 'limited' || (apiMode === 'limited-once' && !limitedOnce)) { limitedOnce = true; return reply(res, 429, { error: { code: 'rate_limited', message: 'Too many requests.' } }, { 'Retry-After': '1' }); }
    if (url.pathname === '/api/v1/tokens/search') return reply(res, 200, { items: [{ id: tokenA.toLowerCase(), name: 'Fixture FROG', symbol: 'FROG', image: '', priceUsd: 0.01, marketCapUsd: 10000, priceQuote: 0.000001, marketCapQuote: 1, change24h: 5, holders: 3, verified: false, graduated: false, createdAt: 1 }] });
    if (url.pathname.startsWith('/api/v1/tokens/')) return reply(res, 200, { id: url.pathname.split('/').at(-1), name: 'Fixture FROG', symbol: 'FROG', supply: 1000000000, asOf: Date.now() });
    if (url.pathname !== '/api/v1/trading/quotes') return reply(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    const q = entry.body;
    const amount = BigInt(q.amount);
    let amountOut = q.side === 'buy' ? amount * 1000n : amount / 1000n;
    if (apiMode === 'inflate') amountOut *= 2n;
    const issuedAt = Date.now();
    reply(res, 200, { id: randomBytes(8).toString('hex'), chainId: 91342, token: q.token, side: q.side, mode: 'exact_in', amount: q.amount, slippageBps: q.slippageBps, amountOut: amountOut.toString(), minimumOut: (amountOut * BigInt(10000 - q.slippageBps) / 10000n).toString(), fee: '30', protocolFee: '20', creatorFee: '10', refund: '0', issuedAt, expiresAt: issuedAt + 30000, snapshot: { source: 'database', blockNumber: 1, indexedAt: issuedAt, marketVersion: 1 } });
  });
  servers.push(api);
  const apiUrl = await listen(api);

  const turbo = createServer(async (req, res) => {
    const raw = await body(req);
    const url = new URL(req.url, 'http://fixture');
    turboRequests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), bytes: raw.length, text: raw.toString('latin1') });
    if (url.pathname === '/v1/account/free') return reply(res, 200, { bytesRemaining: free.remaining });
    if (req.method === 'POST' && url.pathname === '/v1/tx/ethereum') {
      if (free.uploadStatus !== 200) { res.writeHead(free.uploadStatus, { 'Content-Type': 'text/plain' }); return res.end('Insufficient balance'); }
      return reply(res, 200, { id: randomBytes(32).toString('base64url').slice(0, 43), owner: agent, dataCaches: [], fastFinalityIndexes: [], winc: '0' });
    }
    reply(res, 404, {});
  });
  servers.push(turbo);
  const turboUrl = await listen(turbo);

  const baseEnv = { PATH: process.env.PATH, FLOOR1_API_URL: apiUrl, FLOOR1_RPC_URL: rpcUrl, FLOOR1_TURBO_UPLOAD_URL: turboUrl, FLOOR1_TURBO_PAYMENT_URL: turboUrl };
  async function connect(label, env) {
    const transport = new StdioClientTransport({ command: process.execPath, args: [bin], env: { ...baseEnv, ...env }, stderr: 'pipe' });
    transport.stderr.on('data', chunk => stderrLog.push({ server: label, text: chunk.toString() }));
    const send = transport.send.bind(transport);
    transport.send = message => { transcript.push({ server: label, direction: 'client→server', message }); return send(message); };
    const client = new Client({ name: 'floor1-e2e', version: '1.0.0' });
    await client.connect(transport);
    const onmessage = transport.onmessage;
    transport.onmessage = message => { transcript.push({ server: label, direction: 'server→client', message }); onmessage(message); };
    const onerror = transport.onerror;
    transport.onerror = error => { transportErrors.push({ server: label, message: error.message }); onerror?.(error); };
    clients.push(client);
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      const parsed = JSON.parse(result.content[0].text);
      return result.isError ? { error: parsed.error } : parsed;
    };
    return { client, call };
  }

  const main = await connect('signing', { FLOOR1_PRIVATE_KEY: agentKey, FLOOR1_MAX_BUY_ETH: '0.1', FLOOR1_DAILY_MAX_ETH: '0.15', FLOOR1_TOKEN_ALLOWLIST: `${tokenA},${tokenB}`, FLOOR1_MAX_TX_PER_MINUTE: '20' });
  const nonce = () => pub.getTransactionCount({ address: agent });
  const tokenBalance = token => pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [agent] });

  await check('Tools are listed with read-only and destructive annotations', async () => {
    const { tools } = await main.client.listTools();
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));
    assert.deepEqual(Object.keys(byName).sort(), ['floor1_approve', 'floor1_balances', 'floor1_buy', 'floor1_mint', 'floor1_quote', 'floor1_search_tokens', 'floor1_sell', 'floor1_token', 'floor1_tx_status']);
    for (const name of ['floor1_quote', 'floor1_balances', 'floor1_tx_status', 'floor1_search_tokens', 'floor1_token']) assert.equal(byName[name].annotations.readOnlyHint, true, name), assert.equal(byName[name].annotations.destructiveHint, false, name);
    for (const name of ['floor1_buy', 'floor1_sell', 'floor1_approve', 'floor1_mint']) assert.equal(byName[name].annotations.readOnlyHint, false, name), assert.equal(byName[name].annotations.destructiveHint, true, name);
    await writeFile(resolve(out, 'tools.json'), JSON.stringify(tools, null, 2));
  });

  await check('Quote sends the exact public request without credentials', async () => {
    const quote = await main.call('floor1_quote', { token: tokenA, side: 'buy', amount: '0.01' });
    assert.equal(quote.amountOut, (parseEther('0.01') * 1000n).toString());
    assert.equal(quote.amountOutDisplay, '10');
    const sent = apiRequests.at(-1);
    assert.deepEqual(sent.body, { token: tokenA, side: 'buy', amount: parseEther('0.01').toString(), slippageBps: 100 });
    assert.equal(sent.cookie, null);
  });

  await check('Malformed amounts are rejected before any request', async () => {
    const before = apiRequests.length;
    for (const amount of ['1e18', '-1', '0x10', '0.0000000000000000001', '0', '', ' 1', '1,5', 'NaN', '1.']) {
      const result = await main.call('floor1_quote', { token: tokenA, side: 'buy', amount });
      assert.equal(result.error?.code, 'invalid_amount', amount);
    }
    const numeric = await main.client.callTool({ name: 'floor1_quote', arguments: { token: tokenA, side: 'buy', amount: 1 } });
    assert.equal(numeric.isError, true);
    assert.equal(apiRequests.length, before);
  });

  let buyHash;
  await check('Buy sends a real transaction and reports the on-chain fill', async () => {
    const before = await tokenBalance(tokenA);
    const result = await main.call('floor1_buy', { token: tokenA, amount_eth: '0.1' });
    assert.equal(result.sent, true);
    assert.equal(result.status, 'success');
    assert.equal(result.fill.kind, 'trade');
    assert.equal(result.fill.amountOut, (parseEther('0.1') * 1000n).toString());
    assert.equal((await tokenBalance(tokenA)) - before, parseEther('0.1') * 1000n);
    assert.equal(result.dailyRemainingEth, '0.05');
    buyHash = result.hash;
  });

  await check('Buy dry run returns the unsigned transaction and sends nothing', async () => {
    const n = await nonce();
    const result = await main.call('floor1_buy', { token: tokenA, amount_eth: '0.01', dry_run: true });
    assert.equal(result.sent, false);
    assert.equal(result.mode, 'dry_run');
    assert.equal(result.transaction.to, giwaSepolia.market);
    assert.equal(result.transaction.value, parseEther('0.01').toString());
    assert.equal(decodeFunctionData({ abi: tradingAbi, data: result.transaction.data }).functionName, 'buyWithEth');
    assert.equal(await nonce(), n);
  });

  await check('Guardrails refuse per-trade, daily, slippage and allowlist breaches before signing', async () => {
    const n = await nonce();
    const requests = apiRequests.length;
    assert.equal((await main.call('floor1_buy', { token: tokenA, amount_eth: '0.11' })).error.code, 'buy_cap');
    assert.equal((await main.call('floor1_buy', { token: tokenA, amount_eth: '0.06' })).error.code, 'daily_cap');
    assert.equal((await main.call('floor1_buy', { token: tokenA, amount_eth: '0.01', slippage_bps: 600 })).error.code, 'slippage_cap');
    assert.equal((await main.call('floor1_buy', { token: tokenC, amount_eth: '0.01' })).error.code, 'token_not_allowed');
    assert.equal((await main.call('floor1_sell', { token: tokenC, amount: '1' })).error.code, 'token_not_allowed');
    assert.equal(apiRequests.length, requests);
    assert.equal(await nonce(), n);
  });

  await check('Sell without allowance is refused, exact approval enables it, and the fill is reported', async () => {
    const n = await nonce();
    const refused = await main.call('floor1_sell', { token: tokenA, amount: '50' });
    assert.equal(refused.error.code, 'insufficient_allowance');
    assert.equal(await nonce(), n);
    const approved = await main.call('floor1_approve', { token: tokenA, amount: '50' });
    assert.equal(approved.status, 'success');
    assert.equal(await pub.readContract({ address: tokenA, abi: erc20Abi, functionName: 'allowance', args: [agent, giwaSepolia.market] }), parseEther('50'));
    const balances = await main.call('floor1_balances', { token: tokenA });
    assert.equal(balances.marketAllowanceDisplay, '50');
    const ethBefore = await pub.getBalance({ address: agent });
    const sold = await main.call('floor1_sell', { token: tokenA, amount: '50' });
    assert.equal(sold.status, 'success');
    assert.equal(sold.fill.side, 'sell');
    assert.equal(sold.fill.amountOut, (parseEther('50') / 1000n).toString());
    assert(await pub.getBalance({ address: agent }) > ethBefore);
    assert.equal(await pub.readContract({ address: tokenA, abi: erc20Abi, functionName: 'allowance', args: [agent, giwaSepolia.market] }), 0n);
    assert.equal((await main.call('floor1_sell', { token: tokenA, amount: '999999999' })).error.code, 'insufficient_balance');
  });

  await check('A trade that would revert is decoded and never broadcast', async () => {
    apiMode = 'inflate';
    const n = await nonce();
    const result = await main.call('floor1_approve', { token: tokenA, amount: '10' });
    assert.equal(result.status, 'success');
    const sell = await main.call('floor1_sell', { token: tokenA, amount: '10' });
    apiMode = 'valid';
    assert.equal(sell.error.code, 'reverted');
    assert.equal(sell.error.revert, 'Slippage');
    assert.equal(await nonce(), n + 1);
  });

  await check('Transaction status decodes a mined revert and reports a mined fill', async () => {
    const data = encodeFunctionData({ abi: tradingAbi, functionName: 'buyWithEth', args: [tokenB, 0n] });
    const hash = await wallet.sendTransaction({ to: giwaSepolia.market, data, value: parseEther('0.001'), gas: 200000n });
    await pub.waitForTransactionReceipt({ hash });
    const reverted = await main.call('floor1_tx_status', { hash });
    assert.equal(reverted.state, 'reverted');
    assert.equal(reverted.revert, 'NotActive');
    const ok = await main.call('floor1_tx_status', { hash: buyHash });
    assert.equal(ok.state, 'success');
    assert.equal(ok.fill.kind, 'trade');
    assert.equal(ok.fill.trader, agent);
    assert.equal((await main.call('floor1_tx_status', { hash: `0x${'1'.repeat(64)}` })).state, 'unknown');
    assert.equal((await main.call('floor1_tx_status', { hash: '0x12' })).error.code, 'invalid_hash');
  });

  await check('Concurrent writes from one wallet are refused instead of racing', async () => {
    const results = await Promise.all([main.call('floor1_approve', { token: tokenA, amount: '1' }), main.call('floor1_approve', { token: tokenA, amount: '2' })]);
    assert.deepEqual(results.map(r => r.error?.code ?? r.status).sort(), ['busy', 'success']);
  });

  const imagePath = resolve(out, 'frog.png');
  await writeFile(imagePath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(2048)]));
  const launch = { name: 'Floor Frog', symbol: 'FROG', description: 'A frog with a floor.', website: 'https://example.com', image_path: imagePath, creator_tax_bps: 200 };

  await check('Mint dry run checks the free allowance and uploads nothing', async () => {
    const uploads = turboRequests.filter(r => r.method === 'POST').length;
    const result = await main.call('floor1_mint', { ...launch, dry_run: true });
    assert.equal(result.uploaded, false);
    assert.equal(result.upload.paid, false);
    assert.equal(result.image.contentType, 'image/png');
    assert.equal(turboRequests.filter(r => r.method === 'POST').length, uploads);
    assert.equal(turboRequests.at(-1).query.address, agent);
  });

  await check('Mint uploads the image and metadata within the free tier, launches, and returns the token', async () => {
    const result = await main.call('floor1_mint', launch);
    assert.equal(result.status, 'success');
    assert.match(result.imageUri, /^ar:\/\/[A-Za-z0-9_-]{43}$/);
    assert.match(result.metadataUri, /^ar:\/\/[A-Za-z0-9_-]{43}$/);
    assert.equal(result.launched.symbol, 'FROG');
    assert.equal(result.launched.metadataUri, result.metadataUri);
    assert.equal(result.launched.creatorTaxBps, 200);
    assert.equal(await pub.readContract({ address: result.launched.token, abi: parseAbi(['function symbol() view returns (string)']), functionName: 'symbol' }), 'FROG');
    const posts = turboRequests.filter(r => r.method === 'POST');
    const [image, metadata] = posts.slice(-2);
    assert(image.text.includes('token-image') && image.text.includes('Floor1') && image.text.includes('image/png'));
    assert(metadata.text.includes(JSON.stringify({ name: 'Floor Frog', symbol: 'FROG', description: 'A frog with a floor.', image: result.imageUri, links: { website: 'https://example.com' } })));
    const tx = await pub.getTransaction({ hash: result.hash });
    const decoded = decodeFunctionData({ abi: mintingAbi, data: tx.input });
    assert.deepEqual(decoded.args, ['Floor Frog', 'FROG', giwaSepolia.weth, result.metadataUri, 200]);
  });

  await check('A second launch within a minute is refused before uploading', async () => {
    const posts = turboRequests.filter(r => r.method === 'POST').length;
    const result = await main.call('floor1_mint', launch);
    assert.equal(result.error.code, 'local_rate_limited');
    assert(result.error.retryAfterSeconds > 0);
    assert.equal(turboRequests.filter(r => r.method === 'POST').length, posts);
  });

  await check('Invalid images and metadata are rejected before uploading', async () => {
    const posts = turboRequests.filter(r => r.method === 'POST').length;
    const text = resolve(out, 'not-an-image.png');
    await writeFile(text, 'hello');
    const big = resolve(out, 'too-big.png');
    await writeFile(big, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96 * 1024)]));
    assert.equal((await main.call('floor1_mint', { ...launch, image_path: text, dry_run: true })).error.code, 'invalid_image');
    assert.equal((await main.call('floor1_mint', { ...launch, image_path: big, dry_run: true })).error.code, 'invalid_image');
    assert.equal((await main.call('floor1_mint', { ...launch, symbol: 'frog', dry_run: true })).error.code, 'invalid_metadata');
    assert.equal((await main.call('floor1_mint', { ...launch, x: 'https://evil.example/x', dry_run: true })).error.code, 'invalid_metadata');
    assert.equal(turboRequests.filter(r => r.method === 'POST').length, posts);
  });

  const exhausted = await connect('free-tier-exhausted', { FLOOR1_PRIVATE_KEY: agentKey });
  await check('An exhausted free tier refuses the launch before any upload', async () => {
    free.remaining = 1000;
    const posts = turboRequests.filter(r => r.method === 'POST').length;
    const n = await nonce();
    const result = await exhausted.call('floor1_mint', launch);
    assert.equal(result.error.code, 'free_tier_exhausted');
    assert.equal(result.error.freeBytesRemaining, 1000);
    assert.match(result.error.message, /10 MiB per wallet/);
    assert.match(result.error.message, /FLOOR1_ARWEAVE_ALLOW_PAID=1/);
    assert.equal(turboRequests.filter(r => r.method === 'POST').length, posts);
    assert.equal(await nonce(), n);
  });

  const paid = await connect('paid-uploads', { FLOOR1_PRIVATE_KEY: agentKey, FLOOR1_ARWEAVE_ALLOW_PAID: '1' });
  await check('Paid uploads proceed only when explicitly enabled', async () => {
    const result = await paid.call('floor1_mint', { ...launch, symbol: 'PAID' });
    assert.equal(result.status, 'success');
    assert.equal(result.upload.paid, true);
    assert.equal(result.launched.symbol, 'PAID');
    free.remaining = 10 * 1024 * 1024;
  });

  const refused = await connect('uploader-refuses', { FLOOR1_PRIVATE_KEY: agentKey });
  await check('An uploader payment refusal explains the free-tier caps and mints nothing', async () => {
    free.uploadStatus = 402;
    const n = await nonce();
    const result = await refused.call('floor1_mint', { ...launch, symbol: 'NOPE' });
    free.uploadStatus = 200;
    assert.equal(result.error.code, 'upload_payment_required');
    assert.match(result.error.message, /per network address/);
    assert.equal(await nonce(), n);
  });

  const prepare = await connect('prepare-only', {});
  await check('Prepare-only mode returns unsigned transactions and refuses uploads', async () => {
    const buy = await prepare.call('floor1_buy', { token: tokenA, amount_eth: '0.01' });
    assert.equal(buy.mode, 'prepare_only');
    assert.equal(buy.sent, false);
    assert.deepEqual(decodeFunctionData({ abi: tradingAbi, data: buy.transaction.data }).args, [tokenA, BigInt(buy.quote.minimumOut)]);
    const approve = await prepare.call('floor1_approve', { token: tokenA, amount: '5' });
    assert.deepEqual(decodeFunctionData({ abi: approvalAbi, data: approve.transaction.data }).args, [giwaSepolia.market, parseEther('5')]);
    const sell = await prepare.call('floor1_sell', { token: tokenA, amount: '5' });
    assert.equal(sell.transaction.value, '0');
    assert.equal((await prepare.call('floor1_mint', launch)).error.code, 'signer_required');
    const mint = await prepare.call('floor1_mint', { name: 'Floor Frog', symbol: 'FROG', metadata_uri: `ar://${'a'.repeat(43)}` });
    assert.equal(mint.transaction.to, giwaSepolia.factory);
    assert.equal((await prepare.call('floor1_balances', {})).error.code, 'address_required');
    assert.equal((await prepare.call('floor1_balances', { address: agent })).address, agent);
  });

  const wrong = await connect('wrong-chain', { FLOOR1_PRIVATE_KEY: agentKey, FLOOR1_RPC_URL: wrongRpcUrl });
  await check('An RPC on another chain is refused before reading or signing', async () => {
    assert.equal((await wrong.call('floor1_balances', {})).error.code, 'wrong_chain');
    const result = await wrong.call('floor1_buy', { token: tokenA, amount_eth: '0.01' });
    assert.equal(result.error.code, 'wrong_chain');
    assert.equal(await createPublicClient({ transport: http(wrongRpcUrl) }).getTransactionCount({ address: agent }), 0);
  });

  const limited = await connect('rate-limits', { FLOOR1_PRIVATE_KEY: agentKey, FLOOR1_MAX_TX_PER_MINUTE: '1' });
  await check('A 429 is retried once after Retry-After, then surfaced without looping', async () => {
    apiMode = 'limited-once';
    limitedOnce = false;
    let before = apiRequests.length;
    const started = Date.now();
    const quote = await limited.call('floor1_quote', { token: tokenA, side: 'buy', amount: '0.01' });
    assert(quote.amountOut);
    assert(Date.now() - started >= 1000);
    assert.equal(apiRequests.length - before, 2);
    apiMode = 'limited';
    before = apiRequests.length;
    const result = await limited.call('floor1_quote', { token: tokenA, side: 'buy', amount: '0.01' });
    assert.equal(result.error.code, 'rate_limited');
    assert.equal(result.error.retryAfterSeconds, 1);
    assert.equal(apiRequests.length - before, 2);
    apiMode = 'valid';
  });

  await check('Local buckets refuse bursts of quotes and transactions', async () => {
    await new Promise(r => setTimeout(r, 3000));
    const before = apiRequests.length;
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await limited.call('floor1_quote', { token: tokenA, side: 'buy', amount: '0.01' }));
    const refusedQuotes = results.filter(r => r.error?.code === 'local_rate_limited');
    assert(refusedQuotes.length >= 1);
    assert.equal(apiRequests.length - before, results.length - refusedQuotes.length);
    assert.equal((await limited.call('floor1_approve', { token: tokenA, amount: '1' })).status, 'success');
    const second = await limited.call('floor1_approve', { token: tokenA, amount: '1' });
    assert.equal(second.error.code, 'local_rate_limited');
  });

  await check('Market reads use public endpoints without credentials and cache repeats', async () => {
    const before = apiRequests.length;
    const first = await main.call('floor1_search_tokens', { query: 'fro', limit: 5 });
    const second = await main.call('floor1_search_tokens', { query: 'fro', limit: 5 });
    assert.deepEqual(first, second);
    assert.equal(first.items[0].symbol, 'FROG');
    const detail = await main.call('floor1_token', { token: tokenA });
    assert.equal(detail.symbol, 'FROG');
    const reads = apiRequests.slice(before);
    assert.deepEqual(reads.map(r => r.path), ['/api/v1/tokens/search', `/api/v1/tokens/${tokenA.toLowerCase()}`]);
    assert.deepEqual(reads[0].query, { limit: '5', q: 'fro' });
    assert(reads.every(r => r.cookie === null && r.method === 'GET'));
  });

  await check('The private key never appears in any transcript, error or log, and stdout carried only JSON-RPC', async () => {
    for (const c of clients) await c.close();
    await new Promise(r => setTimeout(r, 300));
    const everything = JSON.stringify(transcript) + JSON.stringify(stderrLog) + JSON.stringify(apiRequests) + JSON.stringify(turboRequests);
    for (const form of [agentKey, agentKey.slice(2), agentKey.toUpperCase(), agentKey.slice(2).toUpperCase()]) assert(!everything.includes(form));
    assert.deepEqual(transportErrors, []);
    assert(stderrLog.some(e => e.text.includes('signing as')));
  });
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const c of clients) await c.close().catch(() => {});
  for (const s of servers) await new Promise(r => s.close(r));
  for (const child of children) child.kill('SIGTERM');
  await writeFile(resolve(out, 'jsonrpc-transcript.json'), JSON.stringify(transcript, null, 2));
  await writeFile(resolve(out, 'server-stderr.json'), JSON.stringify(stderrLog, null, 2));
  await writeFile(resolve(out, 'api-requests.json'), JSON.stringify(apiRequests, null, 2));
  await writeFile(resolve(out, 'uploader-requests.json'), JSON.stringify(turboRequests.map(({ text, ...rest }) => rest), null, 2));
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ passed: !failure && checks.length > 0, checks, failure, tarball: tarball?.split('/').at(-1), sha256, coverage: 'Packed @floor1/mcp installed in a clean consumer, driven over stdio by the official MCP client against a local Giwa Sepolia fork (anvil, chain 91342) with fixture market, factory and token contracts, a fixture Floor1 API and a fixture Arweave uploader. Real signed transactions on the local chain; no public network transactions or uploads.', reproduce: 'npm ci && npx playwright install chromium && npm run e2e (requires Foundry: anvil and forge on PATH). MCP only: npm run build && node tests/mcp-e2e.mjs', artifacts: ['report.json', 'jsonrpc-transcript.json', 'server-stderr.json', 'api-requests.json', 'uploader-requests.json', 'tools.json', 'consumer-install.log', 'forge.log', tarball?.split('/').at(-1)] }, null, 2));
}
