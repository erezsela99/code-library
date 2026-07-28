export default function Logo({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6c5ce7" />
          <stop offset="100%" stopColor="#00d2a0" />
        </linearGradient>
        <linearGradient id="logoGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5a4bd1" />
          <stop offset="100%" stopColor="#00b88a" />
        </linearGradient>
        <clipPath id="roundedSquare">
          <rect x="2" y="2" width="60" height="60" rx="14" />
        </clipPath>
      </defs>

      {/* Background rounded square */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#logoGrad)" />

      {/* Book / library shape - left page */}
      <path
        d="M18 16 L18 48 Q18 48 18 48 L30 44 L30 12 L18 16Z"
        fill="rgba(255,255,255,0.25)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Book / library shape - right page */}
      <path
        d="M46 16 L46 48 Q46 48 46 48 L34 44 L34 12 L46 16Z"
        fill="rgba(255,255,255,0.15)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Spine line */}
      <line
        x1="32" y1="12"
        x2="32" y2="44"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.5"
      />

      {/* Play triangle - center of book */}
      <path
        d="M28 24 L28 36 L38 30 Z"
        fill="rgba(255,255,255,0.9)"
      />

      {/* Small circuit/node dots - tech/code element */}
      <circle cx="22" cy="20" r="1.5" fill="rgba(255,255,255,0.7)" />
      <circle cx="42" cy="20" r="1.5" fill="rgba(255,255,255,0.7)" />
      <circle cx="22" cy="42" r="1.5" fill="rgba(255,255,255,0.7)" />
      <circle cx="42" cy="42" r="1.5" fill="rgba(255,255,255,0.7)" />

      {/* Connecting lines from dots */}
      <line x1="22" y1="20" x2="28" y2="24" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <line x1="42" y1="20" x2="38" y2="24" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <line x1="22" y1="42" x2="28" y2="36" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
      <line x1="42" y1="42" x2="38" y2="36" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
    </svg>
  )
}
