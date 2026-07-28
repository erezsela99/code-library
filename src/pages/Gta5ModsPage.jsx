import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const CATEGORIES = [
  { slug: 'tools', label: 'Tools' },
  { slug: 'vehicles', label: 'Vehicles' },
  { slug: 'paintjobs', label: 'Paint Jobs' },
  { slug: 'weapons', label: 'Weapons' },
  { slug: 'scripts', label: 'Scripts' },
  { slug: 'player', label: 'Player' },
  { slug: 'maps', label: 'Maps' },
  { slug: 'misc', label: 'Misc' },
]

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'downloads', label: 'Most Downloaded' },
  { value: 'likes', label: 'Most Liked' },
  { value: 'rating', label: 'Highest Rated' },
]

const TIME_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'day', label: 'Today' },
]

function formatCount(n) {
  if (!n && n !== 0) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function Gta5ModsPage() {
  const navigate = useNavigate()
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('tools')
  const [sort, setSort] = useState('latest')
  const [since, setSince] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearch, setIsSearch] = useState(false)
  const [selectedMod, setSelectedMod] = useState(null)
  const [modDetail, setModDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState(null)
  const [installPath, setInstallPath] = useState('')
  const searchTimeout = useRef(null)

  const loadMods = useCallback(async (cat, srt, snce, pg, query) => {
    if (!window.electronAPI?.gta5mods) return
    setLoading(true)
    try {
      let result
      if (query) {
        result = await window.electronAPI.gta5mods.search({ query, page: pg })
      } else {
        result = await window.electronAPI.gta5mods.browse({ category: cat, sort: srt, since: snce, page: pg })
      }
      setMods(pg === 1 ? (result?.mods || []) : prev => [...prev, ...(result?.mods || [])])
      setTotalPages(result?.totalPages || 1)
    } catch (err) {
      console.error('Failed to load GTA5-Mods:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadMods(category, sort, since, page, isSearch ? searchQuery : '')
  }, [category, sort, since, page])

  useEffect(() => {
    (async () => {
      const p = await window.electronAPI?.db?.getSetting?.('game_install_path')
      if (p) setInstallPath(p)
    })()
  }, [])

  const handleSearch = (val) => {
    setSearchQuery(val)
    clearTimeout(searchTimeout.current)
    if (val.trim().length < 2) {
      setIsSearch(false)
      setPage(1)
      loadMods(category, sort, since, 1, '')
      return
    }
    searchTimeout.current = setTimeout(() => {
      setIsSearch(true)
      setPage(1)
      loadMods(category, sort, since, 1, val.trim())
    }, 300)
  }

  const handleSelectMod = async (mod) => {
    setSelectedMod(mod)
    setDetailLoading(true)
    setModDetail(null)
    try {
      const detail = await window.electronAPI.gta5mods.getMod(mod.url)
      setModDetail(detail)
    } catch (err) {
      console.error('Failed to load mod detail:', err)
    }
    setDetailLoading(false)
  }

  const handleDownload = async () => {
    if (!modDetail?.downloadUrl || !modDetail?.title) return
    setDownloading(true)
    setDownloadStatus('Downloading...')
    try {
      const result = await window.electronAPI.gta5mods.downloadFile({
        downloadUrl: modDetail.downloadUrl,
        modName: modDetail.title,
      })
      if (result?.filePath) {
        setDownloadStatus(`Downloaded: ${result.fileName}`)
        if (installPath) {
          const fs = window.electronAPI?.fs
          if (fs) {
            const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz']
            const isArchive = archiveExts.some(ext => result.fileName?.toLowerCase().endsWith(ext))
            if (isArchive) {
              setDownloadStatus(`Downloaded: ${result.fileName} — Extract to game folder manually or use Mod Browser.`)
            } else {
              setDownloadStatus(`Downloaded: ${result.fileName} — Ready to copy to game folder.`)
            }
          }
        } else {
          setDownloadStatus(`Downloaded: ${result.fileName} — Set game path in Settings to install.`)
        }
      }
    } catch (err) {
      setDownloadStatus('Download failed: ' + err.message)
    }
    setDownloading(false)
  }

  const handleOpenWebsite = (url) => {
    if (url) window.open(url, '_blank')
  }

  if (selectedMod) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <button onClick={() => { setSelectedMod(null); setModDetail(null) }} className="nav-item !w-auto !px-4 !py-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Browse</span>
        </button>

        {detailLoading ? (
          <div className="space-y-4">
            <div className="h-48 skeleton rounded-xl" />
            <div className="h-6 w-2/3 skeleton rounded-lg" />
            <div className="h-4 w-1/3 skeleton rounded-lg" />
          </div>
        ) : modDetail ? (
          <div className="space-y-6">
            {modDetail.image && (
              <div className="glass rounded-xl overflow-hidden">
                <img src={modDetail.image} alt={modDetail.title} className="w-full max-h-96 object-cover" />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold gradient-text">{modDetail.title}</h1>
                  <div className="flex items-center gap-3 mt-1 text-sm text-cl-text-dim">
                    {modDetail.version && <span className="badge">{modDetail.version}</span>}
                    <span>by {modDetail.author || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {modDetail.categories?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {modDetail.categories.map((cat, i) => (
                    <span key={i} className="badge">{cat}</span>
                  ))}
                </div>
              )}
            </div>

            {modDetail.description && (
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cl-text mb-3">Description</h3>
                <div className="text-sm text-cl-text-dim leading-relaxed whitespace-pre-wrap">
                  {modDetail.description}
                </div>
              </div>
            )}

            {modDetail.screenshots?.length > 0 && (
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cl-text mb-3">Screenshots</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {modDetail.screenshots.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={src} alt="" className="h-40 rounded-lg border border-cl-border/20 hover:border-cl-accent/40 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleDownload} disabled={downloading || !modDetail.downloadUrl} className="btn-primary !px-6">
                {downloading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Downloading...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </span>
                )}
              </button>
              <button onClick={() => handleOpenWebsite(selectedMod.url)} className="btn-secondary !px-6">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Website
                </span>
              </button>
            </div>

            {downloadStatus && (
              <div className={`text-sm px-4 py-3 rounded-xl ${
                downloadStatus.includes('failed') || downloadStatus.includes('error')
                  ? 'bg-cl-red/10 text-cl-red border border-cl-red/20'
                  : 'bg-cl-green/10 text-cl-green border border-cl-green/20'
              }`}>
                {downloadStatus}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-cl-text-dim">Failed to load mod details</div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold gradient-text">GTA5-Mods.com</h1>
        <span className="text-xs text-cl-text-dim">Browse & install GTA V mods</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cl-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search mods..."
            className="input-field pl-10"
          />
        </div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} className="input-field !w-auto">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={since} onChange={(e) => { setSince(e.target.value); setPage(1) }} className="input-field !w-auto">
          {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {!isSearch && (
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.slug}
              onClick={() => { setCategory(cat.slug); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                category === cat.slug
                  ? 'bg-cl-accent/20 text-cl-accent border border-cl-accent/30 shadow-glow'
                  : 'glass text-cl-text-dim hover:text-cl-text hover:border-cl-border/40'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {mods.length === 0 && !loading ? (
        <div className="text-center py-16 text-cl-text-dim">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>No mods found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {mods.map((mod, i) => (
            <div
              key={`${mod.slug}-${i}`}
              onClick={() => handleSelectMod(mod)}
              className="glass rounded-xl overflow-hidden cursor-pointer group hover:border-cl-accent/30 transition-all duration-300 hover:shadow-glow animate-scale-in"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <div className="aspect-video bg-cl-dark overflow-hidden">
                {mod.image ? (
                  <img src={mod.image} alt={mod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-cl-text-dim/30">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {mod.categories?.slice(0, 3).map((cat, j) => (
                    <span key={j} className="badge !text-[9px] !px-1.5 !py-0">{cat}</span>
                  ))}
                </div>
                <h3 className="text-sm font-semibold text-cl-text line-clamp-2 group-hover:text-cl-accent transition-colors">{mod.name}</h3>
                {mod.version && <p className="text-[11px] text-cl-text-dim">{mod.version}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11px] text-cl-text-dim">
                    {mod.rating > 0 && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        {Number(mod.rating).toFixed(1)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      {formatCount(mod.downloads)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                      {formatCount(mod.likes)}
                    </span>
                  </div>
                  {mod.author && <span className="text-[11px] text-cl-text-dim">by {mod.author}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-3 text-cl-text-dim">
            <svg className="w-5 h-5 animate-spin text-cl-accent" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Loading mods...
          </div>
        </div>
      )}

      {!loading && mods.length > 0 && totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {page > 1 && (
            <button onClick={() => setPage(p => p - 1)} className="btn-secondary !px-4 !py-2 text-xs">
              Previous
            </button>
          )}
          <span className="text-xs text-cl-text-dim flex items-center px-3">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <button onClick={() => setPage(p => p + 1)} className="btn-secondary !px-4 !py-2 text-xs">
              Next
            </button>
          )}
        </div>
      )}
    </div>
  )
}
