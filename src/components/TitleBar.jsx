import Logo from './Logo'

export default function TitleBar() {
  return (
    <div className="titlebar">
      <div className="flex items-center gap-2.5">
        <Logo size={22} />
        <span className="text-[11px] font-semibold tracking-[0.15em] text-cl-text-dim uppercase">Code Library</span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          className="titlebar-btn"
          onClick={() => window.electronAPI?.window.minimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.electronAPI?.window.maximize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => window.electronAPI?.window.close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
