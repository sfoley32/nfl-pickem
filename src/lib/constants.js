export const CURRENT_SEASON = 2026
export const CURRENT_WEEK = 1

export const PLAYERS = [
  'Sierra', 'Leah', 'David', 'AJ', 'UM',
  'Katie', 'Billy', 'Jill', 'Angel', 'Alex'
]

// IMPORTANT: Always put Sunday night game second-to-last
// and Monday night game last. Scenario calculator always
// uses the final 2 games in this array.
export const GAMES = [
  { id: 1, away: 'Patriots', home: 'Seahawks', spread: 'Patriots +3.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 2, away: '49ers', home: 'Rams', spread: '49ers +3.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 3, away: 'Saints', home: 'Lions', spread: 'Saints +7', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 4, away: 'Buccaneers', home: 'Bengals', spread: 'Buccaneers +3.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 5, away: 'Ravens', home: 'Colts', spread: 'Colts +3.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 6, away: 'Browns', home: 'Jaguars', spread: 'Browns +8.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 7, away: 'Jets', home: 'Titans', spread: 'Jets +1.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 8, away: 'Bills', home: 'Texans', spread: 'Texans +1.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 9, away: 'Falcons', home: 'Steelers', spread: 'Falcons +3.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 10, away: 'Bears', home: 'Panthers', spread: 'Panthers +3', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 11, away: 'Packers', home: 'Vikings', spread: 'Packers +1.5', time: 'Sun 1:00pm', day: 'Sunday' },
  { id: 12, away: 'Dolphins', home: 'Raiders', spread: 'Dolphins +3.5', time: 'Sun 4:25pm', day: 'Sunday' },
  { id: 13, away: 'Cardinals', home: 'Chargers', spread: 'Cardinals +10', time: 'Sun 4:25pm', day: 'Sunday' },
  { id: 14, away: 'Commanders', home: 'Eagles', spread: 'Commanders +5.5', time: 'Sun 4:25pm', day: 'Sunday' },
  { id: 15, away: 'Cowboys', home: 'Giants', spread: 'Giants +3', time: 'Sun 4:25pm', day: 'Sunday' },
  { id: 16, away: 'Broncos', home: 'Chiefs', spread: 'Broncos +3', time: 'Sun 8:20pm', day: 'Sunday' },
]

export const LIONS_GAME_ID = 3
export const LIONS_TEAM = 'Lions'

export const PRIOR_WINS = {
  Sierra: 0, Billy: 0, AJ: 0, UM: 0,
  Katie: 0, Leah: 0, Jill: 0, Angel: 0, Alex: 0, David: 0
}