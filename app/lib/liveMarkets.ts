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
  const rows = await Promise.all(
    matches.map(async (match) => {
      const [marketPda] = getMarketPda(match.matchId);
      try {
        const market = await (program.account as any).market.fetch(marketPda);
        return [match.matchId, marketToLiveData(market)] as const;
      } catch {
        return [match.matchId, null] as const;
      }
    })
  );

  return Object.fromEntries(rows) as Record<string, LiveMarketData | null>;
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

export function useLiveMatches(baseMatches: Match[], pollMs = 15000) {
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

    run();
    for (const match of baseMatches) {
      const [marketPda] = getMarketPda(match.matchId);
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
    }

    const timer = setInterval(run, pollMs);
    return () => {
      stopped = true;
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
