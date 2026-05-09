export type Match = {
  id: string;
  fixtureId?: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string;
  awayCrest: string;
  league: string;
  leagueLogo: string;
  kickoff: string;       // ISO string
  status: "upcoming" | "live" | "finished";
  minute?: number;       // match minute if live
  homeScore?: number;
  awayScore?: number;
  yesPrice: number;      // 0–1 implied probability (home win)
  noPrice: number;       // when away win
  totalVolume: number;   // USDC
  matchId: string;       // on-chain match ID
  marketKind?: "match_winner" | "yellow_cards" | "fouls";
  marketLabel?: string;
  yesLabel?: string;
  noLabel?: string;
};

export const LIVE_MARKET_TYPES = [
  {
    kind: "match_winner",
    label: "Match Winner",
    idSuffix: "",
    yesLabel: "Home win",
    noLabel: "Away win",
  },
  {
    kind: "yellow_cards",
    label: "Yellow Cards O/U 4.5",
    idSuffix: "_yc",
    yesLabel: "Over 4.5 cards",
    noLabel: "Under 4.5 cards",
  },
  {
    kind: "fouls",
    label: "Fouls O/U 21.5",
    idSuffix: "_fl",
    yesLabel: "Over 21.5 fouls",
    noLabel: "Under 21.5 fouls",
  },
] as const;

export type LiveMarketKind = (typeof LIVE_MARKET_TYPES)[number]["kind"];

export function getFixtureId(match: Match) {
  return match.fixtureId ?? match.id;
}

export function getFixtureMarketVariants(match: Match): Match[] {
  const fixtureId = getFixtureId(match);
  const baseMatchId = match.matchId.replace(/(_yc|_fl)$/, "");
  return LIVE_MARKET_TYPES.map((marketType) => ({
    ...match,
    id: marketType.idSuffix ? `${fixtureId}${marketType.idSuffix}` : fixtureId,
    fixtureId,
    matchId: `${baseMatchId}${marketType.idSuffix}`,
    marketKind: marketType.kind,
    marketLabel: marketType.label,
    yesLabel:
      marketType.kind === "match_winner" ? match.homeTeam : marketType.yesLabel,
    noLabel:
      marketType.kind === "match_winner" ? match.awayTeam : marketType.noLabel,
    yesPrice: marketType.kind === "match_winner" ? match.yesPrice : 0.5,
    noPrice: marketType.kind === "match_winner" ? match.noPrice : 0.5,
    totalVolume: marketType.kind === "match_winner" ? match.totalVolume : 0,
  }));
}

export function getAllFixtureMarketVariants(matches: Match[]) {
  return matches.flatMap(getFixtureMarketVariants);
}

export const MOCK_MATCHES: Match[] = [
  {
    id: "1",
    matchId: "match_arsenal_chelsea_v2",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeCrest: "https://resources.premierleague.com/premierleague/badges/t3.svg",
    awayCrest: "https://resources.premierleague.com/premierleague/badges/t8.svg",
    league: "Premier League",
    leagueLogo: "https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg",
    kickoff: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
    status: "live",
    minute: 34,
    homeScore: 1,
    awayScore: 0,
    yesPrice: 0.62,
    noPrice: 0.38,
    totalVolume: 8420,
  },
  {
    id: "2",
    matchId: "match_barca_madrid_v2",
    homeTeam: "Barcelona",
    awayTeam: "Real Madrid",
    homeCrest: "https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg",
    awayCrest: "https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg",
    league: "La Liga",
    leagueLogo: "https://upload.wikimedia.org/wikipedia/commons/1/13/LaLiga_logo_2023.svg",
    kickoff: new Date(Date.now() + 1000 * 60 * 90).toISOString(),
    status: "upcoming",
    yesPrice: 0.48,
    noPrice: 0.52,
    totalVolume: 14200,
  },
  {
    id: "3",
    matchId: "match_psg_dortmund_v2",
    homeTeam: "PSG",
    awayTeam: "Dortmund",
    homeCrest: "https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg",
    awayCrest: "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
    league: "Champions League",
    leagueLogo: "https://upload.wikimedia.org/wikipedia/en/b/bf/UEFA_Champions_League_logo_2.svg",
    kickoff: new Date(Date.now() + 1000 * 60 * 180).toISOString(),
    status: "upcoming",
    yesPrice: 0.55,
    noPrice: 0.45,
    totalVolume: 22100,
  },
  {
    id: "4",
    matchId: "match_city_liverpool_v2",
    homeTeam: "Man City",
    awayTeam: "Liverpool",
    homeCrest: "https://resources.premierleague.com/premierleague/badges/t43.svg",
    awayCrest: "https://resources.premierleague.com/premierleague/badges/t14.svg",
    league: "Premier League",
    leagueLogo: "https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg",
    kickoff: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
    status: "upcoming",
    yesPrice: 0.44,
    noPrice: 0.56,
    totalVolume: 31500,
  },
  {
    id: "5",
    matchId: "match_inter_juventus_v2",
    homeTeam: "Inter Milan",
    awayTeam: "Juventus",
    homeCrest: "https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg",
    awayCrest: "https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_icon_%28black%29.svg",
    league: "Serie A",
    leagueLogo: "https://upload.wikimedia.org/wikipedia/en/e/e1/Serie_A_logo_%282019%29.svg",
    kickoff: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: "live",
    minute: 71,
    homeScore: 2,
    awayScore: 2,
    yesPrice: 0.33,
    noPrice: 0.67,
    totalVolume: 9800,
  },
];
