import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CURRENT_SEASON, CURRENT_WEEK, PRIOR_WINS, PLAYERS, GAMES } from '../lib/constants'

const SNF = GAMES[GAMES.length - 2]
const MNF = GAMES[GAMES.length - 1]

function calcWeeklyWinner(picksData, hypotheticalResults, tbAnswer) {
  const scored = picksData.map(p => {
    let wins = 0
    Object.entries(hypotheticalResults).forEach(([gameId, winner]) => {
      if (p.picks && p.picks[gameId] === winner) wins++
    })
    const tbDiff = tbAnswer !== null ? Math.abs((p.tiebreaker || 0) - tbAnswer) : null
    return { player: p.player, wins, tbDiff, tiebreaker: p.tiebreaker || 0 }
  }).sort((a, b) => b.wins - a.wins)

  const topWins = scored[0]?.wins
  const tied = scored.filter(p => p.wins === topWins)

  if (tied.length === 1) return { winner: tied[0].player, wins: topWins, tiebreaker: null }

  if (tbAnswer !== null) {
    tied.sort((a, b) => a.tbDiff - b.tbDiff)
    const closestDiff = tied[0].tbDiff
    const stillTied = tied.filter(p => p.tbDiff === closestDiff)
    if (stillTied.length === 1) return { winner: stillTied[0].player, wins: topWins, tiebreaker: null }
    return { winner: stillTied.map(p => p.player).join(' & '), wins: topWins, tiebreaker: null }
  }

  // No tiebreaker yet — show cutoff info
  if (tied.length === 2) {
    const a = tied[0]
    const b = tied[1]
    const cutoff = Math.round((a.tiebreaker + b.tiebreaker) / 2)
    const aWinsBelow = a.tiebreaker < b.tiebreaker
    return {
      winner: null,
      wins: topWins,
      tiebreaker: {
        players: [a, b],
        cutoff,
        below: aWinsBelow ? a.player : b.player,
        above: aWinsBelow ? b.player : a.player,
        belowScore: aWinsBelow ? a.tiebreaker : b.tiebreaker,
        aboveScore: aWinsBelow ? b.tiebreaker : a.tiebreaker,
      }
    }
  }

  // 3+ way tie
  const sorted = tied.sort((a, b) => a.tiebreaker - b.tiebreaker)
  return {
    winner: null,
    wins: topWins,
    tiebreaker: { multiway: sorted }
  }
}

export default function Leaderboard() {
  const [rows, setRows] = useState([])
  const [weeklyRows, setWeeklyRows] = useState([])
  const [weeklyWinners, setWeeklyWinners] = useState([])
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK)
  const [weekOptions, setWeekOptions] = useState([])
  const [allPicks, setAllPicks] = useState([])
  const [currentWeekPicks, setCurrentWeekPicks] = useState([])
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('weekly')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [picksRes, weeklyRes, resultsRes] = await Promise.all([
          supabase.from('picks').select('player, week, wins, tiebreaker, picks').eq('season', CURRENT_SEASON),
          supabase.from('archive_weekly').select('*').eq('season', CURRENT_SEASON).order('week', { ascending: true }),
          supabase.from('results').select('*')
        ])

        const picksData = picksRes.data || []
        const weeklyWinnersData = weeklyRes.data || []
        const resultsData = resultsRes.data || []

        setAllPicks(picksData)

        const r = {}
        resultsData.forEach(row => {
          if (!r[row.week]) r[row.week] = {}
          r[row.week][row.game_id] = row.winner
        })
        setResults(r)

        const seasonTotals = {}
        const weeklyTotals = {}
        const weeks = new Set()

        picksData.forEach(row => {
          if (row.wins === null || row.wins === undefined) return
          weeks.add(row.week)
          if (!seasonTotals[row.player]) seasonTotals[row.player] = 0
          seasonTotals[row.player] += row.wins || 0
          if (!weeklyTotals[row.week]) weeklyTotals[row.week] = []
          weeklyTotals[row.week].push({ player: row.player, wins: row.wins || 0, picks: row.picks })
        })

        const weekList = [...weeks].sort((a, b) => b - a)
        setWeekOptions(weekList)

        const seasonStandings = PLAYERS.map(player => ({
          player,
          total: (PRIOR_WINS[player] || 0) + (seasonTotals[player] || 0),
        })).sort((a, b) => b.total - a.total)

        setRows(seasonStandings)

        const latestWeek = weekList[0]
        if (latestWeek && weeklyTotals[latestWeek]) {
          setWeeklyRows(weeklyTotals[latestWeek].sort((a, b) => b.wins - a.wins))
          setSelectedWeek(latestWeek)
        }

        setWeeklyWinners(weeklyWinnersData)

        const cwp = picksData.filter(r => r.week === CURRENT_WEEK)
        setCurrentWeekPicks(cwp)

      } catch (err) {
        console.error('Leaderboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleWeekChange = async (week) => {
    setSelectedWeek(week)
    const { data } = await supabase
      .from('picks')
      .select('player, wins, picks')
      .eq('week', week)
      .eq('season', CURRENT_SEASON)
      .not('wins', 'is', null)
    if (data) setWeeklyRows(data.sort((a, b) => b.wins - a.wins))
  }

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: '#666' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>🦁</div>
      Loading standings...
    </div>
  )

  const medals = ['🥇', '🥈', '🥉']
  const lead = rows[0]?.total || 0
  const last = rows[rows.length - 1]?.total || 0
  const gap = lead - last
  const withinFive = rows.filter(r => lead - r.total <= 5).length

  const weekResults = results[selectedWeek] || {}
  const currentResults = results[CURRENT_WEEK] || {}

  // Build scenario calculator data
  // Only show if SNF/MNF not yet scored
  const snfScored = currentResults[SNF.id]
  const mnfScored = currentResults[MNF.id]
  const showScenarios = currentWeekPicks.length > 0 && (!snfScored || !mnfScored)

  const scenarios = [
    { snf: SNF.away, mnf: MNF.away, label: `${SNF.away} win + ${MNF.away} win` },
    { snf: SNF.away, mnf: MNF.home, label: `${SNF.away} win + ${MNF.home} win` },
    { snf: SNF.home, mnf: MNF.away, label: `${SNF.home} win + ${MNF.away} win` },
    { snf: SNF.home, mnf: MNF.home, label: `${SNF.home} win + ${MNF.home} win` },
  ]

  const scenarioResults = scenarios.map(s => {
    const hypo = {
      ...currentResults,
      [SNF.id]: snfScored || s.snf,
      [MNF.id]: mnfScored || s.mnf,
    }
    const tbAnswer = currentResults.tiebreakerAnswer || null
    const result = calcWeeklyWinner(currentWeekPicks, hypo, tbAnswer)

    // top 3 standings for this scenario
    const scenarioWins = {}
    currentWeekPicks.forEach(p => {
      let wins = 0
      Object.entries(hypo).forEach(([gameId, winner]) => {
        if (p.picks && p.picks[gameId] === winner) wins++
      })
      scenarioWins[p.player] = wins
    })

    const top3 = PLAYERS.map(player => ({
      player,
      total: (PRIOR_WINS[player] || 0) +
        (allPicks.filter(r => r.week !== CURRENT_WEEK && r.wins)
          .reduce((sum, r) => r.player === player ? sum + r.wins : sum, 0)) +
        (scenarioWins[player] || 0)
    })).sort((a, b) => b.total - a.total).slice(0, 3)

    return { ...s, result, top3 }
  })

  const tabStyle = (name) => ({
    flex: 1, padding: '8px', fontSize: 13,
    fontWeight: view === name ? 600 : 400,
    border: '1px solid',
    borderColor: view === name ? 'var(--lions-blue)' : '#ddd',
    borderRadius: 8,
    background: view === name ? 'var(--lions-blue-light)' : '#fff',
    color: view === name ? 'var(--lions-blue)' : '#666',
    cursor: 'pointer',
  })

  const sectionLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', marginBottom: 12,
      textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</div>
  )

  const renderTiebreakerNote = (tb) => {
    if (!tb) return null
    if (tb.multiway) {
      return (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef9c3',
          borderRadius: 8, fontSize: 12, color: '#854d0e' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🎯 Tiebreaker cutoffs (last game combined score):</div>
          {tb.multiway.map((p, i) => (
            i < tb.multiway.length - 1 && (
              <div key={p.player}>
                Under {Math.round((tb.multiway[i].tiebreaker + tb.multiway[i + 1].tiebreaker) / 2)} pts → <strong>{tb.multiway[i].player}</strong> ({tb.multiway[i].tiebreaker})
              </div>
            )
          ))}
          <div>
            {tb.multiway[tb.multiway.length - 1].tiebreaker}+ pts → <strong>{tb.multiway[tb.multiway.length - 1].player}</strong>
          </div>
        </div>
      )
    }
    return (
      <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef9c3',
        borderRadius: 8, fontSize: 12, color: '#854d0e' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🎯 Tiebreaker (last game combined score):</div>
        <div>≤ {tb.cutoff} pts → <strong>{tb.below}</strong> wins (guessed {tb.belowScore})</div>
        <div>&gt; {tb.cutoff} pts → <strong>{tb.above}</strong> wins (guessed {tb.aboveScore})</div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 40 }}>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={tabStyle('weekly')} onClick={() => setView('weekly')}>Weekly</button>
        <button style={tabStyle('season')} onClick={() => setView('season')}>Season</button>
        <button style={tabStyle('winners')} onClick={() => setView('winners')}>Winners</button>
        {showScenarios && (
          <button style={tabStyle('scenarios')} onClick={() => setView('scenarios')}>Scenarios</button>
        )}
      </div>

      {view === 'weekly' && (
        <div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
            {sectionLabel('Week results')}
            {weekOptions.length > 0 ? (
              <>
                <select value={selectedWeek} onChange={e => handleWeekChange(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd',
                    fontSize: 14, marginBottom: 14, background: '#fff' }}>
                  {weekOptions.map(w => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
                {weeklyRows.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: 13, color: '#999', padding: '20px 0' }}>
                    No results yet for week {selectedWeek}.
                  </div>
                ) : weeklyRows.map((row, i) => {
                  const isWinner = i === 0
                  return (
                    <div key={row.player} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px', marginBottom: 4, borderRadius: 8,
                      background: isWinner ? '#f0fdf4' : i % 2 === 0 ? '#fafafa' : '#fff',
                      border: isWinner ? '1px solid #bbf7d0' : '1px solid transparent'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#999', width: 20, textAlign: 'center' }}>{i + 1}</span>
                        {isWinner && <span>🏆</span>}
                        <span style={{ fontSize: 14, fontWeight: isWinner ? 700 : 400 }}>{row.player}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: isWinner ? '#16a34a' : '#111' }}>
                        {row.wins} wins
                      </span>
                    </div>
                  )
                })}
              </>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 13, color: '#999', padding: '20px 0' }}>
                No results yet this season.
              </div>
            )}
          </div>

          {weeklyRows.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px' }}>
              {sectionLabel(`Week ${selectedWeek} picks`)}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                        color: '#fff', background: 'var(--lions-blue)', position: 'sticky',
                        left: 0, minWidth: 80, borderRadius: '8px 0 0 0' }}>Player</th>
                      {GAMES.map(g => (
                        <th key={g.id} style={{ padding: '4px 5px', textAlign: 'center', fontWeight: 600,
                          color: '#fff', background: 'var(--lions-blue)', minWidth: 60, lineHeight: 1.3 }}>
                          <div style={{ fontSize: 9, opacity: 0.8 }}>{g.day.slice(0, 3)}</div>
                          <div>{g.away}</div>
                          <div style={{ opacity: 0.6, fontSize: 9 }}>vs</div>
                          <div>{g.home}</div>
                        </th>
                      ))}
                      <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700,
                        color: '#fff', background: 'var(--lions-blue)', minWidth: 40, borderRadius: '0 8px 0 0' }}>
                        Wins
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyRows.map((row, pi) => (
                      <tr key={row.player} style={{ background: pi % 2 === 0 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 12,
                          position: 'sticky', left: 0, zIndex: 1,
                          background: pi % 2 === 0 ? '#fafafa' : '#fff',
                          borderRight: '2px solid var(--lions-blue)', whiteSpace: 'nowrap' }}>
                          {row.player}
                        </td>
                        {GAMES.map(game => {
                          const pick = row.picks?.[game.id]
                          const result = weekResults[game.id]
                          const won = result && pick === result
                          const lost = result && pick && pick !== result
                          return (
                            <td key={game.id} style={{ padding: '3px', textAlign: 'center' }}>
                              <div style={{
                                padding: '4px 3px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                background: won ? '#f0fdf4' : lost ? '#fef2f2' : '#f3f4f6',
                                color: won ? '#15803d' : lost ? '#dc2626' : '#666',
                                border: `1px solid ${won ? '#bbf7d0' : lost ? '#fecaca' : '#e5e7eb'}`
                              }}>
                                {pick || '—'}
                                {won ? ' ✓' : lost ? ' ✗' : ''}
                              </div>
                            </td>
                          )
                        })}
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700,
                          color: 'var(--lions-blue)', fontSize: 13 }}>
                          {row.wins}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'season' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--lions-silver-dark)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season gap</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--lions-blue)' }}>{gap}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>wins 1st to last</div>
            </div>
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--lions-silver-dark)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Within 5 wins</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--lions-blue)' }}>{withinFive}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>players in contention</div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px' }}>
            {sectionLabel(`${CURRENT_SEASON} season standings`)}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {rows.slice(0, 3).map((row, i) => (
                <div key={row.player} style={{
                  flex: 1, borderRadius: 10, padding: '12px 8px', textAlign: 'center',
                  background: i === 0 ? '#fefce8' : i === 1 ? 'var(--lions-blue-light)' : '#f9fafb',
                  border: `1px solid ${i === 0 ? '#fde68a' : i === 1 ? 'var(--lions-blue)' : '#e5e5e5'}`
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{medals[i]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{row.player}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4,
                    color: i === 0 ? '#92400e' : i === 1 ? 'var(--lions-blue)' : '#374151' }}>{row.total}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>wins</div>
                </div>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: 11 }}>#</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: 11 }}>Player</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#666', fontSize: 11 }}>Wins</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#666', fontSize: 11 }}>Gap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.player} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <td style={{ padding: '10px 10px', color: '#999', fontWeight: 500 }}>{i + 1}</td>
                    <td style={{ padding: '10px 10px', fontWeight: i < 3 ? 700 : 400 }}>{row.player}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>{row.total}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12,
                      color: i === 0 ? '#16a34a' : '#dc2626' }}>
                      {i === 0 ? '—' : `-${lead - row.total}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'winners' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px' }}>
          {sectionLabel(`${CURRENT_SEASON} weekly winners`)}
          {weeklyWinners.length === 0 ? (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#999', padding: '20px 0' }}>
              No weekly winners recorded yet.
            </div>
          ) : weeklyWinners.map((w, i) => (
            <div key={w.week} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px', marginBottom: 4, borderRadius: 8,
              background: i % 2 === 0 ? '#fafafa' : '#fff'
            }}>
              <span style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>Week {w.week}</span>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>🏆 {w.winner}</span>
                <span style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>({w.wins} wins)</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'scenarios' && (
        <div>
          <div style={{ background: 'var(--lions-blue-light)', borderRadius: 12,
            border: '1px solid var(--lions-blue)', padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--lions-blue-dark)' }}>
              🔮 Scenario calculator — Week {CURRENT_WEEK}
            </div>
            <div style={{ fontSize: 12, color: 'var(--lions-blue-dark)', marginTop: 4 }}>
              Showing 4 possible outcomes for {SNF.away} vs {SNF.home} ({SNF.time})
              and {MNF.away} vs {MNF.home} ({MNF.time})
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {scenarioResults.map((s, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 12,
                border: '1px solid #e0e4e8', padding: '14px', overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff',
                  background: 'var(--lions-blue)', margin: '-14px -14px 12px',
                  padding: '8px 14px', lineHeight: 1.4 }}>
                  {s.label}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--lions-silver-dark)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Weekly winner
                  </div>
                  {s.result.winner ? (
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>
                      🏆 {s.result.winner}
                      <span style={{ fontSize: 12, color: '#999', fontWeight: 400, marginLeft: 4 }}>
                        ({s.result.wins} wins)
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#854d0e' }}>
                      🤝 Tiebreaker needed
                    </div>
                  )}
                  {renderTiebreakerNote(s.result.tiebreaker)}
                </div>

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--lions-silver-dark)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Season top 3
                  </div>
                  {s.top3.map((r, j) => (
                    <div key={r.player} style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
                      <span style={{ fontWeight: j === 0 ? 700 : 400 }}>
                        {['🥇', '🥈', '🥉'][j]} {r.player}
                      </span>
                      <span style={{ fontWeight: 700, color: j === 0 ? 'var(--lions-blue)' : '#666' }}>
                        {r.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}