"use client";

import Link from "next/link";
import { Match } from "@/lib/matches";

function formatKickoff(iso: string, status: Match["status"], minute?: number) {
  if (status === "live") return `LIVE ${minute}'`;
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatVolume(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

export function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === "live";

  return (
    <Link href={`/match/${match.id}`} className="match-card">
      {/* League */}
      <div className="match-card-league">
        <span className="league-name">{match.league}</span>
        <span className={`match-status ${isLive ? "live" : ""}`}>
          {isLive ? (
            <>
              <span className="live-dot" />
              {match.minute}'
            </>
          ) : (
            formatKickoff(match.kickoff, match.status)
          )}
        </span>
      </div>

      {/* Teams */}
      <div className="match-card-teams">
        <div className="team home">
          <img
            src={match.homeCrest}
            alt={match.homeTeam}
            className="team-crest"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <span className="team-name">{match.homeTeam}</span>
          {isLive && (
            <span className="team-score">{match.homeScore}</span>
          )}
        </div>

        <div className="match-vs">
          {isLive ? "—" : "vs"}
        </div>

        <div className="team away">
          {isLive && (
            <span className="team-score">{match.awayScore}</span>
          )}
          <span className="team-name">{match.awayTeam}</span>
          <img
            src={match.awayCrest}
            alt={match.awayTeam}
            className="team-crest"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>
      </div>

      {/* Odds bar */}
      <div className="match-card-odds">
        <div className="odds-bar-wrap">
          <div
            className="odds-bar-yes"
            style={{ width: `${match.yesPrice * 100}%` }}
          />
        </div>
        <div className="odds-labels">
          <span className="odds-yes">
            Home {(match.yesPrice * 100).toFixed(0)}%
          </span>
          <span className="odds-no">
            Away {(match.noPrice * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="match-card-footer">
        <span className="match-volume">
          Vol {formatVolume(match.totalVolume)}
        </span>
        <span className="match-cta">Trade →</span>
      </div>
    </Link>
  );
}
