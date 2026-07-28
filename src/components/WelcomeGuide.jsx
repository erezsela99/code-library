import { useState } from 'react'
import Logo from './Logo'

const STEPS = [
  {
    title: 'Welcome to CODE LIBRARY',
    icon: (
      <div className="flex justify-center"><Logo size={64} /></div>
    ),
    text: 'Your unified game launcher, library organizer, and mod manager. This guide will walk you through the basics.',
  },
  {
    title: 'Scan Your Library',
    icon: (
      <svg className="w-16 h-16 mx-auto text-cl-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    text: 'Click "Scan for Games" in the sidebar to automatically detect your Steam, GOG, Epic, and Rockstar games. You can also add custom directories.',
  },
  {
    title: 'Connect Nexus Mods',
    icon: (
      <svg className="w-16 h-16 mx-auto text-cl-accent-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    text: 'To browse and install mods, you need a Nexus Mods API key. This step is required to continue.',
    requiresApiKey: true,
  },
  {
    title: 'Browse Mods',
    icon: (
      <svg className="w-16 h-16 mx-auto text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    text: 'Select a game and click "Mods" to browse Nexus Mods. Use the search bar to find specific mods.',
  },
  {
    title: 'Install Mods',
    icon: (
      <svg className="w-16 h-16 mx-auto text-cl-accent-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
      </svg>
    ),
    text: 'Click "Install" on any mod. The app reads the mod description to figure out where files should go — like BepInEx/plugins or Data folders. You can review before confirming.',
  },
  {
    title: 'Launch Games',
    icon: (
      <svg className="w-16 h-16 mx-auto text-cl-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
    text: 'Click "Play" on any game to launch it directly. Track your playtime and keep your library organized.',
  },
]

const API_KEY_STEP = STEPS.findIndex(s => s.requiresApiKey)

export default function WelcomeGuide({ onComplete, onDontShow }) {
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [keyValid, setKeyValid] = useState(false)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isApiKeyStep = current.requiresApiKey

  const validateAndSave = async () => {
    if (!apiKey.trim()) {
      setKeyError('Please enter an API key')
      return
    }
    setValidating(true)
    setKeyError('')
    try {
      const result = await window.electronAPI.nexus.validateKey(apiKey.trim())
      if (result.valid) {
        await window.electronAPI.db.setSetting('nexus_api_key', apiKey.trim())
        setKeyValid(true)
        setKeyError('')
      } else {
        setKeyError('Invalid API key. Please check and try again.')
      }
    } catch {
      setKeyError('Failed to validate key. Check your internet connection.')
    }
    setValidating(false)
  }

  const canProceed = () => {
    if (isApiKeyStep) return keyValid
    return true
  }

  const handleNext = () => {
    if (!canProceed()) return
    if (isLast) {
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-cl-card border border-cl-border rounded-2xl p-8 max-w-lg w-full space-y-6 animate-slide-up">
        <div className="text-center space-y-4">
          {current.icon}
          <h2 className="text-xl font-bold text-cl-text">{current.title}</h2>
          <p className="text-sm text-cl-text-dim leading-relaxed">{current.text}</p>
        </div>

        {isApiKeyStep && (
          <div className="space-y-3">
            <div className="bg-cl-darker rounded-lg p-3 text-xs text-cl-text-dim space-y-1">
              <p>1. Go to <span className="text-cl-accent">nexusmods.com</span> and log in</p>
              <p>2. Click your avatar → <span className="text-cl-accent">Site Preferences</span></p>
              <p>3. Click the <span className="text-cl-accent">API Keys</span> tab</p>
              <p>4. Scroll to <span className="text-cl-accent">Personal API Key</span> and copy it</p>
              <button
                onClick={() => window.electronAPI?.shell?.openPath('https://www.nexusmods.com/users/myaccount?tab=api+access')}
                className="text-cl-accent hover:underline mt-1 inline-block"
              >
                Open Nexus Mods API page →
              </button>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeyError(''); setKeyValid(false) }}
              onKeyDown={(e) => e.key === 'Enter' && validateAndSave()}
              className="input-field w-full"
              placeholder="Paste your Nexus Mods API key"
              autoFocus
            />
            {keyError && (
              <p className="text-xs text-cl-red">{keyError}</p>
            )}
            {keyValid && (
              <p className="text-xs text-cl-green flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                API key verified! You can continue.
              </p>
            )}
            <button
              onClick={validateAndSave}
              disabled={validating || !apiKey.trim()}
              className="btn-primary text-sm w-full disabled:opacity-40"
            >
              {validating ? 'Validating...' : keyValid ? 'Saved!' : 'Validate & Save'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? 'bg-cl-accent w-6' : i < step ? 'bg-cl-accent/50' : 'bg-cl-border'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          {step !== API_KEY_STEP ? (
            <button
              onClick={onDontShow}
              className="text-xs text-cl-text-dim hover:text-cl-text transition-all"
            >
              Don't show again
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            {!isApiKeyStep && (
              <button onClick={onComplete} className="btn-secondary text-sm">
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`text-sm ${canProceed() ? 'btn-primary' : 'btn-primary opacity-40 cursor-not-allowed'}`}
            >
              {isLast ? 'Get Started' : isApiKeyStep && !keyValid ? 'Enter a valid key to continue' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
