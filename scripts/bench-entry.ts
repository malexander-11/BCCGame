// Bundle entry for the bench harness — re-exports everything scripts/bench.mjs needs.
export { BAGSHOT_SQUAD } from '../src/data/squad'
export { OPPOSITION, OPPOSITION_BY_TIER } from '../src/data/opposition'
export { RULES } from '../src/data/types'
export { simulateMatch, simulateFieldingInnings, simulateBattingInnings, buildMatchResult } from '../src/engine/match'
export { autoPlan, buildRota, validatePlan } from '../src/engine/rota'
export { autoBattingOrder, autoSelectXI, teamStrength } from '../src/engine/ai'
export { simulateInnings, formatOvers } from '../src/engine/innings'
export { makeRng } from '../src/engine/rng'
export { DIV6_WEST, BAGSHOT_REAL_POSITION } from '../src/data/league'
export {
  createSeason, nextFixture, recordRound, standings, seasonComplete,
  BAGSHOT_ID, battingBonus, bowlingBonus,
} from '../src/engine/season'
export { dlsPar, resources, startingResources } from '../src/engine/dls'
export { swingBoost, SWING_WINDOW } from '../src/engine/ratings'
