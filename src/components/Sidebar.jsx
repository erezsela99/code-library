import { useNavigate, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/', label: 'Library', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

export default function Sidebar({ games, onScan, loading, scanStatus }) {
  const navigate = useNavigate()
  const location = useLocation()

  const platformCounts = games.reduce((acc, g) => {
    acc[g.platform] = (acc[g.platform] || 0) + 1
    return acc
  }, {})

  return (
    <aside className="w-56 bg-cl-dark border-r border-cl-border flex flex-col shrink-0">
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === item.path
                ? 'bg-cl-accent/15 text-cl-accent'
                : 'text-cl-text-dim hover:bg-cl-card hover:text-cl-text'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-cl-border space-y-3">
        <div className="space-y-1.5">
          {Object.entries(platformCounts).map(([platform, count]) => (
            <div key={platform} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-cl-text-dim">{platform}</span>
              <span className="text-cl-text font-medium">{count}</span>
            </div>
          ))}
        </div>

        {scanStatus && (
          <div className={`text-xs px-3 py-2 rounded-lg ${
            scanStatus.includes('failed') ? 'bg-cl-red/10 text-cl-red' : 'bg-cl-green/10 text-cl-green'
          }`}>
            {scanStatus}
          </div>
        )}

        <button
          onClick={() => onScan()}
          disabled={loading}
          className="w-full btn-primary justify-center text-sm disabled:opacity-50"
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
