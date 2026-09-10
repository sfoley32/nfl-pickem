import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CURRENT_WEEK, CURRENT_SEASON, GAMES, LIONS_GAME_ID, LIONS_TEAM, PLAYERS } from '../lib/constants'

export default function Stats() {
  const [allPicks, setAllPicks] = useState([])
  const [results, setResults] = useState({})
  const [weeklyWinners, setWeeklyWinners] = useState([])
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK)
  const [weekOptions, setWeekOptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [picksRes, resultsRes, weeklyRes] = await Promise.all([
          supabase.from('picks').select('*').eq('season', CURRENT_SEASON),
          supabase.from('results').select('*'),
          supabase.from('archive_weekly').select('*').eq('season', CURRENT_SEASON).order('week', { ascending: true })
        ])

        const picksData = picksRes.data || []
        const resultsData = resultsRes.data || []
        const weeklyData = weeklyRes.data || []

        setAllPicks(picksData)
        setWeeklyWinners(weeklyData)

        const weeks = [...new Set(picksData.filter(r => r.wins !== null && r.wins !== undefined).map(r => r.week))].sort((a, b) => b - a)
        setWeekOptions(weeks)
        if (weeks.length > 0) setSelectedWeek(weeks[0])

        const r = {}
        resultsData.forEach(row => {
          if (!r[row.week]) r[row.week] = {}
          r[row.week][row.game_id] = row.winner
        })
        setResults(r)
      } catch (err) {
        console.error('Stats fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: '#666' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>🦁</div>
      Loading stats...
    </div>
  )

  const weekPicks = allPicks.filter(r => r.week === selectedWeek)
  const weekResults = results[selectedWeek] || {}
  const totalPlayers = weekPicks.length

  // picks per game this week
  const gamePicks = {}
  GAMES.forEach(g => { gamePicks[g.id] = {} })
  weekPicks.forEach(row => {
    GAMES.forEach(g => {
      const pick = row.picks[g.id]
      if (pick) gamePicks[g.id][pick] = (gamePicks[g.id][pick] || 0) + 1
    })
  })

  // most popular pick
  let mostPopularTeam = '—'
  let mostPopularCount = 0
  GAMES.forEach(g => {
    Object.entries(gamePicks[g.id]).forEach(([team, count]) => {
      if (count > mostPopularCount) { mostPopularCount = count; mostPopularTeam = team }
    })
  })

  // contrarian index
  const contrarian = {}
  weekPicks.forEach(row => {
    let againstMajority = 0
    GAMES.forEach(g => {
      const pick = row.picks[g.id]
      const maxPick = Object.entries(gamePicks[g.id]).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (pick && pick !== maxPick) againstMajority++
    })
    contrarian[row.player] = againstMajority
  })
  const mostContrarian = Object.entries(contrarian).sort((a, b) => b[1] - a[1])[0]

  // games that fooled the most people
  const fooledGames = GAMES.map(g => {
    const counts = gamePicks[g.id]
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const majorityTeam = sorted[0]?.[0]
    const majorityCount = sorted[0]?.[1] || 0
    const actualWinner = weekResults[g.id]
    const fooled = actualWinner && actualWinner !== majorityTeam ? total - (counts[actualWinner] || 0) : 0
    return { game: g, majorityTeam, majorityCount, total, fooled, actualWinner }
  }).filter(g => g.total > 0 && g.fooled > 0).sort((a, b) => b.fooled - a.fooled)

  // best/worst/avg per player across season
  const playerWeekWins = {}
  allPicks.forEach(row => {
    if (!playerWeekWins[row.player]) playerWeekWins[row.player] = {}
    if (row.wins !== null && row.wins !== undefined) {
      playerWeekWins[row.player][row.week] = row.wins
    }
  })

  const allWeeks = [...new Set(allPicks.filter(r => r.wins !== null).map(r => r.week))].sort((a, b) => a - b)

  const playerStats = PLAYERS.map(player => {
    const weekMap = playerWeekWins[player] || {}
    const wins = Object.values(weekMap)
    return {
      player,
      weekMap,
      best: wins.length ? Math.max(...wins) : null,
      worst: wins.length ? Math.min(...wins) : null,
      avg: wins.length ? (wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(1) : null
    }
  }).filter(r => r.best !== null).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))

  // most weekly wins (weeks won outright)
  const weekWinCounts = {}
  weeklyWinners.forEach(w => {
    const winners = w.winner.split(' & ')
    winners.forEach(p => {
      const name = p.trim()
      weekWinCounts[name] = (weekWinCounts[name] || 0) + 1
    })
  })
  const weekWinLeader = Object.entries(weekWinCounts).sort((a, b) => b[1] - a[1])

  // lions
  const lionsGame = GAMES.find(g => g.id === LIONS_GAME_ID)
  const lionsTraitors = weekPicks.filter(row => row.picks[LIONS_GAME_ID] !== LIONS_TEAM)
  const lionsLoyal = weekPicks.filter(row => row.picks[LIONS_GAME_ID] === LIONS_TEAM)
  const lionsResult = weekResults[LIONS_GAME_ID]

  // color for week grid cells
  const cellColor = (wins, allWins) => {
    if (wins === null || wins === undefined) return { bg: '#f3f4f6', color: '#999' }
    const max = Math.max(...allWins)
    const min = Math.min(...allWins)
    const range = max - min || 1
    const pct = (wins - min) / range
    if (pct >= 0.75) return { bg: '#0076B6', color: '#fff' }
    if (pct >= 0.5) return { bg: '#60b8e0', color: '#fff' }
    if (pct >= 0.25) return { bg: '#bde0f5', color: '#004F7C' }
    return { bg: '#fde8e8', color: '#dc2626' }
  }

  const allSeasonWins = allPicks.filter(r => r.wins !== null).map(r => r.wins)

  const card = (children) => (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
      {children}
    </div>
  )

  const sectionLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', marginBottom: 12,
      textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</div>
  )

  return (
    <div style={{ paddingTop: 20, paddingBottom: 40 }}>

      {card(<>
        {sectionLabel('Select week')}
        {weekOptions.length === 0 ? (
          <div style={{ fontSize: 13, color: '#999' }}>No scored weeks yet.</div>
        ) : (
          <select value={selectedWeek} onChange={e => setSelectedWeek(parseInt(e.target.value))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: '#fff' }}>
            {weekOptions.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
        )}
      </>)}

      {weekWinLeader.length > 0 && card(<>
        {sectionLabel('🏆 Most weeks won this season')}
        {weekWinLeader.map(([player, count], i) => (
          <div key={player} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 10px', marginBottom: 4, borderRadius: 8,
            background: i === 0 ? 'var(--lions-blue-light)' : i % 2 === 0 ? '#fafafa' : '#fff',
            border: i === 0 ? '1px solid var(--lions-blue)' : '1px solid transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#999', width: 20 }}>{i + 1}</span>
              {i === 0 && <span>👑</span>}
              <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 400 }}>{player}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? 'var(--lions-blue)' : '#111' }}>
              {count} {count === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        ))}
      </>)}

      {allWeeks.length > 0 && card(<>
        {sectionLabel('📊 Week by week scores')}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                  color: '#fff', background: 'var(--lions-blue)', position: 'sticky', left: 0,
                  minWidth: 80, borderRadius: '8px 0 0 0' }}>Player</th>
                {allWeeks.map(w => (
                  <th key={w} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600,
                    color: '#fff', background: 'var(--lions-blue)', minWidth: 40 }}>Wk{w}</th>
                ))}
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600,
                  color: '#fff', background: 'var(--lions-blue)', minWidth: 44, borderRadius: '0 8px 0 0' }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((row, pi) => (
                <tr key={row.player} style={{ background: pi % 2 === 0 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 13,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: pi % 2 === 0 ? '#fafafa' : '#fff',
                    borderRight: '2px solid var(--lions-blue)' }}>{row.player}</td>
                  {allWeeks.map(w => {
                    const wins = row.weekMap[w]
                    const c = cellColor(wins ?? null, allSeasonWins)
                    return (
                      <td key={w} style={{ padding: '4px', textAlign: 'center' }}>
                        <div style={{ width: 32, height: 28, borderRadius: 6, background: c.bg,
                          color: c.color, fontWeight: 700, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                          {wins ?? '—'}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700,
                    color: 'var(--lions-blue)', fontSize: 13 }}>{row.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {weekPicks.length > 0 && <>
        {card(<>
          {sectionLabel(`Week ${selectedWeek} snapshot`)}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: 'var(--lions-blue-light)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--lions-silver-dark)', marginBottom: 3 }}>Players in</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--lions-blue)' }}>{totalPlayers}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--lions-blue-light)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--lions-silver-dark)', marginBottom: 3 }}>Most popular</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--lions-blue)' }}>{mostPopularTeam}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--lions-blue-light)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--lions-silver-dark)', marginBottom: 3 }}>Contrarian</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--lions-blue)' }}>{mostContrarian?.[0] || '—'}</div>
            </div>
          </div>
        </>)}

        {card(<>
          {sectionLabel('🎯 How the league picked')}
          {GAMES.map(g => {
            const counts = gamePicks[g.id]
            const total = Object.values(counts).reduce((a, b) => a + b, 0)
            if (total === 0) return null
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
            const top = sorted[0]
            const pct = Math.round((top[1] / total) * 100)
            const actualWinner = weekResults[g.id]
            const majorityWon = actualWinner && actualWinner === top[0]
            const majorityLost = actualWinner && actualWinner !== top[0]
            return (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: '#555' }}>{g.away} vs {g.home}</span>
                  <span style={{ fontWeight: 600, color: majorityWon ? '#16a34a' : majorityLost ? '#dc2626' : 'var(--lions-blue)' }}>
                    {top[0]} — {top[1]}/{total}{majorityWon ? ' ✓' : majorityLost ? ' ✗' : ''}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--lions-silver-light)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
                    background: majorityWon ? '#16a34a' : majorityLost ? '#dc2626' : 'var(--lions-blue)' }} />
                </div>
              </div>
            )
          })}
        </>)}

        {fooledGames.length > 0 && card(<>
          {sectionLabel('🤯 Games that fooled the most people')}
          {fooledGames.slice(0, 5).map(({ game, majorityTeam, fooled, total, actualWinner }) => (
            <div key={game.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{game.away} vs {game.home}</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  {fooled} of {total} picked {majorityTeam} — {actualWinner} won
                </div>
              </div>
              <span style={{ fontSize: 12, background: '#fef3c7', color: '#92400e',
                padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                {fooled} wrong
              </span>
            </div>
          ))}
        </>)}

        {lionsGame && card(<>
          {sectionLabel(`🦁 Lions loyalty report — week ${selectedWeek}`)}
          {lionsResult && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8,
              background: lionsResult === LIONS_TEAM ? 'var(--lions-blue-light)' : '#fef2f2',
              border: `1px solid ${lionsResult === LIONS_TEAM ? 'var(--lions-blue)' : '#fecaca'}` }}>
              <span style={{ fontSize: 13, fontWeight: 700,
                color: lionsResult === LIONS_TEAM ? 'var(--lions-blue)' : '#dc2626' }}>
                {lionsResult === LIONS_TEAM ? '🦁 Lions won! Traitors suffer.' : '😬 Lions lost. Traitors were right this time.'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, background: 'var(--lions-blue-light)', borderRadius: 10, padding: '12px',
              border: '1px solid var(--lions-blue)', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>🦁</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lions-blue-dark)', marginTop: 4 }}>True believers</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--lions-blue)' }}>{lionsLoyal.length}</div>
            </div>
            <div style={{ flex: 1, background: '#fef2f2', borderRadius: 10, padding: '12px',
              border: '1px solid #fca5a5', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>🐀</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginTop: 4 }}>Traitors</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{lionsTraitors.length}</div>
            </div>
          </div>
          {lionsTraitors.length > 0 && <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠️ Wanted for treason</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {lionsTraitors.map(row => (
                <div key={row.player} style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 8px',
                  textAlign: 'center', border: '2px solid #dc2626', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#dc2626' }} />
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, letterSpacing: '0.1em',
                    marginBottom: 6, textTransform: 'uppercase' }}>WANTED</div>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#333',
                    border: '2px solid #555', margin: '0 auto 8px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🐀</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{row.player}</div>
                  <div style={{ fontSize: 10, color: '#f87171' }}>picked</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', marginTop: 1 }}>
                    {row.picks[LIONS_GAME_ID]}
                  </div>
                </div>
              ))}
            </div>
          </>}
          {lionsLoyal.length > 0 && <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--lions-blue)', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>✅ Hall of honor</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {lionsLoyal.map(row => (
                <div key={row.player} style={{ background: 'var(--lions-blue)', borderRadius: 20,
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🦁</span>{row.player}
                </div>
              ))}
            </div>
          </>}
        </>)}
      </>}

    </div>
  )
}