/**
 * SAMPLE DATA — Phase 1 clickable mockup.
 * Fictional college basketball games for the live foul monitor.
 */
import type { LiveGame } from "@shared/types";

export const liveGames: LiveGame[] = [
  {
    id: "cbb-live-1",
    away: { name: "Ridgeline State", shortName: "RSU", score: 38, fouls: 10, inBonus: true, inDoubleBonus: true, ftAttempts: 14 },
    home: { name: "Harbor City", shortName: "HC", score: 41, fouls: 7, inBonus: true, inDoubleBonus: false, ftAttempts: 9 },
    half: "2nd half",
    clock: "14:22",
    pregameTotal: 143.5,
    liveTotal: 146.5,
    pace: "fast",
    paceNote: "Scoring pace is running about 4 points ahead of the pregame total.",
    alerts: [
      {
        severity: "caution",
        message:
          "Both teams are now in the bonus with more than five minutes left in the half. That could create more free throws and scoring opportunities.",
        time: "1 min ago",
      },
      {
        severity: "info",
        message: "Ridgeline State reached the double bonus at 15:10. Every Harbor City foul now sends them to the line for two shots.",
        time: "2 min ago",
      },
    ],
    freshness: "fresh",
    lastUpdated: "20 sec ago",
  },
  {
    id: "cbb-live-2",
    away: { name: "Summit Valley", shortName: "SV", score: 51, fouls: 4, inBonus: false, inDoubleBonus: false, ftAttempts: 5 },
    home: { name: "Lakeport", shortName: "LP", score: 47, fouls: 6, inBonus: false, inDoubleBonus: false, ftAttempts: 3 },
    half: "2nd half",
    clock: "17:45",
    pregameTotal: 138.0,
    liveTotal: 136.5,
    pace: "average",
    paceNote: "Scoring pace is close to the pregame expectation.",
    alerts: [
      {
        severity: "info",
        message: "Lakeport picked up its 6th team foul unusually early in the half. Watch whether the free-throw environment shifts.",
        time: "4 min ago",
      },
    ],
    freshness: "fresh",
    lastUpdated: "35 sec ago",
  },
  {
    id: "cbb-live-3",
    away: { name: "Gulf Shore Tech", shortName: "GST", score: 22, fouls: 2, inBonus: false, inDoubleBonus: false, ftAttempts: 2 },
    home: { name: "Prairie A&M", shortName: "PAM", score: 25, fouls: 3, inBonus: false, inDoubleBonus: false, ftAttempts: 4 },
    half: "1st half",
    clock: "6:18",
    pregameTotal: 129.5,
    liveTotal: 127.5,
    pace: "slow",
    paceNote: "Scoring pace is running a few points behind the pregame total.",
    alerts: [],
    freshness: "delayed",
    lastUpdated: "3 min ago",
  },
];
