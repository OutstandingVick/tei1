import { Match } from "@/lib/matches";

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
const DEFAULT_LEAGUES = "39,140,135,2";
const DEFAULT_DAYS_AHEAD = 7;
const CACHE_MS = 5 * 60 * 1000;

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: {
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    logo: string;
  };
  teams: {
    home: {
      name: string;
      logo: string;
    };
    away: {
      name: string;
      logo: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

type ApiFootballResponse = {
  response?: ApiFootballFixture[];
  errors?: unknown;
};

let cached: { expiresAt: number; matches: Match[] } | null = null;

function requireApiKey() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("Missing API_FOOTBALL_KEY server environment variable.");
  }
  return key;
}

function dateString(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function getConfiguredLeagues() {
  return (process.env.API_FOOTBALL_LEAGUES || DEFAULT_LEAGUES)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function getSeason() {
  return process.env.API_FOOTBALL_SEASON || String(new Date().getUTCFullYear());
}

function getDaysAhead() {
  const parsed = Number(process.env.API_FOOTBALL_DAYS_AHEAD || DEFAULT_DAYS_AHEAD);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS_AHEAD;
  return Math.min(parsed, 14);
}

function truncate(input: string, max: number) {
  return input.length > max ? input.slice(0, max - 1).trimEnd() : input;
}

function toMatchStatus(short: string): Match["status"] {
  if (["1H", "2H", "HT", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(short)) {
    return "live";
  }
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  return "upcoming";
}

function normalizeFixture(item: ApiFootballFixture): Match {
  const status = toMatchStatus(item.fixture.status.short);
  const homeTeam = truncate(item.teams.home.name, 32);
  const awayTeam = truncate(item.teams.away.name, 32);

  return {
    id: `af_${item.fixture.id}`,
    matchId: `af_${item.fixture.id}`,
    homeTeam,
    awayTeam,
    homeCrest: item.teams.home.logo,
    awayCrest: item.teams.away.logo,
    league: truncate(item.league.name, 32),
    leagueLogo: item.league.logo,
    kickoff: item.fixture.date,
    status,
    minute: status === "live" ? item.fixture.status.elapsed ?? undefined : undefined,
    homeScore: item.goals.home ?? undefined,
    awayScore: item.goals.away ?? undefined,
    yesPrice: 0.5,
    noPrice: 0.5,
    totalVolume: 0,
  };
}

async function fetchFixturesForLeagueDate(apiKey: string, league: string, date: string) {
  const params = new URLSearchParams({
    league,
    season: getSeason(),
    date,
    timezone: "Africa/Lagos",
  });

  const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?${params.toString()}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed (${res.status}) for league ${league} on ${date}.`);
  }

  const body = (await res.json()) as ApiFootballResponse;
  if (body.errors && Object.keys(body.errors as Record<string, unknown>).length > 0) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(body.errors)}`);
  }
  return body.response ?? [];
}

export async function getApiFootballMatches() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.matches;
  }

  const apiKey = requireApiKey();
  const leagues = getConfiguredLeagues();
  const daysAhead = getDaysAhead();
  const dates = Array.from({ length: daysAhead }, (_, i) => dateString(i));

  const fixtureGroups = await Promise.all(
    leagues.flatMap((league) =>
      dates.map((date) => fetchFixturesForLeagueDate(apiKey, league, date))
    )
  );

  const matches = fixtureGroups
    .flat()
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
    .map(normalizeFixture);

  cached = {
    expiresAt: Date.now() + CACHE_MS,
    matches,
  };
  return matches;
}
