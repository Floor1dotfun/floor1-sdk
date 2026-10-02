import { parseAbi } from "viem";

export const giwaSepolia = {
  chainId: 91342,
  market: "0x7fe4ABD28046F31FF4961932756Be3AE3a003903",
  factory: "0x4f05c336DE9bD27e0f37aedda0222FF3f87499e5",
  weth: "0x4200000000000000000000000000000000000006",
  explorerUrl: "https://sepolia-explorer.giwa.io",
} as const;

export const tradingAbi = parseAbi([
  "function buyWithEth(address token, uint256 minTokensOut) payable",
  "function sellToEth(address token, uint256 tokenAmount, uint256 minQuoteOut) returns (uint256 quoteOut)",
  "event Trade(address indexed token, address indexed trader, address indexed quote, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 realQuote, uint256 realToken, uint256 protocolFee, uint256 creatorFee)",
  "event BuyRefunded(address indexed token, address indexed buyer, uint256 refund)",
  "error Slippage()",
  "error NotActive()",
  "error InsufficientLiquidity()",
  "error Paused()",
  "error ZeroAmount()",
  "error NotWeth()",
  "error FeeOnTransfer()",
]);

export const mintingAbi = parseAbi([
  "function launch(string name, string symbol, address quote, string metadataURI, uint16 creatorTaxBps) returns (address token)",
  "event Launched(address indexed token, address indexed creator, address indexed quote, string name, string symbol, string metadataURI, uint256 supply, uint16 creatorTaxBps)",
  "error Paused()",
  "error EmptyString()",
  "error QuoteNotAllowed()",
  "error FeeTooHigh()",
  "error NotWired()",
]);

export const MAX_CREATOR_TAX_BPS = 1_000;

export const approvalAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
