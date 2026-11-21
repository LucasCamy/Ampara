import { isVault, type Vault } from './vault'

export const LOCAL_DB_NAME = 'ampara-local'
export const VAULT_KEY = 'ampara:vault:v1'
const KV_FALLBACK_KEY = 'ampara:local:kv:v1'
const CLEARED_KEY = 'ampara:local:cleared:v1'

/** Guarda apenas o cofre cifrado e marcadores não sensíveis do aparelho. */
function transaction<T>(store: 'vault' | 'kv', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    let blocked = false
    try {
      request = indexedDB.open(LOCAL_DB_NAME, 1)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of ['vault', 'kv']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('O banco local está ocupado em outra aba.'))
    }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) return db.close()
      db.onversionchange = () => db.close()
      try {
        const tx = db.transaction(store, mode)
        const result = run(tx.objectStore(store))
        tx.oncomplete = () => {
          db.close()
          resolve(result.result)
        }
        tx.onabort = tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('Não foi possível gravar no banco local.'))
        }
      } catch (error) {
        db.close()
        reject(error)
      }
    }
  })
}

function readFallback(): { vault: Vault; pending: boolean } | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VAULT_KEY) ?? 'null')
    if (!isVault(parsed)) return null
    // Um fallback gravado após falha do IDB deve prevalecer sobre a cópia antiga dele.
    const value = { ...parsed } as Vault & { localFallback?: boolean }
    const pending = value.localFallback === true
    delete value.localFallback
    return { vault: value, pending }
  } catch {
    return null
  }
}

function removeLocal(name: string) {
  try {
    localStorage.removeItem(name)
  } catch {
    // IndexedDB também funciona em navegadores com localStorage bloqueado.
  }
}

async function finishPendingClear(): Promise<void> {
  let cleared = false
  try {
    cleared = !!localStorage.getItem(CLEARED_KEY)
  } catch {
    // IndexedDB funciona mesmo quando o localStorage está bloqueado.
  }
  if (cleared) {
    await transaction('vault', 'readwrite', (s) => s.clear())
    await transaction('kv', 'readwrite', (s) => s.clear())
    removeLocal(CLEARED_KEY)
  }
}

/** Migra o cofre legado somente depois de a transação do IndexedDB confirmar a gravação. */
export async function readStoredVault(): Promise<Vault | null> {
  try {
    await finishPendingClear()
  } catch {
    return readFallback()?.vault ?? null
  }
  const fallback = readFallback()
  try {
    const stored = await transaction<unknown>('vault', 'readonly', (s) => s.get('primary'))
    if (isVault(stored) && !fallback?.pending) return stored
    if (fallback) {
      await transaction('vault', 'readwrite', (s) => s.put(fallback.vault, 'primary'))
      removeLocal(VAULT_KEY)
      return fallback.vault
    }
    return isVault(stored) ? stored : null
  } catch {
    return fallback?.vault ?? null
  }
}

/** Nenhum dado decifrado deve chegar a esta camada. Escritas do app passam pela sessão. */
export async function writeStoredVault(value: Vault): Promise<void> {
  if (!isVault(value)) throw new Error('Cofre inválido.')
  try {
    await finishPendingClear()
    await transaction('vault', 'readwrite', (s) => s.put(value, 'primary'))
    removeLocal(VAULT_KEY)
  } catch {
    // A marca fica junto do conteúdo cifrado, inclusive ao restaurar um backup de revisão menor.
    localStorage.setItem(VAULT_KEY, JSON.stringify({ ...value, localFallback: true }))
  }
}

function fallbackMetadata(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KV_FALLBACK_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** Apenas marcadores não sensíveis, como data de ritual concluído ou dica dispensada. */
export async function readLocalMetadata<T>(name: string): Promise<T | undefined> {
  const fallback = fallbackMetadata()
  try {
    await finishPendingClear()
    if (Object.hasOwn(fallback, name)) return fallback[name] as T
    return await transaction<T | undefined>('kv', 'readonly', (s) => s.get(name))
  } catch {
    return fallback[name] as T | undefined
  }
}

export async function writeLocalMetadata<T>(name: string, value: T): Promise<void> {
  try {
    await finishPendingClear()
    await transaction('kv', 'readwrite', (s) => s.put(value, name))
  } catch {
    localStorage.setItem(KV_FALLBACK_KEY, JSON.stringify({ ...fallbackMetadata(), [name]: value }))
    return
  }
  try {
    const fallback = fallbackMetadata()
    delete fallback[name]
    localStorage.setItem(KV_FALLBACK_KEY, JSON.stringify(fallback))
  } catch {
    // A gravação já foi confirmada no IndexedDB.
  }
}

/** Apagar o aparelho também elimina os marcadores locais de rituais e sugestões. */
export async function clearLocalStorage(): Promise<void> {
  // Se o IDB estiver temporariamente indisponível, o marcador impede ressuscitar a cópia antiga.
  let marked = false
  try {
    localStorage.setItem(CLEARED_KEY, '1')
    marked = true
  } catch {
    // Com IndexedDB disponível, a limpeza ainda pode terminar normalmente.
  }
  let clearedDb = false
  try {
    await transaction('vault', 'readwrite', (s) => s.clear())
    await transaction('kv', 'readwrite', (s) => s.clear())
    clearedDb = true
    if (marked) removeLocal(CLEARED_KEY)
  } catch (error) {
    if (!marked) throw error
  }
  try {
    localStorage.removeItem(VAULT_KEY)
    localStorage.removeItem(KV_FALLBACK_KEY)
  } catch (error) {
    if (!clearedDb) throw error
  }
}
