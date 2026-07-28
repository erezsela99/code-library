import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import GameCard from '../components/GameCard'

const SORT_OPTIONS = [
  { value: 'title', label: 'Title' },
  { value: 'platform', label: 'Platform' },
  { value: 'playtime', label: 'Playtime' },
  { value: 'last_played', label: 'Last Played' },
]

const PLATFORM_FILTERS = ['All', 'Steam', 'GOG', 'Epic', 'Rockstar', 'Local']

export default function LibraryPage({ games, onScan, loading, refreshGames }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('title')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newGame, setNewGame] = useState({ title: '', platform: 'Local', exe_path: '', install_path: '' })
  const [fetchingCovers, setFetchingCovers] = useState(false)
  const fetchingRef = useRef(false)
  const abortRef = useRef(false)

  const fetchMissingCovers = useCallback(async () => {
    if (!window.electronAPI?.sgdb || fetchingRef.current) return
    const sgdbKey = await window.electronAPI.db.getSetting('sgdb_api_key')
    if (!sgdbKey) return

    const missing = games.filter(g => !g.sgdb_cover_url)
    if (missing.length === 0) return

    fetchingRef.current = true
    setFetchingCovers(true)
    abortRef.current = false

    for (const game of missing) {
      if (abortRef.current) break
      try {
        let gameData = null
        let steamId = game.steam_app_id
        if (!steamId && game.cover_url) {
          const match = game.cover_url.match(/\/steam\/apps\/(\d+)\//)
          if (match) steamId = match[1]
        }
        if (steamId) {
          gameData = await window.electronAPI.sgdb.searchBySteam(steamId, sgdbKey)
        }
        if (!gameData) {
          gameData = await window.electronAPI.sgdb.searchByName(game.title, sgdbKey)
        }
        if (gameData) {
          const grids = await window.electronAPI.sgdb.getGrids(gameData.id, sgdbKey)
          if (grids.length > 0) {
            await window.electronAPI.db.updateGame(game.id, { sgdb_cover_url: grids[0].url })
            game.sgdb_cover_url = grids[0].url
          }
        }
      } catch (e) {
        console.error(`SGDB fetch failed for ${game.title}:`, e.message)
      }
      await new Promise(r => setTimeout(r, 1000))
    }

    fetchingRef.current = false
    setFetchingCovers(false)
    refreshGames()
  }, [games, refreshGames])

  useEffect(() => {
    if (games.length > 0) fetchMissingCovers()
    return () => { abortRef.current = true }
  }, [games.length])

  const filteredGames = useMemo(() => {
    let result = [...games]
    if (platformFilter !== 'All') {
      result = result.filter(g => g.platform === platformFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(g => g.title.toLowerCase().includes(q))
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title': return a.title.localeCompare(b.title)
        case 'platform': return a.platform.localeCompare(b.platform)
        case 'playtime': return (b.playtime_minutes || 0) - (a.playtime_minutes || 0)
        case 'last_played': return (b.last_played || '').localeCompare(a.last_played || '')
        default: return 0
      }
    })
    return result
  }, [games, search, sortBy, platformFilter])

  const handleAddGame = async () => {
    if (!newGame.title.trim()) return
    await window.electronAPI.db.addGame({
      title: newGame.title.trim(),
      platform: newGame.platform,
      exe_path: newGame.exe_path || null,
      install_path: newGame.install_path || null,
      cover_url: null,
      banner_url: null,
    })
    setNewGame({ title: '', platform: 'Local', exe_path: '', install_path: '' })
    setShowAddModal(false)
    await refreshGames()
  }

  const handleSelectExe = async () => {
    const path = await window.electronAPI.dialog.openFile([{ name: 'Executables', extensions: ['exe'] }])
    if (path) {
      const name = path.split('\\').pop().replace('.exe', '')
      setNewGame(prev => ({ ...prev, exe_path: path, title: prev.title || name }))
    }
  }

  const handleSelectDir = async () => {
    const path = await window.electronAPI.dialog.openDirectory()
    if (path) setNewGame(prev => ({ ...prev, install_path: path }))
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Library</h1>
          <p className="text-sm text-cl-text-dim mt-1">
            {filteredGames.length} game{filteredGames.length !== 1 ? 's' : ''}
            {fetchingCovers && (
              <span className="ml-2 text-cl-accent animate-pulse-glow">
                · Fetching artwork...
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Game
          </button>
          <button onClick={() => onScan()} disabled={loading} className="btn-secondary text-sm">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cl-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="input-field w-auto min-w-[140px]"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="flex gap-1 glass rounded-xl p-1">
          {PLATFORM_FILTERS.map(p => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                platformFilter === p
                  ? 'bg-cl-accent text-white shadow-glow'
                  : 'text-cl-text-dim hover:text-cl-text hover:bg-cl-border/30'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Add Game Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md space-y-4 animate-scale-in shadow-glass-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold gradient-text">Add Game Manually</h2>

            <div>
              <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Game Title *</label>
              <input
                type="text"
                value={newGame.title}
                onChange={(e) => setNewGame(prev => ({ ...prev, title: e.target.value }))}
                className="input-field"
                placeholder="My Game"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Platform</label>
              <select
                value={newGame.platform}
                onChange={(e) => setNewGame(prev => ({ ...prev, platform: e.target.value }))}
                className="input-field"
              >
                {['Local', 'Steam', 'GOG', 'Epic', 'Rockstar'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Executable</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGame.exe_path}
                  onChange={(e) => setNewGame(prev => ({ ...prev, exe_path: e.target.value }))}
                  className="input-field flex-1"
                  placeholder="C:\Games\game.exe"
                />
                <button onClick={handleSelectExe} className="btn-secondary text-sm">Browse</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Install Directory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGame.install_path}
                  onChange={(e) => setNewGame(prev => ({ ...prev, install_path: e.target.value }))}
                  className="input-field flex-1"
                  placeholder="C:\Games\MyGame"
                />
                <button onClick={handleSelectDir} className="btn-secondary text-sm">Browse</button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleAddGame} disabled={!newGame.title.trim()} className="btn-primary text-sm disabled:opacity-40">Add Game</button>
            </div>
          </div>
        </div>
      )}

      {/* Game Grid */}
      {filteredGames.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
          <div className="w-24 h-24 rounded-3xl glass flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-cl-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-cl-text mb-2">No games found</h3>
          <p className="text-sm text-cl-text-dim max-w-sm mb-6">
            Click "Scan for Games" to auto-detect your library, or add games manually.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowAddModal(true)} className="btn-primary">Add Game</button>
            <button onClick={() => onScan()} disabled={loading} className="btn-secondary">Scan for Games</button>
          </div>
        </div>
      ) : loading && filteredGames.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden">
              <div className="aspect-[16/9] skeleton" />
              <div className="p-3.5 space-y-2">
                <div className="h-4 skeleton rounded w-3/4" />
                <div className="h-3 skeleton rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredGames.map((game, i) => (
            <div key={game.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
              <GameCard game={game} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
