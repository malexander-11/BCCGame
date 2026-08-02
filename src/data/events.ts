/**
 * Team news: the reasons a club cricketer doesn't turn up.
 *
 * Availability is the thing that actually decides a village Saturday XI, far
 * more than tactics do. Three to five are away every week, three to five are
 * carrying something, and once or twice a season somebody storms off.
 */

/** Gone for one week only — the standard Saturday casualties. */
export const AWAY_REASONS: string[] = [
  'on holiday in Portugal',
  'at a wedding in Yorkshire',
  'working — big deadline Monday',
  'on a stag do in Prague',
  'away with the family half-term',
  'playing golf, allegedly a long-standing booking',
  'at a festival',
  'moving house this weekend',
  'has a christening',
  'building his in-laws a patio',
  'on paternity leave',
  'at his daughter’s sports day',
  'unreachable — three unanswered messages in the group',
  'double-booked with his other club',
  'has a wedding anniversary he forgot until Thursday',
  'in Ibiza for a "quiet one"',
  'watching England at Lord’s',
  'on call for work',
  'took the ferry to France and misjudged the return',
  'said yes in March and has now remembered why he shouldn’t have',
]

/**
 * Carrying a knock — one week, like everything else.
 *
 * Every line here has to read as a man who'll be fine by next Saturday, because
 * that's exactly how long he's out. The long ones — stress fractures, torn
 * calves, knees done at five-a-side — are gone, along with the multi-week
 * ranges that used to come with them. A club side churns; it doesn't lose
 * people for a month.
 */
export const INJURIES: string[] = [
  'has a tight hamstring',
  'has a side strain',
  'rolled an ankle in the nets',
  'jarred a finger keeping',
  'has gone in the back',
  'has a tight calf',
  'has a sore shoulder after that throw from the deep',
  'banged a knee playing five-a-side',
  'is in concussion protocol',
  'has a groin strain',
  'took one in the ribs and is bruised',
  'has tennis elbow, which he insists is from cricket',
  'has a sore heel and is under orders to rest it',
  'jammed a thumb at slip',
  'tweaked an achilles running in',
  'has a stiff neck and can barely look square',
]

export interface FalloutTemplate {
  text: string
  min: number
  max: number
}

/** The dramatic ones. Rare, and they sting because they're usually your best. */
export const FALLOUTS: FalloutTemplate[] = [
  { text: 'has fallen out with the captain over the batting order', min: 2, max: 5 },
  { text: 'walked out after being left out last week', min: 3, max: 6 },
  { text: 'is refusing to play until the club replaces the sightscreens', min: 2, max: 4 },
  { text: 'has been suspended for dissent', min: 2, max: 3 },
  { text: 'is "taking a break from cricket"', min: 3, max: 7 },
  { text: 'has been poached by the 2nd XI and is sulking about it', min: 2, max: 4 },
  { text: 'is not speaking to the skipper after that run-out', min: 1, max: 3 },
  { text: 'posted something regrettable in the group chat and left it', min: 3, max: 6 },
  { text: 'has taken up Saturday golf on principle', min: 4, max: 8 },
  { text: 'is banned for two matches after the umpire’s report', min: 2, max: 2 },
  { text: 'is in dispute with the club over his subs', min: 2, max: 4 },
]

export const RETURN_LINES: string[] = [
  'is fit and available again',
  'has come through a fitness test',
  'is back in the frame',
  'has patched things up and is available',
  'returns to selection',
]
