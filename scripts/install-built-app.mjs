import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import fse from 'fs-extra';

const productName = 'Frappe Cash Books';
const projectRoot = path.resolve(process.cwd());
const bundledDir = path.join(projectRoot, 'dist_electron', 'bundled');

function walk(dir, matches = []) {
  if (!fs.existsSync(dir)) {
    return matches;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        matches.push(fullPath);
        continue;
      }
      walk(fullPath, matches);
    }
  }

  return matches;
}

function pickNewest(paths) {
  if (!paths.length) {
    return null;
  }
  return paths
    .map((p) => ({ path: p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.path;
}

function isWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureInstallDir() {
  const envDir = process.env.INSTALL_DIR;
  if (envDir) {
    fse.ensureDirSync(envDir);
    return envDir;
  }

  const systemApps = '/Applications';
  if (isWritable(systemApps)) {
    return systemApps;
  }

  const userApps = path.join(os.homedir(), 'Applications');
  fse.ensureDirSync(userApps);
  return userApps;
}

function quitRunningApp() {
  try {
    execSync(`osascript -e 'tell application "${productName}" to quit'`, {
      stdio: 'ignore',
    });
  } catch {
    // ignore if app isn't running
  }
}

if (process.platform !== 'darwin') {
  console.error('install-built-app.mjs currently supports macOS only.');
  process.exit(1);
}

const appCandidates = walk(bundledDir);
const appPath = pickNewest(appCandidates);

if (!appPath) {
  console.error('No .app found under dist_electron/bundled. Run build first.');
  process.exit(1);
}

const installDir = ensureInstallDir();
const targetPath = path.join(installDir, `${productName}.app`);

quitRunningApp();
fse.removeSync(targetPath);
fse.copySync(appPath, targetPath, { overwrite: true });

console.log(`Installed ${productName} to ${targetPath}`);

if (process.env.OPEN_AFTER_INSTALL === '1') {
  execSync(`open -a "${targetPath}"`);
}
