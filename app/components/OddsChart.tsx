"use client";

import { useEffect, useMemo, useState } from "react";

type PricePoint = {
  t: number;
  yesPrice: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function buildLinePath(points: PricePoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return "M 0 44";

  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 44 - p.yesPrice * 38;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points: PricePoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return "M 0 44 L 100 44 L 100 44 L 0 44 Z";

  const line = buildLinePath(points);
  return `${line} L 100 44 L 0 44 Z`;
}

export function OddsChart({
  yesPrice,
  homeTeam,
  awayTeam,
}: {
  yesPrice: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const safePrice = clamp(yesPrice, 0.01, 0.99);

  useEffect(() => {
    const now = Date.now();
    setPoints((prev) => {
      const next = [...prev, { t: now, yesPrice: safePrice }];
      return next.slice(-90);
    });
  }, [safePrice]);

  const linePath = useMemo(() => buildLinePath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points), [points]);
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

      <div className="odds-chart-wrap">
        <svg className="odds-chart-svg" viewBox="0 0 100 44" preserveAspectRatio="none">
          <defs>
            <linearGradient id="teiYesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 232, 122, 0.45)" />
              <stop offset="100%" stopColor="rgba(0, 232, 122, 0.02)" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#teiYesArea)" />
          <path d={linePath} className="odds-chart-line" />
        </svg>
      </div>

      <div className="odds-chart-axis">
        <span>Now</span>
        <span>Live feed</span>
      </div>
    </div>
  );
}
