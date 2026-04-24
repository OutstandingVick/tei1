"use client";

import { MOCK_MATCHES } from "@/lib/matches";
import { TradePanel } from "@/components/TradePanel";
import { notFound } from "next/navigation";
import Link from "next/link";
import { use } from "react";

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const match = MOCK_MATCHES.find((m) => m.id === id);
  if (!match) notFound();

  const isLive = match.status === "live";

  return (
    <div className="match-page">
      {/* Back */}
      <Link href="/" className="back-link">← All Markets</Link>

      {/* Match header */}
      <div className="match-page-header">
        <div className="match-page-league">{match.league}</div>

        <div className="match-page-teams">
          <div className="match-page-team">
            <img
              src={match.homeCrest}
              alt={match.homeTeam}
              className="match-page-crest"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <span className="match-page-team-name">{match.homeTeam}</span>
            {isLive && (
              <span className="match-page-score">{match.homeScore}</span>
            )}
          </div>

          <div className="match-page-middle">
            {isLive ? (
              <div className="match-page-live">
                <span className="live-dot" />
                <span className="match-page-minute">{match.minute}'</span>
              </div>
            ) : (
              <span className="match-page-vs">vs</span>
            )}
          </div>

          <div className="match-page-team">
            {isLive && (
              <span className="match-page-score">{match.awayScore}</span>
            )}
            <span className="match-page-team-name">{match.awayTeam}</span>
            <img
              src={match.awayCrest}
              alt={match.awayTeam}
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
          <span>{match.homeTeam} {(match.yesPrice * 100).toFixed(0)}%</span>
          <span>{match.awayTeam} {(match.noPrice * 100).toFixed(0)}%</span>
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
            <span className="match-stat-val">Match Winner</span>
          </div>
          <div className="match-stat">
            <span className="match-stat-label">Settlement</span>
            <span className="match-stat-val">On-chain</span>
          </div>
        </div>
      </div>

      {/* Trade panel */}
      <TradePanel match={match} />
    </div>
  );
}
