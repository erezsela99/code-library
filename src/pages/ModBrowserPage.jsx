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
  const [depDownloadProgress, setDepDownloadProgress] = useState({ downloaded: 0, total: 0 })
  const [preflightResult, setPreflightResult] = useState(null)
  const [depChain, setDepChain] = useState([])
  const [installQueue, setInstallQueue] = useState([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [autoDetectStatus, setAutoDetectStatus] = useState(null)
  const [nexusGameName, setNexusGameName] = useState('')
  const [sortBy, setSortBy] = useState('trending')
  const PAGE_SIZE = 10

  useEffect(() => {
    loadData()
  }, [gameId])

  const loadData = async () => {
    if (!window.electronAPI) return
    const g = await window.electronAPI.db.getGame(parseInt(gameId))
    setGame(g)
    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
    setInstalledMods(installed)
    const savedKey = await window.electronAPI.db.getSetting('nexus_api_key')
    if (savedKey) {
      setApiKey(savedKey)
    }
    if (!savedKey || !g) return

    const savedSlug = g.nexus_slug || await window.electronAPI.db.getSetting(`nexus_slug_${gameId}`)
    const savedName = g.nexus_game_name || ''
    if (savedSlug) {
      setNexusSlug(savedSlug)
      setSlugInput(savedSlug)
      setNexusGameName(savedName)
      fetchNexusMods(savedKey, savedSlug, 'trending')
      return
    }

    setLoading(true)
    setAutoDetectStatus('Searching Nexus Mods for this game...')
    try {
      const result = await window.electronAPI.nexus.autoDetectSlug(savedKey, parseInt(gameId), g.title)
      if (result.slug) {
        setNexusSlug(result.slug)
        setSlugInput(result.slug)
        setNexusGameName(result.name || '')
        await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, result.slug)
        setAutoDetectStatus(
          result.confidence === 'high'
            ? `Auto-matched: ${result.name}`
            : result.confidence === 'medium'
            ? `Best guess: ${result.name} (click to change)`
            : `Possible match: ${result.name} (verify below)`
        )
        fetchNexusMods(savedKey, result.slug, 'trending')
      } else {
        setAutoDetectStatus('Game not found on Nexus Mods. Select manually below.')
        setShowSlugPicker(true)
      }
    } catch {
      setAutoDetectStatus('Could not reach Nexus Mods API.')
    }
    setLoading(false)
  }

  const isSafeMod = (mod) => {
    const status = (mod.status || '').toLowerCase()
    return !status || status === 'published' || status === 'normal'
  }

  const NEXUS_SORT_MAP = {
    trending: { sort_by: 'updated_timestamp', sort_direction: 'desc' },
    downloads: { sort_by: 'downloads', sort_direction: 'desc' },
    endorsements: { sort_by: 'endorsements', sort_direction: 'desc' },
    newest: { sort_by: 'created_timestamp', sort_direction: 'desc' },
    updated: { sort_by: 'updated_timestamp', sort_direction: 'desc' },
    name: { sort_by: 'name', sort_direction: 'asc' },
  }

  const fetchNexusMods = async (key, slug, sortKey) => {
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
              if (!seen.has(mod.mod_id) && isSafeMod(mod)) {
                seen.add(mod.mod_id)
                allMods.push(mod)
              }
            }
          }
        } catch {}
      }
      if (allMods.length === 0) {
        setError(`No safe mods found for "${slug}". Click the game name to search.`)
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
      fetchNexusMods(apiKey, nexusSlug, sortBy)
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
        setNexusMods(mods.filter(isSafeMod))
      } else {
        fetchNexusMods(apiKey, nexusSlug, sortBy)
      }
    } catch {
      fetchNexusMods(apiKey, nexusSlug, sortBy)
    }
    setLoading(false)
  }

  const searchNexusGames = async () => {
    if (!apiKey || !slugInput.trim()) return
    setSearchingGames(true)
    try {
      const results = await window.electronAPI.nexus.searchGames(apiKey, slugInput)
      setSlugSuggestions(results.map(r => ({ domain: r.domain, name: r.name })))
    } catch {}
    setSearchingGames(false)
  }

  const selectSlug = async (domain, name) => {
    setNexusSlug(domain)
    setSlugInput(domain)
    setNexusGameName(name || '')
    setShowSlugPicker(false)
    setSlugSuggestions([])
    setAutoDetectStatus(null)
    await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, domain)
    await window.electronAPI.db.updateGame(parseInt(gameId), { nexus_slug: domain, nexus_game_name: name || '' })
    fetchNexusMods(apiKey, domain, sortBy)
  }

  const applySlug = async () => {
    const slug = slugInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug) return
    setNexusSlug(slug)
    setNexusGameName('')
    setShowSlugPicker(false)
    setAutoDetectStatus(null)
    await window.electronAPI.db.setSetting(`nexus_slug_${gameId}`, slug)
    await window.electronAPI.db.updateGame(parseInt(gameId), { nexus_slug: slug, nexus_game_name: '' })
    fetchNexusMods(apiKey, slug, sortBy)
  }

  const handleSaveApiKey = async () => {
    await window.electronAPI.db.setSetting('nexus_api_key', apiKey)
    setShowApiKeyInput(false)
    setAutoDetectStatus(null)
    if (game) {
      setLoading(true)
      setAutoDetectStatus('Searching Nexus Mods for this game...')
      try {
        const result = await window.electronAPI.nexus.autoDetectSlug(apiKey, parseInt(gameId), game.title)
        if (result.slug) {
          setNexusSlug(result.slug)
          setSlugInput(result.slug)
          setNexusGameName(result.name || '')
          setAutoDetectStatus(`Auto-matched: ${result.name}`)
          fetchNexusMods(apiKey, result.slug, 'trending')
        } else {
          setAutoDetectStatus('Game not found on Nexus Mods. Select manually below.')
          setShowSlugPicker(true)
        }
      } catch {
        setAutoDetectStatus('Could not reach Nexus Mods API.')
      }
      setLoading(false)
    }
  }

  const addLog = (msg) => setInstallLog(prev => [...prev, msg])

  const handleInstallMod = async (mod) => {
    if (!apiKey || !nexusSlug) return
    setInstallMod(mod)
    setInstallStep('preflight')
    setInstallLog([])
    setModFiles([])
    setSelectedFile(null)
    setInstallAnalysis(null)
    setPreflightResult(null)
    setDepChain([])

    addLog('Running pre-flight checks...')
    const pfResult = await window.electronAPI.preflight.check(game, apiKey, nexusSlug)
    setPreflightResult(pfResult)
    addLog(`Pre-flight: ${pfResult.checks.length} check(s), all OK: ${pfResult.allOk}`)

    for (const check of pfResult.checks) {
      addLog(`  ${check.ok ? '✓' : '✗'} ${check.name}: ${check.message}`)
    }

    if (!pfResult.allOk) {
      const failed = pfResult.checks.find(c => !c.ok)
      if (failed?.name === 'Mod Loader' && failed?.loader) {
        setInstallStep('missing_loader')
        addLog(`Mod loader "${failed.loader.name}" is required but not installed.`)
        return
      }
      setInstallStep('preflight_failed')
      addLog('Pre-flight checks failed. Fix the issues above and try again.')
      return
    }

    addLog('Fetching mod description for dependency analysis...')
    const descResult = await window.electronAPI.nexus.getModDescription(apiKey, nexusSlug, mod.mod_id)
    const modDescription = descResult?.description || descResult?.summary || mod.summary || ''
    addLog(`Got description (${modDescription.length} chars)`)

    addLog('Analyzing dependencies...')
    const chain = await window.electronAPI.preflight.getDepChain(apiKey, nexusSlug, modDescription, game?.title, game?.install_path || '')
    setDepChain(chain)

    if (chain.length > 0) {
      addLog(`Found ${chain.length} dependency(ies):`)
      for (const dep of chain) {
        const sources = dep.sources.map(s => s.source).join(', ') || 'none'
        const vtStatus = dep.vtScan?.clean ? ' [VT: Clean]' : dep.vtScan?.scanned ? ` [VT: ${dep.vtScan.malicious} threats]` : ''
        addLog(`  ${dep.found ? '✓' : '?'} ${dep.name}${dep.found ? ` → sources: ${sources}` : ' (not found)'}${vtStatus}`)
      }
      setInstallStep('dep_preview')
      return
    }

    addLog('No dependencies detected. Proceeding to download...')
    proceedToDownload(mod)
  }

  const proceedToDownload = async (mod) => {
    setInstallMod(mod)
    setInstallStep('fetching_files')
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

  const installAllDeps = async (mod) => {
    const depsToInstall = depChain.filter(d => d.found && d.bestSource)
    if (depsToInstall.length === 0) {
      setDepChain([])
      proceedToDownload(mod)
      return
    }

    setInstallQueue(depsToInstall)
    setQueueIndex(0)
    setInstallStep('installing_deps')

    for (let i = 0; i < depsToInstall.length; i++) {
      const dep = depsToInstall[i]
      setQueueIndex(i)
      const best = dep.bestSource
      addLog(`Installing dependency ${i + 1}/${depsToInstall.length}: ${dep.name} (from ${best.source})...`)

      try {
        let dlResult = null

        if (best.source === 'nexus') {
          window.electronAPI.nexus.onDownloadProgress((data) => {
            if (data.modId === best.modId) {
              setDepDownloadProgress({ downloaded: data.downloaded, total: data.total })
            }
          })
          dlResult = await window.electronAPI.nexus.downloadMod({
            apiKey, slug: nexusSlug, modId: best.modId, fileId: best.fileId, gameTitle: game?.title || 'Unknown',
          })
        } else if (best.downloadUrl) {
          addLog(`Downloading ${best.assetName || dep.name} from ${best.source}...`)
          dlResult = await window.electronAPI.dep.downloadExternal({
            url: best.downloadUrl,
            fileName: best.assetName || `${dep.name}.zip`,
            gameTitle: game?.title || 'Unknown',
            depName: dep.name,
          })
        } else {
          addLog(`No download URL available for ${dep.name} from ${best.source}. Skipping.`)
          continue
        }

        if (dlResult?.vtScan && !dlResult.vtScan.clean) {
          addLog(`VirusTotal WARNING: ${dlResult.vtScan.malicious} malicious, ${dlResult.vtScan.suspicious} suspicious detections. Skipping ${dep.name}.`)
          continue
        }

        if (dlResult?.vtScan?.scanned && dlResult.vtScan.clean) {
          addLog(`VirusTotal: Clean (${dlResult.vtScan.harmless} engines, 0 threats)`)
        }

        if (dlResult.error) {
          if (dlResult.error === 'virus_detected') {
            addLog(`BLOCKED: ${dlResult.message}`)
            continue
          }
          if (dlResult.error.includes('403') && best.source === 'nexus') {
            addLog(`Premium required for ${dep.name}. Opening in browser...`)
            window.electronAPI.shell.openExternal(`https://www.nexusmods.com/${nexusSlug}/mods/${best.modId}`)
            addLog(`Please download "${dep.name}" manually, then click Continue.`)
            setInstallStep('manual_dep_queue')
            return
          }
          if (best.source !== 'nexus' && dlResult.error.includes('403')) {
            addLog(`Download requires authentication. Opening in browser...`)
            window.electronAPI.shell.openExternal(best.officialUrl || best.downloadUrl)
            addLog(`Please download "${dep.name}" manually, then click Continue.`)
            setInstallStep('manual_dep_queue')
            return
          }
          addLog(`Download error for ${dep.name}: ${dlResult.error}. Skipping.`)
          continue
        }

        addLog(`Downloaded ${dep.name}. Installing...`)
        const rawResult = await window.electronAPI.nexus.installDependencyRaw({
          archivePath: dlResult.archivePath, modDir: dlResult.modDir, gameTitle: game?.title || 'Unknown',
          installPath: game?.install_path || '', dependency: dep.name,
        })

        if (rawResult.error === 'permission_denied') {
          addLog(`Permission denied for ${dep.name}: Game is in a protected directory.`)
          addLog(rawResult.stageDir
            ? `Files staged to: ${rawResult.stageDir}`
            : `Drag files from the opened folder into: ${rawResult.gameDir}`)
          addLog(`Windows Explorer windows opened. Drag and drop the files manually.`)
          continue
        }

        if (rawResult.error) {
          addLog(`Install error for ${dep.name}: ${rawResult.error}. Skipping.`)
          continue
        }

        addLog(`${dep.name} installed: ${rawResult.copied} file(s) copied`)
        await window.electronAPI.db.addMod({
          game_id: parseInt(gameId), nexus_id: best.modId || null, name: dep.name, author: best.author || best.source,
          version: best.version || '', description: `Auto-installed dependency from ${best.source}`,
          archive_path: null, install_path: game?.install_path || null, installed_files: JSON.stringify(rawResult.files || []),
        })
      } catch (err) {
        addLog(`Error installing ${dep.name}: ${err.message}`)
      }
    }

    addLog('All dependencies installed.')
    setDepChain([])
    proceedToDownload(mod)
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
        apiKey, slug: nexusSlug, modId: mod.mod_id, fileId: file.file_id, gameTitle: game?.title || 'Unknown',
      })

      if (dlResult.error) {
        if (dlResult.error.includes('403')) {
          addLog('Premium required for auto-download. Opening in browser...')
          const modUrl = `https://www.nexusmods.com/${nexusSlug}/mods/${mod.mod_id}`
          window.electronAPI.shell.openExternal(modUrl)
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
        archivePath: dlResult.archivePath, modDir: dlResult.modDir, game: game?.title,
        installPath: game?.install_path || '', description: modDescription,
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
      setInstallStep('review')

    } catch (err) {
      addLog(`Error: ${err.message}`)
      setInstallStep('error')
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

      if (result.error === 'permission_denied') {
        addLog(`Permission denied: Game is in a protected directory.`)
        addLog(result.stageDir
          ? `Files staged to: ${result.stageDir}`
          : `Drag files from the opened folder into: ${result.gameDir}`)
        addLog(`Windows Explorer windows opened. Drag and drop the files manually.`)
        setInstallStep('permission_denied')
        return
      }

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
    setDepDownloadProgress({ downloaded: 0, total: 0 })
    setPreflightResult(null)
    setDepChain([])
    setInstallQueue([])
    setQueueIndex(0)
  }

  const handleRemoveMod = async (mod) => {
    if (!confirm(`Remove mod "${mod.name}"?`)) return
    await window.electronAPI.db.deleteMod(mod.id)
    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
    setInstalledMods(installed)
  }

  const handleCheckHealth = async () => {
    if (!apiKey || !installedMods.length) return
    setCheckingHealth(true)
    try {
      const results = await window.electronAPI.db.checkHealth(parseInt(gameId), apiKey)
      setInstalledMods(results)
    } catch {}
    setCheckingHealth(false)
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
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/game/${gameId}`)}
          className="p-2.5 glass rounded-xl hover:bg-cl-border/40 text-cl-text-dim hover:text-cl-text transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold gradient-text">Mod Browser</h1>
          <p className="text-sm text-cl-text-dim">{game?.title || 'Loading...'}</p>
        </div>
      </div>

      {/* API Key prompt */}
      {!apiKey ? (
        <div className="glass rounded-2xl p-8 text-center space-y-4 animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-cl-accent/10 border border-cl-accent/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold gradient-text">Connect to Nexus Mods</h3>
            <p className="text-sm text-cl-text-dim mt-1">Enter your API key to browse and install mods.</p>
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
          {/* Search + controls */}
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
            <button onClick={() => fetchNexusMods(apiKey, nexusSlug, sortBy)} disabled={loading} className="btn-secondary text-sm">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* Game slug */}
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
                {nexusGameName || nexusSlug || 'Select game...'}
              </button>
            )}
          </div>

          {autoDetectStatus && (
            <p className="text-xs text-cl-text-dim italic">{autoDetectStatus}</p>
          )}

          {/* Slug suggestions */}
          {slugSuggestions.length > 0 && (
            <div className="glass rounded-xl p-2 max-h-60 overflow-y-auto space-y-0.5">
              {slugSuggestions.map(r => (
                <button
                  key={r.domain}
                  onClick={() => selectSlug(r.domain, r.name)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-cl-accent/10 transition-all text-left"
                >
                  <span className="text-sm text-cl-text font-medium">{r.name}</span>
                  <span className="text-xs text-cl-text-dim">{r.domain}</span>
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass rounded-xl p-3 text-sm text-cl-red border border-cl-red/30">
              {error}
            </div>
          )}

          {/* No mods */}
          {!error && !loading && nexusMods.length === 0 && nexusSlug && (
            <div className="text-center py-12 text-cl-text-dim space-y-3">
              <p>No mods found for <span className="text-cl-accent font-medium">{nexusGameName || nexusSlug}</span></p>
              <p className="text-xs">Click the game name above to search for the correct Nexus Mods game.</p>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3 text-cl-text-dim">
                <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                Fetching mods...
              </div>
            </div>
          ) : (
            <>
              {/* Sort filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'trending', label: 'Trending' },
                  { key: 'downloads', label: 'Most Downloaded' },
                  { key: 'endorsements', label: 'Most Endorsed' },
                  { key: 'newest', label: 'Newest' },
                  { key: 'updated', label: 'Recently Updated' },
                  { key: 'name', label: 'A → Z' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => { setSortBy(f.key); setCurrentPage(1) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      sortBy === f.key
                        ? 'bg-cl-accent text-white shadow-glow'
                        : 'glass text-cl-text-dim hover:text-cl-text hover:bg-cl-border/30'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Mod cards */}
              <div className="space-y-3">
                {[...nexusMods]
                  .sort((a, b) => {
                    switch (sortBy) {
                      case 'downloads': return (b.downloads || 0) - (a.downloads || 0)
                      case 'endorsements': return (b.endorsements || 0) - (a.endorsements || 0)
                      case 'newest': return (b.created_timestamp || 0) - (a.created_timestamp || 0)
                      case 'updated': return (b.updated_timestamp || 0) - (a.updated_timestamp || 0)
                      case 'name': return (a.name || '').localeCompare(b.name || '')
                      default: return 0
                    }
                  })
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((mod, i) => {
                    const img = getModImage(mod)
                    return (
                      <div key={mod.mod_id} className="glass rounded-2xl p-4 animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
                        <div className="flex gap-4">
                          {img && <img src={img} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="font-semibold text-cl-text truncate">{mod.name}</h3>
                                <p className="text-xs text-cl-text-dim mt-0.5">
                                  by {mod.author} · v{mod.version}
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
                              {mod.downloads > 0 && (
                                <span className="text-xs text-cl-text-dim flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  {mod.downloads.toLocaleString()}
                                </span>
                              )}
                              {mod.endorsements > 0 && (
                                <span className="text-xs text-cl-text-dim flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                  </svg>
                                  {mod.endorsements.toLocaleString()}
                                </span>
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

              {/* Pagination */}
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
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                            currentPage === p.num
                              ? 'bg-cl-accent text-white shadow-glow'
                              : 'text-cl-text-dim hover:text-cl-text glass'
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

      {/* Installed Mods */}
      {installedMods.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-cl-border/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold gradient-text uppercase tracking-wider">Installed Mods ({installedMods.length})</h3>
            <button
              onClick={handleCheckHealth}
              disabled={checkingHealth}
              className="text-xs text-cl-accent hover:text-cl-accent/80 transition-all flex items-center gap-1.5"
            >
              <svg className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {checkingHealth ? 'Checking...' : 'Check Mods'}
            </button>
          </div>
          <div className="space-y-2">
            {installedMods.map(mod => (
              <div key={mod.id} className={`glass rounded-xl p-3.5 flex items-center gap-3 ${
                mod.health_status === 'removed' ? 'border-cl-red/40 bg-cl-red/5' :
                mod.health_status === 'outdated' ? 'border-cl-yellow/40 bg-cl-yellow/5' :
                mod.health_status === 'update_available' ? 'border-cl-accent/40 bg-cl-accent/5' : ''
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  mod.health_status === 'removed' ? 'bg-cl-red' :
                  mod.health_status === 'outdated' ? 'bg-cl-yellow' :
                  mod.health_status === 'update_available' ? 'bg-cl-accent shadow-glow' :
                  mod.enabled ? 'bg-cl-green' : 'bg-cl-red'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cl-text truncate">{mod.name}</p>
                  <p className="text-xs text-cl-text-dim">
                    {mod.author || 'Unknown author'} · v{mod.version || '?'}
                    {mod.health_status === 'outdated' && (
                      <span className="ml-2 text-cl-yellow">· Outdated</span>
                    )}
                    {mod.health_status === 'removed' && (
                      <span className="ml-2 text-cl-red">· Removed from Nexus</span>
                    )}
                    {mod.health_status === 'update_available' && (
                      <span className="ml-2 text-cl-accent">· Update available</span>
                    )}
                  </p>
                  {mod.reason && mod.health_status !== 'ok' && (
                    <p className="text-xs text-cl-text-dim mt-0.5 italic">{mod.reason}</p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    await window.electronAPI.db.updateMod(mod.id, { enabled: mod.enabled ? 0 : 1 })
                    const installed = await window.electronAPI.db.getMods(parseInt(gameId))
                    setInstalledMods(installed)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    mod.enabled ? 'bg-cl-green/10 text-cl-green hover:bg-cl-green/20 border border-cl-green/20' : 'bg-cl-red/10 text-cl-red hover:bg-cl-red/20 border border-cl-red/20'
                  }`}
                >
                  {mod.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => handleRemoveMod(mod)} className="p-1.5 rounded-lg text-cl-text-dim hover:text-cl-red hover:bg-cl-red/10 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Install Modal */}
      {installStep && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={cancelInstall}>
          <div className="glass-strong rounded-2xl p-6 max-w-lg w-full space-y-4 animate-scale-in shadow-glass-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold gradient-text truncate">{installMod?.name}</h3>
              {installStep !== 'installing' && (
                <button onClick={cancelInstall} className="text-cl-text-dim hover:text-cl-text transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {installStep === 'fetching_files' && (
              <div className="flex items-center gap-3 text-cl-text-dim py-4">
                <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
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
                      className="w-full flex items-center justify-between p-3 rounded-xl glass hover:bg-cl-accent/10 hover:border-cl-accent/30 transition-all text-left"
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
                  <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                  Downloading...
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
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
                <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                Extracting archive...
              </div>
            )}

            {installStep === 'review' && installAnalysis && (
              <div className="space-y-3">
                <p className="text-sm font-bold gradient-text">Installation Analysis</p>
                {installAnalysis.notes?.map((note, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-cl-text-dim">
                    <svg className="w-4 h-4 mt-0.5 text-cl-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {note}
                  </div>
                ))}
                <div className="glass rounded-xl p-3 text-xs text-cl-text-dim space-y-0.5">
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
                <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                Installing files...
              </div>
            )}

            {(installStep === 'preflight' || installStep === 'preflight_failed') && (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-3 text-cl-text-dim">
                  <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                  {preflightResult ? 'Pre-flight checks complete' : 'Running pre-flight checks...'}
                </div>
                {preflightResult && (
                  <div className="space-y-1.5">
                    {preflightResult.checks.map((check, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={check.ok ? 'text-cl-green' : 'text-cl-red'}>
                          {check.ok ? '✓' : '✗'}
                        </span>
                        <span className={check.ok ? 'text-cl-text-dim' : 'text-cl-text'}>
                          {check.name}: {check.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {installStep === 'preflight_failed' && (
                  <p className="text-xs text-cl-yellow">Fix the issues above and try again.</p>
                )}
              </div>
            )}

            {installStep === 'missing_loader' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-yellow/10 border border-cl-yellow/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold gradient-text">Mod Loader Required</p>
                  <p className="text-xs text-cl-text-dim mt-1">
                    This game needs <span className="text-cl-accent font-medium">{preflightResult?.checks?.find(c => c.name === 'Mod Loader')?.loader?.name || 'a mod loader'}</span> installed before you can add mods.
                  </p>
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Cancel</button>
                  <button
                    onClick={() => window.electronAPI.shell.openExternal(`https://www.nexusmods.com/${nexusSlug}/mods/?BH=0`)}
                    className="btn-primary text-sm"
                  >
                    Open Nexus Mods
                  </button>
                </div>
                <p className="text-xs text-cl-text-dim">Install the mod loader to your game, then come back and try again.</p>
              </div>
            )}

            {installStep === 'dep_preview' && (
              <div className="space-y-3 py-2">
                <p className="text-sm font-bold gradient-text">Dependencies Detected</p>
                <p className="text-xs text-cl-text-dim">This mod requires the following dependencies:</p>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {depChain.map((dep, i) => (
                    <div key={i} className="glass rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${dep.found ? 'bg-cl-green' : 'bg-cl-yellow'}`} />
                        <span className="text-sm font-medium text-cl-text">{dep.name}</span>
                        {dep.bestSource && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cl-accent/10 text-cl-accent border border-cl-accent/20">
                            {dep.bestSource.source}
                          </span>
                        )}
                      </div>

                      {dep.vtScan && dep.vtScan.scanned && (
                        <div className={`flex items-center gap-2 text-xs ${dep.vtScan.clean ? 'text-cl-green' : 'text-cl-red'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          {dep.vtScan.clean
                            ? `VirusTotal: Clean (${dep.vtScan.harmless} engines, 0 threats)`
                            : `VirusTotal: ${dep.vtScan.malicious} malicious, ${dep.vtScan.suspicious} suspicious`
                          }
                        </div>
                      )}
                      {dep.vtScan && !dep.vtScan.scanned && (
                        <div className="text-xs text-cl-text-dim">VT: {dep.vtScan.reason}</div>
                      )}

                      {dep.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {dep.sources.map((s, j) => (
                            <span key={j} className="px-2 py-0.5 rounded text-[10px] glass text-cl-text-dim">
                              {s.source}{s.version ? ` v${s.version}` : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {dep.installHint && (
                        <p className="text-[11px] text-cl-text-dim italic">{dep.installHint}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Cancel</button>
                  <button
                    onClick={() => installAllDeps(installMod)}
                    disabled={depChain.filter(d => d.found && d.bestSource).length === 0}
                    className="btn-primary text-sm disabled:opacity-40"
                  >
                    Install {depChain.filter(d => d.found && d.bestSource).length} Dependencies & Mod
                  </button>
                </div>
              </div>
            )}

            {installStep === 'installing_deps' && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-3 text-cl-text-dim">
                  <div className="w-5 h-5 border-2 border-cl-accent border-t-transparent rounded-full animate-spin" />
                  Installing dependency {queueIndex + 1}/{installQueue.length}...
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill bg-gradient-to-r from-cl-green to-cl-green"
                    style={{ width: `${depDownloadProgress.total > 0 ? (depDownloadProgress.downloaded / depDownloadProgress.total * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-cl-text-dim text-center">
                  {installQueue[queueIndex]?.mod?.name || 'Downloading...'}
                </p>
                {depDownloadProgress.total > 0 && (
                  <p className="text-xs text-cl-text-dim text-center">
                    {(depDownloadProgress.downloaded / 1024 / 1024).toFixed(1)} / {(depDownloadProgress.total / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
            )}

            {installStep === 'manual_dep_queue' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-accent/10 border border-cl-accent/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold gradient-text">Manual Dependency Download</p>
                  <p className="text-xs text-cl-text-dim mt-1">Nexus Mods Premium is needed for auto-downloads.<br/>The dependency page is open in your browser.</p>
                </div>
                <div className="glass rounded-xl p-3 text-xs text-cl-text-dim space-y-1">
                  <p>Dependency: <span className="text-cl-green font-medium">{installQueue[queueIndex]?.mod?.name || 'Unknown'}</span></p>
                  <p>Download and install this dependency to your game directory, then click Continue.</p>
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Skip All</button>
                  <button onClick={() => installAllDeps(installMod)} className="btn-primary text-sm">Continue</button>
                </div>
              </div>
            )}

            {installStep === 'done' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-green/10 border border-cl-green/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-bold gradient-text">Installation Complete!</p>
                <button onClick={cancelInstall} className="btn-primary text-sm">Done</button>
              </div>
            )}

            {installStep === 'manual_download' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-accent/10 border border-cl-accent/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold gradient-text">Manual Download Required</p>
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

            {installStep === 'permission_denied' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-yellow/10 border border-cl-yellow/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold gradient-text">Administrator Permission Required</p>
                  <p className="text-xs text-cl-text-dim mt-1">This game is in a protected directory (Program Files).<br/>Files have been staged — drag them into the game folder.</p>
                </div>
                <ol className="text-xs text-cl-text-dim text-left max-w-xs mx-auto space-y-1 list-decimal list-inside">
                  <li>Two Explorer windows have opened</li>
                  <li>Drag all files from <b>Code Library - Mod Install</b> into the game folder</li>
                  <li>Windows will ask for permission — click Continue</li>
                </ol>
                <div className="flex gap-2 justify-center pt-2">
                  <button onClick={cancelInstall} className="btn-secondary text-sm">Done</button>
                </div>
              </div>
            )}

            {installStep === 'error' && (
              <div className="text-center py-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-cl-red/10 border border-cl-red/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-cl-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-sm font-bold gradient-text">Installation Failed</p>
                <button onClick={cancelInstall} className="btn-secondary text-sm">Close</button>
              </div>
            )}

            {/* Install log */}
            {installLog.length > 0 && (
              <div className="glass rounded-xl p-3 max-h-32 overflow-y-auto">
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
