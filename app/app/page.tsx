"use client";

import { useMemo } from "react";
import { MatchCard } from "@/components/MatchCard";
import { useLiveMatches } from "@/lib/liveMarkets";
import { useMatches } from "@/lib/useMatches";

export default function Home() {
  const { matches: baseMatches, source } = useMatches();
  const matches = useLiveMatches(baseMatches);
  const live = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);
  const upcoming = useMemo(() => matches.filter((m) => m.status === "upcoming"), [matches]);
  const totalVolume = useMemo(
    () => matches.reduce((sum, match) => sum + match.totalVolume, 0),
    [matches]
  );

  return (
    <div className="tei-home">
      {/* Hero */}
      <section className="tei-hero">
        <div className="hero-eyebrow">Solana · Devnet</div>
        <h1 className="hero-title">
          Trade football<br />
          <span className="hero-accent">as it happens.</span>
        </h1>
        <p className="hero-sub">
          Peer-to-peer prediction markets for live football.
          No house edge. AMM pricing. Instant settlement.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-val">${totalVolume.toLocaleString()}</span>
            <span className="hero-stat-label">Volume today</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-val">{matches.length}</span>
            <span className="hero-stat-label">{source === "api-football" ? "Real fixtures" : "Demo markets"}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-val">&lt;1s</span>
            <span className="hero-stat-label">Settlement</span>
          </div>
        </div>
      </section>

      {/* Live matches */}
      {live.length > 0 && (
        <section className="matches-section">
          <div className="section-header">
            <h2 className="section-title">
              <span className="live-indicator" /> Live Now
            </h2>
          </div>
          <div className="matches-grid">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section className="matches-section">
        <div className="section-header">
          <h2 className="section-title">Upcoming</h2>
        </div>
        <div className="matches-grid">
          {upcoming.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
