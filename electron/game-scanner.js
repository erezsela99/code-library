const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execAsync = promisify(exec);

const COMMON_PATHS = {
  'Steam': [
    'C:\\Program Files (x86)\\Steam\\steamapps',
    'C:\\Program Files\\Steam\\steamapps',
    'D:\\Steam\\steamapps',
    'D:\\SteamLibrary\\steamapps',
    'E:\\SteamLibrary\\steamapps',
    'C:\\Users\\*\\Documents\\My Games',
    '/Users/*/Library/Application Support/Steam/steamapps',
    '/home/*/.steam/steam/steamapps',
    '/home/*/.local/share/Steam/steamapps',
  ],
  'GOG': [
    'C:\\GOG Games',
    'C:\\Program Files (x86)\\GOG Galaxy\\Games',
    'D:\\GOG Games',
    '/Users/*/Applications',
    '/home/*/GOG Games',
  ],
  'Epic': [
    'C:\\Program Files\\Epic Games',
    'D:\\Epic Games',
    'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
  ],
  'Rockstar': [
    'C:\\Program Files\\Rockstar Games',
    'D:\\Rockstar Games',
  ],
};

const STEAM_APPS_VDF = 'libraryfolders.vdf';

const BLACKLISTED_DIRS = [
  'steamworks common redistributables',
  'steamworks sdk',
  'directx',
  'vcredist',
  'microsoft visual c++',
  'commonfiles',
  'directshow',
  'windows kits',
  '.net',
  'dotnet',
  ' redistributable',
  'physx',
  'openal',
  'pragma',
  'galaxy common',
  'gog galaxy',
  'epic games launcher',
  'epic games\\engine',
];

const BLACKLISTED_TITLES = [
  'steamworks common redistributables',
  'steamworks sdk redistributable',
  'rockstar games launcher',
  'rockstar games social club',
  'social club',
  'rockstar cloud services',
  'epic games launcher',
  'epic online services',
  'gog galaxy',
  'gog overlay',
  'ubisoft connect',
  'ubisoft connect launcher',
  'ea app',
  'ea desktop',
  'origin',
  'battle.net',
  'xbox console companion',
  'xbox game bar',
  'nvidia GeForce Experience',
  'nvidia app',
  'amd software',
  'radeon software',
  'msi afterburner',
  'rivatuner',
  'obs studio',
  'discord',
  'spotify',
  'chrome',
  'firefox',
  '7-zip',
  'winrar',
  'notepad++',
  'visual studio',
  'vs code',
  'python',
  'node.js',
  'java',
  'dotnet',
  '.net',
  'directx runtime',
  'directx sdk',
  'vcredist',
  'microsoft visual c++',
  'physx',
  'openal',
  'pragma',
  'galaxy common',
  'redistributable',
  'dxwebsetup',
  'setup exe',
  'uninstall',
  'uninstall.exe',
  'installer',
  'launcher',
  'social club',
  ' rockstar',
  'forza horizon 6',
];

function isBlacklisted(title, installPath) {
  const t = (title || '').toLowerCase();
  const p = (installPath || '').toLowerCase();

  for (const bl of BLACKLISTED_TITLES) {
    if (t.includes(bl)) return true;
  }

  for (const bl of BLACKLISTED_DIRS) {
    if (t.includes(bl) || p.includes(bl)) return true;
  }

  return false;
}

async function readVDF(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const paths = [];
    const pathRegex = /"path"\s+"([^"]+)"/g;
    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }
    return paths;
  } catch {
    return [];
  }
}

async function scanSteamLibrary() {
  const games = [];
  const defaultSteam = 'C:\\Program Files (x86)\\Steam';
  const vdfPath = path.join(defaultSteam, 'steamapps', STEAM_APPS_VDF);

  let steamPaths = [defaultSteam];
  if (fs.existsSync(vdfPath)) {
    const extraPaths = await readVDF(vdfPath);
    steamPaths = [...steamPaths, ...extraPaths];
  }

  for (const steamPath of steamPaths) {
    const appsDir = path.join(steamPath, 'steamapps');
    if (!fs.existsSync(appsDir)) continue;

    try {
      const files = fs.readdirSync(appsDir);
      for (const file of files) {
        if (!file.startsWith('appmanifest_')) continue;
        const content = fs.readFileSync(path.join(appsDir, file), 'utf-8');
        const nameMatch = content.match(/"name"\s+"([^"]+)"/);
        const idMatch = file.match(/appmanifest_(\d+)/);
        if (nameMatch && idMatch) {
          const gameName = nameMatch[1];
          const steamAppId = idMatch[1];
          const installDir = path.join(appsDir, 'common', gameName);
          const exePath = findExeInDir(installDir);
          if (isBlacklisted(gameName, installDir)) continue;
          games.push({
            title: gameName,
            platform: 'Steam',
            steam_app_id: steamAppId,
            exe_path: exePath || null,
            install_path: fs.existsSync(installDir) ? installDir : null,
            cover_url: `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`,
          });
        }
      }
    } catch (e) {
      console.error('Error scanning Steam path:', steamPath, e.message);
    }
  }
  return games;
}

function findExeInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir);
    const exes = files.filter(f => f.endsWith('.exe'));
    if (exes.length === 1) return path.join(dir, exes[0]);
    if (exes.length > 1) {
      const launcher = exes.find(f => /^(PlayGTAV|PlayRDR2|launcher|Rockstar|SocialClub)\.exe$/i.test(f));
      if (launcher) return path.join(dir, launcher);
      const mainExe = exes.find(f => !f.includes('uninstall') && !f.includes('setup') && !f.includes('launcher'));
      return mainExe ? path.join(dir, mainExe) : path.join(dir, exes[0]);
    }
  } catch {}
  return null;
}

async function scanGOGLibrary() {
  const games = [];
  const gogDirs = COMMON_PATHS['GOG'].filter(p => !p.includes('*'));

  for (const dir of gogDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const exePath = findExeInDir(fullPath);
          if (exePath && !isBlacklisted(entry, fullPath)) {
            games.push({
              title: entry,
              platform: 'GOG',
              exe_path: exePath,
              install_path: fullPath,
              cover_url: null,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error scanning GOG path:', dir, e.message);
    }
  }
  return games;
}

async function scanEpicLibrary() {
  const games = [];
  const manifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (!fs.existsSync(manifestDir)) return games;

  try {
    const files = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(manifestDir, file), 'utf-8');
        const data = JSON.parse(content);
        const displayName = data.DisplayName || path.basename(file, '.item');
        const installLoc = data.InstallLocation || '';
        if (isBlacklisted(displayName, installLoc)) continue;
        games.push({
          title: displayName,
          platform: 'Epic',
          exe_path: data.InstallLocation ? findExeInDir(data.InstallLocation) : null,
          install_path: data.InstallLocation || null,
          cover_url: data.KeyImages?.[0]?.Url || null,
        });
      } catch {}
    }
  } catch (e) {
    console.error('Error scanning Epic:', e.message);
  }
  return games;
}

async function scanRockstarLibrary() {
  const games = [];
  const rsDirs = COMMON_PATHS['Rockstar'].filter(p => !p.includes('*'));

  for (const dir of rsDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const exePath = findExeInDir(fullPath);
          if (exePath && !isBlacklisted(entry, fullPath)) {
            games.push({
              title: entry,
              platform: 'Rockstar',
              exe_path: exePath,
              install_path: fullPath,
              cover_url: null,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error scanning Rockstar path:', dir, e.message);
    }
  }
  return games;
}

async function scanRegistryForGames() {
  const games = [];
  if (process.platform !== 'win32') return games;

  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Steam" 2>nul',
      { timeout: 10000 }
    );
    const lines = stdout.split('\n').filter(l => l.includes('InstallLocation'));
    for (const line of lines) {
      const match = line.match(/InstallLocation\s+REG_SZ\s+(.+)/);
      if (match) {
        const installPath = match[1].trim();
        const exePath = findExeInDir(installPath);
        const title = path.basename(installPath);
        if (exePath && !isBlacklisted(title, installPath)) {
          games.push({
            title: path.basename(installPath),
            platform: 'Steam',
            exe_path: exePath,
            install_path: installPath,
            cover_url: null,
          });
        }
      }
    }
  } catch {}

  return games;
}

async function scanAllLibraries(additionalDirs = []) {
  const allGames = [];

  const [steamGames, gogGames, epicGames, rsGames, registryGames] = await Promise.all([
    scanSteamLibrary(),
    scanGOGLibrary(),
    scanEpicLibrary(),
    scanRockstarLibrary(),
    scanRegistryForGames(),
  ]);

  allGames.push(...steamGames, ...gogGames, ...epicGames, ...rsGames, ...registryGames);

  for (const dir of additionalDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const exePath = findExeInDir(fullPath);
          if (exePath && !isBlacklisted(entry, fullPath)) {
            allGames.push({
              title: entry,
              platform: 'Local',
              exe_path: exePath,
              install_path: fullPath,
              cover_url: null,
            });
          }
        } else if (entry.endsWith('.exe') && !isBlacklisted(path.basename(entry, '.exe'), fullPath)) {
          allGames.push({
            title: path.basename(entry, '.exe'),
            platform: 'Local',
            exe_path: fullPath,
            install_path: dir,
            cover_url: null,
          });
        }
      }
    } catch (e) {
      console.error('Error scanning custom dir:', dir, e.message);
    }
  }

  const seen = new Set();
  return allGames.filter(g => {
    const key = `${g.title.toLowerCase()}|${g.platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { scanAllLibraries, scanSteamLibrary, scanGOGLibrary, scanEpicLibrary, scanRockstarLibrary };
