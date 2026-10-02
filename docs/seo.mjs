export const origin = 'https://docs.floor1.fun';
export const siteName = 'Floor1 Docs';
export const updated = '2026-10-02';
export const indexNowKey = 'ed9a78df6525b9ec01cdba9d330318d0';
export const socialImage = { url: `${origin}/social.jpg`, width: 1200, height: 630, alt: 'Floor1 — memecoin launchpad on Giwa chain' };
export const organization = { '@type': 'Organization', '@id': 'https://www.floor1.fun/#organization', name: 'Floor1', url: 'https://www.floor1.fun/' };

export const search = {
  '': {
    title: 'Floor1 SDK: Trade & Launch Giwa Memecoins in TypeScript',
    description: 'Floor1 SDK docs: get bonding-curve quotes, buy and sell memecoins with ETH, and launch tokens on Giwa from TypeScript, with every transaction signed by your wallet.',
  },
  quickstart: {
    title: 'Quickstart: First Giwa Memecoin Trade with the Floor1 SDK',
    description: 'Install @floor1/sdk and viem, connect a wallet on Giwa Sepolia (chain ID 91342), request a quote and send your first memecoin buy in a few lines of TypeScript.',
  },
  quotes: {
    title: 'Bonding Curve Quotes & Slippage on Giwa | Floor1 SDK',
    description: 'Request exact-input buy and sell quotes for Floor1 tokens on Giwa, with minimum output, fees, expiry and the indexed block each quote was calculated from.',
  },
  buy: {
    title: 'Buy Giwa Memecoins with ETH in TypeScript | Floor1 SDK',
    description: 'Buy Floor1 memecoins on Giwa with native ETH: one SDK call fetches a fresh quote and builds the bonding-market transaction locally for your wallet to sign.',
  },
  sell: {
    title: 'Sell Giwa Memecoins for ETH in TypeScript | Floor1 SDK',
    description: 'Sell Floor1 tokens back to ETH on Giwa: approve an exact amount, fetch a fresh quote and send a sell protected by a minimum output. No unlimited approvals.',
  },
  mint: {
    title: 'Launch a Memecoin on Giwa with TypeScript | Floor1 SDK',
    description: 'Create a new Floor1 memecoin on Giwa from TypeScript: publish Arweave metadata, send the launch transaction from your wallet and read the new token address.',
  },
  metadata: {
    title: 'Memecoin Metadata Format on Arweave | Floor1 SDK',
    description: 'The JSON document and image a Floor1 token launch references on Arweave: name, symbol, description, image and website, X and Telegram links.',
  },
  sdk: {
    title: '@floor1/sdk TypeScript API Reference | Floor1 SDK',
    description: 'Complete reference for @floor1/sdk: createFloor1Client, quote, buy, sell and mint, the prepare transaction builders, ABIs, receipt parsing and error types.',
  },
  http: {
    title: 'Floor1 Quote API: Public HTTP Reference for Giwa Tokens',
    description: 'POST /api/v1/trading/quotes on www.floor1.fun returns exact-input buy and sell quotes for Floor1 tokens on Giwa. No API key, CORS enabled, read only.',
  },
  'market-api': {
    title: 'Floor1 Market API: Public Giwa Token Data over HTTP',
    description: 'Read Floor1 token lists, prices, candles, trades and holders on Giwa from public, CDN-cached HTTP endpoints. No API key. OpenAPI 3.1 description included.',
  },
  errors: {
    title: 'Errors, Reverts & Retries | Floor1 SDK for Giwa',
    description: 'Every Floor1 SDK and API error code, decoded contract reverts and the safe recovery for each, from wrong-chain wallets to expired quotes and rate limits.',
  },
  network: {
    title: 'Giwa Sepolia Network & Floor1 Contract Addresses | Floor1 SDK',
    description: 'Giwa Sepolia chain ID 91342, the explorer, and the Floor1 bonding market and token factory contract addresses supported by @floor1/sdk v0.1.0.',
  },
};
