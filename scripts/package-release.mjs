import fs from 'node:fs/promises';
import path from 'node:path';

function printUsage() {
  console.log(`Usage: node scripts/package-release.mjs [--out-dir <dir>] [--label <name>] [--dry-run]

Creates a staged release artifact folder containing the built frontend (dist/) and backend runtime files.

Options:
  --out-dir <dir>   Output root directory (default: release-artifacts)
  --label <name>    Override artifact folder label (default: package name + version + UTC timestamp)
  --dry-run         Show planned files without writing
  --help            Show this help
`);
}

function parseArgs(argv) {
  const options = {
    outDir: 'release-artifacts',
    label: null,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out-dir') {
      options.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--label') {
      options.label = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.outDir) {
    throw new Error('Missing value for --out-dir');
  }

  return options;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageMeta(rootDir) {
  const raw = await fs.readFile(path.join(rootDir, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw);
  return {
    name: typeof pkg.name === 'string' ? pkg.name : 'app',
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  };
}

function timestampUtc(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function sanitizeLabel(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function copyEntry(rootDir, artifactDir, entry) {
  const source = path.join(rootDir, entry);
  const destination = path.join(artifactDir, entry);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const rootDir = process.cwd();
  const { name, version } = await readPackageMeta(rootDir);

  const requiredPaths = ['dist', 'server', 'package.json', 'package-lock.json'];
  for (const relPath of requiredPaths) {
    const fullPath = path.join(rootDir, relPath);
    if (!(await pathExists(fullPath))) {
      throw new Error(`Required path is missing: ${relPath}. Run build/install first.`);
    }
  }

  const optionalPaths = [
    'README.md',
    'START.bat',
    'STOP.bat',
    'LaunchApp.vbs',
    'scripts/backup-db.mjs',
    'scripts/windows-host-scheduled-backup.ps1',
    'scripts/windows-host-backup-retention-cleanup.ps1',
    'scripts/windows-host-offhost-backup-replicate.ps1',
    'scripts/windows-host-offhost-backup-retention-cleanup.ps1',
    'scripts/windows-host-nssm-service.ps1',
    'scripts/windows-host-health-check.ps1',
    'scripts/windows-host-notify-webhook.ps1'
  ];

  const includedPaths = [...requiredPaths];
  for (const relPath of optionalPaths) {
    if (await pathExists(path.join(rootDir, relPath))) {
      includedPaths.push(relPath);
    }
  }

  const label =
    options.label || sanitizeLabel(`${name}-v${version}-${timestampUtc()}`);
  const artifactRoot = path.resolve(rootDir, options.outDir);
  const artifactDir = path.join(artifactRoot, label);

  console.log('[release-package] artifact root:', artifactRoot);
  console.log('[release-package] artifact dir:', artifactDir);
  console.log('[release-package] included paths:');
  for (const relPath of includedPaths) {
    console.log(`  - ${relPath}`);
  }
  console.log('[release-package] note: this creates a staged folder (not a .zip archive).');

  if (options.dryRun) {
    console.log('[release-package] dry-run complete (no files written)');
    return;
  }

  if (await pathExists(artifactDir)) {
    throw new Error(`Artifact directory already exists: ${artifactDir}`);
  }

  await fs.mkdir(artifactDir, { recursive: true });

  for (const relPath of includedPaths) {
    await copyEntry(rootDir, artifactDir, relPath);
  }

  const manifest = {
    created_at: new Date().toISOString(),
    artifact_dir: artifactDir,
    package: { name, version },
    included_paths: includedPaths
  };

  await fs.writeFile(
    path.join(artifactDir, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log('[release-package] artifact created successfully');
}

main().catch((error) => {
  console.error('[release-package] failed:', error.message);
  process.exit(1);
});
