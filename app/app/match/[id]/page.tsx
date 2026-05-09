"use client";

import { TradePanel } from "@/components/TradePanel";
import { OddsChart } from "@/components/OddsChart";
import { useLiveMatches } from "@/lib/liveMarkets";
import { getFixtureMarketVariants } from "@/lib/matches";
import { useMatches } from "@/lib/useMatches";
import { notFound } from "next/navigation";
import Link from "next/link";
import { use, useMemo, useState } from "react";

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { matches: baseMatches, loading } = useMatches();
  const fixture = baseMatches.find((m) => m.id === id || m.fixtureId === id);
  const baseMarketVariants = useMemo(
    () => (fixture ? getFixtureMarketVariants(fixture) : []),
    [fixture]
  );
  const marketVariants = useLiveMatches(baseMarketVariants);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const match = marketVariants.find((m) => m.matchId === selectedMarketId) ?? marketVariants[0];

  if (!fixture && loading) {
    return (
      <div className="match-page">
        <Link href="/" className="back-link">← All Markets</Link>
        <div className="match-page-header">
          <div className="match-page-league">Loading live fixture...</div>
        </div>
      </div>
    );
  }
  if (!fixture || !match) notFound();

  const isLive = fixture.status === "live";

  return (
    <div className="match-page">
      {/* Back */}
      <Link href="/" className="back-link">← All Markets</Link>

      <div className="match-page-left">
        <div className="market-tabs">
          {marketVariants.map((variant) => (
            <button
              key={variant.matchId}
              className={`market-tab ${variant.matchId === match.matchId ? "active" : ""}`}
              onClick={() => setSelectedMarketId(variant.matchId)}
            >
              <span>{variant.marketLabel}</span>
              <strong>
                {(variant.yesPrice * 100).toFixed(1)} / {(variant.noPrice * 100).toFixed(1)}
              </strong>
            </button>
          ))}
        </div>

        <OddsChart
          matchId={match.matchId}
          yesPrice={match.yesPrice}
          homeTeam={match.yesLabel ?? match.homeTeam}
          awayTeam={match.noLabel ?? match.awayTeam}
        />

        {/* Match header */}
        <div className="match-page-header">
          <div className="match-page-league">{fixture.league}</div>

          <div className="match-page-teams">
            <div className="match-page-team">
              <img
                src={fixture.homeCrest}
                alt={fixture.homeTeam}
                className="match-page-crest"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <span className="match-page-team-name">{fixture.homeTeam}</span>
              {isLive && (
                <span className="match-page-score">{fixture.homeScore}</span>
              )}
            </div>

            <div className="match-page-middle">
              {isLive ? (
                <div className="match-page-live">
                  <span className="live-dot" />
                  <span className="match-page-minute">{fixture.minute}'</span>
                </div>
              ) : (
                <span className="match-page-vs">vs</span>
              )}
            </div>

            <div className="match-page-team">
              {isLive && (
                <span className="match-page-score">{fixture.awayScore}</span>
              )}
              <span className="match-page-team-name">{fixture.awayTeam}</span>
              <img
                src={fixture.awayCrest}
                alt={fixture.awayTeam}
                className="match-page-crest"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          </div>

          {/* Probability bar */}
          <div className="match-page-prob-bar">
            <div
              className="prob-fill-yes"
              style={{ width: `${match.yesPrice * 100}%` }}
            />
          </div>
          <div className="match-page-prob-labels">
            <span>{match.yesLabel ?? fixture.homeTeam} {(match.yesPrice * 100).toFixed(1)}%</span>
            <span>{match.noLabel ?? fixture.awayTeam} {(match.noPrice * 100).toFixed(1)}%</span>
          </div>

          {/* Market stats */}
          <div className="match-page-stats">
            <div className="match-stat">
              <span className="match-stat-label">Volume</span>
              <span className="match-stat-val">
                ${match.totalVolume.toLocaleString()}
              </span>
            </div>
            <div className="match-stat">
              <span className="match-stat-label">Market</span>
              <span className="match-stat-val">{match.marketLabel ?? "Match Winner"}</span>
            </div>
            <div className="match-stat">
              <span className="match-stat-label">Settlement</span>
              <span className="match-stat-val">On-chain</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trade panel */}
      <TradePanel match={match} />
    </div>
  );
}
