// Export / import of ALL data as one JSON file (backup or move to a new phone).
import { TABLES, type TableName, type TuraDB } from './db';

export const BACKUP_APP = 'tura-mea';
export const SCHEMA_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function exportAll(database: TuraDB): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) data[t] = await database.table(t).toArray();
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Throws an Error with a Romanian message if the file is not a valid backup. */
export function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('Fișierul nu este un backup valid.');
  const f = raw as Partial<BackupFile>;
  if (f.app !== BACKUP_APP) throw new Error('Fișierul nu este un backup Tura Mea.');
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Backup-ul a fost făcut cu o versiune mai nouă a aplicației. Actualizează aplicația.');
  }
  if (!f.data || typeof f.data !== 'object') throw new Error('Backup-ul nu conține date.');
  for (const t of TABLES) {
    const rows = (f.data as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabelul „${t}” din backup este invalid.`);
  }
  return f as BackupFile;
}

/** Replaces all local data with the backup, atomically. */
export async function importAll(database: TuraDB, file: BackupFile): Promise<void> {
  await database.transaction('rw', TABLES.map((t) => database.table(t)), async () => {
    for (const t of TABLES) {
      await database.table(t).clear();
      const rows = file.data[t] ?? [];
      if (rows.length) await database.table(t).bulkPut(rows);
    }
  });
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `tura-mea-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
