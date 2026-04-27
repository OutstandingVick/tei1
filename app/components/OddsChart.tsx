"use client";

import { useEffect, useMemo, useState } from "react";

type PricePoint = {
  t: number;
  yesPrice: number;
  noPrice: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function buildLinePath(values: number[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return "M 0 44";

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 44 - v * 38;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(values: number[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return "M 0 44 L 100 44 L 100 44 L 0 44 Z";

  const line = buildLinePath(values);
  return `${line} L 100 44 L 0 44 Z`;
}

function windowMs(range: TimeRange) {
  if (range === "5m") return 5 * 60 * 1000;
  if (range === "1h") return 60 * 60 * 1000;
  if (range === "6h") return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

type TimeRange = "5m" | "1h" | "6h" | "1d";
type OddsSide = "yes" | "no";

function normalizePoints(raw: unknown): PricePoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      t: Number((item as PricePoint).t),
      yesPrice: Number((item as PricePoint).yesPrice),
      noPrice: Number((item as PricePoint).noPrice),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.yesPrice) && Number.isFinite(p.noPrice))
    .map((p) => ({
      t: p.t,
      yesPrice: clamp(p.yesPrice, 0.01, 0.99),
      noPrice: clamp(p.noPrice, 0.01, 0.99),
    }));
}

function appendPoint(prev: PricePoint[], point: PricePoint) {
  const last = prev[prev.length - 1];
  if (last && last.yesPrice === point.yesPrice && point.t - last.t < 10_000) {
    return prev;
  }
  return [...prev, point].slice(-1000);
}

function pruneTo1d(points: PricePoint[]) {
  const threshold = Date.now() - 24 * 60 * 60 * 1000;
  return points.filter((p) => p.t >= threshold);
}

export function OddsChart({
  matchId,
  yesPrice,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  yesPrice: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [range, setRange] = useState<TimeRange>("1h");
  const [side, setSide] = useState<OddsSide>("yes");

  const safePrice = clamp(yesPrice, 0.01, 0.99);
  const noPrice = clamp(1 - safePrice, 0.01, 0.99);
  const storageKey = `tei:odds-history:${matchId}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = normalizePoints(JSON.parse(raw));
      setPoints(pruneTo1d(parsed));
    } catch {
      // no-op, start fresh
    }
  }, [storageKey]);

  useEffect(() => {
    const now = Date.now();
    setPoints((prev) =>
      pruneTo1d(
        appendPoint(prev, {
          t: now,
          yesPrice: safePrice,
          noPrice,
        })
      )
    );
  }, [safePrice, noPrice]);

  useEffect(() => {
    if (points.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(points));
    } catch {
      // ignore quota/storage errors
    }
  }, [points, storageKey]);

  const visiblePoints = useMemo(() => {
    const minTs = Date.now() - windowMs(range);
    const filtered = points.filter((p) => p.t >= minTs);
    if (filtered.length >= 2) return filtered;
    return points.slice(-2);
  }, [points, range]);

  const values = useMemo(
    () => visiblePoints.map((p) => (side === "yes" ? p.yesPrice : p.noPrice)),
    [visiblePoints, side]
  );

  const linePath = useMemo(() => buildLinePath(values), [values]);
  const areaPath = useMemo(() => buildAreaPath(values), [values]);
  const yesPct = Math.round(safePrice * 100);
  const noPct = 100 - yesPct;

  return (
    <div className="odds-chart-card">
      <div className="odds-chart-head">
        <div className="odds-chart-title">Live Odds</div>
        <div className="odds-chart-prices">
          <span className="odds-chart-price yes">{homeTeam} {yesPct}%</span>
          <span className="odds-chart-price no">{awayTeam} {noPct}%</span>
        </div>
      </div>

      <div className="odds-chart-controls">
        <div className="odds-chart-ranges">
          {(["5m", "1h", "6h", "1d"] as TimeRange[]).map((r) => (
            <button
              key={r}
              className={`odds-chip ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="odds-chart-sides">
          <button
            className={`odds-chip odds-chip-yes ${side === "yes" ? "active" : ""}`}
            onClick={() => setSide("yes")}
          >
            YES
          </button>
          <button
            className={`odds-chip odds-chip-no ${side === "no" ? "active" : ""}`}
            onClick={() => setSide("no")}
          >
            NO
          </button>
        </div>
      </div>

      <div className="odds-chart-wrap">
        <svg className="odds-chart-svg" viewBox="0 0 100 44" preserveAspectRatio="none">
          <defs>
            <linearGradient id="teiOddsArea" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={side === "yes" ? "rgba(0, 232, 122, 0.45)" : "rgba(255, 77, 109, 0.45)"}
              />
              <stop
                offset="100%"
                stopColor={side === "yes" ? "rgba(0, 232, 122, 0.02)" : "rgba(255, 77, 109, 0.02)"}
              />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#teiOddsArea)" />
          <path d={linePath} className={`odds-chart-line ${side === "yes" ? "yes" : "no"}`} />
        </svg>
      </div>

      <div className="odds-chart-axis">
        <span>{range}</span>
        <span>Live feed</span>
      </div>
    </div>
  );
}
