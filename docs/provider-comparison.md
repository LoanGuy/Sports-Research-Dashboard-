# Data Provider Comparison

Before connecting any live feed, complete this comparison. **Do not assume a
platform is covered because a marketing page says "player props."** Test the
actual API response or obtain written confirmation. Do not scrape a platform
unless its terms clearly allow it.

Status legend: ✅ verified via API response · 📝 written confirmation ·
❓ documented claim, not yet API-tested · Ⓜ️ marketing claim only ·
❌ evidence of absence · ⬜ not yet checked

> **Research pass #1 — 2026-07-15.** Desk research from official docs,
> pricing pages, and practitioner sources, with adversarial verification of
> each claim (20 claims confirmed, 5 refuted). **No API responses have been
> tested yet**, so nothing below is ✅. Key constraint: opticodds.com,
> sportsgameodds.com, goalserve.com, and prizepicks.com all block automated
> fetching (HTTP 403), so most figures come from search-engine-indexed copies
> of official pages and must be confirmed on the live page or a trial key.

## Checklist per provider

| Capability | OpticOdds | SportsGameOdds | The Odds API | SportsDataIO | Sportradar | Genius Sports | Goalserve | API-Basketball |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hard Rock Bet odds | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PrizePicks projections | ❓ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| NoVig markets | ❓ | ❓ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Major sportsbook odds | Ⓜ️ 100+ | Ⓜ️ 80+ | Ⓜ️ ~40 | ⬜ | ⬜ | ⬜ | Ⓜ️ 50+ | ⬜ |
| MLB player props | Ⓜ️ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Ⓜ️ | ⬜ |
| Tennis player props | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| CBB live scores | ⬜ | ⬜ | ⬜ | Ⓜ️ | Ⓜ️ | ⬜ | ⬜ | ⬜ |
| CBB team fouls (live) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Opening lines | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Current lines | ❓ | ❓ | ❓ | ⬜ | ⬜ | ⬜ | ❓ | ⬜ |
| Historical line movement | Ⓜ️ | ⬜ | Ⓜ️ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Live odds | Ⓜ️ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ❓ 1s push | ⬜ |
| Confirmed lineups | Ⓜ️ | ⬜ | ⬜ | Ⓜ️ | Ⓜ️ | ⬜ | ⬜ | ⬜ |
| Injuries | Ⓜ️ | ⬜ | ⬜ | Ⓜ️ | ⬜ | ⬜ | ⬜ | ⬜ |
| Starting pitchers | ⬜ | ⬜ | ⬜ | Ⓜ️ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pitch counts | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| API update frequency | Ⓜ️ | ❓ per tier | ⬜ | ⬜ | ⬜ | ⬜ | ❓ 30s pregame | ⬜ |
| API rate limits | ⬜ | ❓ per tier | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Commercial-use terms | ⬜ | ❓ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pricing | ⬜ none public | ❓ $0/$99+/$499 | ❓ $0/~$30+ | ⬜ | ⬜ | ⬜ | ❓ $500–800/mo | ⬜ |

**Critical gap:** Hard Rock Bet coverage — the dashboard's first requirement —
was not confirmed for **any** provider in this pass. It must be checked against
each finalist's live bookmaker-list endpoint or trial key.

Weather comes from the **National Weather Service API** (forecasts,
observations, and alerts for United States locations) and is not part of this
comparison.

## Per-provider notes

### OpticOdds — shortlist PRIMARY

- Researched: 2026-07-15 (docs + site; live site 403-blocks fetchers; no API test yet)
- **NoVig (Novig): strongest finding of the pass.** Novig appears in OpticOdds'
  developer-docs sportsbook list, has a dedicated per-book page ("real-time
  betting odds, player props, alternate markets, futures, historical odds"),
  and — decisively — Novig is itself a published OpticOdds *customer* with a
  case study and named VP quote, so the relationship is a direct feed, not
  scraping. Verified 3-0 in adversarial review.
  Sources: `opticodds.com/sportsbooks/novig-api`, `opticodds.com/customers/novig`,
  `developer.opticodds.com/docs/sportsbooks`
- **PrizePicks: likely covered.** PrizePicks is listed in the developer-docs
  sportsbook list and has its own per-book page. Medium confidence — surfaced
  as corroboration rather than a directly adjudicated claim. Confirm via the
  `/sportsbooks` endpoint on a trial key, including MLB/tennis/CBB prop depth.
- Breadth claims ("100+ sportsbooks", "1M+ odds/sec", injury data for major
  leagues) are **templated marketing boilerplate** repeated verbatim on every
  per-book page (confirmed on DraftKings, PrizePicks, Polymarket pages) — treat
  as unverified until keyed.
- **No public pricing.** Enterprise-style sales contact required; whether a
  single-user research plan exists is an open question.
- To verify on trial key: Hard Rock Bet in book list; Novig market depth
  (bid/ask? liquidity?); PrizePicks projection fields; MLB K/TB/outs props;
  tennis props; historical movement granularity; latency.

### SportsGameOdds — shortlist SECONDARY / prototyping

- Researched: 2026-07-15 (indexed copies of official pricing/terms/docs; live site 403-blocks fetchers)
- **Pricing (indexed, conflicting copies — confirm on live page):** free
  "Amateur" tier (1,000–2,500 objects/mo, 10 req/min, 10-minute odds delay, no
  credit card); "Rookie" $99/mo annual ($149 month-to-month), 5M objects/mo,
  60 req/min; "Pro" reported at $499/mo (one indexed copy says $299), 1,000
  req/min; custom "All-Star" tier. Verified 3-0 / 2-1.
- **License:** limited, revocable, non-exclusive, non-transferable,
  non-sublicensable during subscription; no personal-vs-commercial split —
  a single-user research tool appears to fall under standard plan terms
  (verified 3-0 from `/terms`).
- **Coverage:** "80+ bookmakers" is marketing-level; the claim that this
  includes Hard Rock Bet / PrizePicks / NoVig **failed verification** (1-2).
  Third-party corroboration suggests it lists Novig (`/bookmakers/novig`
  page reported), unadjudicated. Check `sportsgameodds.com/docs/data-types/bookmakers`.
- Attractive property: the free tier allows testing the actual response shape
  before spending anything.

### The Odds API — not evaluated (evidence gap, not inferiority)

- Researched: 2026-07-15 — fetch attempts yielded no verification-surviving
  claims. Search-stage (unverified) notes: free 500 credits/mo, paid from
  ~$30/mo, ~40 mainstream US books, credit-based quota, historical odds
  add-on. Known in practitioner circles for cheap historical data.
- Worth a follow-up pass: check bookmaker list for Hard Rock Bet, and player-
  prop market depth for MLB/tennis/CBB.

### SportsDataIO — not evaluated (evidence gap)

- Researched: 2026-07-15 — no verification-surviving claims. Search-stage
  (unverified) notes: MLB product page advertises projected **and confirmed
  lineups, starting pitchers, injuries** through the game lifecycle; NCAA
  basketball API exists. Likely relevant as a **stats/lineups provider**
  alongside an odds aggregator rather than as the odds source itself.

### Sportradar — not evaluated (evidence gap)

- Researched: 2026-07-15 — no verification-surviving claims. Enterprise
  licensing; NCAA MB and MLB lineup-tracking docs exist. Probably oversized
  for a single-user tool; revisit only if NCAA live team-foul data can't be
  sourced elsewhere.

### Genius Sports — not evaluated

- Researched: 2026-07-15 — no usable public evidence surfaced. Enterprise
  sales motion; low priority for a single-user tool.

### Goalserve — shortlist FALLBACK (breadth, not target books)

- Researched: 2026-07-15 (indexed copies of official pricing pages; live site 403-blocks fetchers)
- **Pricing:** All Sports pregame odds ~$500/mo; Full Package with in-play
  ~$800/mo ($5,100/yr, sale ~$4,000); ~14-day free trial. Verified 3-0.
- **Update cadence claims:** pregame odds every 30 seconds across "250+
  markets including player props and outrights"; 1-second in-play via
  websockets/PUSH; 99% uptime, 24/7 support — all vendor marketing, needs
  trial testing. Verified as *claims* 3-0.
- **No evidence it carries Hard Rock Bet, PrizePicks, or NoVig.** (A stronger
  claim that its book list *omits* them was refuted 0-3 — absence from
  snippets isn't proof of absence — so check the actual list on trial.)

### API-Basketball / API-Sports — not evaluated

- Researched: 2026-07-15 — no verification-surviving claims. Sport-specific
  budget APIs; possible niche role for CBB live data if the main provider
  lacks it.

### PrizePicks direct (unofficial) — fragile last resort, flagged risks

- Researched: 2026-07-15, including a live endpoint test.
- **There is no official public PrizePicks API.** Practitioner ecosystems
  (71+ GitHub codebases) parse undocumented endpoints
  (`api.prizepicks.com/projections`, `partner-api.prizepicks.com/projections`,
  `/leagues`) returning exactly what prop research needs: `display_name`,
  team/position, opponent, `stat_type`, `line_score`, `flash_sale_line_score`,
  `start_time`, `status`; filterable by `league_id` (MLB=2, MLBLIVE=231,
  TENNIS=5, CBB=20 — IDs partly from a 2021 snapshot, re-verify at build
  time). Payload schema confirmed current as of 2026-07-12. Verified 3-0.
- **But access is Cloudflare-protected:** a plain request returned HTTP 403 in
  a live test on 2026-07-15; working scrapers use Puppeteer+Stealth or
  FlareSolverr cookies, and datacenter-IP polling is unreliable. All claims
  that the endpoints work without anti-bot measures were **refuted 0-3**.
- **Spec compliance note:** the project rules say do not scrape a platform
  unless its terms clearly allow it. PrizePicks' ToS position on this is
  unestablished → prefer an aggregator (OpticOdds) for PrizePicks lines; treat
  direct access as a fallback pending a terms review.

## Refuted claims (do not rely on these)

1. Goalserve's book list omits Hard Rock/PrizePicks/NoVig — refuted 0-3
   (snippet absence ≠ absence; list simply unverified).
2. PrizePicks partner API is callable without auth/anti-bot measures — refuted 0-3.
3. PrizePicks endpoints work with plain HTTP from practitioners — refuted 0-3.
4. SportsGameOdds' 80+ books includes the three target books — refuted 1-2 (unproven).
5. Hourly polling of PrizePicks endpoints is a demonstrated-workable cadence — refuted 0-3.

## Open questions for the trial-key phase

1. **Does anyone carry Hard Rock Bet?** Not confirmed for any provider. First
   thing to check on every trial key / live bookmaker list.
2. **What does OpticOdds cost for a single user?** No public pricing; ask
   sales whether a personal-research plan and license exist.
3. **The Odds API and SportsDataIO deep-dive** — both plausible but
   unevaluated; The Odds API for cheap odds+history, SportsDataIO for
   lineups/starting pitchers/NCAA stats.
4. **Who supplies CBB live team fouls?** No adjudicated finding anywhere. May
   require a dedicated stats feed (SportsDataIO/Sportradar) next to the odds
   aggregator.

## Decision criteria

1. Coverage of the three launch sports (MLB, tennis, college basketball) and
   the three comparison platforms (Hard Rock Bet, PrizePicks, NoVig).
2. Verified player-prop depth (not just headline markets).
3. Update frequency fast enough for the freshness rules (fresh/delayed/stale).
4. Clear commercial-use terms.
5. Cost against a single-user research tool budget.

## Current shortlist (post research pass #1)

| Rank | Provider | Why | Cost signal | Next action |
| --- | --- | --- | --- | --- |
| 1 | **OpticOdds** | Only provider verified to carry NoVig (direct feed); very likely PrizePicks; broad books/props/history claims | Unpublished (sales contact) | Request trial + pricing; verify Hard Rock, Novig depth, PrizePicks fields, props |
| 2 | **SportsGameOdds** | Free tier to prototype today; $99–149/mo entry; single-user-compatible license; possibly lists Novig | $0 → ~$99–149/mo | Sign up free tier; pull `/bookmakers` and prop markets; confirm pricing on live page |
| 3 | **Goalserve** | Cheap breadth (MLB/tennis/basketball, props, 30s pregame, 1s in-play) but no target-book evidence | ~$500–800/mo, free trial | Only if 1–2 fail; check book list on trial |

Supplemental: **SportsDataIO** (or similar) may still be needed for confirmed
MLB lineups/starting pitchers and CBB live team fouls — the odds aggregators'
coverage of those is unproven. PrizePicks-direct remains a terms-gated fallback.

A provider is only "selected" after its actual API responses are checked into
the notes above (upgrading claims to ✅), per the project rules.
