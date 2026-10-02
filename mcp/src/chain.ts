import { decodeFloor1Revert, giwaSepolia, type PreparedTransaction } from "@floor1/sdk";
import { BaseError, createPublicClient, createWalletClient, defineChain, erc20Abi, http, type Address, type Hash, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { McpError } from "./errors.ts";

export const RECEIPT_TIMEOUT_MS = 90_000;

export function revertName(error: unknown) {
  if (!(error instanceof BaseError)) return null;
  const found = error.walk(cause => typeof (cause as { data?: unknown }).data === "string" && /^0x[0-9a-fA-F]{8,}$/.test((cause as { data: string }).data)) as { data?: Hex } | null;
  return found?.data ? decodeFloor1Revert(found.data) : null;
}

export function createChain(rpcUrl: string | null, privateKey: Hex | null) {
  const account: PrivateKeyAccount | null = privateKey ? privateKeyToAccount(privateKey) : null;
  let checked: Promise<void> | null = null;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;

  function clients() {
    if (!rpcUrl) throw new McpError("rpc_required", "Set FLOOR1_RPC_URL to a Giwa Sepolia RPC endpoint to read balances or send transactions.");
    if (!publicClient) {
      const chain = defineChain({ id: giwaSepolia.chainId, name: "Giwa Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, blockExplorers: { default: { name: "Giwa Explorer", url: giwaSepolia.explorerUrl } } });
      publicClient = createPublicClient({ chain, pollingInterval: 1_000, transport: http(rpcUrl, { retryCount: 1, timeout: 20_000 }) }) as PublicClient;
      if (account) walletClient = createWalletClient({ account, chain, transport: http(rpcUrl, { retryCount: 0, timeout: 20_000 }) });
    }
    return { publicClient, walletClient };
  }

  async function ready() {
    const { publicClient } = clients();
    checked ??= publicClient.getChainId().then(id => {
      if (id !== giwaSepolia.chainId) throw new McpError("wrong_chain", `FLOOR1_RPC_URL serves chain ${id}. Use a Giwa Sepolia (${giwaSepolia.chainId}) endpoint.`);
    }, () => { throw new McpError("rpc_unavailable", "The configured RPC endpoint did not answer."); });
    try { await checked; }
    catch (error) { checked = null; throw error; }
    return publicClient;
  }

  async function failure(receipt: TransactionReceipt, client: PublicClient) {
    const tx = await client.getTransaction({ hash: receipt.transactionHash });
    try {
      await client.call({ account: tx.from, to: tx.to ?? undefined, data: tx.input, value: tx.value, blockNumber: receipt.blockNumber });
      return null;
    } catch (error) {
      return revertName(error);
    }
  }

  return {
    address: account?.address ?? null,
    ready,
    async balances(owner: Address, token?: Address) {
      const client = await ready();
      const native = await client.getBalance({ address: owner });
      if (!token) return { native, token: null, allowance: null };
      const [balance, allowance] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, giwaSepolia.market] }),
      ]);
      return { native, token: balance, allowance };
    },
    async send(tx: PreparedTransaction) {
      const client = await ready();
      const { walletClient } = clients();
      if (!walletClient || !account) throw new McpError("signer_required", "Set FLOOR1_PRIVATE_KEY to send transactions, or use dry_run to get the unsigned transaction.");
      let hash: Hash;
      try { hash = await walletClient.sendTransaction({ account, chain: walletClient.chain, to: tx.to, data: tx.data, value: tx.value }); }
      catch (error) {
        const reason = revertName(error);
        if (reason) throw new McpError("reverted", `The transaction would revert with ${reason}. Nothing was sent.`, { revert: reason });
        throw new McpError("send_failed", error instanceof BaseError ? error.shortMessage : "The transaction could not be sent.");
      }
      let receipt: TransactionReceipt;
      try { receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }); }
      catch { throw new McpError("receipt_timeout", `Sent ${hash}, but no receipt arrived within ${RECEIPT_TIMEOUT_MS / 1000} s. Check it with floor1_tx_status.`, { hash }); }
      return { hash, receipt, revert: receipt.status === "reverted" ? await failure(receipt, client) : null };
    },
    async status(hash: Hash) {
      const client = await ready();
      const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
      if (!receipt) {
        const pending = await client.getTransaction({ hash }).catch(() => null);
        return { state: pending ? "pending" as const : "unknown" as const, receipt: null, revert: null };
      }
      return { state: receipt.status === "success" ? "success" as const : "reverted" as const, receipt, revert: receipt.status === "reverted" ? await failure(receipt, client) : null };
    },
  };
}

export type Chain = ReturnType<typeof createChain>;
