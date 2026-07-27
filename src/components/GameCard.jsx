import { useNavigate } from 'react-router-dom'

const PLATFORM_COLORS = {
  Steam: '#1b2838',
  GOG: '#86328a',
  Epic: '#2f2f2f',
  Rockstar: '#f5a623',
  Local: '#00d2a0',
}

const PLATFORM_ICONS = {
  Steam: 'M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z',
  GOG: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  Epic: 'M12 2L2 7l10 5 10-5-10-5z',
  Rockstar: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  Local: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
}

export default function GameCard({ game }) {
  const navigate = useNavigate()

  const formatPlaytime = (minutes) => {
    if (!minutes) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <div
      className="game-card bg-cl-card rounded-xl overflow-hidden border border-cl-border hover:border-cl-accent/30"
      onClick={() => navigate(`/game/${game.id}`)}
    >
      <div className="relative aspect-[16/9] bg-cl-darker overflow-hidden">
        {game.cover_url ? (
          <img
            src={game.cover_url}
            alt={game.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-cl-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: PLATFORM_COLORS[game.platform] || '#333' }}
        >
          {game.platform}
        </div>
        {game.playtime_minutes > 0 && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[11px] font-medium text-cl-text">
            {formatPlaytime(game.playtime_minutes)}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold text-cl-text truncate">{game.title}</h3>
        {game.install_path && (
          <p className="text-[11px] text-cl-text-dim mt-1 truncate">{game.install_path}</p>
        )}
      </div>
    </div>
  )
}
