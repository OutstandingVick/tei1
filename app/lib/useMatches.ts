"use client";

import { useEffect, useState } from "react";
import { Match, MOCK_MATCHES } from "@/lib/matches";

type MatchSource = "api-football" | "mock-fallback";

type MatchesResponse = {
  matches?: Match[];
  source?: MatchSource;
};

export function useMatches(pollMs = 120000) {
  const [matches, setMatches] = useState<Match[]>(MOCK_MATCHES);
  const [source, setSource] = useState<MatchSource>("mock-fallback");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const res = await fetch("/api/matches", { cache: "no-store" });
        if (!res.ok) throw new Error(`Match feed failed: ${res.status}`);
        const data = (await res.json()) as MatchesResponse;
        const nextMatches = data.matches ?? [];
        if (!stopped && nextMatches.length > 0) {
          setMatches(nextMatches);
          setSource("api-football");
        }
      } catch {
        if (!stopped) {
          setMatches(MOCK_MATCHES);
          setSource("mock-fallback");
        }
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return { matches, source, loading };
}
