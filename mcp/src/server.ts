import { TurboFactory } from "@ardrive/turbo-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApi } from "./api.ts";
import { createUploader } from "./arweave.ts";
import { createChain } from "./chain.ts";
import { readConfig } from "./config.ts";
import { McpError } from "./errors.ts";
import { registerTools } from "./tools.ts";

declare const FLOOR1_MCP_VERSION: string;

function redactor(secret: string | null) {
  if (!secret) return (text: string) => text;
  const forms = [secret, secret.slice(2), secret.toLowerCase(), secret.slice(2).toLowerCase()];
  return (text: string) => forms.reduce((out, form) => out.split(form).join("[redacted]"), text);
}

function stderrConsole(redact: (text: string) => string) {
  const write = (...args: unknown[]) => { process.stderr.write(redact(args.map(arg => typeof arg === "string" ? arg : arg instanceof Error ? arg.message : JSON.stringify(arg)).join(" ")) + "\n"); };
  console.log = write;
  console.info = write;
  console.debug = write;
  console.warn = write;
  console.error = write;
}

async function main() {
  let config;
  try { config = readConfig(); }
  catch (error) {
    process.stderr.write(`floor1-mcp: ${error instanceof McpError ? error.message : "invalid configuration"}\n`);
    process.exit(1);
  }
  const redact = redactor(config.privateKey);
  stderrConsole(redact);
  TurboFactory.setLogLevel("none");
  const chain = createChain(config.rpcUrl, config.privateKey);
  const api = createApi(config.apiUrl);
  const uploader = createUploader(config.privateKey, chain.address, { allowPaid: config.allowPaidUploads, uploadUrl: config.turboUploadUrl, paymentUrl: config.turboPaymentUrl });
  const server = new McpServer({ name: "floor1", version: FLOOR1_MCP_VERSION }, { instructions: "Floor1 tools trade and launch memecoins on Giwa Sepolia (testnet, chain 91342). Amounts are decimal strings in whole units. Quote before trading, approve an exact amount before selling, and treat buy, sell, approve and mint as real transactions from the configured wallet." });
  registerTools(server, { config, api, chain, uploader, redact });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`floor1-mcp ${FLOOR1_MCP_VERSION} ready (${chain.address ? `signing as ${chain.address}` : "prepare-only, no key configured"})\n`);
}

main().catch(error => {
  process.stderr.write(`floor1-mcp failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exit(1);
});
