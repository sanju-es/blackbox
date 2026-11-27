import { constants } from 'node:fs'
import { access, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'

/** One read of the file: its text and the markers the drift check needs. */
export interface Snapshot {
  readonly text: string
  /** `false` when the mount holds no file yet; the first write creates it. */
  readonly exists: boolean
  readonly revision: string
  readonly lastWrite: string | null
}

export interface FileStore {
  readonly path: string
  read(): Promise<Snapshot>
  canWrite(): Promise<boolean>
  write(text: string): Promise<Snapshot>
}

/**
 * The only code that touches the mounted file (`D-17`, `D-19`). A write goes to
 * a sibling temporary file and is renamed, so the exporter never reads a
 * half-written document (`D-16`). A missing file reads as an empty document and
 * the first write creates it (`D-30`).
 */
export function createFileStore(path: string): FileStore {
  return {
    path,
    read: () => read(path),
    canWrite: async () => {
      try {
        await access(path, constants.W_OK)
        return true
      } catch (error) {
        // A missing file may still be created if its directory accepts a write.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
        try {
          await access(dirname(path), constants.W_OK)
          return true
        } catch {
          return false
        }
      }
    },
    write: async (text: string) => {
      const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
      try {
        await writeFile(temporary, text, 'utf8')
        await rename(temporary, path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
      return read(path)
    },
  }
}

async function read(path: string): Promise<Snapshot> {
  try {
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    return {
      text,
      exists: true,
      revision: `${info.mtimeMs}:${info.size}`,
      lastWrite: new Date(info.mtimeMs).toISOString(),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { text: '', exists: false, revision: 'absent', lastWrite: null }
    }
    throw error
  }
}
