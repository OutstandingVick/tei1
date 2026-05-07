"use client";

import { useEffect, useMemo, useState } from "react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { Match } from "@/lib/matches";
import { getMarketPda } from "@/lib/program";
import IDL from "@/lib/idl.json";

type LiveMarketData = {
  yesPrice: number;
  noPrice: number;
  totalVolume: number;
};

type MarketAccount = {
  yesLiquidity: { toNumber: () => number };
  noLiquidity: { toNumber: () => number };
  totalVolume: { toNumber: () => number };
};

const MARKET_REFRESH_EVENT = "tei:market-refresh";
const DEFAULT_POLL_MS = 30000;
const RPC_STAGGER_MS = 125;
const WS_SUBSCRIBE_STAGGER_MS = 350;
const MAX_WS_SUBSCRIPTIONS = Number(
  process.env.NEXT_PUBLIC_MAX_MARKET_WS_SUBSCRIPTIONS || 3
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function derivePrices(yesLiquidity: number, noLiquidity: number) {
  const total = yesLiquidity + noLiquidity;
  if (total <= 0) {
    return { yesPrice: 0.5, noPrice: 0.5 };
  }
  return {
    yesPrice: noLiquidity / total,
    noPrice: yesLiquidity / total,
  };
}

async function fetchLiveMarketData(connection: ReturnType<typeof useConnection>["connection"], matches: Match[]) {
  const program = getReadOnlyProgram(connection);
  const rows: Array<readonly [string, LiveMarketData | null]> = [];

  for (const match of matches) {
    const [marketPda] = getMarketPda(match.matchId);
    try {
      const market = await (program.account as any).market.fetch(marketPda);
      rows.push([match.matchId, marketToLiveData(market)] as const);
    } catch {
      rows.push([match.matchId, null] as const);
    }
    await sleep(RPC_STAGGER_MS);
  }

  return Object.fromEntries(rows) as Record<string, LiveMarketData | null>;
}

async function fetchOneLiveMarketData(
  connection: ReturnType<typeof useConnection>["connection"],
  matchId: string
) {
  const program = getReadOnlyProgram(connection);
  const [marketPda] = getMarketPda(matchId);
  const market = await (program.account as any).market.fetch(marketPda);
  return marketToLiveData(market);
}

function getReadOnlyProgram(connection: ReturnType<typeof useConnection>["connection"]) {
  const readOnlyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  };
  const provider = new AnchorProvider(connection, readOnlyWallet as any, {
    commitment: "confirmed",
  });
  return new Program(IDL as Idl, provider);
}

function marketToLiveData(market: MarketAccount): LiveMarketData {
  const yesLiquidity = market.yesLiquidity.toNumber() / 1_000_000;
  const noLiquidity = market.noLiquidity.toNumber() / 1_000_000;
  const { yesPrice, noPrice } = derivePrices(yesLiquidity, noLiquidity);
  return {
    yesPrice,
    noPrice,
    totalVolume: market.totalVolume.toNumber() / 1_000_000,
  };
}

function decodeMarketAccount(
  program: Program,
  data: Buffer
): LiveMarketData | null {
  try {
    const market = program.coder.accounts.decode("market", data) as MarketAccount;
    return marketToLiveData(market);
  } catch {
    return null;
  }
}

export function useLiveMatches(baseMatches: Match[], pollMs = DEFAULT_POLL_MS) {
  const { connection } = useConnection();
  const [liveDataByMatchId, setLiveDataByMatchId] = useState<Record<string, LiveMarketData | null>>({});

  useEffect(() => {
    let stopped = false;
    const subscriptions: number[] = [];
    const program = getReadOnlyProgram(connection);

    const run = async () => {
      try {
        const data = await fetchLiveMarketData(connection, baseMatches);
        if (!stopped) {
          setLiveDataByMatchId((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Keep UI resilient; fall back to static match values on fetch issues.
      }
    };

    const refreshOne = async (matchId: string) => {
      try {
        const live = await fetchOneLiveMarketData(connection, matchId);
        if (!stopped) {
          setLiveDataByMatchId((prev) => ({ ...prev, [matchId]: live }));
        }
      } catch {
        // Polling and WebSocket subscriptions remain as backup refresh paths.
      }
    };

    const handleRefreshEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ matchId?: string }>).detail;
      if (detail?.matchId) {
        refreshOne(detail.matchId);
      } else {
        run();
      }
    };

    run();
    window.addEventListener(MARKET_REFRESH_EVENT, handleRefreshEvent);
    const subscribe = async () => {
      const subscriptionMatches = baseMatches.slice(0, Math.max(MAX_WS_SUBSCRIPTIONS, 0));
      for (const match of subscriptionMatches) {
        if (stopped) return;
        await sleep(WS_SUBSCRIBE_STAGGER_MS);
        if (stopped) return;
        const [marketPda] = getMarketPda(match.matchId);
        try {
          const subId = connection.onAccountChange(
            marketPda,
            (accountInfo) => {
              const live = decodeMarketAccount(program, accountInfo.data);
              if (!live || stopped) return;
              setLiveDataByMatchId((prev) => ({
                ...prev,
                [match.matchId]: live,
              }));
            },
            "confirmed"
          );
          subscriptions.push(subId);
        } catch {
          // Polling still keeps the UI fresh if the WebSocket tier is rate-limited.
        }
      }
    };

    subscribe();

    const timer = setInterval(run, pollMs);
    return () => {
      stopped = true;
      window.removeEventListener(MARKET_REFRESH_EVENT, handleRefreshEvent);
      clearInterval(timer);
      subscriptions.forEach((subId) => {
        connection.removeAccountChangeListener(subId).catch(() => undefined);
      });
    };
  }, [connection, baseMatches, pollMs]);

  return useMemo(
    () =>
      baseMatches.map((match) => {
        const live = liveDataByMatchId[match.matchId];
        if (!live) return match;
        return {
          ...match,
          yesPrice: live.yesPrice,
          noPrice: live.noPrice,
          totalVolume: live.totalVolume,
        };
      }),
    [baseMatches, liveDataByMatchId]
  );
}

export function emitMarketRefresh(matchId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MARKET_REFRESH_EVENT, {
      detail: { matchId },
    })
  );
}

export function emitMarketRefreshBurst(matchId: string) {
  emitMarketRefresh(matchId);
  window.setTimeout(() => emitMarketRefresh(matchId), 1200);
  window.setTimeout(() => emitMarketRefresh(matchId), 3500);
}
