import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CURRENT_WEEK, CURRENT_SEASON, PLAYERS, GAMES, LIONS_GAME_ID } from '../lib/constants'

export default function Picks() {
  const [player, setPlayer] = useState('')
  const [picks, setPicks] = useState({})
  const [tiebreaker, setTiebreaker] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState({})
  const [allPicks, setAllPicks] = useState([])
  const [gamesLocked, setGamesLocked] = useState(false)

  useEffect(() => {
    const fetchResults = async () => {
      const { data } = await supabase
        .from('results')
        .select('*')
        .eq('week', CURRENT_WEEK)
      if (data && data.length > 0) {
        const r = {}
        data.forEach(row => { r[row.game_id] = row.winner })
        setResults(r)
        setGamesLocked(true)
      }
    }
    const fetchAllPicks = async () => {
      const { data } = await supabase
        .from('picks')
        .select('*')
        .eq('week', CURRENT_WEEK)
      if (data) setAllPicks(data)
    }
    fetchResults()
    fetchAllPicks()
  }, [])

  useEffect(() => {
    if (!player) return
    const existing = allPicks.find(r => r.player === player)
    if (existing) {
      setPicks(existing.picks)
      setTiebreaker(existing.tiebreaker?.toString() || '')
      setSubmitted(true)
    } else {
      setPicks({})
      setTiebreaker('')
      setSubmitted(false)
    }
  }, [player, allPicks])

  const handlePick = (gameId, team) => {
    if (gamesLocked) return
    setPicks(prev => ({ ...prev, [gameId]: team }))
  }

  const allPicked = GAMES.every(g => picks[g.id])

  const handleSubmit = async () => {
    if (!player) { alert('Please select your name first!'); return }
    if (!allPicked) { alert('Please make a pick for every game!'); return }
    if (!tiebreaker) { alert('Please enter a tiebreaker score!'); return }

    setLoading(true)
    setError('')

    const { error } = await supabase
      .from('picks')
      .upsert({
        player,
        week: CURRENT_WEEK,
        season: CURRENT_SEASON,
        picks,
        tiebreaker: parseInt(tiebreaker),
        updated_at: new Date().toISOString()
      }, { onConflict: 'player,week' })

    setLoading(false)
    if (error) {
      setError('Something went wrong saving your picks. Please try again!')
      console.error(error)
    } else {
      setSubmitted(true)
      const { data } = await supabase.from('picks').select('*').eq('week', CURRENT_WEEK)
      if (data) setAllPicks(data)
    }
  }

  const getPickStyle = (gameId, team) => {
    const selected = picks[gameId] === team
    const hasResult = results[gameId]
    if (hasResult) {
      const won = results[gameId] === team
      const wasPicked = picks[gameId] === team
      if (wasPicked && won) return { bg: '#f0fdf4', border: '#16a34a', color: '#15803d', fw: 700 }
      if (wasPicked && !won) return { bg: '#fef2f2', border: '#dc2626', color: '#dc2626', fw: 700 }
      if (!wasPicked && won) return { bg: '#f0fdf4', border: '#16a34a', color: '#15803d', fw: 400 }
      return { bg: '#fff', border: '#ddd', color: '#999', fw: 400 }
    }
    if (selected) return { bg: 'var(--lions-blue-light)', border: 'var(--lions-blue)', color: 'var(--lions-blue)', fw: 600 }
    return { bg: '#fff', border: '#ddd', color: '#111', fw: 400 }
  }

  const groupedGames = GAMES.reduce((acc, game) => {
    const time = game.time.split(' ')[0]
    if (!acc[time]) acc[time] = []
    acc[time].push(game)
    return acc
  }, {})

  if (gamesLocked && submitted) {
    return (
      <div style={{ paddingTop: 20, paddingBottom: 40 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Your picks — Week {CURRENT_WEEK}
          </div>
          {GAMES.map((game, i) => {
            const s = getPickStyle(game.id, picks[game.id])
            const won = results[game.id] && results[game.id] === picks[game.id]
            const lost = results[game.id] && results[game.id] !== picks[game.id]
            return (
              <div key={game.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: i < GAMES.length - 1 ? '1px solid #f0f0f0' : 'none', fontSize: 13 }}>
                <span style={{ color: '#666' }}>{game.away} vs {game.home}</span>
                <span style={{ fontWeight: 600, color: won ? '#15803d' : lost ? '#dc2626' : '#111' }}>
                  {picks[game.id]} {won ? '✓' : lost ? '✗' : ''}
                </span>
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 13 }}>
            <span style={{ color: '#666' }}>Tiebreaker</span>
            <span style={{ fontWeight: 600 }}>{tiebreaker}</span>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 4 }}>
          Everyone's picks
        </div>
        {allPicks.map(row => (
          <div key={row.player} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '12px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{row.player}</span>
              {row.wins !== null && row.wins !== undefined &&
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lions-blue)' }}>{row.wins} wins</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {GAMES.map(game => {
                const pick = row.picks[game.id]
                const won = results[game.id] && results[game.id] === pick
                const lost = results[game.id] && results[game.id] !== pick
                return (
                  <span key={game.id} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 500,
                    background: won ? '#f0fdf4' : lost ? '#fef2f2' : '#f3f4f6',
                    color: won ? '#15803d' : lost ? '#dc2626' : '#555',
                    border: `1px solid ${won ? '#bbf7d0' : lost ? '#fecaca' : '#e5e7eb'}`
                  }}>{pick}</span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 40 }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your name</label>
        <select value={player} onChange={e => setPlayer(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, background: '#fff' }}>
          <option value=''>Select your name...</option>
          {PLAYERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {Object.entries(groupedGames).map(([day, games]) => (
        <div key={day} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {day === 'Sat' ? 'Saturday' : day === 'Sun' ? 'Sunday' : day}
          </div>
          {games.map((game, i) => {
            const awayStyle = getPickStyle(game.id, game.away)
            const homeStyle = getPickStyle(game.id, game.home)
            const isLionsGame = game.id === LIONS_GAME_ID
            return (
              <div key={game.id}>
                {i > 0 && <div style={{ height: 1, background: '#f0f0f0', margin: '10px 0' }} />}
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                  {game.time} · {game.spread}
                  {isLionsGame && <span style={{ marginLeft: 6, color: 'var(--lions-blue)', fontWeight: 700 }}>🦁 Lions game</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ team: game.away, style: awayStyle }, { team: game.home, style: homeStyle }].map(({ team, style }) => (
                    <button key={team} onClick={() => handlePick(game.id, team)}
                      disabled={gamesLocked}
                      style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: `1px solid ${style.border}`,
                        fontSize: 14, fontWeight: style.fw, background: style.bg, color: style.color,
                        cursor: gamesLocked ? 'default' : 'pointer' }}>
                      {team}
                      {results[game.id] === team ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e4e8', padding: '16px 20px', marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--lions-blue)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Tiebreaker — total score of last game
        </label>
        <input type='number' value={tiebreaker} onChange={e => setTiebreaker(e.target.value)}
          disabled={gamesLocked}
          placeholder='e.g. 47'
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }} />
      </div>

      {error && <p style={{ color: 'red', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>{error}</p>}

      {!gamesLocked && (
        <>
          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: allPicked && player && tiebreaker && !loading ? 'var(--lions-blue)' : '#ccc',
              color: '#fff', fontSize: 16, fontWeight: 700 }}>
            {loading ? 'Saving...' : submitted ? 'Update picks' : 'Submit picks'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#999', marginTop: 10 }}>
            {Object.keys(picks).length} of {GAMES.length} games picked
          </p>
        </>
      )}

      {gamesLocked && !submitted && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: 14 }}>
          Games are locked — picks can no longer be submitted.
        </div>
      )}
    </div>
  )
}