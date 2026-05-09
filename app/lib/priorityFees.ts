import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/program";
import {
  IS_QUICKNODE_RPC,
  SOLANA_RPC_ENDPOINT,
} from "@/lib/solanaRpc";

type QuicknodePriorityFeeResponse = {
  result?: {
    recommended?: number;
    per_compute_unit?: {
      medium?: number;
      high?: number;
    };
  };
  error?: {
    message?: string;
  };
};

const DEFAULT_PRIORITY_FEE_MAX_MICROLAMPORTS = 250_000;
const PRIORITY_FEE_CACHE_MS = 30_000;
export const PRIORITY_FEES_ENABLED =
  process.env.NEXT_PUBLIC_PRIORITY_FEES_ENABLED !== "false";
let cachedPriorityFee:
  | { expiresAt: number; account: string; microLamports: number | null }
  | null = null;

function getPriorityFeeCap() {
  const parsed = Number(process.env.NEXT_PUBLIC_PRIORITY_FEE_MAX_MICROLAMPORTS);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PRIORITY_FEE_MAX_MICROLAMPORTS;
  }
  return parsed;
}

export async function estimatePriorityFeeMicroLamports(account: PublicKey = PROGRAM_ID) {
  if (!PRIORITY_FEES_ENABLED) return null;
  if (!IS_QUICKNODE_RPC) return null;
  const accountKey = account.toBase58();
  if (
    cachedPriorityFee &&
    cachedPriorityFee.expiresAt > Date.now() &&
    cachedPriorityFee.account === accountKey
  ) {
    return cachedPriorityFee.microLamports;
  }

  try {
    const res = await fetch(SOLANA_RPC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tei-priority-fee",
        method: "qn_estimatePriorityFees",
        params: {
          last_n_blocks: 100,
          account: accountKey,
          api_version: 2,
        },
      }),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as QuicknodePriorityFeeResponse;
    const recommended =
      body.result?.recommended ??
      body.result?.per_compute_unit?.high ??
      body.result?.per_compute_unit?.medium;

    if (!Number.isFinite(recommended) || !recommended || recommended <= 0) {
      return null;
    }

    const microLamports = Math.min(Math.ceil(recommended), getPriorityFeeCap());
    cachedPriorityFee = {
      expiresAt: Date.now() + PRIORITY_FEE_CACHE_MS,
      account: accountKey,
      microLamports,
    };
    return microLamports;
  } catch {
    cachedPriorityFee = {
      expiresAt: Date.now() + PRIORITY_FEE_CACHE_MS,
      account: accountKey,
      microLamports: null,
    };
    return null;
  }
}

export async function applyPriorityFee(tx: Transaction, account: PublicKey = PROGRAM_ID) {
  const microLamports = await estimatePriorityFeeMicroLamports(account);
  if (!microLamports) return null;

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports,
    })
  );
  return microLamports;
}
