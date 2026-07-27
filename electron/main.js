const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { scanAllLibraries } = require('./game-scanner');

let mainWindow;
let db;
let dbPath;

const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
const MODS_DIR = path.join(app.getPath('userData'), 'mods');

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

async function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'code-library.db');
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      exe_path TEXT,
      install_path TEXT,
      cover_url TEXT,
      banner_url TEXT,
      playtime_minutes INTEGER DEFAULT 0,
      last_played TEXT,
      custom_args TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(title, platform)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      nexus_id INTEGER,
      name TEXT NOT NULL,
      author TEXT,
      version TEXT,
      description TEXT,
      archive_path TEXT,
      install_path TEXT,
      installed_files TEXT,
      enabled INTEGER DEFAULT 1,
      installed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  try { db.run('ALTER TABLE mods ADD COLUMN installed_files TEXT'); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  saveDb();
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] || 0;
  saveDb();
  return { lastInsertRowid: lastId, changes: db.getRowsModified() };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#050508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await initDatabase();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(MODS_DIR, { recursive: true });
  createWindow();
});

app.on('window-all-closed', () => {
  if (db) { saveDb(); db.close(); }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.handle('db:getGames', () => {
  return dbAll('SELECT * FROM games ORDER BY title');
});

ipcMain.handle('db:getGame', (_, id) => {
  return dbGet('SELECT * FROM games WHERE id = ?', [id]);
});

ipcMain.handle('db:addGame', (_, game) => {
  const result = dbRun(
    'INSERT OR IGNORE INTO games (title, platform, exe_path, install_path, cover_url, banner_url) VALUES (?, ?, ?, ?, ?, ?)',
    [game.title, game.platform, game.exe_path || null, game.install_path || null, game.cover_url || null, game.banner_url || null]
  );
  return result.lastInsertRowid;
});

ipcMain.handle('db:updateGame', (_, id, updates) => {
  const fields = Object.keys(updates);
  const setClause = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => updates[k]);
  dbRun(`UPDATE games SET ${setClause} WHERE id = ?`, [...values, id]);
  return true;
});

ipcMain.handle('db:deleteGame', (_, id) => {
  dbRun('DELETE FROM games WHERE id = ?', [id]);
  return true;
});

ipcMain.handle('db:getMods', (_, gameId) => {
  return dbAll('SELECT * FROM mods WHERE game_id = ? ORDER BY name', [gameId]);
});

ipcMain.handle('db:addMod', (_, mod) => {
  const result = dbRun(
    'INSERT INTO mods (game_id, nexus_id, name, author, version, description, archive_path, install_path, installed_files) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [mod.game_id, mod.nexus_id || null, mod.name, mod.author || null, mod.version || null, mod.description || null, mod.archive_path || null, mod.install_path || null, mod.installed_files || null]
  );
  return result.lastInsertRowid;
});

ipcMain.handle('db:updateMod', (_, id, updates) => {
  const fields = Object.keys(updates);
  const setClause = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => updates[k]);
  dbRun(`UPDATE mods SET ${setClause} WHERE id = ?`, [...values, id]);
  return true;
});

ipcMain.handle('db:deleteMod', (_, id) => {
  const mod = dbGet('SELECT * FROM mods WHERE id = ?', [id]);
  if (mod) {
    if (mod.installed_files) {
      try {
        const files = JSON.parse(mod.installed_files);
        for (const filePath of files) {
          try { fs.rmSync(filePath, { force: true }); } catch {}
          const dir = path.dirname(filePath);
          try {
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
              fs.rmSync(dir, { force: true });
            }
          } catch {}
        }
      } catch {}
    }
    const modsDir = MODS_DIR;
    const possibleDirs = fs.readdirSync(modsDir).filter(d => d.endsWith(`_${mod.nexus_id}`));
    for (const d of possibleDirs) {
      const dirPath = path.join(modsDir, d);
      try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch {}
    }
  }
  dbRun('DELETE FROM mods WHERE id = ?', [id]);
  return true;
});

ipcMain.handle('db:getSetting', (_, key) => {
  const row = dbGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
});

ipcMain.handle('db:setSetting', (_, key, value) => {
  dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  return true;
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Executables', extensions: ['exe'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
ipcMain.handle('shell:showItemInFolder', (_, p) => shell.showItemInFolder(p));

ipcMain.handle('fs:exists', (_, p) => fs.existsSync(p));
ipcMain.handle('fs:readDir', (_, p) => {
  try { return fs.readdirSync(p); } catch { return []; }
});

ipcMain.handle('scanner:scanAll', async (_, additionalDirs) => {
  const games = await scanAllLibraries(additionalDirs || []);
  let added = 0;
  for (const game of games) {
    const existing = dbGet('SELECT id FROM games WHERE title = ? AND platform = ?', [game.title, game.platform]);
    if (!existing) {
      dbRun(
        'INSERT INTO games (title, platform, exe_path, install_path, cover_url, banner_url) VALUES (?, ?, ?, ?, ?, ?)',
        [game.title, game.platform, game.exe_path || null, game.install_path || null, game.cover_url || null, game.banner_url || null]
      );
      added++;
    }
  }
  return { total: games.length, added };
});

ipcMain.handle('scanner:launchGame', (_, game) => {
  const { exec } = require('child_process');
  if (!game.exe_path) return false;
  const args = game.custom_args || '';
  exec(`"${game.exe_path}" ${args}`, { cwd: game.install_path || undefined });
  dbRun('UPDATE games SET last_played = datetime("now") WHERE id = ?', [game.id]);
  return true;
});

ipcMain.handle('nexus:validateKey', async (_, apiKey) => {
  try {
    const data = await httpsGet(
      'https://api.nexusmods.com/v1/users/validate.json',
      { 'apikey': apiKey }
    );
    return { valid: true, name: data.name || 'Unknown' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
});

ipcMain.handle('nexus:getModCount', async (_, apiKey, slug) => {
  try {
    const https = require('https');
    return await new Promise((resolve) => {
      const req = https.get(`https://api.nexusmods.com/v1/games/${slug}/mods/latest_added.json`, {
        headers: { 'apikey': apiKey }
      }, (res) => {
        const total = res.headers['x-total-count'];
        const code = res.statusCode;
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          console.log(`[nexus:getModCount] slug=${slug} status=${code} x-total-count=${total} bodyLen=${body.length}`);
          if (total) {
            resolve(parseInt(total));
          } else {
            try {
              const data = JSON.parse(body);
              const mods = Array.isArray(data) ? data : (data.mods || []);
              console.log(`[nexus:getModCount] fallback count=${mods.length}`);
              resolve(mods.length || null);
            } catch { resolve(null); }
          }
        });
      });
      req.on('error', (e) => { console.log('[nexus:getModCount] error:', e.message); resolve(null); });
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    });
  } catch { return null; }
});

function httpsGet(url, headers = {}) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function httpsDownload(url, dest, headers = {}, onProgress) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsDownload(res.headers.location, dest, headers, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`)));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const file = fs.createWriteStream(dest);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        if (onProgress && total > 0) onProgress(downloaded, total);
      });
      res.on('end', () => { file.end(); resolve({ dest, size: downloaded }); });
    });
    req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

ipcMain.handle('nexus:getModFiles', async (_, apiKey, slug, modId) => {
  try {
    return await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${modId}/files.json`,
      { 'apikey': apiKey }
    );
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('nexus:getDownloadLink', async (_, apiKey, slug, modId, fileId) => {
  try {
    return await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${modId}/files/${fileId}/download_link.json`,
      { 'apikey': apiKey }
    );
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('nexus:getModDescription', async (_, apiKey, slug, modId) => {
  try {
    return await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${modId}.json`,
      { 'apikey': apiKey }
    );
  } catch (e) { return { error: e.message }; }
});

const DEPENDENCY_SEARCH_QUERIES = {
  'BepInEx': ['BepInExPack', 'BepInEx', 'BepInEx Core'],
  'SMAPI': ['SMAPI', 'StardewModdingAPI'],
  'Script Extender': ['Script Extender', 'SKSE', 'F4SE', 'OBSE', 'NVSE'],
  'r2modman/Thunderstore': ['r2modman', 'Thunderstore Mod Manager'],
  'ScriptHookV': ['ScriptHookV', 'Script Hook V'],
};

ipcMain.handle('nexus:resolveDependencies', async (_, { apiKey, slug, dependency, gameTitle, installPath }) => {
  try {
    const queries = DEPENDENCY_SEARCH_QUERIES[dependency] || [dependency];
    const seen = new Set();
    const candidates = [];

    for (const query of queries) {
      try {
        const data = await httpsGet(
          `https://api.nexusmods.com/v1/games/${slug}/mods/search.json?name=${encodeURIComponent(query)}&include_adult=true`,
          { 'apikey': apiKey }
        );
        const mods = Array.isArray(data) ? data : (data.mods || []);
        for (const mod of mods) {
          if (!seen.has(mod.mod_id)) {
            seen.add(mod.mod_id);
            candidates.push(mod);
          }
        }
      } catch {}
    }

    if (candidates.length === 0) return { found: false, dependency, candidates: [] };

    const depLower = dependency.toLowerCase();
    const best = candidates.find(m => {
      const name = (m.name || '').toLowerCase();
      return name.includes(depLower) || name.includes('bepinexpack') || name.includes('smapi');
    }) || candidates[0];

    const filesResult = await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${best.mod_id}/files.json`,
      { 'apikey': apiKey }
    );
    const files = Array.isArray(filesResult) ? filesResult : (filesResult?.files || filesResult?.data || []);

    const mainFile = files.find(f => f.category_name?.toLowerCase().includes('main'))
      || files.find(f => !f.category_name?.toLowerCase().includes('optional'))
      || files[0];

    if (!mainFile) return { found: false, dependency, candidates: [] };

    return {
      found: true,
      dependency,
      mod: { mod_id: best.mod_id, name: best.name, author: best.author, version: best.version },
      file: { file_id: mainFile.file_id, file_name: mainFile.file_name, size: mainFile.size },
    };
  } catch (e) {
    return { found: false, dependency, error: e.message };
  }
});

ipcMain.handle('nexus:downloadMod', async (_, { apiKey, slug, modId, fileId, gameTitle }) => {
  try {
    const modsDir = MODS_DIR;
    fs.mkdirSync(modsDir, { recursive: true });
    const modDir = path.join(modsDir, `${gameTitle.replace(/[<>:"/\\|?*]/g, '_')}_${modId}`);
    fs.mkdirSync(modDir, { recursive: true });
    const archiveDir = path.join(modDir, 'archives');
    fs.mkdirSync(archiveDir, { recursive: true });

    const links = await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${modId}/files/${fileId}/download_link.json`,
      { 'apikey': apiKey }
    );

    const downloadUrl = Array.isArray(links) ? links[0]?.URI || links[0]?.uri : null;
    if (!downloadUrl) return { error: 'No download URL found' };

    const fileName = downloadUrl.split('/').pop().split('?')[0] || `mod_${fileId}.zip`;
    const archivePath = path.join(archiveDir, fileName);

    await httpsDownload(downloadUrl, archivePath, {}, (downloaded, total) => {
      mainWindow?.webContents.send('mod:download-progress', { modId, downloaded, total });
    });

    return { archivePath, modDir };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('nexus:installMod', async (_, { archivePath, modDir, game, installPath, description }) => {
  try {
    const AdmZip = require('adm-zip');
    const extractDir = path.join(modDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);

    const contents = fs.readdirSync(extractDir);
    let dataDir = null;
    let rootContents = contents;

    if (contents.length === 1 && fs.statSync(path.join(extractDir, contents[0])).isDirectory()) {
      const subDir = path.join(extractDir, contents[0]);
      rootContents = fs.readdirSync(subDir);
      dataDir = subDir;
    } else {
      dataDir = extractDir;
    }

    const analysis = analyzeModContents(dataDir, rootContents, game, installPath, description || '');
    return { extractDir: dataDir, analysis, contents: rootContents };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('nexus:installDependencyRaw', async (_, { archivePath, modDir, gameTitle, installPath, dependency }) => {
  try {
    const AdmZip = require('adm-zip');
    const extractDir = path.join(modDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);

    const contents = fs.readdirSync(extractDir);
    let sourceDir = extractDir;

    if (contents.length === 1 && fs.statSync(path.join(extractDir, contents[0])).isDirectory()) {
      sourceDir = path.join(extractDir, contents[0]);
    }

    const destDir = installPath;
    fs.mkdirSync(destDir, { recursive: true });

    const ROOT_LEVEL_FILES = [
      'doorstop_config.ini', '.doorstop_version', 'winhttp.dll',
      'changelog.txt', 'httpdoor.dll', 'version.dll', 'winmm.dll',
    ];

    const copiedFiles = [];

    function findRootFiles(dir) {
      for (const item of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          findRootFiles(fullPath);
        } else if (ROOT_LEVEL_FILES.includes(item.toLowerCase())) {
          const destPath = path.join(destDir, item);
          fs.copyFileSync(fullPath, destPath);
          copiedFiles.push(destPath);
        }
      }
    }

    function copyNonRootItems(dir, dest) {
      fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(dir)) {
        const srcPath = path.join(dir, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          if (ROOT_LEVEL_FILES.some(f => item.toLowerCase() === f)) continue;
          copyDirRecursive(srcPath, destPath, ROOT_LEVEL_FILES);
        } else {
          if (ROOT_LEVEL_FILES.includes(item.toLowerCase())) continue;
          fs.copyFileSync(srcPath, destPath);
          copiedFiles.push(destPath);
        }
      }
    }

    findRootFiles(sourceDir);
    copyNonRootItems(sourceDir, destDir);

    return { success: true, copied: copiedFiles.length, files: copiedFiles };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('nexus:copyModFiles', async (_, { sourceDir, targetDirs }) => {
  try {
    let copied = 0;
    for (const target of targetDirs) {
      fs.mkdirSync(target.dest, { recursive: true });
      const source = path.join(sourceDir, target.src || '');
      if (!fs.existsSync(source)) continue;
      const stat = fs.statSync(source);
      if (stat.isDirectory()) {
        copyDirRecursive(source, path.join(target.dest, target.name || path.basename(source)));
        copied++;
      } else {
        fs.copyFileSync(source, path.join(target.dest, target.name || path.basename(source)));
        copied++;
      }
    }
    return { copied };
  } catch (e) {
    return { error: e.message };
  }
});

function copyDirRecursive(src, dest, skipFiles) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (skipFiles && skipFiles.includes(item.toLowerCase())) continue;
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d, skipFiles);
    else fs.copyFileSync(s, d);
  }
}

function parseDescriptionInstructions(desc, game, installPath) {
  const d = (desc || '').toLowerCase();
  const result = { target: null, instructions: [], confidence: 'low', dependency: null };

  const pathPatterns = [
    /(?:install|copy|place|put|extract|move)\s+(?:to|into|in)\s+['"]?([a-zA-Z0-9_\-\\.\\/\\\\]+(?:folder|directory)?)['"]?/gi,
    /(?:goes?|belongs?)\s+(?:to|in|into)\s+['"]?([a-zA-Z0-9_\-\\.\\/\\\\]+)['"]?/gi,
    /(?:data|mods?|plugins?|scripts?|skse)[\s\-]*(?:folder|directory|path)/gi,
  ];

  for (const pat of pathPatterns) {
    let m;
    while ((m = pat.exec(d)) !== null) {
      result.instructions.push(m[0].trim());
    }
  }

  if (/manual\s*(?:install|installation)/i.test(d)) {
    result.instructions.push('Manual installation required');
  }

  if (/vortex|mod\s*organizer|mo2|mo3|wrye\s*bash|nmm/i.test(d)) {
    const managers = d.match(/(?:vortex|mod\s*organizer|mo2|mo3|wrye\s*bash|nmm)/gi);
    result.instructions.push(`Mod manager(s) mentioned: ${[...new Set(managers)].join(', ')}`);
  }

  if (/bepinex/i.test(d)) {
    result.dependency = 'BepInEx';
    result.instructions.push('Requires BepInEx framework');
  } else if (/r2modman|thunderstore|overwolf/i.test(d)) {
    result.dependency = 'r2modman/Thunderstore';
    result.instructions.push('Thunderstore/r2modman mod detected');
  } else if (/script\s*extender|skyrim\s*script\s*extender|f4se|obse|nvse|se\/se/i.test(d)) {
    result.dependency = 'Script Extender';
    result.instructions.push('Requires Script Extender');
  } else if (/smapi|stardew\s*modding/i.test(d)) {
    result.dependency = 'SMAPI';
    result.instructions.push('Requires SMAPI');
  } else if (/forge|fabric|quilt/i.test(d)) {
    result.dependency = 'Forge/Fabric';
    result.instructions.push('Requires Forge or Fabric');
  } else if (/open\s*iv|openiv/i.test(d)) {
    result.dependency = 'OpenIV';
    result.instructions.push('Requires OpenIV');
  } else if (/scripthookv|script\s*hook/i.test(d)) {
    result.dependency = 'ScriptHookV';
    result.instructions.push('Requires ScriptHookV');
  }

  return result;
}

function analyzeModContents(dataDir, contents, game, installPath, description) {
  const gameLower = (game || '').toLowerCase();
  const files = [];
  const dirs = [];
  const result = { files: [], suggestedTarget: installPath || '', confidence: 'low', notes: [] };

  for (const item of contents) {
    const itemPath = path.join(dataDir, item);
    try {
      if (fs.statSync(itemPath).isDirectory()) {
        dirs.push(item);
      } else {
        files.push(item);
      }
    } catch {
      files.push(item);
    }
  }

  const exts = files.map(f => path.extname(f).toLowerCase());
  const dirNames = dirs.map(d => d.toLowerCase());

  const descInfo = parseDescriptionInstructions(description, game, installPath);
  if (descInfo.instructions.length > 0) {
    result.notes.push(`From description: ${descInfo.instructions.slice(0, 3).join('; ')}`);
  }

  const descLower = (description || '').toLowerCase();

  let descTarget = null;

  if (descLower.includes('data folder') || descLower.includes('data directory') || descLower.includes('data files')) {
    descTarget = findDataDir(installPath) || path.join(installPath || '', 'Data');
  } else if (descLower.includes('mods folder') || descLower.includes('mods directory')) {
    if (gameLower.includes('stardew')) {
      descTarget = findStardewModsDir(installPath) || path.join(installPath || '', 'Mods');
    } else if (gameLower.includes('minecraft')) {
      descTarget = findMinecraftModsDir(installPath) || path.join(installPath || '', 'mods');
    } else {
      descTarget = path.join(installPath || '', 'Mods');
    }
  } else if (descLower.includes('game root') || descLower.includes('root folder') || descLower.includes('main directory') || descLower.includes('game directory')) {
    descTarget = installPath;
  } else if (descLower.includes('skse') && descLower.includes('plugins')) {
    descTarget = path.join(installPath || '', 'Data', 'SKSE', 'Plugins');
  } else if (descLower.includes('skse')) {
    descTarget = path.join(installPath || '', 'Data');
  } else if (descLower.includes('script extender')) {
    descTarget = path.join(installPath || '', 'Data');
  }

  if (descTarget) {
    result.suggestedTarget = descTarget;
    result.confidence = 'high';
    result.notes.unshift(`Description indicates files belong in: ${path.relative(installPath || '', descTarget) || 'game root'}`);
    result.files = contents.map(c => ({ name: c, dest: descTarget }));
    return result;
  }

  if (descInfo.dependency === 'BepInEx') {
    const bepinexDir = findBepInExPluginsDir(installPath);
    result.suggestedTarget = bepinexDir || path.join(installPath || '', 'BepInEx', 'plugins');
    result.confidence = 'high';
    result.notes.unshift('BepInEx mod - placing in BepInEx/plugins');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (descInfo.dependency === 'SMAPI') {
    const modsDir = findStardewModsDir(installPath);
    result.suggestedTarget = modsDir || path.join(installPath || '', 'Mods');
    result.confidence = 'high';
    result.notes.unshift('SMAPI mod - placing in Mods folder');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (descInfo.dependency === 'r2modman/Thunderstore') {
    result.suggestedTarget = path.join(installPath || '', 'BepInEx', 'plugins');
    result.confidence = 'medium';
    result.notes.unshift('Thunderstore mod - placing in BepInEx/plugins');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (descInfo.dependency === 'Forge/Fabric') {
    const modsDir = findMinecraftModsDir(installPath);
    result.suggestedTarget = modsDir || path.join(installPath || '', 'mods');
    result.confidence = 'high';
    result.notes.unshift('Minecraft mod (Forge/Fabric) - placing in mods folder');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (descInfo.dependency === 'OpenIV' || descInfo.dependency === 'ScriptHookV') {
    result.suggestedTarget = path.join(installPath || '', 'mods');
    result.confidence = 'medium';
    result.notes.unshift('GTA mod requiring OpenIV/ScriptHookV - placing in mods folder');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (descInfo.dependency === 'Script Extender') {
    const dataDir = findDataDir(installPath);
    result.suggestedTarget = dataDir || path.join(installPath || '', 'Data');
    result.confidence = 'high';
    result.notes.unshift('Script Extender mod - placing in Data folder');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    return result;
  }

  if (gameLower.includes('skyrim') || gameLower.includes('fallout')) {
    if (exts.some(e => ['.esp', '.esm', '.esl'].includes(e))) {
      const dataDir = findDataDir(installPath);
      result.suggestedTarget = dataDir || path.join(installPath || '', 'Data');
      result.confidence = 'high';
      result.notes.push('ESP/ESM/ESL files detected - placing in Data folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else if (dirNames.includes('skse') || dirNames.includes('scripts')) {
      result.suggestedTarget = path.join(installPath || '', 'Data');
      result.confidence = 'high';
      result.notes.push('SKSE mod detected - scripts go to Data folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else if (exts.some(e => ['.dll', '.asi'].includes(e))) {
      const pluginDir = findPluginDir(installPath);
      result.suggestedTarget = pluginDir || installPath;
      result.confidence = 'medium';
      result.notes.push('DLL/ASI plugin detected - placing in game root or plugins folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else if (dirNames.includes('meshes') || dirNames.includes('textures') || dirNames.includes('materials')) {
      const dataDir = findDataDir(installPath);
      result.suggestedTarget = dataDir || path.join(installPath || '', 'Data');
      result.confidence = 'high';
      result.notes.push('Asset mod (meshes/textures) - placing in Data folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else {
      result.suggestedTarget = installPath;
      result.confidence = 'low';
      result.notes.push('Could not determine mod type. Files will be placed in game root.');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    }
  } else if (gameLower.includes('stardew')) {
    if (exts.some(e => ['.dll'].includes(e)) || dirNames.includes('content') || dirNames.includes('assets')) {
      const modsDir = findStardewModsDir(installPath);
      result.suggestedTarget = modsDir || path.join(installPath || '', 'Mods');
      result.confidence = 'medium';
      result.notes.push('SMAPI mod detected - placing in Mods folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else {
      result.suggestedTarget = path.join(installPath || '', 'Mods');
      result.confidence = 'medium';
      result.notes.push('Placing in Mods folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    }
  } else if (gameLower.includes('minecraft')) {
    const modsDir = findMinecraftModsDir(installPath);
    result.suggestedTarget = modsDir || path.join(installPath || '', 'mods');
    result.confidence = 'medium';
    result.notes.push('Placing in Minecraft mods folder');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
  } else if (gameLower.includes('gta') || gameLower.includes('red dead')) {
    if (exts.some(e => ['.asi'].includes(e))) {
      result.suggestedTarget = installPath;
      result.confidence = 'medium';
      result.notes.push('ASI mod - placing in game root');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else if (dirNames.includes('dlcpacks') || dirNames.includes('mods')) {
      result.suggestedTarget = path.join(installPath || '', 'mods');
      result.confidence = 'medium';
      result.notes.push('DLC pack detected - placing in mods folder');
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    } else {
      result.suggestedTarget = installPath;
      result.confidence = 'low';
      result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
    }
  } else {
    result.suggestedTarget = installPath;
    result.confidence = 'low';
    result.notes.push('Generic mod - files placed in game directory');
    result.files = contents.map(c => ({ name: c, dest: result.suggestedTarget }));
  }

  return result;
}

function findDataDir(installPath) {
  if (!installPath) return null;
  const candidates = ['Data', 'data', 'DATA'];
  for (const c of candidates) {
    if (fs.existsSync(path.join(installPath, c))) return path.join(installPath, c);
  }
  return null;
}

function findBepInExPluginsDir(installPath) {
  if (!installPath) return null;
  const candidates = [
    path.join('BepInEx', 'plugins'),
    path.join('BepInEx', 'Plugins'),
    path.join('bepinex', 'plugins'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(installPath, c))) return path.join(installPath, c);
  }
  return null;
}

function findPluginDir(installPath) {
  if (!installPath) return null;
  const candidates = ['plugins', 'Plugins', 'asi', 'ASI', 'scripts/Plugins'];
  for (const c of candidates) {
    if (fs.existsSync(path.join(installPath, c))) return path.join(installPath, c);
  }
  return null;
}

function findStardewModsDir(installPath) {
  if (!installPath) return null;
  if (fs.existsSync(path.join(installPath, 'Mods'))) return path.join(installPath, 'Mods');
  if (fs.existsSync(path.join(installPath, 'mods'))) return path.join(installPath, 'mods');
  return null;
}

function findMinecraftModsDir(installPath) {
  if (!installPath) return null;
  if (fs.existsSync(path.join(installPath, 'mods'))) return path.join(installPath, 'mods');
  return null;
}

ipcMain.handle('nexus:findSlug', async (_, apiKey, title) => {
  const https = require('https');
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const words = base.split(/\s+/)
  const variants = [
    words.join(''), words.join('-'), words.join('_'),
    title.toLowerCase().replace(/\s+/g, ''), title.toLowerCase().replace(/\s+/g, '-'),
    title.toLowerCase().replace(/[^a-z0-9]/g, ''), title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
  ];
  for (const slug of variants) {
    try {
      const found = await new Promise((resolve) => {
        const req = https.get(`https://api.nexusmods.com/v1/games/${slug}/mods/latest_added.json`, {
          headers: { 'apikey': apiKey }
        }, (res) => {
          resolve(res.statusCode === 200 ? slug : null);
        });
        req.on('error', () => resolve(null));
        req.setTimeout(3000, () => { req.destroy(); resolve(null); });
      });
      if (found) return found;
    } catch {}
  }
  return variants[0] || null;
});
