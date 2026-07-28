const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  db: {
    getGames: () => ipcRenderer.invoke('db:getGames'),
    getGame: (id) => ipcRenderer.invoke('db:getGame', id),
    addGame: (game) => ipcRenderer.invoke('db:addGame', game),
    updateGame: (id, updates) => ipcRenderer.invoke('db:updateGame', id, updates),
    deleteGame: (id) => ipcRenderer.invoke('db:deleteGame', id),
    getMods: (gameId) => ipcRenderer.invoke('db:getMods', gameId),
    addMod: (mod) => ipcRenderer.invoke('db:addMod', mod),
    updateMod: (id, updates) => ipcRenderer.invoke('db:updateMod', id, updates),
    deleteMod: (id) => ipcRenderer.invoke('db:deleteMod', id),
    checkHealth: (gameId, apiKey) => ipcRenderer.invoke('mods:checkHealth', { gameId, apiKey }),
    getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
  },
  scanner: {
    scanAll: (dirs) => ipcRenderer.invoke('scanner:scanAll', dirs),
    launchGame: (game) => ipcRenderer.invoke('scanner:launchGame', game),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
  },
  fs: {
    exists: (p) => ipcRenderer.invoke('fs:exists', p),
    readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
  },
  nexus: {
    getModCount: (apiKey, slug) => ipcRenderer.invoke('nexus:getModCount', apiKey, slug),
    findSlug: (apiKey, title) => ipcRenderer.invoke('nexus:findSlug', apiKey, title),
    validateKey: (apiKey) => ipcRenderer.invoke('nexus:validateKey', apiKey),
    ssoLogin: () => ipcRenderer.invoke('nexus:ssoLogin'),
    resolveDependencies: (params) => ipcRenderer.invoke('nexus:resolveDependencies', params),
    getModFiles: (apiKey, slug, modId) => ipcRenderer.invoke('nexus:getModFiles', apiKey, slug, modId),
    getDownloadLink: (apiKey, slug, modId, fileId) => ipcRenderer.invoke('nexus:getDownloadLink', apiKey, slug, modId, fileId),
    getModDescription: (apiKey, slug, modId) => ipcRenderer.invoke('nexus:getModDescription', apiKey, slug, modId),
    downloadMod: (params) => ipcRenderer.invoke('nexus:downloadMod', params),
    installMod: (params) => ipcRenderer.invoke('nexus:installMod', params),
    copyModFiles: (params) => ipcRenderer.invoke('nexus:copyModFiles', params),
    installDependencyRaw: (params) => ipcRenderer.invoke('nexus:installDependencyRaw', params),
    onDownloadProgress: (cb) => ipcRenderer.on('mod:download-progress', (_, data) => cb(data)),
    searchGames: (apiKey, title) => ipcRenderer.invoke('nexus:searchGames', { apiKey, title }),
    autoDetectSlug: (apiKey, gameId, title) => ipcRenderer.invoke('nexus:autoDetectSlug', { apiKey, gameId, title }),
  },
  gameInfo: {
    getSteamInfo: (steamAppId) => ipcRenderer.invoke('gameinfo:getSteamInfo', steamAppId),
    searchRawg: (title, apiKey) => ipcRenderer.invoke('gameinfo:searchRawg', { title, apiKey }),
    getRawgScreenshots: (slug, apiKey) => ipcRenderer.invoke('gameinfo:getRawgScreenshots', { slug, apiKey }),
  },
  sgdb: {
    searchBySteam: (steamAppId, apiKey) => ipcRenderer.invoke('sgdb:searchBySteam', { steamAppId, apiKey }),
    searchByName: (name, apiKey) => ipcRenderer.invoke('sgdb:searchByName', { name, apiKey }),
    getGrids: (gameId, apiKey) => ipcRenderer.invoke('sgdb:getGrids', { gameId, apiKey }),
    getHeroes: (gameId, apiKey) => ipcRenderer.invoke('sgdb:getHeroes', { gameId, apiKey }),
    getLogos: (gameId, apiKey) => ipcRenderer.invoke('sgdb:getLogos', { gameId, apiKey }),
  },
  preflight: {
    check: (game, apiKey, slug) => ipcRenderer.invoke('preflight:check', { game, apiKey, slug }),
    detectLoader: (installPath, gameTitle) => ipcRenderer.invoke('preflight:detectLoader', { installPath, gameTitle }),
    getDepChain: (apiKey, slug, description, gameTitle, installPath) => ipcRenderer.invoke('preflight:getDepChain', { apiKey, slug, description, gameTitle, installPath }),
  },
  vt: {
    scanUrl: (url) => ipcRenderer.invoke('vt:scanUrl', url),
  },
  dep: {
    downloadExternal: (params) => ipcRenderer.invoke('dep:downloadExternal', params),
  },
  gta5mods: {
    browse: (params) => ipcRenderer.invoke('gta5mods:browse', params),
    search: (params) => ipcRenderer.invoke('gta5mods:search', params),
    getMod: (url) => ipcRenderer.invoke('gta5mods:getMod', url),
    downloadFile: (params) => ipcRenderer.invoke('gta5mods:downloadFile', params),
  },
});
