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
    resolveDependencies: (params) => ipcRenderer.invoke('nexus:resolveDependencies', params),
    getModFiles: (apiKey, slug, modId) => ipcRenderer.invoke('nexus:getModFiles', apiKey, slug, modId),
    getDownloadLink: (apiKey, slug, modId, fileId) => ipcRenderer.invoke('nexus:getDownloadLink', apiKey, slug, modId, fileId),
    getModDescription: (apiKey, slug, modId) => ipcRenderer.invoke('nexus:getModDescription', apiKey, slug, modId),
    downloadMod: (params) => ipcRenderer.invoke('nexus:downloadMod', params),
    installMod: (params) => ipcRenderer.invoke('nexus:installMod', params),
    copyModFiles: (params) => ipcRenderer.invoke('nexus:copyModFiles', params),
    installDependencyRaw: (params) => ipcRenderer.invoke('nexus:installDependencyRaw', params),
    onDownloadProgress: (cb) => ipcRenderer.on('mod:download-progress', (_, data) => cb(data)),
  },
});
