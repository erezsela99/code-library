import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const NEXUS_API_BASE = 'https://api.nexusmods.com'

function getModImage(mod) {
  return mod.preview?.thumbnail_url || mod.preview?.medium_url || null
}

export default function ModBrowserPage() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [installedMods, setInstalledMods] = useState([])
  const [nexusMods, setNexusMods] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [nexusSlug, setNexusSlug] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [slugSuggestions, setSlugSuggestions] = useState([])
  const [searchingGames, setSearchingGames] = useState(false)
  const [showSlugPicker, setShowSlugPicker] = useState(false)
  const [error, setError] = useState(null)
  const [debounceTimer, setDebounceTimer] = useState(null)

  const [installStep, setInstallStep] = useState(null)
  const [installMod, setInstallMod] = useState(null)
  const [modFiles, setModFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState({ downloaded: 0, total: 0 })
  const [installAnalysis, setInstallAnalysis] = useState(null)
  const [installLog, setInstallLog] = useState([])
  const [extractDir, setExtractDir] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [manualMod, setManualMod] = useState(null)
  const [depInfo, setDepInfo] = useState(null)
  const [depDownloadProgress, setDepDownloadProgress] = useState({ downloaded: 0, total: 0 })
  const PAGE_SIZE = 10

  useEffect(() => {
    loadData()
  }, [gameId])

  const generateSlugVariations = (title) => {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const words = base.split(/\s+/)
    const noSpace = words.join('')
    return [
      noSpace,
      words.join('-'),
      words.join('_'),
      words.join(''),
      title.toLowerCase().replace(/\s+/g, ''),
      title.toLowerCase().replace(/\s+/g, '-'),
      title.toLowerCase().replace(/[^a-z0-9]/g, ''),
      title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    ]
  }

  const tryAutoSlug = async (key, title) => {
    const variants = generateSlugVariations(title)
    for (const slug of variants) {
      try {
        const response = await fetch(
          `${NEXUS_API_BASE}/v1/games/${slug}/mods/trending.json`,
          { headers: { 'apikey': key } }
        )
        if (response.ok) {
          const data = await response.json()
          const mods = Array.isArray(data) ? data : (data.mods || [])
          if (mods.length > 0) {
            return { slug, mods }
          }
        }
      } catch {}
    }
    return { slug: variants[0], mods: [] }
  }

  const loadData = async () => {
    if (!window.electronAPI) return
    const g = await window.electronAPI.db.getGame(parseInt(gameId))
    setGame(g)
    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
    setInstalledMods(installed)
    const savedKey = await window.electronAPI.db.getSetting('nexus_api_key')
    const savedSlug = await window.electronAPI.db.getSetting(`nexus_slug_${gameId}`)
    if (savedKey) {
      setApiKey(savedKey)
      if (savedSlug) {
        setNexusSlug(savedSlug)
        setSlugInput(savedSlug)
        fetchNexusMods(savedKey, savedSlug)
      } else if (g) {
        setLoading(true)
        const result = await tryAutoSlug(savedKey, g.title)
        setNexusSlug(result.slug)
        setSlugInput(result.slug)
        await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, result.slug)
        setLoading(false)
        if (result.mods.length === 0) {
          setShowSlugPicker(true)
        } else {
          fetchNexusMods(savedKey, result.slug)
        }
      }
    }
  }

  const fetchNexusMods = async (key, slug) => {
    if (!key || !slug) return
    setLoading(true)
    setError(null)
    setNexusMods([])
    try {
      const endpoints = [
        `${NEXUS_API_BASE}/v1/games/${slug}/mods/trending.json`,
        `${NEXUS_API_BASE}/v1/games/${slug}/mods/latest_added.json`,
        `${NEXUS_API_BASE}/v1/games/${slug}/mods/latest_updated.json`,
      ]
      const seen = new Set()
      const allMods = []
      for (const url of endpoints) {
        try {
          const response = await fetch(url, { headers: { 'apikey': key } })
          if (response.ok) {
            const data = await response.json()
            const mods = Array.isArray(data) ? data : (data.mods || [])
            for (const mod of mods) {
              if (!seen.has(mod.mod_id)) {
                seen.add(mod.mod_id)
                allMods.push(mod)
              }
            }
          }
        } catch {}
      }
      if (allMods.length === 0) {
        setError(`No mods found for "${slug}". Click the game name to search.`)
      } else {
        setNexusMods(allMods)
        setCurrentPage(1)
      }
    } catch (err) {
      setError('Failed to fetch mods: ' + err.message)
    }
    setLoading(false)
  }

  const searchNexusMods = async (query) => {
    if (!apiKey || !nexusSlug || !query.trim()) {
      fetchNexusMods(apiKey, nexusSlug)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${NEXUS_API_BASE}/v1/games/${nexusSlug}/mods/search.json?name=${encodeURIComponent(query)}&include_adult=true`,
        { headers: { 'apikey': apiKey } }
      )
      if (response.ok) {
        const data = await response.json()
        const mods = Array.isArray(data) ? data : (data.mods || [])
        setNexusMods(mods)
      } else {
        const fallback = await fetch(
          `${NEXUS_API_BASE}/v1/games/${nexusSlug}/mods/trending.json`,
          { headers: { 'apikey': apiKey } }
        )
        if (fallback.ok) {
          const fdata = await fallback.json()
          const allMods = Array.isArray(fdata) ? fdata : (fdata.mods || [])
          const filtered = allMods.filter(m =>
            m.name.toLowerCase().includes(query.toLowerCase())
          )
          setNexusMods(filtered)
        }
      }
    } catch {
      fetchNexusMods(apiKey, nexusSlug)
    }
    setLoading(false)
  }

  const searchNexusGames = async () => {
    if (!apiKey || !slugInput.trim()) return
    setSearchingGames(true)
    try {
      const response = await fetch(`${NEXUS_API_BASE}/v1/games.json`, {
        headers: { 'apikey': apiKey }
      })
      if (response.ok) {
        const data = await response.json()
        const q = slugInput.toLowerCase()
        const results = []
        for (const [domain, info] of Object.entries(data)) {
          if (domain.toLowerCase().includes(q) || info.name?.toLowerCase().includes(q)) {
            results.push({ domain, name: info.name })
          }
        }
        setSlugSuggestions(results.slice(0, 15))
      }
    } catch {}
    setSearchingGames(false)
  }

  const selectSlug = async (domain) => {
    setNexusSlug(domain)
    setSlugInput(domain)
    setShowSlugPicker(false)
    setSlugSuggestions([])
    await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, domain)
    fetchNexusMods(apiKey, domain)
  }

  const applySlug = async () => {
    const slug = slugInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug) return
    setNexusSlug(slug)
    setShowSlugPicker(false)
    await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, slug)
    fetchNexusMods(apiKey, slug)
  }

  const handleSaveApiKey = async () => {
    await window.electronAPI.db.setSetting('nexus_api_key', apiKey)
    setShowApiKeyInput(false)
    if (nexusSlug) {
      fetchNexusMods(apiKey, nexusSlug)
    } else if (game) {
      const autoSlug = game.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
      setNexusSlug(autoSlug)
      setSlugInput(autoSlug)
      fetchNexusMods(apiKey, autoSlug)
    }
  }

  const addLog = (msg) => setInstallLog(prev => [...prev, msg])

  const handleInstallMod = async (mod) => {
    if (!apiKey || !nexusSlug) return
    setInstallMod(mod)
    setInstallStep('fetching_files')
    setInstallLog([])
    setModFiles([])
    setSelectedFile(null)
    setInstallAnalysis(null)

    addLog(`Fetching files for ${mod.name}...`)
    const result = await window.electronAPI.nexus.getModFiles(apiKey, nexusSlug, mod.mod_id)
    if (result.error) {
      addLog(`Error: ${result.error}`)
      setInstallStep('error')
      return
    }

    const files = result.files || []
    setModFiles(files)
    addLog(`Found ${files.length} file(s)`)

    if (files.length === 1) {
      setSelectedFile(files[0])
      startDownload(mod, files[0])
    } else {
      setInstallStep('select_file')
    }
  }

  const startDownload = async (mod, file) => {
    setInstallStep('downloading')
    setSelectedFile(file)
    addLog(`Downloading ${file.file_name}...`)

    addLog('Fetching mod description for install instructions...')
    const descResult = await window.electronAPI.nexus.getModDescription(apiKey, nexusSlug, mod.mod_id)
    const modDescription = descResult?.description || descResult?.summary || mod.summary || ''
    addLog(`Got description (${modDescription.length} chars)`)

    window.electronAPI.nexus.onDownloadProgress((data) => {
      if (data.modId === mod.mod_id) {
        setDownloadProgress({ downloaded: data.downloaded, total: data.total })
      }
    })

    try {
      const dlResult = await window.electronAPI.nexus.downloadMod({
        apiKey,
        slug: nexusSlug,
        modId: mod.mod_id,
        fileId: file.file_id,
        gameTitle: game?.title || 'Unknown',
      })

      if (dlResult.error) {
        if (dlResult.error.includes('403')) {
          addLog('Premium required for auto-download. Opening in browser...')
          const modUrl = `https://www.nexusmods.com/${nexusSlug}/mods/${mod.mod_id}`
          window.electronAPI.shell.openPath(modUrl)
          setInstallStep('manual_download')
          setManualMod({ mod, file, description: modDescription })
          return
        }
        addLog(`Download error: ${dlResult.error}`)
        setInstallStep('error')
        return
      }

      addLog(`Downloaded to ${dlResult.archivePath}`)
      setInstallStep('extracting')
      addLog('Extracting archive...')

      const installResult = await window.electronAPI.nexus.installMod({
        archivePath: dlResult.archivePath,
        modDir: dlResult.modDir,
        game: game?.title,
        installPath: game?.install_path || '',
        description: modDescription,
      })

      if (installResult.error) {
        addLog(`Extract error: ${installResult.error}`)
        setInstallStep('error')
        return
      }

      addLog(`Extracted ${installResult.contents?.length || 0} items`)
      setInstallAnalysis(installResult.analysis)
      setExtractDir(installResult.extractDir)
      addLog(`Analysis: ${installResult.analysis?.notes?.join(', ') || 'No specific instructions found'}`)

      const allNotes = (installResult.analysis?.notes || []).join(' ')
      let dep = null
      if (/requires bepinex/i.test(allNotes)) dep = 'BepInEx'
      else if (/requires smapi/i.test(allNotes)) dep = 'SMAPI'
      else if (/requires script extender/i.test(allNotes)) dep = 'Script Extender'
      else if (/requires scripthookv/i.test(allNotes)) dep = 'ScriptHookV'
      else if (/requires openiv/i.test(allNotes)) dep = 'OpenIV'
      else if (/thunderstore|r2modman/i.test(allNotes)) dep = 'r2modman/Thunderstore'

      if (dep) {
        addLog(`Detected dependency: ${dep}. Searching Nexus Mods...`)
        setInstallStep('resolving_dep')
        const depResult = await window.electronAPI.nexus.resolveDependencies({
          apiKey, slug: nexusSlug, dependency: dep, gameTitle: game?.title, installPath: game?.install_path || '',
        })
        if (depResult.found) {
          setDepInfo(depResult)
          addLog(`Found dependency: ${depResult.mod.name} by ${depResult.mod.author}`)
          setInstallStep('installing_dep')
          await installDependency(depResult)
        } else {
          addLog(`Dependency "${dep}" not found on Nexus Mods for this game. Continuing...`)
          setDepInfo(null)
          setInstallStep('review')
        }
      } else {
        setInstallStep('review')
      }

    } catch (err) {
      addLog(`Error: ${err.message}`)
      setInstallStep('error')
    }
  }

  const installDependency = async (depResult) => {
    try {
      window.electronAPI.nexus.onDownloadProgress((data) => {
        if (data.modId === depResult.mod.mod_id) {
          setDepDownloadProgress({ downloaded: data.downloaded, total: data.total })
        }
      })

      addLog(`Downloading ${depResult.dependency}: ${depResult.file.file_name}...`)
      const dlResult = await window.electronAPI.nexus.downloadMod({
        apiKey,
        slug: nexusSlug,
        modId: depResult.mod.mod_id,
        fileId: depResult.file.file_id,
        gameTitle: game?.title || 'Unknown',
      })

      if (dlResult.error) {
        if (dlResult.error.includes('403')) {
          addLog(`Premium required for auto-download of ${depResult.dependency}. Opening in browser...`)
          const modUrl = `https://www.nexusmods.com/${nexusSlug}/mods/${depResult.mod.mod_id}`
          window.electronAPI.shell.openPath(modUrl)
          addLog(`Please download ${depResult.dependency} manually, then click Continue.`)
          setInstallStep('manual_dep')
          return
        }
        addLog(`Download error: ${dlResult.error}. Skipping dependency.`)
        setInstallStep('review')
        return
      }

      addLog(`Downloaded ${depResult.dependency}. Installing...`)
      setInstallStep('installing_dep')

      addLog(`Installing ${depResult.dependency} files to game directory...`)

      const rawResult = await window.electronAPI.nexus.installDependencyRaw({
        archivePath: dlResult.archivePath,
        modDir: dlResult.modDir,
        gameTitle: game?.title || 'Unknown',
        installPath: game?.install_path || '',
        dependency: depResult.dependency,
      })

      if (rawResult.error) {
        addLog(`Install error for ${depResult.dependency}: ${rawResult.error}. Skipping.`)
        setInstallStep('review')
        return
      }

      addLog(`${depResult.dependency} installed: ${rawResult.copied} file(s) copied`)
      await window.electronAPI.db.addMod({
        game_id: parseInt(gameId),
        nexus_id: depResult.mod.mod_id,
        name: depResult.mod.name,
        author: depResult.mod.author,
        version: depResult.mod.version,
        description: `Auto-installed dependency: ${depResult.dependency}`,
        archive_path: null,
        install_path: game?.install_path || null,
        installed_files: JSON.stringify(rawResult.files),
      })

      setDepInfo(null)
      setInstallStep('review')
      addLog(`${depResult.dependency} ready. Proceeding with ${installMod?.name}...`)
    } catch (err) {
      addLog(`Error installing dependency: ${err.message}`)
      setDepInfo(null)
      setInstallStep('review')
    }
  }

  const handleManualFilePick = async () => {
    const filePath = await window.electronAPI.dialog.openFile([
      { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] }
    ])
    if (!filePath) return

    setInstallStep('extracting')
    addLog(`Using file: ${filePath.split(/[\\/]/).pop()}`)

    try {
      const installResult = await window.electronAPI.nexus.installMod({
        archivePath: filePath,
        modDir: filePath.replace(/[\\/][^\\/]+\.\w+$/, ''),
        game: game?.title,
        installPath: game?.install_path || '',
        description: manualMod?.description || '',
      })

      if (installResult.error) {
        addLog(`Extract error: ${installResult.error}`)
        setInstallStep('error')
        return
      }

      addLog(`Extracted ${installResult.contents?.length || 0} items`)
      setInstallAnalysis(installResult.analysis)
      setExtractDir(installResult.extractDir)
      setInstallStep('review')
      addLog(`Analysis: ${installResult.analysis?.notes?.join(', ') || 'No specific instructions found'}`)
    } catch (err) {
      addLog(`Error: ${err.message}`)
      setInstallStep('error')
    }
  }

  const confirmInstall = async () => {
    if (!installAnalysis || !installMod) return
    setInstallStep('installing')
    addLog('Installing files...')

    try {
      const result = await window.electronAPI.nexus.copyModFiles({
        sourceDir: extractDir,
        targetDirs: installAnalysis.files.map(f => ({
          src: f.name,
          dest: f.dest,
          name: f.name,
        })),
      })

      if (result.error) {
        addLog(`Install error: ${result.error}`)
        setInstallStep('error')
        return
      }

      addLog(`Copied ${result.copied} file(s)`)

      const installedFiles = installAnalysis.files.map(f => f.dest + '/' + f.name)

      await window.electronAPI.db.addMod({
        game_id: parseInt(gameId),
        nexus_id: installMod.mod_id,
        name: installMod.name,
        author: installMod.author,
        version: installMod.version,
        description: installMod.summary,
        archive_path: null,
        install_path: game?.install_path || null,
        installed_files: JSON.stringify(installedFiles),
      })

      const installed = await window.electronAPI.db.getMods(parseInt(gameId))
      setInstalledMods(installed)
      setInstallStep('done')
      addLog('Installation complete!')
    } catch (err) {
      addLog(`Error: ${err.message}`)
      setInstallStep('error')
    }
  }

  const cancelInstall = () => {
    setInstallStep(null)
    setInstallMod(null)
    setModFiles([])
    setSelectedFile(null)
    setInstallAnalysis(null)
    setExtractDir(null)
    setInstallLog([])
    setDownloadProgress({ downloaded: 0, total: 0 })
    setDepInfo(null)
    setDepDownloadProgress({ downloaded: 0, total: 0 })
  }

  const handleRemoveMod = async (mod) => {
    if (!confirm(`Remove mod "${mod.name}"?`)) return
    await window.electronAPI.db.deleteMod(mod.id)
    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
    setInstalledMods(installed)
  }

  const handleSearchChange = (value) => {
    setSearch(value)
    setCurrentPage(1)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => {
      searchNexusMods(value)
    }, 500)
    setDebounceTimer(timer)
  }

  const isInstalled = (nexusModId) => installedMods.some(m => m.nexus_id === nexusModId)
  const isInstalling = (modId) => installMod?.mod_id === modId && installStep && installStep !== 'done' && installStep !== 'error'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/game/${gameId}`)}
          className="p-2 rounded-lg bg-cl-card hover:bg-cl-card-hover border border-cl-border text-cl-text-dim hover:text-cl-text transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-cl-text">Mod Browser</h1>
          <p className="text-sm text-cl-text-dim">{game?.title || 'Loading...'}</p>
        </div>
      </div>

      {!apiKey ? (
        <div className="bg-cl-card border border-cl-border rounded-xl p-6 text-center space-y-4">
          <svg className="w-12 h-12 mx-auto text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-cl-text">Connect to Nexus Mods</h3>
            <p className="text-sm text-cl-text-dim mt-1">Enter your API key to browse mods.</p>
          </div>
          <button onClick={() => setShowApiKeyInput(true)} className="btn-primary">Enter API Key</button>
          {showApiKeyInput && (
            <div className="max-w-md mx-auto space-y-3">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-field" placeholder="Your Nexus Mods API key" />
              <div className="flex gap-2 justify-center">
                <button onClick={() => setShowApiKeyInput(false)} className="btn-secondary text-sm">Cancel</button>
                <button onClick={handleSaveApiKey} className="btn-primary text-sm">Save & Connect</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cl-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search mods on Nexus Mods..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <button onClick={() => fetchNexusMods(apiKey, nexusSlug)} disabled={loading} className="btn-secondary text-sm">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-cl-text-dim">
            <span>Nexus game:</span>
            {showSlugPicker ? (
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <input
                  type="text"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applySlug()}
                  className="input-field text-xs py-1.5 flex-1"
                  placeholder="Type game name or slug..."
                  autoFocus
                />
                <button onClick={applySlug} className="btn-primary text-xs py-1.5">Go</button>
                <button onClick={searchNexusGames} disabled={searchingGames} className="btn-secondary text-xs py-1.5">
                  {searchingGames ? '...' : 'Find'}
                </button>
                <button onClick={() => { setShowSlugPicker(false); setSlugSuggestions([]) }} className="text-cl-text-dim hover:text-cl-text p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSlugPicker(true)}
                className="text-cl-accent hover:underline cursor-pointer"
              >
                {nexusSlug || 'Select game...'}
              </button>
            )}
          </div>

          {slugSuggestions.length > 0 && (
            <div className="bg-cl-card border border-cl-border rounded-lg p-2 max-h-60 overflow-y-auto space-y-0.5">
              {slugSuggestions.map(r => (
                <button
                  key={r.domain}
                  onClick={() => selectSlug(r.domain)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-cl-accent/10 transition-all text-left"
                >
                  <span className="text-sm text-cl-text">{r.name}</span>
                  <span className="text-xs text-cl-text-dim">{r.domain}</span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-cl-red/10 border border-cl-red/30 rounded-lg p-3 text-sm text-cl-red">
              {error}
            </div>
          )}

          {!error && !loading && nexusMods.length === 0 && nexusSlug && (
            <div className="text-center py-12 text-cl-text-dim space-y-3">
              <p>No mods found for <span className="text-cl-accent font-medium">{nexusSlug}</span></p>
              <p className="text-xs">Click the game name above to search for the correct Nexus Mods game.</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3 text-cl-text-dim">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Fetching mods...
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {nexusMods
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map(mod => {
                    const img = getModImage(mod)
                    return (
                      <div key={mod.mod_id} className="bg-cl-card border border-cl-border rounded-xl p-4 animate-slide-up">
                        <div className="flex gap-4">
                          {img && <img src={img} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="font-semibold text-cl-text truncate">{mod.name}</h3>
                                <p className="text-xs text-cl-text-dim mt-0.5">
                                  by {mod.author} · v{mod.version} · {mod.downloads?.toLocaleString()} downloads
                                </p>
                              </div>
                              <button
                                onClick={() => handleInstallMod(mod)}
                                disabled={isInstalled(mod.mod_id) || isInstalling(mod.mod_id)}
                                className={`btn-primary text-sm shrink-0 ${isInstalled(mod.mod_id) ? 'opacity-50 cursor-default' : ''}`}
                              >
                                {isInstalling(mod.mod_id) ? 'Installing...' : isInstalled(mod.mod_id) ? 'Installed' : 'Install'}
                              </button>
                            </div>
                            {mod.summary && <p className="text-sm text-cl-text-dim mt-2 line-clamp-2">{mod.summary}</p>}
                            <div className="flex items-center gap-4 mt-2">
                              {mod.endorsements > 0 && (
                                <span className="text-xs text-cl-text-dim">{mod.endorsements} endorsements</span>
                              )}
                              {mod.updated_timestamp && (
                                <span className="text-xs text-cl-text-dim">
                                  Updated {new Date(mod.updated_timestamp * 1000).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>

              {nexusMods.length > PAGE_SIZE && (() => {
                const totalPages = Math.ceil(nexusMods.length / PAGE_SIZE)
                const pages = []
                for (let i = 1; i <= totalPages; i++) {
                  if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                    pages.push({ type: 'page', num: i })
                  } else if (pages[pages.length - 1]?.type !== 'ellipsis') {
                    pages.push({ type: 'ellipsis' })
                  }
                }
                return (
                  <div className="flex items-center justify-center gap-1.5 pt-4">
                    {pages.map((p, idx) =>
                      p.type === 'ellipsis' ? (
                        <span key={`e${idx}`} className="text-cl-text-dim px-1">...</span>
                      ) : (
                        <button
                          key={p.num}
                          onClick={() => setCurrentPage(p.num)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                            currentPage === p.num
                              ? 'bg-cl-accent text-white'
                              : 'text-cl-text-dim hover:text-cl-text hover:bg-cl-card border border-cl-border'
                          }`}
                        >
                          {p.num}
                        </button>
                      )
                    )}
                    <span className="text-xs text-cl-text-dim ml-2">
                      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, nexusMods.length)} of {nexusMods.length}
                    </span>
                  </div>
                )
              })()}
            </>
          )}
        </>
      )}

      {installedMods.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-cl-border">
          <h3 className="text-sm font-semibold text-cl-text uppercase tracking-wider">Installed Mods ({installedMods.length})</h3>
          <div className="space-y-2">
            {installedMods.map(mod => (
              <div key={mod.id} className="flex items-center gap-3 bg-cl-card border border-cl-border rounded-lg p-3">
                <div className={`w-2 h-2 rounded-full ${mod.enabled ? 'bg-cl-green' : 'bg-cl-red'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cl-text truncate">{mod.name}</p>
                  <p className="text-xs text-cl-text-dim">{mod.author || 'Unknown author'} · v{mod.version || '?'}</p>
                </div>
                <button
                  onClick={async () => {
                    await window.electronAPI.db.updateMod(mod.id, { enabled: mod.enabled ? 0 : 1 })
                    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
                    setInstalledMods(installed)
                  }}
                  className={`px-3 py-1 rounded text-xs font-medium ${mod.enabled ? 'bg-cl-green/10 text-cl-green hover:bg-cl-green/20' : 'bg-cl-red/10 text-cl-red hover:bg-cl-red/20'}`}
                >
                  {mod.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => handleRemoveMod(mod)} className="p-1.5 rounded text-cl-text-dim hover:text-cl-red hover:bg-cl-red/10 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {installStep && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={cancelInstall}>
          <div className="bg-cl-card border border-cl-border rounded-xl p-6 max-w-lg w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-cl-text">{installMod?.name}</h3>
              {installStep !== 'installing' && (
                <button onClick={cancelInstall} className="text-cl-text-dim hover:text-cl-text">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {installStep === 'fetching_files' && (
              <div className="flex items-center gap-3 text-cl-text-dim py-4">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Fetching mod files...
              </div>
            )}

            {installStep === 'select_file' && (
              <div className="space-y-3">
                <p className="text-sm text-cl-text-dim">Select a file to download:</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {modFiles.map(file => (
                    <button
                      key={file.file_id}
                      onClick={() => startDownload(installMod, file)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-cl-darker hover:bg-cl-accent/10 border border-cl-border hover:border-cl-accent/30 transition-all text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-cl-text truncate">{file.file_name}</p>
                        <p className="text-xs text-cl-text-dim">
                          {file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Unknown size'}
                          {file.version && ` · v${file.version}`}
                          {file.category_name && ` · ${file.category_name}`}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-cl-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {installStep === 'downloading' && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-3 text-cl-text-dim">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Downloading...
                </div>
                <div className="w-full bg-cl-darker rounded-full h-2">
                  <div
                    className="bg-cl-accent h-2 rounded-full transition-all"
                    style={{ width: `${downloadProgress.total > 0 ? (downloadProgress.downloaded / downloadProgress.total * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-cl-text-dim text-center">
                  {downloadProgress.total > 0
                    ? `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} / ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB`
                    : 'Starting download...'}
                </p>
              </div>
            )}

            {installStep === 'extracting' && (
              <div className="flex items-center gap-3 text-cl-text-dim py-4">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Extracting archive...
              </div>
            )}

            {installStep === 'review' && installAnalysis && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-cl-text">Installation Analysis</p>
                {installAnalysis.notes?.map((note, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-cl-text-dim">
                    <svg className="w-4 h-4 mt-0.5 text-cl-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {note}
                  </div>
                ))}
                <div className="bg-cl-darker rounded-lg p-3 text-xs text-cl-text-dim">
                  <p>Confidence: <span className={`font-medium ${installAnalysis.confidence === 'high' ? 'text-cl-green' : installAnalysis.confidence === 'medium' ? 'text-cl-accent' : 'text-cl-yellow'}`}>{installAnalysis.confidence}</span></p>
                  <p>Target: {installAnalysis.suggestedTarget || 'Game directory'}</p>
                  <p>{installAnalysis.files?.length || 0} item(s) to install</p>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Cancel</button>
                  <button onClick={confirmInstall} className="btn-primary text-sm">Install</button>
                </div>
              </div>
            )}

            {installStep === 'installing' && (
              <div className="flex items-center gap-3 text-cl-text-dim py-4">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Installing files...
              </div>
            )}

            {installStep === 'resolving_dep' && (
              <div className="flex items-center gap-3 text-cl-text-dim py-4">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Searching for dependency on Nexus Mods...
              </div>
            )}

            {installStep === 'installing_dep' && depInfo && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-3 text-cl-text-dim">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Installing dependency: {depInfo.mod.name}...
                </div>
                <div className="w-full bg-cl-darker rounded-full h-2">
                  <div
                    className="bg-cl-green h-2 rounded-full transition-all"
                    style={{ width: `${depDownloadProgress.total > 0 ? (depDownloadProgress.downloaded / depDownloadProgress.total * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-cl-text-dim text-center">
                  {depDownloadProgress.total > 0
                    ? `${(depDownloadProgress.downloaded / 1024 / 1024).toFixed(1)} / ${(depDownloadProgress.total / 1024 / 1024).toFixed(1)} MB`
                    : 'Downloading dependency...'}
                </p>
              </div>
            )}

            {installStep === 'manual_dep' && (
              <div className="text-center py-4 space-y-3">
                <svg className="w-12 h-12 mx-auto text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-cl-text">Manual Dependency Download</p>
                  <p className="text-xs text-cl-text-dim mt-1">Nexus Mods Premium is needed for auto-downloads.<br/>The dependency page is open in your browser.</p>
                </div>
                <div className="bg-cl-darker rounded-lg p-3 text-xs text-cl-text-dim space-y-1">
                  <p>Dependency: <span className="text-cl-green font-medium">{depInfo?.mod?.name}</span></p>
                  <p>Download and install this dependency to your game directory, then click Continue.</p>
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  <button onClick={() => { setDepInfo(null); setInstallStep('review') }} className="btn-secondary text-sm">Skip</button>
                  <button onClick={() => { setDepInfo(null); setInstallStep('review') }} className="btn-primary text-sm">Continue</button>
                </div>
              </div>
            )}

            {installStep === 'done' && (
              <div className="text-center py-4 space-y-3">
                <svg className="w-12 h-12 mx-auto text-cl-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-cl-text">Installation Complete!</p>
                <button onClick={cancelInstall} className="btn-primary text-sm">Done</button>
              </div>
            )}

            {installStep === 'manual_download' && (
              <div className="text-center py-4 space-y-3">
                <svg className="w-12 h-12 mx-auto text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-cl-text">Manual Download Required</p>
                  <p className="text-xs text-cl-text-dim mt-1">Nexus Mods Premium is needed for auto-downloads.<br/>The mod page is now open in your browser.</p>
                </div>
                <ol className="text-xs text-cl-text-dim text-left max-w-xs mx-auto space-y-1 list-decimal list-inside">
                  <li>Download the file from Nexus Mods</li>
                  <li>Click "Pick Downloaded File" below</li>
                  <li>Select the downloaded archive</li>
                </ol>
                <div className="flex gap-2 justify-center pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Cancel</button>
                  <button onClick={handleManualFilePick} className="btn-primary text-sm">Pick Downloaded File</button>
                </div>
              </div>
            )}

            {installStep === 'error' && (
              <div className="text-center py-4 space-y-3">
                <svg className="w-12 h-12 mx-auto text-cl-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-cl-text">Installation Failed</p>
                <button onClick={cancelInstall} className="btn-secondary text-sm">Close</button>
              </div>
            )}

            {installLog.length > 0 && (
              <div className="bg-cl-darker rounded-lg p-3 max-h-32 overflow-y-auto">
                {installLog.map((msg, i) => (
                  <p key={i} className="text-xs text-cl-text-dim font-mono">{msg}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
