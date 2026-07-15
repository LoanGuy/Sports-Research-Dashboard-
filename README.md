# Edge Research — Sports Research Dashboard

A private research and analysis tool that compares sports market prices, removes
sportsbook vig, analyzes player props, reviews matchup conditions, and presents
everything in plain language.

> This dashboard provides research and probability estimates. It does not
> guarantee results or place wagers. Odds, projections, lineups, injuries,
> weather, and other information can change quickly.

## What it does — and does not — do

The dashboard **does**:

- Collect available odds, projections, market prices, scores, statistics,
  lineups, weather, and matchup information (live feeds in later phases).
- Calculate fair probabilities automatically.
- Compare Hard Rock Bet, PrizePicks, NoVig, and the broader sportsbook market.
- Identify possible pricing differences and research each one.
- Grade the quality of each opportunity and the quality of the available data.
- Explain what supports and what weakens each opportunity.
- Let the user make the final decision.

The dashboard **does not**:

- Place bets, log into betting accounts, or submit PrizePicks entries.
- Automatically choose a wager or recommend stake sizes.
- Guarantee results or treat estimates as facts.

## Current status: Phase 1 — clickable mockup

This build is a clickable mockup using **fictional sample data**. Every player,
team, odd, projection, weather reading, and live score is invented for
demonstration. See `client/src/data/` — those modules are replaced by the data
pipeline in later phases while the UI keeps consuming the same types.

What works today:

- **Research feed** (Compact Mode): filter by sport (MLB, tennis, college
  basketball) and platform (Hard Rock, PrizePicks, NoVig); sort by estimated
  difference, grade, or start time.
- **Detailed Mode**: per-opportunity research view with grade breakdown
  (six weighted categories), plain-language summary, "why it grades well,"
  "what could go wrong," bottom line, per-source market comparison with
  freshness labels, recent form with labeled sample sizes, weather/roof
  status, lineup status, NoVig order-book state, and PrizePicks
  projection-vs-market comparison.
- **Live monitor**: college basketball foul traffic light (Gray 0–5,
  Yellow 6–9, Green 10+, count always shown beside the color), bonus/double
  bonus status, pace vs pregame total, and plain-language alerts.
- **Calculators** (real math, unit-tested): manual vig remover (two- and
  three-way, EV, Kelly full/half/quarter), PrizePicks entry evaluator
  (power/flex, per-pick probabilities, editable payout tiers, correlation
  warning), and NoVig contract evaluator (fees included, executable price).
- **Settings**: configurable grading weights (defaults: market value 30%,
  matchup 25%, recent form 15%, conditions 10%, data confidence 15%,
  risk 5%).

## Stack

- React 18 + TypeScript + Vite (client), Express (server shell)
- Tailwind CSS + shadcn/ui components, wouter routing
- Vitest for the calculation library tests

The odds/probability library lives in `client/src/lib/odds.ts` with tests in
`client/src/lib/odds.test.ts`. Calculations, data, and display are kept in
separate modules.

## Commands

```bash
npm run dev     # start the dev server (port 5000)
npm run test    # run the calculation library unit tests
npm run check   # typecheck
npm run build   # production build
```

## Roadmap (small phases)

1. **Phase 1 (this build)** — clickable mockup with fake data.
2. Provider selection using `docs/provider-comparison.md` (verify actual API
   responses, never marketing pages).
3. Data collection + normalization + event/market matching modules.
4. Automatic no-vig consensus from live feeds; source freshness monitoring.
5. National Weather Service integration; MLB lineup confirmation + alerts.
6. Grading engine wired to configurable weights; history and audit records.
7. Authentication, PostgreSQL persistence, scheduled jobs, error monitoring.

## Repository notes

This project began as a Phase 1 mockup exported from a scaffold that carried
some unused dependencies (drizzle-orm, better-sqlite3, passport). They are
kept temporarily so the lockfile stays valid; they will be pruned or put to
use when the persistence phase lands.
