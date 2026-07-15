# Data Provider Comparison

Before connecting any live feed, complete this comparison. **Do not assume a
platform is covered because a marketing page says "player props."** Test the
actual API response or obtain written confirmation. Do not scrape a platform
unless its terms clearly allow it.

Status legend: ✅ verified via API response · 📝 written confirmation ·
❓ unverified claim · ❌ not offered · ⬜ not yet checked

## Checklist per provider

| Capability | OpticOdds | SportsGameOdds | The Odds API | SportsDataIO | Sportradar | Genius Sports | Goalserve | API-Basketball |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hard Rock Bet odds | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PrizePicks projections | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| NoVig markets | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Major sportsbook odds | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| MLB player props | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Tennis player props | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| CBB live scores | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| CBB team fouls (live) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Opening lines | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Current lines | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Historical line movement | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Live odds | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Confirmed lineups | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Injuries | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Starting pitchers | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pitch counts | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| API update frequency | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| API rate limits | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Commercial-use terms | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pricing | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

Weather comes from the **National Weather Service API** (forecasts,
observations, and alerts for United States locations) and is not part of this
comparison.

## Per-provider notes

For each provider, record when it was tested, which endpoints were called, a
sample response snippet for each capability marked ✅, rate-limit headers
observed, and pricing/terms links. Keep raw sample responses in
`docs/provider-samples/` (gitignored if they contain licensed data).

### OpticOdds

- Tested: not yet
- Notes:

### SportsGameOdds

- Tested: not yet
- Notes:

### The Odds API

- Tested: not yet
- Notes:

### SportsDataIO

- Tested: not yet
- Notes:

### Sportradar

- Tested: not yet
- Notes:

### Genius Sports

- Tested: not yet
- Notes:

### Goalserve

- Tested: not yet
- Notes:

### API-Basketball (and other sport-specific providers)

- Tested: not yet
- Notes:

## Decision criteria

1. Coverage of the three launch sports (MLB, tennis, college basketball) and
   the three comparison platforms (Hard Rock Bet, PrizePicks, NoVig).
2. Verified player-prop depth (not just headline markets).
3. Update frequency fast enough for the freshness rules (fresh/delayed/stale).
4. Clear commercial-use terms.
5. Cost against a single-user research tool budget.

A provider is only "selected" after its actual API responses are checked into
the notes above.
