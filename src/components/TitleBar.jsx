import { useNavigate } from 'react-router-dom'

export default function TitleBar() {
  return (
    <div className="titlebar">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-cl-accent flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">CL</span>
        </div>
        <span className="text-xs font-semibold tracking-wider text-cl-text-dim">CODE LIBRARY</span>
      </div>
      <div className="flex items-center gap-1">
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
            <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
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
