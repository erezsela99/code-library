import { useNavigate, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/', label: 'Library', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { path: '/gta5mods', label: 'GTA5 Mods', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
  { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

const PLATFORM_BADGES = {
  Steam: { color: '#66c0f4', bg: 'rgba(102, 192, 244, 0.1)' },
  GOG: { color: '#c68edd', bg: 'rgba(198, 142, 221, 0.1)' },
  Epic: { color: '#ffffff', bg: 'rgba(255, 255, 255, 0.08)' },
  Rockstar: { color: '#f5a623', bg: 'rgba(245, 166, 35, 0.1)' },
  Local: { color: '#00d2a0', bg: 'rgba(0, 210, 160, 0.1)' },
}

export default function Sidebar({ games, onScan, loading, scanStatus }) {
  const navigate = useNavigate()
  const location = useLocation()

  const platformCounts = games.reduce((acc, g) => {
    acc[g.platform] = (acc[g.platform] || 0) + 1
    return acc
  }, {})

  return (
    <aside className="w-56 glass-strong border-r border-cl-border/30 flex flex-col shrink-0">
      <nav className="flex-1 p-3 space-y-1 pt-2">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full nav-item ${active ? 'active' : ''}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                active
                  ? 'bg-cl-accent/20 text-cl-accent shadow-glow'
                  : 'bg-transparent text-cl-text-dim'
              }`}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <span className="text-[13px]">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-3 space-y-3">
        {Object.keys(platformCounts).length > 0 && (
          <div className="section-card !p-3 !rounded-xl space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cl-text-dim/60 px-1">Platforms</p>
            {Object.entries(platformCounts).map(([platform, count]) => {
              const badge = PLATFORM_BADGES[platform] || { color: '#8888a0', bg: 'rgba(136,136,160,0.1)' }
              return (
                <div key={platform} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-cl-border/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
                    <span className="text-xs text-cl-text-dim">{platform}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: badge.color }}>{count}</span>
                </div>
              )
            })}
          </div>
        )}

        {scanStatus && (
          <div className={`text-xs px-3 py-2 rounded-xl animate-slide-up ${
            scanStatus.includes('failed')
              ? 'bg-cl-red/10 text-cl-red border border-cl-red/20'
              : 'bg-cl-green/10 text-cl-green border border-cl-green/20'
          }`}>
            {scanStatus}
          </div>
        )}

        <button
          onClick={() => onScan()}
          disabled={loading}
          className="w-full btn-primary justify-center text-sm disabled:opacity-50 !py-2"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Scanning...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Scan for Games
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
