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
  try {
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('[saveDb] Failed to save database:', e.message);
    try {
      const backupPath = dbPath + '.new';
      fs.writeFileSync(backupPath, buffer);
      fs.renameSync(backupPath, dbPath);
    } catch (e2) {
      console.error('[saveDb] Backup save also failed:', e2.message);
    }
  }
}

async function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'code-library.db');
  const SQL = await initSqlJs();

  let fileBuffer = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (fs.existsSync(dbPath)) {
        fileBuffer = fs.readFileSync(dbPath);
      }
      break;
    } catch (e) {
      if (attempt < 4) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (fileBuffer) {
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      steam_app_id TEXT,
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

  try { db.run('ALTER TABLE games ADD COLUMN steam_app_id TEXT'); } catch {}
  try { db.run('ALTER TABLE games ADD COLUMN sgdb_cover_url TEXT'); } catch {}
  try { db.run('ALTER TABLE games ADD COLUMN nexus_slug TEXT'); } catch {}
  try { db.run('ALTER TABLE games ADD COLUMN nexus_game_name TEXT'); } catch {}

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
  try { db.run('ALTER TABLE mods ADD COLUMN health_status TEXT'); } catch {}
  try { db.run('ALTER TABLE mods ADD COLUMN last_checked TEXT'); } catch {}
  try { db.run('ALTER TABLE mods ADD COLUMN nexus_last_updated INTEGER'); } catch {}
  try { db.run('ALTER TABLE mods ADD COLUMN installed_version TEXT'); } catch {}

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
  try { await initDatabase(); } catch (e) { console.error('DB init error:', e.message); }
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { fs.mkdirSync(MODS_DIR, { recursive: true }); } catch {}
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
    'INSERT OR IGNORE INTO games (title, platform, steam_app_id, exe_path, install_path, cover_url, banner_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [game.title, game.platform, game.steam_app_id || null, game.exe_path || null, game.install_path || null, game.cover_url || null, game.banner_url || null]
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

ipcMain.handle('mods:checkHealth', async (_, { gameId, apiKey }) => {
  const mods = dbAll('SELECT * FROM mods WHERE game_id = ? AND nexus_id IS NOT NULL', [gameId]);
  if (!mods || mods.length === 0) return [];

  const game = dbGet('SELECT * FROM games WHERE id = ?', [gameId]);
  const slug = game?.nexus_slug;
  if (!slug || !apiKey) return mods.map(m => ({ ...m, health_status: 'unknown' }));

  const results = [];
  const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000;

  for (const mod of mods) {
    try {
      const modData = await httpsGet(
        `https://api.nexusmods.com/v1/games/${slug}/mods/${mod.nexus_id}.json`,
        { 'apikey': apiKey }
      );

      const now = Date.now();
      const lastUpdated = (modData.updated_timestamp || 0) * 1000;
      const ageMs = now - lastUpdated;

      let status = 'ok';
      let reason = '';

      if (modData.status && modData.status !== 'published' && modData.status !== 'normal') {
        status = 'removed';
        reason = `Status: ${modData.status}`;
      } else if (ageMs > SIX_MONTHS && lastUpdated > 0) {
        const months = Math.floor(ageMs / (30 * 24 * 60 * 60 * 1000));
        status = 'outdated';
        reason = `Last updated ${months} months ago`;
      }

      if (mod.installed_version && modData.version && mod.installed_version !== modData.version) {
        if (status === 'ok') {
          status = 'update_available';
          reason = `New version: ${modData.version}`;
        }
      }

      dbRun(
        'UPDATE mods SET health_status = ?, last_checked = datetime("now"), nexus_last_updated = ?, installed_version = ? WHERE id = ?',
        [status, modData.updated_timestamp || null, mod.installed_version || modData.version || null, mod.id]
      );

      results.push({
        ...mod,
        health_status: status,
        reason,
        nexus_name: modData.name,
        nexus_version: modData.version,
        nexus_last_updated: modData.updated_timestamp,
        nexus_downloads: modData.downloads,
        nexus_endorsements: modData.endorsements,
      });
    } catch (e) {
      const isNotFound = e.message && (e.message.includes('404') || e.message.includes('403'));
      const status = isNotFound ? 'removed' : 'unknown';
      const reason = isNotFound ? 'Mod not found on Nexus (may have been removed)' : 'Check failed';

      dbRun(
        'UPDATE mods SET health_status = ?, last_checked = datetime("now") WHERE id = ?',
        [status, mod.id]
      );

      results.push({ ...mod, health_status: status, reason });
    }
  }

  return results;
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
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
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
        'INSERT INTO games (title, platform, steam_app_id, exe_path, install_path, cover_url, banner_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [game.title, game.platform, game.steam_app_id || null, game.exe_path || null, game.install_path || null, game.cover_url || null, game.banner_url || null]
      );
      added++;
    }
  }
  return { total: games.length, added };
});

ipcMain.handle('scanner:launchGame', (_, game) => {
  const { exec } = require('child_process');
  const { shell } = require('electron');
  if (!game.exe_path && !game.steam_app_id) return false;
  const args = game.custom_args || '';

  // Rockstar games: launch through Rockstar Games Launcher in min-mode (exe directly shows "run from Rockstar" error)
  if (game.platform === 'Rockstar') {
    const launcherPaths = [
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Rockstar Games', 'Launcher', 'Launcher.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Rockstar Games', 'Launcher', 'Launcher.exe'),
    ];
    const launcher = launcherPaths.find(p => fs.existsSync(p));
    if (launcher) {
      const titleLower = (game.title || '').toLowerCase().replace(/\s+/g, '');
      let appId = 'gtav';
      if (titleLower.includes('rdr2') || titleLower.includes('reddead')) appId = 'rdr2';
      else if (titleLower.includes('bully')) appId = 'bully';
      exec(`"${launcher}" -minmodeapp=${appId}`, { cwd: path.dirname(launcher) });
      dbRun('UPDATE games SET last_played = datetime("now") WHERE id = ?', [game.id]);
      return true;
    }
  }

  // Steam games: launch via Steam protocol (properly handles Steam Overlay, DRM, etc.)
  if (game.platform === 'Steam' && game.steam_app_id) {
    shell.openExternal(`steam://rungameid/${game.steam_app_id}`);
    dbRun('UPDATE games SET last_played = datetime("now") WHERE id = ?', [game.id]);
    return true;
  }

  // Epic games: launch via Epic Games protocol
  if (game.platform === 'Epic' && game.exe_path) {
    exec(`"${game.exe_path}" ${args}`, { cwd: game.install_path || undefined });
    dbRun('UPDATE games SET last_played = datetime("now") WHERE id = ?', [game.id]);
    return true;
  }

  // Default: launch exe directly
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

let ssoConnection = null;
let ssoTimeout = null;

ipcMain.handle('nexus:ssoLogin', async () => {
  const WebSocket = require('ws');
  const { randomUUID } = require('crypto');
  const { shell } = require('electron');

  return new Promise((resolve, reject) => {
    if (ssoConnection) {
      try { ssoConnection.close(); } catch {}
      ssoConnection = null;
    }
    if (ssoTimeout) clearTimeout(ssoTimeout);

    const loginId = randomUUID();
    let keyReceived = false;
    let attempts = 5;

    const connect = () => {
      ssoConnection = new WebSocket('wss://sso.nexusmods.com');

      ssoConnection.on('open', () => {
        ssoConnection.send(JSON.stringify({
          id: loginId,
          appid: 'CODE_LIBRARY',
          protocol: 2,
        }));
        shell.openExternal(`https://www.nexusmods.com/sso?id=${loginId}`);
      });

      ssoConnection.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.success && response.data?.api_key) {
            keyReceived = true;
            const apiKey = response.data.api_key;
            ssoConnection.close();
            dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['nexus_api_key', apiKey]);
            resolve({ success: true, apiKey });
          } else if (!response.success) {
            keyReceived = true;
            ssoConnection.close();
            reject(new Error(response.error || 'Login failed'));
          }
        } catch (e) {
          reject(e);
        }
      });

      ssoConnection.on('close', (code) => {
        if (!keyReceived) {
          if (code === 1005) {
            reject(new Error('Login cancelled'));
          } else if (attempts-- > 0) {
            connect();
          } else {
            reject(new Error('Login connection closed'));
          }
        }
      });

      ssoConnection.on('error', (err) => {
        reject(new Error('Connection error: ' + err.message));
      });
    };

    ssoTimeout = setTimeout(() => {
      if (ssoConnection) try { ssoConnection.close(); } catch {}
      reject(new Error('Login timed out (60s)'));
    }, 60000);

    connect();
  }).finally(() => {
    if (ssoTimeout) clearTimeout(ssoTimeout);
    ssoTimeout = null;
  });
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

let nexusGamesCache = null;
let nexusGamesCacheTime = 0;

async function fetchNexusGamesList(apiKey) {
  const now = Date.now();
  if (nexusGamesCache && (now - nexusGamesCacheTime) < 3600000) {
    return nexusGamesCache;
  }
  const data = await httpsGet('https://api.nexusmods.com/v1/games.json', { 'apikey': apiKey });
  nexusGamesCache = data;
  nexusGamesCacheTime = now;
  return data;
}

function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreMatch(gameTitle, nexusName) {
  const a = normalizeForMatch(gameTitle);
  const b = normalizeForMatch(nexusName);
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.some(bw => bw.includes(w) || w.includes(bw))) matches++;
  }
  const ratio = matches / Math.max(wordsA.length, 1);
  return Math.round(ratio * 60);
}

ipcMain.handle('nexus:searchGames', async (_, { apiKey, title }) => {
  try {
    const games = await fetchNexusGamesList(apiKey);
    if (!games || typeof games !== 'object') return [];

    const entries = Object.entries(games).map(([id, info]) => ({
      domain: info.domain_name || String(id),
      name: info.name || String(id),
      score: scoreMatch(title, info.name || String(id)),
    }));

    entries.sort((a, b) => b.score - a.score);
    return entries.slice(0, 10).filter(e => e.score > 10);
  } catch (e) {
    console.log('[nexus:searchGames] error:', e.message);
    return [];
  }
});

ipcMain.handle('nexus:autoDetectSlug', async (_, { apiKey, gameId, title }) => {
  try {
    const games = await fetchNexusGamesList(apiKey);
    if (!games || typeof games !== 'object') return { slug: null, confidence: 'none' };

    const entries = Object.entries(games).map(([id, info]) => ({
      domain: info.domain_name || String(id),
      name: info.name || String(id),
      score: scoreMatch(title, info.name || String(id)),
    }));

    entries.sort((a, b) => b.score - a.score);
    const best = entries[0];
    if (!best || best.score < 20) return { slug: null, confidence: 'none' };

    if (gameId) {
      dbRun('UPDATE games SET nexus_slug = ?, nexus_game_name = ? WHERE id = ?', [best.domain, best.name, gameId]);
      saveDb();
    }

    const confidence = best.score >= 80 ? 'high' : best.score >= 50 ? 'medium' : 'low';
    return { slug: best.domain, name: best.name, score: best.score, confidence };
  } catch (e) {
    console.log('[nexus:autoDetectSlug] error:', e.message);
    return { slug: null, confidence: 'none', error: e.message };
  }
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

function httpsPost(url, body, headers = {}) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

const TRUSTED_SOURCES = {
  'BepInEx': {
    github: { owner: 'BepInEx', repo: 'BepInEx' },
    thunderstore: 'bepinex',
    officialUrl: 'https://github.com/BepInEx/BepInEx/releases',
    installHint: 'BepInEx is a modding framework. Download the correct version for your game (Unity 5/Mono or Unity 2019+/IL2CPP).',
  },
  'SMAPI': {
    github: { owner: 'Pathoschild', repo: 'SMAPI' },
    thunderstore: null,
    officialUrl: 'https://github.com/Pathoschild/SMAPI/releases',
    installHint: 'SMAPI is the Stardew Valley modding API. Download the latest release.',
  },
  'ScriptHookV': {
    github: { owner: 'scripthookvdotnet', repo: 'ScriptHookVDotNet' },
    thunderstore: null,
    officialUrl: 'https://github.com/crosire/scripthookv/releases',
    installHint: 'ScriptHookV is required for GTA V script mods. Download from the official GitHub.',
  },
  'Script Extender': {
    github: { owner: 'ianpatt', repo: 'skse64' },
    thunderstore: null,
    officialUrl: 'https://skse.silverlock.org/',
    installHint: 'Script extender for Bethesda games. Make sure to get the exact version matching your game.',
  },
  'Forge/Fabric': {
    github: { owner: 'MinecraftForge', repo: 'MinecraftForge' },
    thunderstore: null,
    officialUrl: 'https://files.minecraftforge.net/',
    installHint: 'Minecraft mod loader. Download the installer matching your Minecraft version.',
  },
  'OpenIV': {
    github: null,
    thunderstore: null,
    officialUrl: 'https://openiv.com/',
    installHint: 'OpenIV is a modding tool for GTA IV/V/RDR2. Download from openiv.com.',
  },
};

async function vtScanUrl(url, vtApiKey) {
  if (!vtApiKey || !url) return { scanned: false, reason: vtApiKey ? 'No URL' : 'No VT API key' };
  try {
    const encoded = Buffer.from(url).toString('base64url');
    const data = await httpsGet(
      `https://www.virustotal.com/api/v3/urls/${encoded}`,
      { 'x-apikey': vtApiKey }
    );
    const stats = data?.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const undetected = stats.undetected || 0;
    const harmless = stats.harmless || 0;
    return {
      scanned: true,
      malicious,
      suspicious,
      undetected,
      harmless,
      clean: malicious === 0 && suspicious === 0,
      totalEngines: malicious + suspicious + undetected + harmless,
      permalink: data?.data?.links?.self || null,
    };
  } catch (e) {
    return { scanned: false, reason: e.message };
  }
}

async function searchGitHubForDep(depName) {
  const info = TRUSTED_SOURCES[depName];
  if (!info?.github) return null;
  try {
    const { owner, repo } = info.github;
    const releases = await httpsGet(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { 'Accept': 'application/vnd.github.v3+json' }
    );
    const asset = (releases.assets || []).find(a =>
      a.name.endsWith('.zip') || a.name.endsWith('.7z') || a.name.endsWith('.rar')
    );
    if (!asset) return null;
    return {
      source: 'github',
      name: `${owner}/${repo}`,
      version: releases.tag_name || '',
      downloadUrl: asset.browser_download_url,
      assetName: asset.name,
      assetSize: asset.size,
      releaseName: releases.name || releases.tag_name,
      officialUrl: `https://github.com/${owner}/${repo}/releases`,
    };
  } catch { return null; }
}

async function searchThunderstoreForDep(depName, gameTitle) {
  const info = TRUSTED_SOURCES[depName];
  const tsSlug = info?.thunderstore;
  if (!tsSlug) return null;
  try {
    const data = await httpsGet(
      `https://thunderstore.io/c/${tsSlug}/api/v1/package/?search=${encodeURIComponent(depName)}`
    );
    const results = data?.results || data || [];
    if (results.length === 0) return null;
    const pkg = results[0];
    const versions = pkg.versions || [];
    const latest = versions[versions.length - 1];
    if (!latest) return null;
    return {
      source: 'thunderstore',
      name: pkg.full_name || pkg.name,
      version: latest.version_number || '',
      downloadUrl: latest.download_url,
      assetName: latest.filename || `${pkg.name}-${latest.version_number}.zip`,
      assetSize: latest.file_size || 0,
      description: pkg.description || '',
    };
  } catch { return null; }
}

async function searchNexusForDep(apiKey, slug, depName) {
  const queries = DEPENDENCY_SEARCH_QUERIES[depName] || [depName];
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
  if (candidates.length === 0) return null;
  const depLower = depName.toLowerCase();
  const best = candidates.find(m => {
    const name = (m.name || '').toLowerCase();
    return name.includes(depLower) || name.includes('bepinexpack') || name.includes('smapi');
  }) || candidates[0];
  try {
    const filesResult = await httpsGet(
      `https://api.nexusmods.com/v1/games/${slug}/mods/${best.mod_id}/files.json`,
      { 'apikey': apiKey }
    );
    const files = Array.isArray(filesResult) ? filesResult : (filesResult?.files || filesResult?.data || []);
    const mainFile = files.find(f => f.category_name?.toLowerCase().includes('main'))
      || files.find(f => !f.category_name?.toLowerCase().includes('optional'))
      || files[0];
    if (!mainFile) return null;
    return {
      source: 'nexus',
      name: best.name,
      modId: best.mod_id,
      version: best.version || '',
      author: best.author || '',
      fileId: mainFile.file_id,
      fileName: mainFile.file_name,
      fileSize: mainFile.size || 0,
    };
  } catch { return null; }
}

async function resolveDependencyFull(apiKey, slug, depName, gameTitle, installPath, vtApiKey) {
  const trustInfo = TRUSTED_SOURCES[depName];
  const result = { name: depName, sources: [], bestSource: null, vtScan: null, installHint: trustInfo?.installHint || '' };

  const nexusResult = await searchNexusForDep(apiKey, slug, depName);
  if (nexusResult) result.sources.push(nexusResult);

  const githubResult = await searchGitHubForDep(depName);
  if (githubResult) result.sources.push(githubResult);

  const tsResult = await searchThunderstoreForDep(depName, gameTitle);
  if (tsResult) result.sources.push(tsResult);

  if (trustInfo?.officialUrl && !result.sources.find(s => s.source === 'official')) {
    result.sources.push({ source: 'official', name: depName, officialUrl: trustInfo.officialUrl, version: '' });
  }

  result.bestSource = result.sources.find(s => s.source === 'nexus')
    || result.sources.find(s => s.source === 'thunderstore')
    || result.sources.find(s => s.source === 'github')
    || result.sources.find(s => s.source === 'official')
    || null;

  if (result.bestSource?.downloadUrl && vtApiKey) {
    result.vtScan = await vtScanUrl(result.bestSource.downloadUrl, vtApiKey);
  }

  result.found = result.sources.length > 0;
  return result;
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

async function resolveDependency(apiKey, slug, dependency, gameTitle, installPath) {
  const depResult = await resolveDependencyFull(apiKey, slug, dependency, gameTitle, installPath, null);
  if (!depResult.bestSource) return { found: false, dependency };
  const best = depResult.bestSource;
  if (best.source === 'nexus') {
    return {
      found: true,
      dependency,
      mod: { mod_id: best.modId, name: best.name, author: best.author, version: best.version },
      file: { file_id: best.fileId, file_name: best.fileName, size: best.fileSize },
    };
  }
  return { found: true, dependency, external: best };
}

ipcMain.handle('nexus:resolveDependencies', async (_, { apiKey, slug, dependency, gameTitle, installPath }) => {
  return resolveDependency(apiKey, slug, dependency, gameTitle, installPath);
});

ipcMain.handle('vt:scanUrl', async (_, url) => {
  const vtApiKey = await dbGet('SELECT value FROM settings WHERE key = ?', ['vt_api_key']);
  if (!vtApiKey?.value) return { scanned: false, reason: 'No VirusTotal API key configured' };
  return vtScanUrl(url, vtApiKey.value);
});

ipcMain.handle('dep:downloadExternal', async (_, { url, fileName, gameTitle, depName }) => {
  try {
    const vtApiKey = await dbGet('SELECT value FROM settings WHERE key = ?', ['vt_api_key']);
    if (vtApiKey?.value) {
      const vtResult = await vtScanUrl(url, vtApiKey.value);
      if (!vtResult.clean) {
        return { error: 'virus_detected', vtScan: vtResult, message: `VirusTotal flagged this download: ${vtResult.malicious} malicious, ${vtResult.suspicious} suspicious out of ${vtResult.totalEngines} engines.` };
      }
    }
    const modsDir = MODS_DIR;
    fs.mkdirSync(modsDir, { recursive: true });
    const safeTitle = (gameTitle || 'Unknown').replace(/[<>:"/\\|?*]/g, '_');
    const modDir = path.join(modsDir, `${safeTitle}_${depName || 'dep'}`);
    fs.mkdirSync(modDir, { recursive: true });
    const archiveDir = path.join(modDir, 'archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    const finalName = fileName || url.split('/').pop().split('?')[0] || 'download.zip';
    const archivePath = path.join(archiveDir, finalName);
    await httpsDownload(url, archivePath, {});
    return { archivePath, modDir };
  } catch (e) {
    return { error: e.message };
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

function extractArchive(archivePath, destDir) {
  const { execSync } = require('child_process');
  const ext = path.extname(archivePath).toLowerCase();
  fs.mkdirSync(destDir, { recursive: true });

  if (ext === '.zip') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(destDir, true);
    return;
  }

  const sevZip = 'C:\\Program Files\\7-Zip\\7z.exe';
  const unrar = 'C:\\Program Files\\WinRAR\\UnRAR.exe';

  if (ext === '.rar' || ext === '.7z' || ext === '.tar' || ext === '.gz' || ext === '.tgz' || ext === '.bz2') {
    if (fs.existsSync(sevZip)) {
      execSync(`"${sevZip}" x "${archivePath}" -o"${destDir}" -y`, { timeout: 60000, stdio: 'pipe' });
      return;
    }
    if (ext === '.rar' && fs.existsSync(unrar)) {
      execSync(`"${unrar}" x -o+ "${archivePath}" "${destDir}"`, { timeout: 60000, stdio: 'pipe' });
      return;
    }
  }

  throw new Error(`Unsupported archive format "${ext}". Install 7-Zip or WinRAR to extract this file type.`);
}

ipcMain.handle('nexus:installMod', async (_, { archivePath, modDir, game, installPath, description }) => {
  try {
    const extractDir = path.join(modDir, 'extracted');
    extractArchive(archivePath, extractDir);

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
  const extractDir = path.join(modDir, 'extracted');
  const ROOT_LEVEL_FILES = [
    'doorstop_config.ini', '.doorstop_version', 'winhttp.dll',
    'changelog.txt', 'httpdoor.dll', 'version.dll', 'winmm.dll',
  ];

  try {
    extractArchive(archivePath, extractDir);

    const contents = fs.readdirSync(extractDir);
    let sourceDir = extractDir;

    if (contents.length === 1 && fs.statSync(path.join(extractDir, contents[0])).isDirectory()) {
      sourceDir = path.join(extractDir, contents[0]);
    }

    const destDir = installPath;
    fs.mkdirSync(destDir, { recursive: true });

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
    const msg = e.message || '';
    if (msg.includes('EPERM') || msg.includes('EACCES')) {
      const os = require('os');
      const stageDir = path.join(os.homedir(), 'Desktop', 'Code Library - Mod Install');
      try {
        fs.mkdirSync(stageDir, { recursive: true });
        const { execSync } = require('child_process');
        const srcBase = extractDir;
        copyDirRecursive(srcBase, stageDir);
        execSync(`explorer "${stageDir}"`, { timeout: 5000, windowsHide: true });
        execSync(`explorer "${installPath}"`, { timeout: 5000, windowsHide: true });
        return { error: 'permission_denied', stageDir, gameDir: installPath };
      } catch (stageErr) {
        return { error: 'permission_denied', stageDir: null, gameDir: installPath };
      }
    }
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
    const msg = e.message || '';
    if (msg.includes('EPERM') || msg.includes('EACCES')) {
      const os = require('os');
      const { execSync } = require('child_process');
      const stageDir = path.join(os.homedir(), 'Desktop', 'Code Library - Mod Install');
      try {
        fs.mkdirSync(stageDir, { recursive: true });
        for (const target of targetDirs) {
          const source = path.join(sourceDir, target.src || '');
          const destPath = path.join(stageDir, target.name || path.basename(source));
          if (!fs.existsSync(source)) continue;
          const stat = fs.statSync(source);
          if (stat.isDirectory()) copyDirRecursive(source, destPath);
          else fs.copyFileSync(source, destPath);
        }
        execSync(`explorer "${stageDir}"`, { timeout: 5000, windowsHide: true });
        for (const target of targetDirs) {
          if (target.dest) { execSync(`explorer "${target.dest}"`, { timeout: 5000, windowsHide: true }); break; }
        }
        return { error: 'permission_denied', stageDir, gameDir: targetDirs[0]?.dest || '' };
      } catch (stageErr) {
        return { error: 'permission_denied', stageDir: null, gameDir: targetDirs[0]?.dest || '' };
      }
    }
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

ipcMain.handle('gameinfo:getSteamInfo', async (_, steamAppId) => {
  if (!steamAppId) return null;
  try {
    const data = await httpsGet(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=english`);
    const appData = data?.[steamAppId];
    if (!appData?.success || !appData?.data) return null;
    const d = appData.data;
    return {
      name: d.name,
      short_description: d.short_description,
      detailed_description: d.detailed_description,
      about_the_game: d.about_the_game,
      developers: d.developers,
      publishers: d.publishers,
      genres: (d.genres || []).map(g => g.description),
      categories: (d.categories || []).map(c => c.description),
      release_date: d.release_date?.date,
      coming_soon: d.release_date?.coming_soon,
      header_image: d.header_image,
      screenshots: (d.screenshots || []).map(s => ({ thumbnail: s.path_thumbnail, full: s.path_full })),
      movies: (d.movies || []).map(m => ({
        id: m.id,
        name: m.name,
        thumbnail: m.thumbnail,
        webm_480: m.webm?.m480,
        webm_max: m.webm?.max,
        mp4_480: m.mp4?.m480,
        mp4_max: m.mp4?.max,
        highlight: m.highlight,
      })),
      background: d.background,
      background_raw: d.background_raw,
      pc_requirements: d.pc_requirements,
      metacritic: d.metacritic,
      price_overview: d.price_overview,
      is_free: d.is_free,
      platforms: d.platforms,
      website: d.website,
      legal_notice: d.legal_notice,
      content_descriptors: d.content_descriptors,
    };
  } catch (e) {
    console.error('[gameinfo:getSteamInfo]', e.message);
    return null;
  }
});

ipcMain.handle('gameinfo:searchRawg', async (_, { title, apiKey }) => {
  if (!apiKey || !title) return null;
  try {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let data = null;
    try {
      data = await httpsGet(`https://api.rawg.io/api/games/${slug}?key=${apiKey}`);
    } catch {}
    if (!data || data.detail) {
      data = await httpsGet(`https://api.rawg.io/api/games?search=${encodeURIComponent(title)}&key=${apiKey}&page_size=1`);
      if (data?.results?.length > 0) {
        data = await httpsGet(`https://api.rawg.io/api/games/${data.results[0].slug}?key=${apiKey}`);
      } else {
        return null;
      }
    }
    return {
      slug: data.slug,
      name: data.name,
      description_raw: data.description_raw,
      released: data.released,
      background_image: data.background_image,
      screenshots: (data.screenshots || []),
      genres: (data.genres || []).map(g => g.name),
      platforms: (data.platforms || []).map(p => p.platform?.name).filter(Boolean),
      metacritic: data.metacritic,
      website: data.website,
      developers: (data.developers || []).map(d => d.name),
      publishers: (data.publishers || []).map(p => p.name),
      esrb_rating: data.esrb_rating?.name,
      rating: data.rating,
      ratings_count: data.ratings_count,
    };
  } catch (e) {
    console.error('[gameinfo:searchRawg]', e.message);
    return null;
  }
});

ipcMain.handle('gameinfo:getRawgScreenshots', async (_, { slug, apiKey }) => {
  if (!apiKey || !slug) return [];
  try {
    const data = await httpsGet(`https://api.rawg.io/api/games/${slug}/screenshots?key=${apiKey}&page_size=20`);
    return data?.results || [];
  } catch {
    return [];
  }
});

function sgdbGet(endpoint, apiKey) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.get(`https://www.steamgriddb.com/api/v2${endpoint}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        } else {
          reject(new Error(`SGDB HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('SGDB timeout')); });
  });
}

ipcMain.handle('sgdb:searchBySteam', async (_, { steamAppId, apiKey }) => {
  if (!apiKey || !steamAppId) return null;
  try {
    const result = await sgdbGet(`/games/steam/${steamAppId}`, apiKey);
    if (result?.success && result?.data) {
      return {
        id: result.data.id,
        name: result.data.name,
        slug: result.data.slug,
        types: result.data.types,
      };
    }
    return null;
  } catch (e) {
    console.error('[sgdb:searchBySteam]', e.message);
    return null;
  }
});

ipcMain.handle('sgdb:searchByName', async (_, { name, apiKey }) => {
  if (!apiKey || !name) return null;
  try {
    const result = await sgdbGet(`/search/autocomplete/${encodeURIComponent(name)}`, apiKey);
    if (result?.success && result?.data?.length > 0) {
      const game = result.data[0];
      return { id: game.id, name: game.name, slug: game.slug, types: game.types };
    }
    return null;
  } catch (e) {
    console.error('[sgdb:searchByName]', e.message);
    return null;
  }
});

ipcMain.handle('sgdb:getGrids', async (_, { gameId, apiKey }) => {
  if (!apiKey || !gameId) return [];
  try {
    const result = await sgdbGet(`/grids/game/${gameId}`, apiKey);
    if (result?.success && result?.data) {
      return result.data.map(g => ({
        id: g.id,
        url: g.url,
        thumb: g.thumb,
        width: g.width,
        height: g.height,
        style: g.style,
      }));
    }
    return [];
  } catch (e) {
    console.error('[sgdb:getGrids]', e.message);
    return [];
  }
});

ipcMain.handle('sgdb:getHeroes', async (_, { gameId, apiKey }) => {
  if (!apiKey || !gameId) return [];
  try {
    const result = await sgdbGet(`/heroes/game/${gameId}`, apiKey);
    if (result?.success && result?.data) {
      return result.data.map(h => ({
        id: h.id,
        url: h.url,
        thumb: h.thumb,
        width: h.width,
        height: h.height,
        style: h.style,
      }));
    }
    return [];
  } catch (e) {
    console.error('[sgdb:getHeroes]', e.message);
    return [];
  }
});

ipcMain.handle('sgdb:getLogos', async (_, { gameId, apiKey }) => {
  if (!apiKey || !gameId) return [];
  try {
    const result = await sgdbGet(`/logos/game/${gameId}`, apiKey);
    if (result?.success && result?.data) {
      return result.data.map(l => ({
        id: l.id,
        url: l.url,
        thumb: l.thumb,
        width: l.width,
        height: l.height,
        style: l.style,
      }));
    }
    return [];
  } catch (e) {
    console.error('[sgdb:getLogos]', e.message);
    return [];
  }
});

const MOD_LOADERS = {
  BepInEx: {
    files: ['BepInEx/core', 'BepInEx/plugins', 'doorstop_config.ini', 'winhttp.dll'],
    gamePatterns: ['unity'],
    commonNexusNames: ['BepInExPack', 'BepInEx'],
  },
  SMAPI: {
    files: ['StardewModdingAPI.exe', 'StardewModdingAPI.dll', 'Mods'],
    gamePatterns: ['stardew'],
    commonNexusNames: ['SMAPI', 'StardewModdingAPI'],
  },
  'Script Extender': {
    files: ['skse64_loader.exe', 'f4se_loader.exe', 'obse_loader.exe', 'nvse_loader.exe'],
    gamePatterns: ['skyrim', 'fallout', 'oblivion'],
    commonNexusNames: ['SKSE', 'SKSE64', 'F4SE', 'Script Extender'],
  },
  ScriptHookV: {
    files: ['dinput8.dll', 'ScriptHookV.dll'],
    gamePatterns: ['gta', 'red dead'],
    commonNexusNames: ['ScriptHookV', 'Script Hook V'],
  },
};

function detectModLoader(installPath, gameTitle) {
  if (!installPath) return null;
  const gameLower = (gameTitle || '').toLowerCase();
  for (const [loader, config] of Object.entries(MOD_LOADERS)) {
    const hasFiles = config.files.some(f => fs.existsSync(path.join(installPath, f)));
    if (hasFiles) return { name: loader, installed: true };
    if (config.gamePatterns.some(p => gameLower.includes(p))) {
      return { name: loader, installed: false };
    }
  }
  return null;
}

function getDiskSpace(p) {
  try { return fs.statfsSync(p).bavail * fs.statfsSync(p).bsize; } catch { return null; }
}

ipcMain.handle('preflight:check', async (_, { game, apiKey, slug }) => {
  const checks = [];

  if (apiKey) {
    try {
      await httpsGet('https://api.nexusmods.com/v1/users/validate.json', { 'apikey': apiKey });
      checks.push({ name: 'API Key', ok: true, message: 'Valid' });
    } catch {
      checks.push({ name: 'API Key', ok: false, message: 'Invalid or expired. Check Settings.' });
    }
  } else {
    checks.push({ name: 'API Key', ok: false, message: 'No API key configured. Go to Settings.' });
  }

  if (game?.install_path) {
    if (fs.existsSync(game.install_path)) {
      checks.push({ name: 'Game Path', ok: true, message: game.install_path });
      const freeSpace = getDiskSpace(game.install_path);
      if (freeSpace !== null) {
        const gb = (freeSpace / 1024 / 1024 / 1024).toFixed(1);
        checks.push({ name: 'Disk Space', ok: freeSpace > 500 * 1024 * 1024, message: `${gb} GB free` });
      }
    } else {
      checks.push({ name: 'Game Path', ok: false, message: `Directory not found: ${game.install_path}` });
    }
  } else {
    checks.push({ name: 'Game Path', ok: false, message: 'No install directory set. Edit game properties.' });
  }

  if (game?.exe_path) {
    checks.push({ name: 'Executable', ok: true, message: path.basename(game.exe_path) });
  }

  const loaderInfo = detectModLoader(game?.install_path, game?.title);
  if (loaderInfo) {
    checks.push({
      name: 'Mod Loader',
      ok: loaderInfo.installed,
      message: loaderInfo.installed ? `${loaderInfo.name} detected` : `${loaderInfo.name} not found`,
      loader: loaderInfo,
    });
  }

  return { allOk: checks.every(c => c.ok), checks };
});

ipcMain.handle('preflight:detectLoader', async (_, { installPath, gameTitle }) => {
  return detectModLoader(installPath, gameTitle);
});

ipcMain.handle('preflight:getDepChain', async (_, { apiKey, slug, description, gameTitle, installPath }) => {
  const deps = [];
  const seen = new Set();
  const d = (description || '').toLowerCase();
  const vtApiKey = await dbGet('SELECT value FROM settings WHERE key = ?', ['vt_api_key']);
  const vtKey = vtApiKey?.value || null;

  const depPatterns = [
    { name: 'BepInEx', pattern: /bepinex/i },
    { name: 'SMAPI', pattern: /smapi|stardew\s*modding/i },
    { name: 'Script Extender', pattern: /script\s*extender|skyrim\s*script\s*extender|f4se|obse|nvse|skse/i },
    { name: 'Forge/Fabric', pattern: /forge|fabric|quilt/i },
    { name: 'ScriptHookV', pattern: /scripthookv|script\s*hook\s*v/i },
    { name: 'OpenIV', pattern: /open\s*iv|openiv/i },
    { name: 'r2modman/Thunderstore', pattern: /r2modman|thunderstore|overwolf/i },
  ];

  for (const { name, pattern } of depPatterns) {
    if (pattern.test(d) && !seen.has(name)) {
      seen.add(name);
      const result = await resolveDependencyFull(apiKey, slug, name, gameTitle, installPath, vtKey);
      deps.push(result);
    }
  }

  return deps;
});

// ─── GTA5-Mods.com Scrapers ────────────────────────────────────────────────

const GTA5MODS_BASE = 'https://www.gta5-mods.com';
const GTA5MODS_CATEGORIES = ['tools', 'vehicles', 'paintjobs', 'weapons', 'scripts', 'player', 'maps', 'misc'];

function httpsGetRaw(url, headers = {}) {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve, reject) => {
    function follow(currentUrl, redirectsLeft) {
      if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          if (next.startsWith('/')) {
            const parsed = new URL(currentUrl);
            next = `${parsed.protocol}//${parsed.host}${next}`;
          }
          res.resume();
          return follow(next, redirectsLeft - 1);
        }
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    }
    follow(url, 10);
  });
}

function parseGta5ModsList(html) {
  const mods = [];
  const cardRegex = /<div class="file-list-obj">([\s\S]*?)(?=<div class="file-list-obj">|$)/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const card = match[1];

    const hrefMatch = card.match(/<a[^>]*href="\/([^"]+)"[^>]*class="preview[^"]*"/);
    const slug = hrefMatch ? hrefMatch[1] : '';

    const titleMatch = card.match(/<a[^>]*href="\/[^"]*"[^>]*title="([^"]*)"/);
    const name = titleMatch ? titleMatch[1] : '';

    const imgMatch = card.match(/<img[^>]*src="(https:\/\/img\.gta5-mods\.com[^"]*)"/);
    const image = imgMatch ? imgMatch[1] : '';

    const ratingMatch = card.match(/<span class="fa fa-star"><\/span>\s*([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    const downloadsMatch = card.match(/<span class="fa fa-download"><\/span>\s*([\d,]+)/);
    const downloads = downloadsMatch ? parseInt(downloadsMatch[1].replace(/,/g, ''), 10) : 0;

    const likesMatch = card.match(/<span class="fa fa-thumbs-up"><\/span>\s*(\d+)/);
    const likes = likesMatch ? parseInt(likesMatch[1], 10) : 0;

    const versionMatch = card.match(/<div class="version"[^>]*>([^<]*)<\/div>/);
    const version = versionMatch ? versionMatch[1].trim() : '';

    const authorMatch = card.match(/<div class="bottom">.*?<a href="\/users\/[^"]*">([^<]*)<\/a>/s);
    const author = authorMatch ? authorMatch[1].trim() : '';

    const category = slug.split('/')[0] || '';

    if (name && slug) {
      mods.push({
        name,
        slug,
        category,
        image,
        rating,
        downloads,
        likes,
        version,
        author,
        url: `${GTA5MODS_BASE}/${slug}`,
      });
    }
  }
  return mods;
}

function parseGta5ModsTotalPages(html) {
  const pageMatch = html.match(/page=(\d+)[^"]*"[^>]*>\s*(?:Next|Last|»)/i)
    || html.match(/class="active"[^>]*>.*?<\/a>\s*<a[^>]*href="[^"]*page=(\d+)"/s)
    || html.match(/page=(\d+)/g);
  if (!pageMatch) return 1;
  let maxPage = 1;
  if (Array.isArray(pageMatch)) {
    for (const m of pageMatch) {
      const numMatch = typeof m === 'string' ? m.match(/page=(\d+)/) : null;
      if (numMatch) {
        const n = parseInt(numMatch[1], 10);
        if (n > maxPage) maxPage = n;
      }
    }
  } else if (pageMatch[1]) {
    maxPage = parseInt(pageMatch[1], 10);
  }
  return maxPage;
}

ipcMain.handle('gta5mods:browse', async (_, { category = 'tools', sort = 'latest', since = 'all', page = 1 } = {}) => {
  try {
    if (!GTA5MODS_CATEGORIES.includes(category)) {
      return { error: `Invalid category: ${category}. Valid: ${GTA5MODS_CATEGORIES.join(', ')}` };
    }
    let url = `${GTA5MODS_BASE}/${category}`;
    const params = [];
    if (sort && sort !== 'latest') params.push(`sort=${sort}`);
    if (since && since !== 'all') params.push(`since=${since}`);
    if (page > 1) params.push(`page=${page}`);
    if (params.length) url += '?' + params.join('&');

    const html = await httpsGetRaw(url);
    const mods = parseGta5ModsList(html);
    const totalPages = parseGta5ModsTotalPages(html);
    return { mods, totalPages, category, sort, since, page };
  } catch (e) {
    return { error: e.message, mods: [], totalPages: 1 };
  }
});

ipcMain.handle('gta5mods:search', async (_, { query, page = 1 }) => {
  try {
    if (!query || !query.trim()) return { error: 'No search query provided', mods: [], totalPages: 1 };
    const url = `${GTA5MODS_BASE}/search/${encodeURIComponent(query.trim())}${page > 1 ? `?page=${page}` : ''}`;
    const html = await httpsGetRaw(url);
    const mods = parseGta5ModsList(html);
    const totalPages = parseGta5ModsTotalPages(html);
    return { mods, totalPages, query, page };
  } catch (e) {
    return { error: e.message, mods: [], totalPages: 1 };
  }
});

ipcMain.handle('gta5mods:getMod', async (_, url) => {
  try {
    if (!url) return { error: 'No URL provided' };
    if (!url.startsWith('http')) {
      url = `${GTA5MODS_BASE}/${url.replace(/^\//, '')}`;
    }

    const html = await httpsGetRaw(url);

    let title = '';
    const titleMatch = html.match(/<h1>([^<]*(?:<span[^>]*>.*?<\/span>)?)<\/h1>/s);
    if (titleMatch) {
      title = titleMatch[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    let version = '';
    const verMatch = html.match(/<h1>.*?<span class="version">([^<]*)<\/span>/s)
      || html.match(/<div class="version"[^>]*>([^<]*)<\/div>/);
    if (verMatch) version = verMatch[1].trim();

    let description = '';
    const descMatch = html.match(/<div id="file-description" class="file-description">([\s\S]*?)<\/div>/);
    if (descMatch) {
      description = descMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    let image = '';
    const coverMatch = html.match(/<a class="cover-media"[^>]*>[\s\S]*?<img[^>]*src="(https:\/\/img\.gta5-mods\.com[^"]*)"/);
    if (coverMatch) {
      image = coverMatch[1];
    } else {
      const fallbackImg = html.match(/<img[^>]*class="[^"]*img-responsive[^"]*"[^>]*src="(https:\/\/img\.gta5-mods\.com[^"]*)"/);
      if (fallbackImg) image = fallbackImg[1];
    }

    const screenshots = [];
    const thumbRegex = /<a class="thumbnail[^"]*mfp-image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="(https:\/\/img\.gta5-mods\.com[^"]*)"/g;
    let thumbMatch;
    while ((thumbMatch = thumbRegex.exec(html)) !== null) {
      if (!screenshots.includes(thumbMatch[1])) screenshots.push(thumbMatch[1]);
    }

    let author = '';
    const authorMatch = html.match(/<a class="username"[^>]*>([^<]*)<\/a>/);
    if (authorMatch) author = authorMatch[1].trim();

    let downloadUrl = '';
    const dlMatch = html.match(/<a[^>]*href="(\/[^"]*\/download\/\d+)"[^>]*class="[^"]*btn-download/);
    if (dlMatch) {
      downloadUrl = dlMatch[1].startsWith('http') ? dlMatch[1] : `${GTA5MODS_BASE}${dlMatch[1]}`;
    }

    let fileId = '';
    if (downloadUrl) {
      const idMatch = downloadUrl.match(/download\/(\d+)/);
      if (idMatch) fileId = idMatch[1];
    }

    const categories = [];
    const catRegex = /<ul class="categories">([\s\S]*?)<\/ul>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(html)) !== null) {
      const liRegex = /<li>([^<]*)<\/li>/g;
      let liMatch;
      while ((liMatch = liRegex.exec(catMatch[1])) !== null) {
        const cat = liMatch[1].trim();
        if (cat && !categories.includes(cat)) categories.push(cat);
      }
    }

    let vtVersion = '';
    const vtMatch = html.match(/<i class="fa fa-shield[^"]*vt-version[^"]*"[^>]*data-version="([^"]*)"/);
    if (vtMatch) vtVersion = vtMatch[1];

    return {
      title,
      version,
      description,
      image,
      screenshots,
      author,
      downloadUrl,
      fileId,
      categories,
      vtVersion,
      url,
    };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('gta5mods:downloadFile', async (_, { downloadUrl, modName }) => {
  try {
    if (!downloadUrl) return { error: 'No download URL provided' };

    let resolvedUrl = downloadUrl;

    const landingHtml = await httpsGetRaw(downloadUrl);
    const directMatch = landingHtml.match(/class="btn btn-primary"[^>]*href="(https?:\/\/[^"]*\.(zip|rar|7z|tar\.gz)[^"]*)"/i)
      || landingHtml.match(/window\.location\s*=\s*["'](https?:\/\/[^"']*\.(zip|rar|7z|tar\.gz)[^"']*)/i);
    if (directMatch) {
      resolvedUrl = directMatch[1];
    } else {
      const anyHref = landingHtml.match(/<a[^>]*href="(https?:\/\/[^"]*\.(zip|rar|7z|tar\.gz)[^"]*)"/i);
      if (anyHref) resolvedUrl = anyHref[1];
    }

    const destDir = path.join(app.getPath('temp'), 'gta5mods');
    fs.mkdirSync(destDir, { recursive: true });

    const safeName = (modName || 'gta5mod').replace(/[<>:"/\\|?*]/g, '_');
    let fileName = safeName;
    const urlPath = new URL(resolvedUrl).pathname;
    const urlFileMatch = urlPath.match(/\/([^/?]+)$/);
    if (urlFileMatch) {
      fileName = decodeURIComponent(urlFileMatch[1]);
    }
    if (!fileName.includes('.')) {
      fileName += '.zip';
    }
    const filePath = path.join(destDir, fileName);

    await httpsDownload(resolvedUrl, filePath, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    return { filePath, fileName };
  } catch (e) {
    return { error: e.message };
  }
});
