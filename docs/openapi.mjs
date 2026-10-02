const ref = name => ({ $ref: `#/components/schemas/${name}` });
const param = name => ({ $ref: `#/components/parameters/${name}` });
const reply = name => ({ $ref: `#/components/responses/${name}` });
const integer = (minimum, maximum, fallback) => ({ type: 'integer', minimum, maximum, ...(fallback === undefined ? {} : { default: fallback }) });
const nullableNumber = description => ({ type: ['number', 'null'], description });
const query = (name, description, schema, extra = {}) => ({ name, in: 'query', description, schema, ...extra });
const versionHeader = { 'x-floor1-version': { $ref: '#/components/headers/MarketVersion' } };
const cacheHeader = { 'Cache-Control': { $ref: '#/components/headers/CacheControl' } };
const ok = (description, schema, versioned = true) => ({
  description,
  headers: { ...cacheHeader, ...(versioned ? versionHeader : {}) },
  content: { 'application/json': { schema } },
});
const read = ({ id, summary, description, parameters = [], schema, versioned = true, errors = ['BadRequest', 'Unavailable'] }) => {
  const responses = { 200: ok(summary, schema, versioned), ...Object.fromEntries(errors.map(name => [({ BadRequest: 400, NotFound: 404, RateLimited: 429, Unavailable: 503 })[name], reply(name)])) };
  const headResponses = Object.fromEntries(Object.entries(responses).map(([status, value]) => [status, status === '200' ? { description: summary, headers: value.headers } : value]));
  return {
    get: { operationId: id, summary, description, tags: ['Market'], parameters, responses },
    head: { operationId: `${id}Head`, summary: `${summary} (headers only)`, tags: ['Market'], parameters, responses: headResponses },
  };
};

const tokenSummary = {
  type: 'object',
  required: ['id', 'name', 'symbol', 'image', 'priceUsd', 'marketCapUsd', 'priceQuote', 'marketCapQuote', 'change24h', 'holders', 'verified', 'graduated', 'createdAt'],
  properties: {
    id: { $ref: '#/components/schemas/Address' },
    name: { type: 'string' },
    symbol: { type: 'string' },
    image: { type: 'string', description: 'HTTPS gateway URL of the token image, or an empty string.' },
    priceUsd: nullableNumber('Price of one token in USD; null without an ETH/USD rate.'),
    marketCapUsd: nullableNumber('Market cap in USD; null without an ETH/USD rate.'),
    priceQuote: { type: 'number', description: 'Price of one token in ETH.' },
    marketCapQuote: { type: 'number', description: 'Market cap in ETH.' },
    change24h: { type: 'number', description: 'Price change over 24 hours, in percent.' },
    holders: { type: 'integer', minimum: 0 },
    verified: { type: 'boolean' },
    graduated: { type: 'boolean' },
    createdAt: { type: 'integer', description: 'Launch time, Unix milliseconds.' },
  },
};

const traderRef = {
  type: 'object',
  required: ['id', 'name', 'color', 'friend'],
  properties: {
    id: { $ref: '#/components/schemas/Address' },
    name: { type: 'string', description: 'Shortened address.' },
    color: { type: 'string', description: 'Display color, #rrggbb.' },
    friend: { type: 'boolean', description: 'Viewer field; always false on public reads.' },
  },
};

const page = (item, description) => ({
  type: 'object',
  description,
  required: ['items', 'nextCursor', 'indexed'],
  properties: {
    items: { type: 'array', items: ref(item) },
    nextCursor: { type: ['string', 'null'], description: 'Opaque cursor for the next page; null when there are no more rows.' },
    indexed: { type: 'boolean', description: 'false when this data is not indexed yet; items is then empty.' },
  },
});

const quoteRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['token', 'side', 'amount', 'slippageBps'],
  properties: {
    token: { $ref: '#/components/schemas/Address' },
    side: { $ref: '#/components/schemas/TradeSide' },
    amount: { type: 'string', pattern: '^[1-9][0-9]{0,77}$', description: 'Exact input in atomic units, below 2^256. Buy: wei of ETH. Sell: atomic token units.' },
    slippageBps: integer(10, 5000),
  },
};

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Floor1 Public API',
    version: '1.0.0',
    summary: 'Public market reads and exact-input quotes for Floor1 tokens on Giwa.',
    description: 'Read-only market data indexed from Giwa Sepolia (chain 91342) and exact-input bonding-curve quotes. No API key, session or cookies. Market reads answer GET and HEAD and send no CORS headers; the quote endpoint supports CORS. Unknown or repeated query parameters return 400.',
    contact: { name: 'Floor1', url: 'https://github.com/Floor1dotfun/floor1-sdk/issues' },
    license: { name: 'MIT', identifier: 'MIT' },
  },
  externalDocs: { description: 'Market API and HTTP reference', url: 'https://docs.floor1.fun/market-api/' },
  servers: [{ url: 'https://www.floor1.fun', description: 'Production' }],
  tags: [
    { name: 'Market', description: 'Public, CDN-cached reads of indexed on-chain data.', externalDocs: { url: 'https://docs.floor1.fun/market-api/' } },
    { name: 'Trading', description: 'Exact-input quotes for the bonding curve.', externalDocs: { url: 'https://docs.floor1.fun/http/' } },
  ],
  security: [],
  paths: {
    '/api/v1/tokens': read({
      id: 'listTokens', summary: 'List tokens', description: 'Paged token list. Pass nextCursor back unchanged for the next page.', schema: ref('TokenPage'),
      parameters: [
        query('sort', 'List order.', { type: 'string', enum: ['trending', 'new', 'holders', 'marketCap'], default: 'trending' }),
        query('status', 'Filter by curve status.', { type: 'string', enum: ['bonding', 'graduated'] }),
        param('Cursor'), param('PageLimit'), param('Version'),
      ],
    }),
    '/api/v1/tokens/batch': read({
      id: 'getTokenBatch', summary: 'Tokens by id', description: 'Tokens in request order. Duplicates are ignored and unknown ids are omitted.', schema: ref('TokenItems'),
      parameters: [query('ids', 'Comma-separated token addresses, 1 to 100.', { type: 'string', minLength: 1 }, { required: true, example: '0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222' }), param('Version')],
    }),
    '/api/v1/tokens/search': read({
      id: 'searchTokens', summary: 'Search tokens', description: 'Case-insensitive symbol prefix or name match, ordered by symbol. Rate limited to 30 requests per 10 seconds per caller.', schema: ref('TokenItems'), versioned: false,
      errors: ['BadRequest', 'RateLimited', 'Unavailable'],
      parameters: [query('q', 'Search text, 1 to 64 characters after trimming.', { type: 'string', minLength: 1, maxLength: 64 }, { required: true }), query('limit', 'Maximum results.', integer(1, 20, 10))],
    }),
    '/api/v1/tokens/{id}': read({
      id: 'getToken', summary: 'Token detail', description: 'One token with supply, read time and 24-hour stats.', schema: ref('TokenDetail'),
      errors: ['BadRequest', 'NotFound', 'Unavailable'], parameters: [param('TokenId'), param('Version')],
    }),
    '/api/v1/tokens/{id}/candles': read({
      id: 'getCandles', summary: 'Token candles', description: 'Columnar OHLCV bars, ascending. Use either since or before, not both.', schema: ref('CandleSeries'),
      errors: ['BadRequest', 'NotFound', 'Unavailable'],
      parameters: [
        param('TokenId'),
        query('interval', 'Bar interval.', { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h'], default: '5m' }),
        query('limit', 'Maximum bars; the newest are returned.', integer(1, 10080, 500)),
        query('since', 'Only bars starting at or after this Unix millisecond time.', { type: 'integer', minimum: 0 }),
        query('before', 'Older bars before this Unix millisecond time.', { type: 'integer', minimum: 0 }),
        param('Version'),
      ],
    }),
    '/api/v1/tokens/{id}/trades': read({
      id: 'listTrades', summary: 'Token trades', description: 'Paged trades, newest first by block and log index.', schema: ref('TradePage'),
      errors: ['BadRequest', 'NotFound', 'Unavailable'],
      parameters: [param('TokenId'), param('Cursor'), param('PageLimit'), query('side', 'Only buys or only sells.', ref('TradeSide')), query('minUsd', 'Minimum trade size in USD.', { type: 'number', minimum: 0 }), param('Version')],
    }),
    '/api/v1/tokens/{id}/holders': read({
      id: 'listHolders', summary: 'Token holders', description: 'Paged holders, largest balance first.', schema: ref('HolderPage'),
      errors: ['BadRequest', 'NotFound', 'Unavailable'], parameters: [param('TokenId'), param('Cursor'), param('PageLimit'), param('Version')],
    }),
    '/api/v1/versions': read({
      id: 'getVersions', summary: 'Market versions', description: 'Change counters. list moves with any list change; each token entry moves when that token changes. Unknown tokens report 0.', schema: ref('MarketVersions'), versioned: false,
      parameters: [query('tokens', 'Comma-separated token addresses, at most 100.', { type: 'string' })],
    }),
    '/api/v1/trading/quotes': {
      post: {
        operationId: 'createQuote', summary: 'Exact-input quote', tags: ['Trading'],
        description: 'Computes an exact-input buy or sell quote from indexed curve state. Sends no transaction. Unknown body fields are rejected; the body is limited to 2048 bytes. Rate limited to 40 requests per 10 seconds per caller. CORS is enabled with an OPTIONS preflight, and responses use Cache-Control: no-store.',
        requestBody: { required: true, content: { 'application/json': { schema: ref('QuoteRequest'), example: { token: '0x1111111111111111111111111111111111111111', side: 'buy', amount: '10000000000000000', slippageBps: 100 } } } },
        responses: { 200: { description: 'Quote', content: { 'application/json': { schema: ref('QuoteResponse') } } }, 400: reply('BadRequest'), 404: reply('NotFound'), 422: reply('Unprocessable'), 429: reply('RateLimited'), 503: reply('Unavailable') },
      },
    },
  },
  components: {
    parameters: {
      TokenId: { name: 'id', in: 'path', required: true, description: 'Token contract address.', schema: ref('Address') },
      Cursor: { name: 'cursor', in: 'query', description: 'nextCursor from the previous page of the same endpoint and sort.', schema: { type: 'string', maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' } },
      PageLimit: { name: 'limit', in: 'query', description: 'Page size.', schema: integer(1, 100, 50) },
      Version: { name: 'v', in: 'query', description: 'Version from /api/v1/versions or x-floor1-version. A current version lets the CDN share one cached answer.', schema: { type: 'integer', minimum: 0, maximum: 9007199254740991 } },
    },
    headers: {
      MarketVersion: { description: 'Version of the list or token the response describes.', schema: { type: 'integer' } },
      CacheControl: { description: 'Shared-cache lifetime chosen by the server.', schema: { type: 'string' } },
      RetryAfter: { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
    },
    responses: {
      BadRequest: { description: 'Invalid, unknown or repeated parameter, bad cursor, or invalid body.', content: { 'application/json': { schema: ref('Error') } } },
      NotFound: { description: 'Token is unknown.', content: { 'application/json': { schema: ref('Error') } } },
      Unprocessable: { description: 'Inactive curve, unsupported asset, amount too small, or insufficient liquidity.', content: { 'application/json': { schema: ref('Error') } } },
      RateLimited: { description: 'Rate limit reached.', headers: { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } }, content: { 'application/json': { schema: ref('Error') } } },
      Unavailable: { description: 'Data or quote service temporarily unavailable.', headers: { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } }, content: { 'application/json': { schema: ref('Error') } } },
    },
    schemas: {
      Address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', example: '0x1111111111111111111111111111111111111111' },
      TradeSide: { type: 'string', enum: ['buy', 'sell'] },
      TokenSummary: tokenSummary,
      TokenStats: {
        type: 'object',
        required: ['volume24hUsd', 'volume24hQuote', 'change', 'buys', 'sells', 'buyVolumeUsd', 'sellVolumeUsd', 'buyVolumeQuote', 'sellVolumeQuote'],
        properties: {
          volume24hUsd: nullableNumber('24-hour volume in USD.'),
          volume24hQuote: { type: 'number', description: '24-hour volume in ETH.' },
          change: { type: 'object', required: ['m5', 'h1', 'h4', 'd1'], description: 'Price change in percent over 5 minutes, 1, 4 and 24 hours.', properties: { m5: { type: 'number' }, h1: { type: 'number' }, h4: { type: 'number' }, d1: { type: 'number' } } },
          buys: { type: 'integer', minimum: 0 },
          sells: { type: 'integer', minimum: 0 },
          buyVolumeUsd: nullableNumber('24-hour buy volume in USD.'),
          sellVolumeUsd: nullableNumber('24-hour sell volume in USD.'),
          buyVolumeQuote: { type: 'number' },
          sellVolumeQuote: { type: 'number' },
        },
      },
      TokenDetail: {
        allOf: [ref('TokenSummary'), {
          type: 'object',
          required: ['supply', 'asOf', 'stats'],
          properties: { supply: { type: 'number', description: 'Total supply in whole tokens.' }, asOf: { type: 'integer', description: 'Read time, Unix milliseconds.' }, stats: ref('TokenStats') },
        }],
      },
      TokenPage: page('TokenSummary', 'One page of tokens.'),
      TokenItems: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: ref('TokenSummary') } } },
      CandleSeries: {
        type: 'object',
        required: ['interval', 't', 'o', 'h', 'l', 'c', 'v'],
        description: 'Columnar bars, ascending. Prices are USD per token (8 significant digits) and volume is USD, unless unit is quote, in which case every value is in ETH.',
        properties: {
          interval: { type: 'string', enum: ['1m', '5m', '15m', '1h', '4h'] },
          t: { type: 'array', items: { type: 'integer' }, description: 'Bar start, Unix milliseconds.' },
          o: { type: 'array', items: { type: 'number' } },
          h: { type: 'array', items: { type: 'number' } },
          l: { type: 'array', items: { type: 'number' } },
          c: { type: 'array', items: { type: 'number' } },
          v: { type: 'array', items: { type: 'number' } },
          unit: { type: 'string', const: 'quote' },
        },
      },
      TraderRef: traderRef,
      Trade: {
        type: 'object',
        required: ['id', 'trader', 'side', 'usd', 'quote', 'price', 'priceQuote', 'time', 'mine'],
        properties: {
          id: { type: 'string', description: 'Transaction hash and log index, joined by a colon.' },
          trader: ref('TraderRef'),
          side: ref('TradeSide'),
          usd: nullableNumber('Trade size in USD.'),
          quote: { type: 'number', description: 'Trade size in ETH.' },
          price: nullableNumber('Curve price after the trade, USD per token.'),
          priceQuote: { type: 'number', description: 'Curve price after the trade, ETH per token.' },
          time: { type: 'integer', description: 'Block time, Unix milliseconds.' },
          mine: { type: 'boolean', description: 'Viewer field; always false on public reads.' },
        },
      },
      TradePage: page('Trade', 'One page of trades.'),
      Holder: {
        allOf: [ref('TraderRef'), {
          type: 'object',
          required: ['hold', 'quantity', 'entry', 'entryQuote', 'thesis', 'likes'],
          properties: {
            hold: { type: 'string', description: 'Time since the position opened, such as <1m, 45m, 6h or 3d.' },
            quantity: { type: 'number', description: 'Balance in whole tokens.' },
            entry: nullableNumber('Average entry price in USD per token.'),
            entryQuote: { type: 'number', description: 'Average entry price in ETH per token.' },
            thesis: { type: 'string' },
            likes: { type: 'integer', minimum: 0 },
          },
        }],
      },
      HolderPage: page('Holder', 'One page of holders.'),
      MarketVersions: {
        type: 'object',
        required: ['list', 'tokens'],
        properties: { list: { type: 'integer', minimum: 0 }, tokens: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } } },
      },
      QuoteRequest: quoteRequest,
      QuoteResponse: {
        type: 'object',
        required: ['id', 'chainId', 'token', 'side', 'mode', 'amount', 'slippageBps', 'amountOut', 'minimumOut', 'fee', 'protocolFee', 'creatorFee', 'issuedAt', 'expiresAt', 'snapshot'],
        properties: {
          id: { type: 'string', description: 'Quote identifier.' },
          chainId: { type: 'integer', const: 91342 },
          token: ref('Address'),
          side: ref('TradeSide'),
          mode: { type: 'string', const: 'exact_in' },
          amount: { type: 'string', description: 'Requested input in atomic units.' },
          slippageBps: integer(10, 5000),
          amountOut: { type: 'string', description: 'Estimated output in atomic units. Buy: token units. Sell: wei.' },
          minimumOut: { type: 'string', description: 'amountOut × (10000 − slippageBps) / 10000, rounded down.' },
          fee: { type: 'string', description: 'Total fee in wei.' },
          protocolFee: { type: 'string', description: 'Protocol fee in wei.' },
          creatorFee: { type: 'string', description: 'Creator fee in wei.' },
          issuedAt: { type: 'integer', description: 'Unix milliseconds.' },
          expiresAt: { type: 'integer', description: 'Unix milliseconds, 30 seconds after issuedAt.' },
          snapshot: {
            type: 'object',
            required: ['source', 'blockNumber', 'indexedAt', 'marketVersion'],
            properties: { source: { type: 'string', const: 'database' }, blockNumber: { type: 'integer' }, indexedAt: { type: 'integer', description: 'Unix milliseconds.' }, marketVersion: { type: 'integer' } },
          },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', enum: ['bad_request', 'not_found', 'unprocessable', 'rate_limited', 'unavailable', 'internal'] },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
};
