import fs from 'node:fs/promises';
import path from 'node:path';

function printUsage() {
  console.log(`Usage: node scripts/backup-db.mjs [--db <path>] [--out-dir <dir>] [--dry-run]

Options:
  --db <path>       SQLite DB file to back up (default: DATABASE_PATH env or chores.db)
  --out-dir <dir>   Backup output directory root (default: backups)
  --dry-run         Print what would be copied without writing files
  --help            Show this help
`);
}

function parseArgs(argv) {
  const options = {
    db: process.env.DATABASE_PATH || 'chores.db',
    outDir: 'backups',
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db') {
      options.db = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--out-dir') {
      options.outDir = argv[i + 1];
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

  if (!options.db) {
    throw new Error('Missing value for --db');
  }
  if (!options.outDir) {
    throw new Error('Missing value for --out-dir');
  }

  return options;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function timestampForPath(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') + '-' + [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const dbPath = path.resolve(process.cwd(), options.db);
  const outRoot = path.resolve(process.cwd(), options.outDir);

  if (!(await exists(dbPath))) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const candidateFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const filesToCopy = [];
  for (const filePath of candidateFiles) {
    if (await exists(filePath)) {
      filesToCopy.push(filePath);
    }
  }

  const backupDir = path.join(outRoot, `chore-db-${timestampForPath()}`);

  console.log('[db-backup] source:', dbPath);
  console.log('[db-backup] destination:', backupDir);
  console.log('[db-backup] files:', filesToCopy.map((f) => path.basename(f)).join(', '));
  console.log('[db-backup] note: stop the app before backup/restore for the safest file copy.');

  if (options.dryRun) {
    console.log('[db-backup] dry-run complete (no files written)');
    return;
  }

  await fs.mkdir(backupDir, { recursive: true });

  const copiedFiles = [];
  for (const sourceFile of filesToCopy) {
    const destinationFile = path.join(backupDir, path.basename(sourceFile));
    await fs.copyFile(sourceFile, destinationFile);
    copiedFiles.push(path.basename(destinationFile));
  }

  const manifest = {
    created_at: new Date().toISOString(),
    source_db_path: dbPath,
    backup_dir: backupDir,
    files: copiedFiles
  };
  await fs.writeFile(path.join(backupDir, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log('[db-backup] backup created successfully');
}

main().catch((error) => {
  console.error('[db-backup] failed:', error.message);
  process.exit(1);
});
