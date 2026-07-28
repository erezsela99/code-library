import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const PLATFORM_STYLES = {
  Steam: { color: '#66c0f4', bg: 'rgba(102, 192, 244, 0.15)', border: 'rgba(102, 192, 244, 0.3)' },
  GOG: { color: '#c68edd', bg: 'rgba(198, 142, 221, 0.15)', border: 'rgba(198, 142, 221, 0.3)' },
  Epic: { color: '#ffffff', bg: 'rgba(255, 255, 255, 0.1)', border: 'rgba(255, 255, 255, 0.2)' },
  Rockstar: { color: '#f5a623', bg: 'rgba(245, 166, 35, 0.15)', border: 'rgba(245, 166, 35, 0.3)' },
  Local: { color: '#00d2a0', bg: 'rgba(0, 210, 160, 0.15)', border: 'rgba(0, 210, 160, 0.3)' },
}

export default function GameCard({ game }) {
  const navigate = useNavigate()
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const platform = PLATFORM_STYLES[game.platform] || { color: '#8888a0', bg: 'rgba(136,136,160,0.15)', border: 'rgba(136,136,160,0.3)' }

  const formatPlaytime = (minutes) => {
    if (!minutes) return null
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k h`
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const playtime = formatPlaytime(game.playtime_minutes)

  return (
    <div
      className="game-card glass rounded-2xl overflow-hidden group"
      onClick={() => navigate(`/game/${game.id}`)}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-cl-darker">
        {!imgError ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 skeleton" />
            )}
            <img
              src={game.sgdb_cover_url || game.cover_url}
              alt={game.title}
              className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cl-card to-cl-darker">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: platform.bg }}>
              <svg className="w-7 h-7" style={{ color: platform.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        )}

        {/* Platform badge */}
        <div
          className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-md"
          style={{ background: platform.bg, color: platform.color, border: `1px solid ${platform.border}` }}
        >
          {game.platform}
        </div>

        {/* Playtime badge */}
        {playtime && (
          <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-medium text-cl-text border border-white/5">
            {playtime}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="p-3.5">
        <h3 className="text-sm font-semibold text-cl-text truncate group-hover:text-white transition-colors">{game.title}</h3>
        {game.install_path && (
          <p className="text-[11px] text-cl-text-dim mt-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">{game.install_path}</p>
        )}
      </div>
    </div>
  )
}
