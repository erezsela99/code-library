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

  useEffect(() => {
    loadGame()
  }, [id])

  const loadGame = async () => {
    if (!window.electronAPI) return
    const data = await window.electronAPI.db.getGame(parseInt(id))
    setGame(data)
    setEditForm(data || {})
    const gameMods = await window.electronAPI.db.getMods(parseInt(id))
    setMods(gameMods)
    if (data) fetchNexusModCount(data)
  }

  const fetchNexusModCount = async (g) => {
    const apiKey = await window.electronAPI.db.getSetting('nexus_api_key')
    if (!apiKey) return
    const savedSlug = await window.electronAPI.db.getSetting(`nexus_slug_${g.id}`)
    let slug = savedSlug
    if (!slug) {
      slug = await window.electronAPI.nexus.findSlug(apiKey, g.title)
    }
    if (!slug) return
    const count = await window.electronAPI.nexus.getModCount(apiKey, slug)
    setNexusModCount(count)
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

  if (!game) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-cl-text-dim">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="relative h-64 bg-gradient-to-b from-cl-card to-cl-darker overflow-hidden">
        {game.banner_url ? (
          <img src={game.banner_url} alt="" className="w-full h-full object-cover opacity-40" />
        ) : game.cover_url ? (
          <img src={game.cover_url} alt="" className="w-full h-full object-cover opacity-30 blur-xl scale-110" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cl-accent/20 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cl-darker via-cl-darker/60 to-transparent" />

        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 p-2 rounded-lg bg-black/50 hover:bg-cl-card text-cl-text-dim hover:text-cl-text transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end gap-4">
            {game.cover_url && (
              <img
                src={game.cover_url}
                alt={game.title}
                className="w-20 h-28 rounded-lg object-cover border-2 border-cl-border shadow-xl"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{game.title}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold uppercase"
                  style={{ background: PLATFORM_COLORS[game.platform] || '#333', color: 'white' }}
                >
                  {game.platform}
                </span>
                <span className="text-sm text-cl-text-dim">
                  {formatPlaytime(game.playtime_minutes)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLaunch}
            disabled={!game.exe_path}
            className="btn-primary text-base px-8 py-3 disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>

          <div className="flex bg-cl-card rounded-lg border border-cl-border p-1">
            {['vanilla', 'modded'].map(mode => (
              <button
                key={mode}
                onClick={() => setLaunchMode(mode)}
                className={`px-4 py-2 rounded text-sm font-medium transition-all capitalize ${
                  launchMode === mode
                    ? 'bg-cl-accent text-white'
                    : 'text-cl-text-dim hover:text-cl-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => navigate(`/mods/${game.id}`)}
            className="btn-secondary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Mods ({nexusModCount !== null ? nexusModCount : mods.length})
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setIsEditing(!isEditing)}
            className="btn-secondary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Properties
          </button>
        </div>

        {isEditing && (
          <div className="animate-slide-up bg-cl-card border border-cl-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-cl-text uppercase tracking-wider">Game Properties</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-cl-text-dim block mb-1">Executable Path</label>
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
                <label className="text-xs text-cl-text-dim block mb-1">Install Directory</label>
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
                <button
                  onClick={handleOpenDir}
                  className="btn-secondary text-sm flex items-center gap-2 w-fit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  Open Game Directory
                </button>
              )}

              <div>
                <label className="text-xs text-cl-text-dim block mb-1">Launch Arguments</label>
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

        {mods.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-cl-text uppercase tracking-wider">Installed Mods</h3>
            <div className="space-y-2">
              {mods.map(mod => (
                <div key={mod.id} className="flex items-center gap-3 bg-cl-card border border-cl-border rounded-lg p-3">
                  <div className={`w-2 h-2 rounded-full ${mod.enabled ? 'bg-cl-green' : 'bg-cl-red'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cl-text truncate">{mod.name}</p>
                    <p className="text-xs text-cl-text-dim">{mod.author || 'Unknown author'}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await window.electronAPI.db.updateMod(mod.id, { enabled: mod.enabled ? 0 : 1 })
                      await loadGame()
                    }}
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      mod.enabled
                        ? 'bg-cl-green/10 text-cl-green hover:bg-cl-green/20'
                        : 'bg-cl-red/10 text-cl-red hover:bg-cl-red/20'
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
