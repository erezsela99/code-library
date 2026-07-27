import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import WelcomeGuide from './components/WelcomeGuide'
import LibraryPage from './pages/LibraryPage'
import GameDetailPage from './pages/GameDetailPage'
import ModBrowserPage from './pages/ModBrowserPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [showGuide, setShowGuide] = useState(false)

  const loadGames = async () => {
    if (!window.electronAPI) return
    const data = await window.electronAPI.db.getGames()
    setGames(data)
  }

  useEffect(() => {
    loadGames()
    checkFirstLaunch()
  }, [])

  const checkFirstLaunch = async () => {
    if (!window.electronAPI) return
    const hidden = await window.electronAPI.db.getSetting('hide_welcome_guide')
    if (!hidden) setShowGuide(true)
  }

  const handleGuideComplete = async () => {
    setShowGuide(false)
  }

  const handleDontShow = async () => {
    await window.electronAPI.db.setSetting('hide_welcome_guide', 'true')
    setShowGuide(false)
  }

  const handleScan = async (customDirs) => {
    setLoading(true)
    setScanStatus('Scanning for games...')
    try {
      const result = await window.electronAPI.scanner.scanAll(customDirs)
      setScanStatus(`Found ${result.total} games, ${result.added} new`)
      await loadGames()
    } catch (err) {
      setScanStatus('Scan failed: ' + err.message)
    }
    setLoading(false)
    setTimeout(() => setScanStatus(null), 3000)
  }

  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-cl-darker">
        <TitleBar />
        <div className="flex flex-1 pt-9 min-h-0">
          <Sidebar
            games={games}
            onScan={handleScan}
            loading={loading}
            scanStatus={scanStatus}
          />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={
                <LibraryPage
                  games={games}
                  onScan={handleScan}
                  loading={loading}
                  refreshGames={loadGames}
                />
              } />
              <Route path="/game/:id" element={
                <GameDetailPage refreshGames={loadGames} />
              } />
              <Route path="/mods/:gameId" element={
                <ModBrowserPage />
              } />
              <Route path="/settings" element={
                <SettingsPage />
              } />
            </Routes>
          </main>
        </div>
        {showGuide && (
          <WelcomeGuide onComplete={handleGuideComplete} onDontShow={handleDontShow} />
        )}
      </div>
    </HashRouter>
  )
}
