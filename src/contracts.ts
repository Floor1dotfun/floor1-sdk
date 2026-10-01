import { parseAbi } from "viem";

export const giwaSepolia = {
  chainId: 91342,
  market: "0xf154266Eea85710479fa85D562D2CB86f70CE6e6",
  factory: "0x0182cdd2eE61409f809D55668C350Ca0Ab0a4355",
  weth: "0x4200000000000000000000000000000000000006",
  explorerUrl: "https://sepolia-explorer.giwa.io",
} as const;

export const tradingAbi = parseAbi([
  "function buyWithEth(address token, uint256 minTokensOut) payable",
  "function sellToEth(address token, uint256 tokenAmount, uint256 minQuoteOut) returns (uint256 quoteOut)",
  "event Trade(address indexed token, address indexed trader, address indexed quote, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 realQuote, uint256 realToken, uint256 protocolFee, uint256 creatorFee)",
  "error Slippage()",
  "error NotActive()",
  "error InsufficientLiquidity()",
  "error Paused()",
  "error ZeroAmount()",
  "error NotWeth()",
  "error FeeOnTransfer()",
]);

export const mintingAbi = parseAbi([
  "function launch(string name, string symbol, address quote, string metadataURI, uint16 creatorFeeShareBps) returns (address token)",
  "event Launched(address indexed token, address indexed creator, address indexed quote, string name, string symbol, string metadataURI, uint256 supply, uint16 creatorFeeShareBps)",
  "error Paused()",
  "error EmptyString()",
  "error QuoteNotAllowed()",
  "error FeeTooHigh()",
  "error NotWired()",
]);

export const approvalAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
