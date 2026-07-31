// Bundle entry for the bench harness — re-exports everything scripts/bench.mjs needs.
export { BAGSHOT_SQUAD } from '../src/data/squad'
export { OPPOSITION, OPPOSITION_BY_TIER } from '../src/data/opposition'
export { RULES, DEFAULT_AVAILABILITY, allocatedOvers, windowOf, WINDOWS, windowSize, windowCap } from '../src/data/types'
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
export {
  initialAvailability, rollRound, availablePlayers, unavailableMap, roundNews,
  availabilityRate,
} from '../src/engine/availability'
export { seasonForms, emptyPlayerStats } from '../src/engine/season'
export { formMultiplier, formBand, updateForm, driftForm, NEUTRAL_FORM } from '../src/engine/form'
export { freshAirPlayers, applyFreshAir } from '../src/engine/freshair'
