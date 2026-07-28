import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const PLATFORM_COLORS = {
  Steam: '#1b2838',
  GOG: '#86328a',
  Epic: '#2f2f2f',
  Rockstar: '#f5a623',
  Local: '#00d2a0',
}

export default function GameDetailPage({ refreshGames }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [mods, setMods] = useState([])
  const [nexusModCount, setNexusModCount] = useState(null)
  const [launchMode, setLaunchMode] = useState('vanilla')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const [steamInfo, setSteamInfo] = useState(null)
  const [rawgInfo, setRawgInfo] = useState(null)
  const [sgdbHero, setSgdbHero] = useState(null)
  const [sgdbGrids, setSgdbGrids] = useState([])
  const [sgdbLogos, setSgdbLogos] = useState([])
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [activeTrailer, setActiveTrailer] = useState(null)
  const [showTrailer, setShowTrailer] = useState(false)
  const [screenshotIdx, setScreenshotIdx] = useState(0)
  const [expandedDesc, setExpandedDesc] = useState(false)
  const [checkingHealth, setCheckingHealth] = useState(false)

  useEffect(() => {
    loadGame()
  }, [id])

  const loadGame = async () => {
    if (!window.electronAPI) return
    setLoadingInfo(true)
    setSteamInfo(null)
    setRawgInfo(null)
    setSgdbHero(null)
    setSgdbGrids([])
    setSgdbLogos([])
    const data = await window.electronAPI.db.getGame(parseInt(id))
    setGame(data)
    setEditForm(data || {})
    const gameMods = await window.electronAPI.db.getMods(parseInt(id))
    setMods(gameMods)
    if (data) fetchNexusModCount(data)
    if (data) fetchGameInfo(data)
    setLoadingInfo(false)
  }

  const fetchNexusModCount = async (g) => {
    const apiKey = await window.electronAPI.db.getSetting('nexus_api_key')
    if (!apiKey) return
    const savedSlug = g.nexus_slug || await window.electronAPI.db.getSetting(`nexus_slug_${g.id}`)
    let slug = savedSlug
    if (!slug) {
      slug = await window.electronAPI.nexus.findSlug(apiKey, g.title)
    }
    if (!slug) return
    const count = await window.electronAPI.nexus.getModCount(apiKey, slug)
    setNexusModCount(count)
  }

  const handleCheckHealth = async () => {
    const apiKey = await window.electronAPI.db.getSetting('nexus_api_key')
    if (!apiKey || !mods.length) return
    setCheckingHealth(true)
    try {
      const results = await window.electronAPI.db.checkHealth(parseInt(id), apiKey)
      setMods(results)
    } catch {}
    setCheckingHealth(false)
  }

  const fetchGameInfo = async (g) => {
    let steamId = g.steam_app_id
    if (!steamId && g.cover_url) {
      const match = g.cover_url.match(/\/steam\/apps\/(\d+)\//)
      if (match) {
        steamId = match[1]
        await window.electronAPI.db.updateGame(g.id, { steam_app_id: steamId })
      }
    }
    if (steamId && window.electronAPI.gameInfo) {
      try {
        const info = await window.electronAPI.gameInfo.getSteamInfo(steamId)
        if (info) setSteamInfo(info)
      } catch (e) { console.error('Steam info error:', e) }
    }
    const rawgKey = await window.electronAPI.db.getSetting('rawg_api_key')
    if (rawgKey && window.electronAPI.gameInfo) {
      try {
        const info = await window.electronAPI.gameInfo.searchRawg(g.title, rawgKey)
        if (info) setRawgInfo(info)
      } catch (e) { console.error('RAWG info error:', e) }
    }

    const sgdbKey = await window.electronAPI.db.getSetting('sgdb_api_key')
    if (sgdbKey && window.electronAPI.sgdb) {
      try {
        let gameData = null
        if (steamId) {
          gameData = await window.electronAPI.sgdb.searchBySteam(steamId, sgdbKey)
        }
        if (!gameData) {
          gameData = await window.electronAPI.sgdb.searchByName(g.title, sgdbKey)
        }
        if (gameData) {
          const [heroes, grids, logos] = await Promise.all([
            window.electronAPI.sgdb.getHeroes(gameData.id, sgdbKey),
            window.electronAPI.sgdb.getGrids(gameData.id, sgdbKey),
            window.electronAPI.sgdb.getLogos(gameData.id, sgdbKey),
          ])
          if (heroes.length > 0) setSgdbHero(heroes[0])
          if (grids.length > 0) {
            setSgdbGrids(grids)
            const bestGrid = grids[0].url
            if (!g.sgdb_cover_url) {
              await window.electronAPI.db.updateGame(g.id, { sgdb_cover_url: bestGrid })
            }
          }
          if (logos.length > 0) setSgdbLogos(logos)
        }
      } catch (e) { console.error('SGDB info error:', e) }
    }
  }

  const handleLaunch = async () => {
    if (!game?.exe_path) return
    await window.electronAPI.scanner.launchGame(game)
    const updated = { ...game, playtime_minutes: (game.playtime_minutes || 0) + 1 }
    await window.electronAPI.db.updateGame(game.id, { playtime_minutes: updated.playtime_minutes, last_played: new Date().toISOString() })
    setGame(updated)
  }

  const handleSave = async () => {
    await window.electronAPI.db.updateGame(game.id, editForm)
    setIsEditing(false)
    await loadGame()
    await refreshGames()
  }

  const handleDelete = async () => {
    if (!confirm('Remove this game from your library?')) return
    await window.electronAPI.db.deleteGame(game.id)
    await refreshGames()
    navigate('/')
  }

  const handleSelectExe = async () => {
    const path = await window.electronAPI.dialog.openFile([{ name: 'Executables', extensions: ['exe'] }])
    if (path) setEditForm(prev => ({ ...prev, exe_path: path }))
  }

  const handleSelectDir = async () => {
    const path = await window.electronAPI.dialog.openDirectory()
    if (path) setEditForm(prev => ({ ...prev, install_path: path }))
  }

  const handleOpenDir = () => {
    if (game?.install_path) {
      window.electronAPI.shell.showItemInFolder(game.install_path)
    }
  }

  const formatPlaytime = (minutes) => {
    if (!minutes) return '0h 0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getAllScreenshots = () => {
    const shots = []
    if (steamInfo?.background_raw) {
      shots.push({ src: steamInfo.background_raw, thumb: steamInfo.background, source: 'Steam' })
    }
    if (sgdbGrids.length > 0) {
      shots.push(...sgdbGrids.map(g => ({ src: g.url, thumb: g.thumb, source: 'SGDB' })))
    }
    if (steamInfo?.screenshots) {
      shots.push(...steamInfo.screenshots.map(s => ({ src: s.full, thumb: s.thumbnail, source: 'Steam' })))
    }
    if (rawgInfo?.screenshots) {
      shots.push(...rawgInfo.screenshots.map(s => ({ src: s.image, thumb: s.image, source: 'RAWG' })))
    }
    return shots
  }

  const getTrailers = () => {
    if (steamInfo?.movies) return steamInfo.movies
    return []
  }

  const info = steamInfo || rawgInfo
  const description = steamInfo?.about_the_game || steamInfo?.detailed_description || rawgInfo?.description_raw || ''
  const genres = steamInfo?.genres || rawgInfo?.genres || []
  const developers = steamInfo?.developers || rawgInfo?.developers || []
  const publishers = steamInfo?.publishers || rawgInfo?.publishers || []
  const releaseDate = steamInfo?.release_date || rawgInfo?.released
  const screenshots = getAllScreenshots()
  const trailers = getTrailers()

  if (!game) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-cl-text-dim">
          <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
          Loading game...
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto animate-fade-in">
      {/* Hero Banner */}
      <div className="relative h-80 overflow-hidden">
        {sgdbHero ? (
          <img src={sgdbHero.url} alt="" className="w-full h-full object-cover" />
        ) : steamInfo?.background ? (
          <img src={steamInfo.background} alt="" className="w-full h-full object-cover opacity-70" />
        ) : rawgInfo?.background_image ? (
          <img src={rawgInfo.background_image} alt="" className="w-full h-full object-cover opacity-60" />
        ) : game.banner_url ? (
          <img src={game.banner_url} alt="" className="w-full h-full object-cover opacity-50" />
        ) : game.cover_url ? (
          <img src={game.cover_url} alt="" className="w-full h-full object-cover opacity-30 blur-2xl scale-125" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cl-accent/20 via-cl-card to-cl-darker" />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-cl-darker via-cl-darker/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-cl-darker/60 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 p-2.5 glass rounded-xl hover:bg-cl-border/40 text-cl-text-dim hover:text-cl-text transition-all z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Game info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end gap-5">
            {(sgdbGrids.length > 0 || game.cover_url) && (
              <img
                src={sgdbGrids.length > 0 ? sgdbGrids[0].url : game.cover_url}
                alt={game.title}
                className="w-24 h-32 rounded-xl object-cover border-2 border-cl-border/50 shadow-glass-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                {sgdbLogos.length > 0 ? (
                  <img src={sgdbLogos[0].url} alt={game.title} className="h-12 max-w-xs object-contain drop-shadow-lg" />
                ) : (
                  <h1 className="text-3xl font-bold text-white drop-shadow-lg truncate">{game.title}</h1>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider text-white shadow-md"
                  style={{ background: PLATFORM_COLORS[game.platform] || '#333' }}
                >
                  {game.platform}
                </span>
                <span className="text-sm text-cl-text-dim flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatPlaytime(game.playtime_minutes)}
                </span>
                {developers.length > 0 && (
                  <span className="text-sm text-cl-text-dim">{developers.join(', ')}</span>
                )}
                {releaseDate && (
                  <span className="text-sm text-cl-text-dim">{releaseDate}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Action bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleLaunch}
            disabled={!game.exe_path}
            className="btn-primary text-base px-8 py-3 shadow-glow disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>

          <div className="flex glass rounded-xl p-1">
            {['vanilla', 'modded'].map(mode => (
              <button
                key={mode}
                onClick={() => setLaunchMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize ${
                  launchMode === mode
                    ? 'bg-cl-accent text-white shadow-glow'
                    : 'text-cl-text-dim hover:text-cl-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button onClick={() => navigate(`/mods/${game.id}`)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Mods ({nexusModCount !== null ? nexusModCount : mods.length})
          </button>

          <div className="flex-1" />

          <button onClick={() => setIsEditing(!isEditing)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Properties
          </button>
        </div>

        {/* Properties panel */}
        {isEditing && (
          <div className="glass-strong rounded-2xl p-6 space-y-4 animate-scale-in shadow-glass">
            <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Game Properties</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Executable Path</label>
                <div className="flex gap-2">
                  <input
                    value={editForm.exe_path || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, exe_path: e.target.value }))}
                    className="input-field flex-1"
                    placeholder="C:\Games\game.exe"
                  />
                  <button onClick={handleSelectExe} className="btn-secondary">Browse</button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Install Directory</label>
                <div className="flex gap-2">
                  <input
                    value={editForm.install_path || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, install_path: e.target.value }))}
                    className="input-field flex-1"
                    placeholder="C:\Games\MyGame"
                  />
                  <button onClick={handleSelectDir} className="btn-secondary">Browse</button>
                </div>
              </div>

              {game?.install_path && (
                <button onClick={handleOpenDir} className="btn-secondary text-sm flex items-center gap-2 w-fit">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  Open Game Directory
                </button>
              )}

              <div>
                <label className="text-xs font-medium text-cl-text-dim block mb-1.5">Launch Arguments</label>
                <input
                  value={editForm.custom_args || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, custom_args: e.target.value }))}
                  className="input-field"
                  placeholder="-windowed -noborder"
                />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={handleDelete} className="text-cl-red text-sm hover:underline">
                Remove from Library
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={handleSave} className="btn-primary text-sm">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loadingInfo && (
          <div className="flex items-center gap-3 text-cl-text-dim text-sm py-4">
            <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
            Fetching game info from Steam & RAWG...
          </div>
        )}

        {/* Trailers */}
        {!loadingInfo && trailers.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Trailers</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {trailers.map((trailer, idx) => (
                <button
                  key={trailer.id || idx}
                  onClick={() => { setActiveTrailer(trailer); setShowTrailer(true) }}
                  className="relative group rounded-2xl overflow-hidden glass hover:border-cl-accent/50 transition-all duration-300 aspect-video"
                >
                  <img
                    src={trailer.thumbnail}
                    alt={trailer.name}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-black/50 group-hover:bg-cl-accent/80 group-hover:scale-110 flex items-center justify-center transition-all duration-300 backdrop-blur-sm">
                      <svg className="w-7 h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
                    <span className="text-xs text-white font-medium truncate block">{trailer.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trailer modal */}
        {showTrailer && activeTrailer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={() => setShowTrailer(false)}>
            <div className="relative max-w-4xl w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowTrailer(false)}
                className="absolute -top-12 right-0 text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <video
                src={activeTrailer.mp4_480 || activeTrailer.webm_480}
                controls
                autoPlay
                className="w-full rounded-2xl"
              />
              <p className="text-center text-cl-text-dim text-sm mt-3">{activeTrailer.name}</p>
            </div>
          </div>
        )}

        {/* Screenshots */}
        {!loadingInfo && screenshots.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Screenshots</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setScreenshotIdx(Math.max(0, screenshotIdx - 3))}
                  disabled={screenshotIdx === 0}
                  className="p-1.5 glass rounded-lg hover:bg-cl-border/40 disabled:opacity-30 transition-all"
                >
                  <svg className="w-4 h-4 text-cl-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setScreenshotIdx(Math.min(screenshots.length - 3, screenshotIdx + 3))}
                  disabled={screenshotIdx >= screenshots.length - 3}
                  className="p-1.5 glass rounded-lg hover:bg-cl-border/40 disabled:opacity-30 transition-all"
                >
                  <svg className="w-4 h-4 text-cl-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-3 overflow-hidden">
              {screenshots.slice(screenshotIdx, screenshotIdx + 3).map((shot, idx) => (
                <button
                  key={idx}
                  className="flex-1 min-w-0 rounded-2xl overflow-hidden glass hover:border-cl-accent/50 transition-all duration-300"
                  onClick={() => {
                    const newWin = window.open('', '_blank')
                    newWin.document.write(`<img src="${shot.src}" style="max-width:100%;max-height:100vh" />`)
                  }}
                >
                  <img
                    src={shot.thumb || shot.src}
                    alt={`Screenshot ${idx}`}
                    className="w-full h-40 object-cover hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {!loadingInfo && description && (
          <div className="space-y-3 animate-fade-in">
            <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">About</h3>
            <div className={`relative glass rounded-2xl p-6 overflow-hidden transition-all duration-300 ${!expandedDesc ? 'max-h-48' : ''}`}>
              <div
                className="text-sm text-cl-text leading-relaxed"
                dangerouslySetInnerHTML={{ __html: description }}
              />
              {!expandedDesc && (
                <>
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#111218] to-transparent" />
                  <button
                    onClick={() => setExpandedDesc(true)}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 text-cl-accent text-xs font-semibold hover:underline"
                  >
                    Read more
                  </button>
                </>
              )}
              {expandedDesc && (
                <button
                  onClick={() => setExpandedDesc(false)}
                  className="text-cl-accent text-xs font-semibold hover:underline mt-3 block"
                >
                  Show less
                </button>
              )}
            </div>
          </div>
        )}

        {/* Game Info */}
        {!loadingInfo && (genres.length > 0 || releaseDate || publishers.length > 0) && (
          <div className="space-y-3 animate-fade-in">
            <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Game Info</h3>
            <div className="glass rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-5">
                {developers.length > 0 && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Developer</p>
                    <p className="text-sm text-cl-text font-medium">{developers.join(', ')}</p>
                  </div>
                )}
                {publishers.length > 0 && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Publisher</p>
                    <p className="text-sm text-cl-text font-medium">{publishers.join(', ')}</p>
                  </div>
                )}
                {releaseDate && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Release Date</p>
                    <p className="text-sm text-cl-text font-medium">{releaseDate}</p>
                  </div>
                )}
                {genres.length > 0 && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Genres</p>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g, i) => (
                        <span key={i} className="px-2.5 py-1 glass rounded-lg text-xs text-cl-text-dim font-medium">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {rawgInfo?.metacritic && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Metacritic</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${rawgInfo.metacritic >= 75 ? 'text-cl-green' : rawgInfo.metacritic >= 50 ? 'text-yellow-500' : 'text-cl-red'}`}>
                        {rawgInfo.metacritic}
                      </span>
                      <span className="text-xs text-cl-text-dim">/ 100</span>
                    </div>
                  </div>
                )}
                {steamInfo?.is_free !== undefined && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Price</p>
                    <p className="text-sm text-cl-text font-medium">
                      {steamInfo.is_free ? 'Free to Play' : steamInfo.price_overview?.finalFormatted || 'N/A'}
                    </p>
                  </div>
                )}
                {steamInfo?.platforms && (
                  <div>
                    <p className="text-xs text-cl-text-dim mb-1">Platforms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(steamInfo.platforms).filter(([,v]) => v).map(([k]) => (
                        <span key={k} className="px-2.5 py-1 glass rounded-lg text-xs text-cl-text-dim capitalize font-medium">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Installed Mods */}
        {mods.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Installed Mods</h3>
              <button
                onClick={handleCheckHealth}
                disabled={checkingHealth}
                className="text-xs text-cl-accent hover:text-cl-accent/80 transition-all flex items-center gap-1.5"
              >
                <svg className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {checkingHealth ? 'Checking...' : 'Check Mods'}
              </button>
            </div>
            <div className="space-y-2">
              {mods.map((mod, i) => (
                <div
                  key={mod.id}
                  className={`glass rounded-xl p-3.5 flex items-center gap-3 transition-all duration-200 animate-slide-up ${
                    mod.health_status === 'removed' ? 'border-cl-red/40 bg-cl-red/5' :
                    mod.health_status === 'outdated' ? 'border-cl-yellow/40 bg-cl-yellow/5' :
                    mod.health_status === 'update_available' ? 'border-cl-accent/40 bg-cl-accent/5' : ''
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    mod.health_status === 'removed' ? 'bg-cl-red' :
                    mod.health_status === 'outdated' ? 'bg-cl-yellow' :
                    mod.health_status === 'update_available' ? 'bg-cl-accent shadow-glow' :
                    mod.enabled ? 'bg-cl-green' : 'bg-cl-red'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cl-text truncate">{mod.name}</p>
                    <p className="text-xs text-cl-text-dim">
                      {mod.author || 'Unknown author'}
                      {mod.health_status === 'outdated' && (
                        <span className="ml-2 text-cl-yellow">· Outdated</span>
                      )}
                      {mod.health_status === 'removed' && (
                        <span className="ml-2 text-cl-red">· Removed from Nexus</span>
                      )}
                      {mod.health_status === 'update_available' && (
                        <span className="ml-2 text-cl-accent">· Update available</span>
                      )}
                    </p>
                    {mod.reason && mod.health_status !== 'ok' && (
                      <p className="text-xs text-cl-text-dim mt-0.5 italic">{mod.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await window.electronAPI.db.updateMod(mod.id, { enabled: mod.enabled ? 0 : 1 })
                      await loadGame()
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      mod.enabled
                        ? 'bg-cl-green/10 text-cl-green hover:bg-cl-green/20 border border-cl-green/20'
                        : 'bg-cl-red/10 text-cl-red hover:bg-cl-red/20 border border-cl-red/20'
                    }`}
                  >
                    {mod.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
