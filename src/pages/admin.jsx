import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CURRENT_WEEK, CURRENT_SEASON, PLAYERS, GAMES } from '../lib/constants'

const ADMIN_PASSWORD = 'pickem2025'

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const [picks, setPicks] = useState({})
  const [tiebreakers, setTiebreakers] = useState({})
  const [winners, setWinners] = useState({})
  const [tiebreakerAnswer, setTiebreakerAnswer] = useState('')
  const [weeklyWinners, setWeeklyWinners] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingResults, setSavingResults] = useState(false)
  const [savedResults, setSavedResults] = useState(false)
  const [tab, setTab] = useState('picks')

 useEffect(() => {
  if (!authed) return
  const fetchData = async () => {
    // Load existing picks for this week
    const { data: picksData } = await supabase
      .from('picks')
      .select('*')
      .eq('week', CURRENT_WEEK)
      .eq('season', CURRENT_SEASON)

    if (picksData) {
      const p = {}
      const t = {}
      picksData.forEach(row => {
        p[row.player] = row.picks || {}
        t[row.player] = row.tiebreaker?.toString() || ''
      })
      setPicks(p)
      setTiebreakers(t)
    }

    // Load existing results
    const { data: resultsData } = await supabase
      .from('results')
      .select('*')
      .eq('week', CURRENT_WEEK)

    if (resultsData) {
      const w = {}
      resultsData.forEach(r => { w[r.game_id] = r.winner })
      setWinners(w)
      const tb = resultsData.find(r => r.tiebreaker_answer !== null)
      if (tb) setTiebreakerAnswer(tb.tiebreaker_answer.toString())
      else setTiebreakerAnswer('')
    }

    // Load weekly winners
    const { data: weeklyData } = await supabase
      .from('archive_weekly')
      .select('*')
      .eq('season', CURRENT_SEASON)
      .order('week', { ascending: true })
    if (weeklyData) setWeeklyWinners(weeklyData)
  }
  fetchData()
}, [authed, tab])

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) { setAuthed(true); setWrongPassword(false) }
    else setWrongPassword(true)
  }

  const handlePickToggle = (player, gameId) => {
    const game = GAMES.find(g => g.id === gameId)
    const current = picks[player]?.[gameId]
    let next
    if (!current) next = game.away
    else if (current === game.away) next = game.home
    else next = null

    setPicks(prev => ({
      ...prev,
      [player]: { ...(prev[player] || {}), [gameId]: next }
    }))
  }

  const handleTiebreaker = (player, value) => {
    setTiebreakers(prev => ({ ...prev, [player]: value }))
  }

  const handleSavePicks = async () => {
    setSaving(true)
    setSaved(false)

    for (const player of PLAYERS) {
      const playerPicks = picks[player] || {}
      const tb = tiebreakers[player] ? parseInt(tiebreakers[player]) : null

      await supabase
        .from('picks')
        .upsert({
          player,
          week: CURRENT_WEEK,
          season: CURRENT_SEASON,
          picks: playerPicks,
          tiebreaker: tb,
          updated_at: new Date().toISOString()
        }, { onConflict: 'player,week' })
    }

    setSaving(false)
    setSaved(true)
  }

  const handleWinnerToggle = (gameId, team) => {
    setWinners(prev => {
      if (prev[gameId] === team) {
        const next = { ...prev }
        delete next[gameId]
        return next
      }
      return { ...prev, [gameId]: team }
    })
  }

const handleSaveResults = async () => {
  setSavingResults(true)
  setSavedResults(false)

  const lastGame = GAMES[GAMES.length - 1]
  const tbAnswer = tiebreakerAnswer ? parseInt(tiebreakerAnswer) : null

  // Delete all existing results for this week first
  await supabase
    .from('results')
    .delete()
    .eq('week', CURRENT_WEEK)

  // Insert only currently selected winners
  if (Object.keys(winners).length > 0) {
    const resultRows = Object.entries(winners).map(([gameId, winner]) => ({
      week: CURRENT_WEEK,
      game_id: parseInt(gameId),
      winner,
      tiebreaker_answer: parseInt(gameId) === lastGame.id ? tbAnswer : null
    }))
    await supabase.from('results').insert(resultRows)
  }

  // Recalculate wins for all players based on current winners only
  const { data: allPicksData } = await supabase
    .from('picks')
    .select('*')
    .eq('week', CURRENT_WEEK)
    .eq('season', CURRENT_SEASON)

  if (allPicksData) {
    for (const row of allPicksData) {
      let wins = 0
      Object.entries(winners).forEach(([gameId, winner]) => {
        if (row.picks[gameId] === winner) wins++
      })
      await supabase
        .from('picks')
        .update({ wins })
        .eq('player', row.player)
        .eq('week', CURRENT_WEEK)
    }

    // Only determine weekly winner if all games scored
    if (Object.keys(winners).length === GAMES.length) {
      const scored = allPicksData.map(p => {
        let wins = 0
        Object.entries(winners).forEach(([gameId, winner]) => {
          if (p.picks[gameId] === winner) wins++
        })
        const tbDiff = tbAnswer ? Math.abs(p.tiebreaker - tbAnswer) : 999
        return { player: p.player, wins, tbDiff }
      }).sort((a, b) => b.wins - a.wins || a.tbDiff - b.tbDiff)

      const topWins = scored[0]?.wins
      const topPlayers = scored.filter(p => p.wins === topWins)
      const isTied = topPlayers.every(p => p.tbDiff === topPlayers[0].tbDiff)
      const winnerStr = topPlayers.length > 1 && isTied
        ? topPlayers.map(p => p.player).join(' & ')
        : scored[0].player

      const existing = weeklyWinners.find(w => w.week === CURRENT_WEEK)
      if (existing) {
        await supabase
          .from('archive_weekly')
          .update({ winner: winnerStr, wins: topWins })
          .eq('season', CURRENT_SEASON)
          .eq('week', CURRENT_WEEK)
      } else {
        await supabase
          .from('archive_weekly')
          .insert({ season: CURRENT_SEASON, week: CURRENT_WEEK, winner: winnerStr, wins: topWins })
      }

      const { data: weeklyData } = await supabase
        .from('archive_weekly')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .order('week', { ascending: true })
      if (weeklyData) setWeeklyWinners(weeklyData)
    } else {
      // If not all games scored remove weekly winner entry if it exists
      await supabase
        .from('archive_weekly')
        .delete()
        .eq('season', CURRENT_SEASON)
        .eq('week', CURRENT_WEEK)
      const { data: weeklyData } = await supabase
        .from('archive_weekly')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .order('week', { ascending: true })
      if (weeklyData) setWeeklyWinners(weeklyData)
    }
  }

  setSavingResults(false)
  setSavedResults(true)
}

  const card = (children) => (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
      {children}
    </div>
  )

  const sectionLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', marginBottom: 12,
      textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</div>
  )

  const tabStyle = (name) => ({
    flex: 1, padding: '8px', fontSize: 13,
    fontWeight: tab === name ? 600 : 400,
    border: '1px solid',
    borderColor: tab === name ? 'var(--lions-blue)' : '#ddd',
    borderRadius: 8,
    background: tab === name ? 'var(--lions-blue-light)' : '#fff',
    color: tab === name ? 'var(--lions-blue)' : '#666',
    cursor: 'pointer',
  })

  if (!authed) {
    return (
      <div style={{ paddingTop: 40, maxWidth: 320, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>Admin login</h2>
        {card(<>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
          <input type='password' value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder='Enter password'
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, marginBottom: 12 }} />
          {wrongPassword && <p style={{ color: 'red', fontSize: 13, marginBottom: 12 }}>Incorrect password, try again.</p>}
          <button onClick={handleLogin}
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--lions-blue)', color: '#fff', fontSize: 15, fontWeight: 600 }}>
            Log in
          </button>
        </>)}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={tabStyle('picks')} onClick={() => setTab('picks')}>Enter picks</button>
        <button style={tabStyle('results')} onClick={() => setTab('results')}>Enter results</button>
        <button style={tabStyle('winners')} onClick={() => setTab('winners')}>Weekly winners</button>
      </div>

      {tab === 'picks' && (
        <>
          {card(<>
            {sectionLabel(`Week ${CURRENT_WEEK} — enter all picks`)}
            <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
              Click a cell to cycle: blank → away team → home team → blank. Fill in tiebreaker number at the end of each row.
            </p>
            <div style={{ overflowX: 'auto', marginLeft: -4, marginRight: -4 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                      color: '#fff', background: 'var(--lions-blue)', position: 'sticky',
                      left: 0, zIndex: 2, minWidth: 80, borderRadius: '8px 0 0 0' }}>
                      Player
                    </th>
                    {GAMES.map(g => (
                    <th key={g.id} style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600,
                      color: '#fff', background: 'var(--lions-blue)', minWidth: 72, lineHeight: 1.3 }}>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{g.day.slice(0, 3)} {g.time.split(' ')[1]}</div>
                      <div>{g.away}</div>
                      <div style={{ opacity: 0.7 }}>vs</div>
                      <div>{g.home}</div>
                    </th>
                    ))}
                    <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700,
                      color: '#fff', background: 'var(--lions-blue)', minWidth: 72, borderRadius: '0 8px 0 0' }}>
                      TB #
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PLAYERS.map((player, pi) => (
                    <tr key={player} style={{ background: pi % 2 === 0 ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 13,
                        position: 'sticky', left: 0, zIndex: 1,
                        background: pi % 2 === 0 ? '#fafafa' : '#fff',
                        borderRight: '2px solid var(--lions-blue)', whiteSpace: 'nowrap' }}>
                        {player}
                      </td>
                      {GAMES.map(game => {
                        const pick = picks[player]?.[game.id] ?? picks[player]?.[String(game.id)]
                        const isAway = pick === game.away
                        const isHome = pick === game.home
                        return (
                          <td key={game.id} style={{ padding: '4px', textAlign: 'center' }}>
                          <button onClick={() => handlePickToggle(player, game.id)}
                            style={{ width: '100%', padding: '5px 3px', borderRadius: 6, border: '1px solid',
                              fontSize: 11, fontWeight: pick ? 700 : 400, cursor: 'pointer',
                              borderColor: isAway ? '#0076B6' : isHome ? '#e85d04' : '#ddd',
                              background: isAway ? '#0076B6' : isHome ? '#e85d04' : '#fff',
                              color: isAway || isHome ? '#fff' : '#bbb',
                              minWidth: 64 }}>
                            {pick || '—'}
                          </button>
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 6px' }}>
                        <input
                          type='number'
                          value={tiebreakers[player] || ''}
                          onChange={e => handleTiebreaker(player, e.target.value)}
                          placeholder='—'
                          style={{ width: 64, padding: '5px 6px', borderRadius: 6,
                            border: '1px solid #ddd', fontSize: 12, textAlign: 'center' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          <button onClick={handleSavePicks} disabled={saving}
            style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: saving ? '#ccc' : 'var(--lions-blue)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
            {saving ? 'Saving...' : 'Save all picks'}
          </button>
          {saved && <p style={{ textAlign: 'center', color: '#16a34a', fontSize: 14, marginTop: 10 }}>✓ All picks saved!</p>}
        </>
      )}

      {tab === 'results' && (
        <>
          {card(<>
            {sectionLabel(`Week ${CURRENT_WEEK} results — enter as games finish`)}
            <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
              Select winners as games finish. Save partial results and come back. Tiebreaker only needed when all games are done.
            </p>
            {GAMES.map((game, i) => (
              <div key={game.id}>
                {i > 0 && <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />}
                <div style={{ fontSize: 11, color: '#999', marginBottom: 5 }}>
                  {game.time} · {game.away} vs {game.home}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[game.away, game.home].map(team => (
                    <button key={team} onClick={() => handleWinnerToggle(game.id, team)}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid', fontSize: 13,
                        fontWeight: winners[game.id] === team ? 700 : 400,
                        borderColor: winners[game.id] === team ? '#16a34a' : '#ddd',
                        background: winners[game.id] === team ? '#f0fdf4' : '#fff',
                        color: winners[game.id] === team ? '#16a34a' : '#111' }}>
                      {team} {winners[game.id] === team ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', display: 'block',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tiebreaker — actual total score of last game
              </label>
              <input type='number' value={tiebreakerAnswer} onChange={e => setTiebreakerAnswer(e.target.value)}
                placeholder='e.g. 47'
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 14 }} />
            </div>

            <button onClick={handleSaveResults} disabled={savingResults}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: savingResults ? '#ccc' : 'var(--lions-blue)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
              {savingResults ? 'Saving...' : `Save results (${Object.keys(winners).length}/${GAMES.length} games scored)`}
            </button>
            {savedResults && <p style={{ textAlign: 'center', color: '#16a34a', fontSize: 14, marginTop: 10 }}>✓ Results saved! Leaderboard updated.</p>}
          </>)}
        </>
      )}

      {tab === 'winners' && (
        card(<>
          {sectionLabel(`${CURRENT_SEASON} weekly winners`)}
          {weeklyWinners.length === 0 ? (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#999', padding: '20px 0' }}>
              No weekly winners recorded yet.
            </div>
          ) : weeklyWinners.map((w, i) => (
            <div key={w.week} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px', marginBottom: 4, borderRadius: 8,
              background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
              <span style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>Week {w.week}</span>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>🏆 {w.winner}</span>
                <span style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>({w.wins} wins)</span>
              </div>
            </div>
          ))}
        </>)
      )}
    </div>
  )
}