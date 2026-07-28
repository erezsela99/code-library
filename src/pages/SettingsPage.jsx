import { useState, useEffect } from 'react'
import Logo from '../components/Logo'

export default function SettingsPage() {
  const [nexusApiKey, setNexusApiKey] = useState('')
  const [rawgApiKey, setRawgApiKey] = useState('')
  const [sgdbApiKey, setSgdbApiKey] = useState('')
  const [vtApiKey, setVtApiKey] = useState('')
  const [customDirs, setCustomDirs] = useState([])
  const [nexusConnected, setNexusConnected] = useState(false)
  const [validating, setValidating] = useState(false)
  const [keyError, setKeyError] = useState('')

  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoError, setSsoError] = useState('')

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
    if (dirs) { try { setCustomDirs(JSON.parse(dirs)) } catch { setCustomDirs([]) } }
    const rawgKey = await window.electronAPI.db.getSetting('rawg_api_key')
    if (rawgKey) setRawgApiKey(rawgKey)
    const sgdbKey = await window.electronAPI.db.getSetting('sgdb_api_key')
    if (sgdbKey) setSgdbApiKey(sgdbKey)
    const vtKey = await window.electronAPI.db.getSetting('vt_api_key')
    if (vtKey) setVtApiKey(vtKey)
  }

  const validateKey = async (key) => {
    if (!key) return null
    setValidating(true)
    setKeyError('')
    try {
      const result = await window.electronAPI.nexus.validateKey(key)
      if (result.valid) {
        setNexusConnected(true)
        setKeyError('')
        setValidating(false)
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

  const handleSsoLogin = async () => {
    setSsoLoading(true)
    setSsoError('')
    try {
      const result = await window.electronAPI.nexus.ssoLogin()
      if (result?.success && result.apiKey) {
        setNexusApiKey(result.apiKey)
        setNexusConnected(true)
        setSsoError('')
        await window.electronAPI.db.setSetting('nexus_api_key', result.apiKey)
      }
    } catch (err) {
      setSsoError(err.message || 'Login failed')
    }
    setSsoLoading(false)
  }

  const handleDisconnect = async () => {
    setNexusApiKey('')
    setNexusConnected(false)
    await window.electronAPI.db.setSetting('nexus_api_key', '')
  }

  const saveRawgKey = async () => {
    await window.electronAPI.db.setSetting('rawg_api_key', rawgApiKey)
  }

  const saveSgdbKey = async () => {
    await window.electronAPI.db.setSetting('sgdb_api_key', sgdbApiKey)
  }

  const saveVtKey = async () => {
    await window.electronAPI.db.setSetting('vt_api_key', vtApiKey)
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
    <div className="p-6 space-y-8 max-w-2xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Settings</h1>
        <p className="text-sm text-cl-text-dim mt-1">Configure your Code Library</p>
      </div>

      {/* Nexus Mods */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">Nexus Mods Integration</h2>
        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${validating || ssoLoading ? 'bg-yellow-500 animate-pulse' : nexusConnected ? 'bg-cl-green animate-pulse-glow' : 'bg-cl-red'}`} />
            <span className="text-sm font-medium text-cl-text">
              {validating || ssoLoading ? 'Connecting...' : nexusConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {(keyError || ssoError) && (
            <div className="glass rounded-xl p-3 text-sm text-cl-red border border-cl-red/30">
              {keyError || ssoError}
            </div>
          )}

          {nexusConnected ? (
            <div className="space-y-3">
              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-cl-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-cl-text">Logged in successfully</span>
                </div>
                <button onClick={handleDisconnect} className="text-xs text-cl-red hover:underline">Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button onClick={handleSsoLogin} disabled={ssoLoading} className="btn-primary w-full !py-3 flex items-center justify-center gap-2">
                {ssoLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Waiting for authorization...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    Sign in with Nexus Mods
                  </>
                )}
              </button>
              <p className="text-xs text-cl-text-dim text-center">Opens Nexus Mods in your browser to authorize</p>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-cl-border/30" /></div>
                <div className="relative flex justify-center"><span className="bg-cl-dark px-3 text-[11px] text-cl-text-dim">or enter manually</span></div>
              </div>

              <div>
                <label className="text-xs font-medium text-cl-text-dim block mb-1.5">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={nexusApiKey}
                    onChange={(e) => { setNexusApiKey(e.target.value); setKeyError(''); setNexusConnected(false) }}
                    className="input-field flex-1"
                    placeholder="Paste your Nexus Mods API key"
                  />
                  <button onClick={saveNexusKey} disabled={validating || !nexusApiKey} className="btn-primary text-sm disabled:opacity-50">
                    {validating ? 'Checking...' : 'Save & Verify'}
                  </button>
                </div>
                <p className="text-xs text-cl-text-dim mt-2">
                  Get your API key from{' '}
                  <span
                    className="text-cl-accent cursor-pointer hover:underline"
                    onClick={() => window.electronAPI?.shell.openExternal('https://www.nexusmods.com/users/myaccount?tab=api+access')}
                  >
                    nexusmods.com/users/myaccount
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* RAWG */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">RAWG Game Database</h2>
        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <p className="text-sm text-cl-text-dim">
            Optional. Provides game info, trailers, and screenshots for non-Steam games.
          </p>
          <div>
            <label className="text-xs font-medium text-cl-text-dim block mb-1.5">RAWG API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={rawgApiKey}
                onChange={(e) => setRawgApiKey(e.target.value)}
                className="input-field flex-1"
                placeholder="Enter your RAWG API key (optional)"
              />
              <button onClick={saveRawgKey} disabled={!rawgApiKey} className="btn-primary text-sm disabled:opacity-50">
                Save
              </button>
            </div>
            <p className="text-xs text-cl-text-dim mt-2">
              Get a free API key from{' '}
              <span
                className="text-cl-accent cursor-pointer hover:underline"
                onClick={() => window.electronAPI?.shell.openExternal('https://rawg.io/apidocs')}
              >
                rawg.io/apidocs
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* SteamGridDB */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">SteamGridDB Artwork</h2>
        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <p className="text-sm text-cl-text-dim">
            Optional. Provides high-quality cover art, hero images, and logos for your games.
          </p>
          <div>
            <label className="text-xs font-medium text-cl-text-dim block mb-1.5">SteamGridDB API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={sgdbApiKey}
                onChange={(e) => setSgdbApiKey(e.target.value)}
                className="input-field flex-1"
                placeholder="Enter your SteamGridDB API key (optional)"
              />
              <button onClick={saveSgdbKey} disabled={!sgdbApiKey} className="btn-primary text-sm disabled:opacity-50">
                Save
              </button>
            </div>
            <p className="text-xs text-cl-text-dim mt-2">
              Get a free API key from{' '}
              <span
                className="text-cl-accent cursor-pointer hover:underline"
                onClick={() => window.electronAPI?.shell.openExternal('https://www.steamgriddb.com/profile/preferences')}
              >
                steamgriddb.com/profile/preferences
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* VirusTotal */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">VirusTotal Safety Scanning</h2>
        <div className="glass-strong rounded-2xl p-6 space-y-4">
          <p className="text-sm text-cl-text-dim">
            Optional but recommended. Scans mod download URLs with 70+ antivirus engines before downloading dependencies from GitHub, Thunderstore, or other sources.
          </p>
          <div>
            <label className="text-xs font-medium text-cl-text-dim block mb-1.5">VirusTotal API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={vtApiKey}
                onChange={(e) => setVtApiKey(e.target.value)}
                className="input-field flex-1"
                placeholder="Enter your VirusTotal API key (optional)"
              />
              <button onClick={saveVtKey} disabled={!vtApiKey} className="btn-primary text-sm disabled:opacity-50">
                Save
              </button>
            </div>
            <p className="text-xs text-cl-text-dim mt-2">
              Get a free API key from{' '}
              <span
                className="text-cl-accent cursor-pointer hover:underline"
                onClick={() => window.electronAPI?.shell.openExternal('https://www.virustotal.com/gui/join-us')}
              >
                virustotal.com/gui/join-us
              </span>
              {' '}(free tier: 4 scans/minute)
            </p>
          </div>
        </div>
      </section>

      {/* Custom Dirs */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">Custom Scan Directories</h2>
        <div className="glass-strong rounded-2xl p-6 space-y-3">
          <p className="text-sm text-cl-text-dim">
            Add additional directories to scan for games.
          </p>
          {customDirs.map(dir => (
            <div key={dir} className="glass rounded-xl p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-cl-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-sm text-cl-text flex-1 truncate">{dir}</span>
              <button
                onClick={() => removeCustomDir(dir)}
                className="p-1.5 rounded-lg text-cl-text-dim hover:text-cl-red hover:bg-cl-red/10 transition-all"
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

      {/* About */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold gradient-text uppercase tracking-wider">About</h2>
        <div className="glass-strong rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <div>
              <p className="text-sm font-bold gradient-text">CODE LIBRARY</p>
              <p className="text-xs text-cl-text-dim">v0.1.0 · Unified Game Launcher & Mod Manager</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
