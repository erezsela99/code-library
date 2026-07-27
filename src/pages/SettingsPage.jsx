import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [nexusApiKey, setNexusApiKey] = useState('')
  const [customDirs, setCustomDirs] = useState([])
  const [nexusConnected, setNexusConnected] = useState(false)
  const [validating, setValidating] = useState(false)
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    if (!window.electronAPI) return
    const key = await window.electronAPI.db.getSetting('nexus_api_key')
    if (key) {
      setNexusApiKey(key)
      validateKey(key)
    }
    const dirs = await window.electronAPI.db.getSetting('custom_scan_dirs')
    if (dirs) setCustomDirs(JSON.parse(dirs))
  }

  const validateKey = async (key) => {
    if (!key) return
    setValidating(true)
    setKeyError('')
    try {
      const result = await window.electronAPI.nexus.validateKey(key)
      if (result.valid) {
        setNexusConnected(true)
        setKeyError('')
        return result.name
      } else {
        setNexusConnected(false)
        setKeyError('Invalid API key. Check that you copied it correctly.')
      }
    } catch (err) {
      setNexusConnected(false)
      setKeyError('Failed to validate key: ' + err.message)
    }
    setValidating(false)
    return null
  }

  const saveNexusKey = async () => {
    setValidating(true)
    const user = await validateKey(nexusApiKey)
    if (user) {
      await window.electronAPI.db.setSetting('nexus_api_key', nexusApiKey)
    }
    setValidating(false)
  }

  const addCustomDir = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (dir && !customDirs.includes(dir)) {
      const updated = [...customDirs, dir]
      setCustomDirs(updated)
      await window.electronAPI.db.setSetting('custom_scan_dirs', JSON.stringify(updated))
    }
  }

  const removeCustomDir = async (dir) => {
    const updated = customDirs.filter(d => d !== dir)
    setCustomDirs(updated)
    await window.electronAPI.db.setSetting('custom_scan_dirs', JSON.stringify(updated))
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-cl-text">Settings</h1>
        <p className="text-sm text-cl-text-dim mt-1">Configure your Code Library</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-cl-text uppercase tracking-wider">Nexus Mods Integration</h2>
        <div className="bg-cl-card border border-cl-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${validating ? 'bg-yellow-500 animate-pulse' : nexusConnected ? 'bg-cl-green animate-pulse-glow' : 'bg-cl-red'}`} />
            <span className="text-sm font-medium text-cl-text">
              {validating ? 'Validating...' : nexusConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {keyError && (
            <div className="bg-cl-red/10 border border-cl-red/30 rounded-lg p-3 text-sm text-cl-red">
              {keyError}
            </div>
          )}

          <div>
            <label className="text-xs text-cl-text-dim block mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={nexusApiKey}
                onChange={(e) => { setNexusApiKey(e.target.value); setKeyError(''); setNexusConnected(false) }}
                className="input-field flex-1"
                placeholder="Enter your Nexus Mods API key"
              />
              <button onClick={saveNexusKey} disabled={validating || !nexusApiKey} className="btn-primary text-sm disabled:opacity-50">
                {validating ? 'Checking...' : 'Save & Verify'}
              </button>
            </div>
            <p className="text-xs text-cl-text-dim mt-2">
              Get your API key from{' '}
              <span
                className="text-cl-accent cursor-pointer hover:underline"
                onClick={() => window.electronAPI?.shell.openPath('https://www.nexusmods.com/users/myaccount?tab=api+access')}
              >
                nexusmods.com/users/myaccount
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-cl-text uppercase tracking-wider">Custom Scan Directories</h2>
        <div className="bg-cl-card border border-cl-border rounded-xl p-5 space-y-3">
          <p className="text-sm text-cl-text-dim">
            Add additional directories to scan for games.
          </p>
          {customDirs.map(dir => (
            <div key={dir} className="flex items-center gap-2 bg-cl-darker rounded-lg p-3">
              <svg className="w-4 h-4 text-cl-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-sm text-cl-text flex-1 truncate">{dir}</span>
              <button
                onClick={() => removeCustomDir(dir)}
                className="p-1 rounded text-cl-text-dim hover:text-cl-red transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button onClick={addCustomDir} className="btn-secondary text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Directory
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-cl-text uppercase tracking-wider">About</h2>
        <div className="bg-cl-card border border-cl-border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cl-accent flex items-center justify-center">
              <span className="text-sm font-bold text-white">CL</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-cl-text">CODE LIBRARY</p>
              <p className="text-xs text-cl-text-dim">v1.0.0 · Unified Game Launcher & Mod Manager</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
