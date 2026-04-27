"use client";

import { useMemo } from "react";
import { MOCK_MATCHES } from "@/lib/matches";
import { MatchCard } from "@/components/MatchCard";
import { useLiveMatches } from "@/lib/liveMarkets";

export default function Home() {
  const matches = useLiveMatches(MOCK_MATCHES);
  const live = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);
  const upcoming = useMemo(() => matches.filter((m) => m.status === "upcoming"), [matches]);

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
            <span className="hero-stat-val">$86k+</span>
            <span className="hero-stat-label">Volume today</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-val">5</span>
            <span className="hero-stat-label">Live markets</span>
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
