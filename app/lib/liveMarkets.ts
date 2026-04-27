"use client";

import { useEffect, useMemo, useState } from "react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { Match } from "@/lib/matches";
import { getMarketPda } from "@/lib/program";
import IDL from "@/lib/idl.json";

type LiveMarketData = {
  yesPrice: number;
  noPrice: number;
  totalVolume: number;
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
  const readOnlyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  };
  const provider = new AnchorProvider(connection, readOnlyWallet as any, {
    commitment: "confirmed",
  });
  const program = new Program(IDL as Idl, provider);

  const rows = await Promise.all(
    matches.map(async (match) => {
      const [marketPda] = getMarketPda(match.matchId);
      try {
        const market: any = await (program.account as any).market.fetch(marketPda);
        const yesLiquidity = market.yesLiquidity.toNumber() / 1_000_000;
        const noLiquidity = market.noLiquidity.toNumber() / 1_000_000;
        const { yesPrice, noPrice } = derivePrices(yesLiquidity, noLiquidity);
        return [
          match.matchId,
          {
            yesPrice,
            noPrice,
            totalVolume: market.totalVolume.toNumber() / 1_000_000,
          } satisfies LiveMarketData,
        ] as const;
      } catch {
        return [match.matchId, null] as const;
      }
    })
  );

  return Object.fromEntries(rows) as Record<string, LiveMarketData | null>;
}

function decodeLiveMarketData(program: Program, accountInfo: AccountInfo<Buffer>): LiveMarketData | null {
  try {
    const market: any = (program.coder.accounts as any).decode("market", accountInfo.data);
    const yesLiquidity = market.yesLiquidity.toNumber() / 1_000_000;
    const noLiquidity = market.noLiquidity.toNumber() / 1_000_000;
    const { yesPrice, noPrice } = derivePrices(yesLiquidity, noLiquidity);
    return {
      yesPrice,
      noPrice,
      totalVolume: market.totalVolume.toNumber() / 1_000_000,
    };
  } catch {
    return null;
  }
}

function createReadOnlyProgram(connection: ReturnType<typeof useConnection>["connection"]) {
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

export function useLiveMatches(baseMatches: Match[], pollMs = 15000) {
  const { connection } = useConnection();
  const [liveDataByMatchId, setLiveDataByMatchId] = useState<Record<string, LiveMarketData | null>>({});

  useEffect(() => {
    let stopped = false;
    const program = createReadOnlyProgram(connection);
    const subIds: number[] = [];
    const pdaMap = baseMatches.map((match) => ({
      matchId: match.matchId,
      marketPda: getMarketPda(match.matchId)[0],
    }));

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

    for (const { matchId, marketPda } of pdaMap) {
      const id = connection.onAccountChange(
        marketPda,
        (accountInfo) => {
          if (stopped) return;
          const live = decodeLiveMarketData(program, accountInfo);
          if (!live) return;
          setLiveDataByMatchId((prev) => ({
            ...prev,
            [matchId]: live,
          }));
        },
        "confirmed"
      );
      subIds.push(id);
    }

    run();
    const timer = setInterval(run, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
      for (const id of subIds) {
        void connection.removeAccountChangeListener(id);
      }
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
