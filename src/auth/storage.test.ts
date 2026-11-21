import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSeed } from '../domain/seed'
import { clearLocalStorage, LOCAL_DB_NAME, readLocalMetadata, readStoredVault, VAULT_KEY, writeLocalMetadata, writeStoredVault } from './storage'
import { createVault, readData, type Vault } from './vault'

let factory: IDBFactory
let vault: Vault
let key: CryptoKey

const password = 'cafe com pao na varanda'

const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value) }),
    removeItem: vi.fn((name: string) => { values.delete(name) }),
  } satisfies Storage
}

const openDatabase = (version = 1) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = factory.open(LOCAL_DB_NAME, version)
  request.onupgradeneeded = () => {
    for (const name of ['vault', 'kv']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
  }
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
})

async function storedValue<T>(store: 'vault' | 'kv', name: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).get(name)
    tx.oncomplete = () => { db.close(); resolve(request.result as T | undefined) }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

beforeAll(async () => {
  const created = await createVault({
    a: { name: 'Lucas', pronoun: 'ele', password },
    b: { name: 'Par', pronoun: 'ela' },
    data: buildSeed(new Date('2026-11-20T12:00:00Z')),
  }, 1_000)
  vault = created.vault
  key = created.key
})

beforeEach(() => {
  factory = new IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('banco local cifrado', () => {
  it('cria ampara-local v1 com vault e kv e guarda somente o cofre cifrado em primary', async () => {
    await writeStoredVault(vault)
    const db = await openDatabase()
    expect(db.name).toBe('ampara-local')
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames]).toEqual(['kv', 'vault'])
    db.close()

    const saved = await storedValue<Vault>('vault', 'primary')
    expect(saved).toEqual(vault)
    const raw = JSON.stringify(saved)
    expect(raw).not.toContain(password)
    expect(raw).not.toContain('Venvanse')
    expect(raw).not.toContain('Supermercado')
    expect((await readData((await readStoredVault())!, key)).profiles.A!.displayName).toBe('Lucas')
    expect(localStorage.getItem(VAULT_KEY)).toBeNull()
  })

  it('migra cofre legado e só remove localStorage após o commit do IndexedDB', async () => {
    const raw = JSON.stringify(vault)
    localStorage.setItem(VAULT_KEY, raw)
    let committed = false
    const originalPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, name?: IDBValidKey) {
      this.transaction.addEventListener('complete', () => { committed = true })
      return originalPut.call(this, value, name)
    })
    const originalRemove = vi.mocked(localStorage.removeItem).getMockImplementation()!
    let removedAfterCommit = false
    const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation((name: string) => {
      if (name === VAULT_KEY) removedAfterCommit = committed
      originalRemove(name)
    })

    expect(await readStoredVault()).toEqual(vault)
    expect(await storedValue('vault', 'primary')).toEqual(vault)
    expect(remove).toHaveBeenCalledWith(VAULT_KEY)
    expect(removedAfterCommit).toBe(true)
    expect(localStorage.getItem(VAULT_KEY)).toBeNull()
  })

  it('preserva o legado se a transação abortar após o put ter sucesso e migra na próxima tentativa', async () => {
    const raw = JSON.stringify(vault)
    localStorage.setItem(VAULT_KEY, raw)
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, name?: IDBValidKey) {
      const request = originalPut.call(this, value, name)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })

    expect(await readStoredVault()).toEqual(vault)
    expect(localStorage.getItem(VAULT_KEY)).toBe(raw)
    expect(await storedValue('vault', 'primary')).toBeUndefined()
    put.mockRestore()
    expect(await readStoredVault()).toEqual(vault)
    expect(localStorage.getItem(VAULT_KEY)).toBeNull()
  })

  it.each(['texto inválido', JSON.stringify({ v: 1, people: {}, data: {} })])('preserva e ignora legado inválido: %s', async (raw) => {
    localStorage.setItem(VAULT_KEY, raw)
    expect(await readStoredVault()).toBeNull()
    expect(await storedValue('vault', 'primary')).toBeUndefined()
    expect(localStorage.getItem(VAULT_KEY)).toBe(raw)
  })

  it('prefere primary existente ao legado sem marca de fallback, independentemente da revisão', async () => {
    await writeStoredVault(vault)
    localStorage.setItem(VAULT_KEY, JSON.stringify({ ...vault, rev: vault.rev + 30 }))
    expect(await readStoredVault()).toEqual(vault)
    expect(await storedValue('vault', 'primary')).toEqual(vault)
  })

  it('faz leitura e gravação cifrada em localStorage quando IndexedDB está ausente', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await readStoredVault()).toBeNull()
    await writeStoredVault(vault)
    expect(await readStoredVault()).toEqual(vault)
    expect(localStorage.getItem(VAULT_KEY)).not.toContain('Supermercado')
    expect((await readData((await readStoredVault())!, key)).profiles.A!.displayName).toBe('Lucas')
  })

  it('continua pelo fallback quando open falha de forma assíncrona', async () => {
    const newerDatabase = await openDatabase(2)
    newerDatabase.close()
    await writeStoredVault(vault)
    expect(localStorage.getItem(VAULT_KEY)).toBeTruthy()
    expect(await readStoredVault()).toEqual(vault)
  })

  it.each([1, 20])('fallback de escrita prevalece sobre IDB antigo, inclusive backup de revisão %i', async (revision) => {
    const previous = { ...vault, rev: 10 }
    const restored = { ...vault, rev: revision, createdAt: '2026-01-01T12:00:00Z' }
    await writeStoredVault(previous)
    const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Sem espaço', 'QuotaExceededError') })
    await writeStoredVault(restored)
    expect(await storedValue('vault', 'primary')).toEqual(previous)
    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!)).toMatchObject({ localFallback: true, rev: revision })
    failure.mockRestore()

    expect(await readStoredVault()).toEqual(restored)
    expect(await storedValue('vault', 'primary')).toEqual(restored)
    expect(localStorage.getItem(VAULT_KEY)).toBeNull()
  })

  it('recusa cofre inválido sem substituir os dados existentes', async () => {
    await writeStoredVault(vault)
    await expect(writeStoredVault({ v: 1 } as Vault)).rejects.toThrow('Cofre inválido')
    expect(await readStoredVault()).toEqual(vault)
  })

  it('rejeita a gravação quando ambos os armazenamentos falham', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Bloqueado', 'SecurityError') })
    await expect(writeStoredVault(vault)).rejects.toThrow('Bloqueado')
  })

  it('funciona somente com IndexedDB quando localStorage está bloqueado', async () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(localStorage, method).mockImplementation(() => { throw new DOMException('Bloqueado', 'SecurityError') })
    }
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito')
    expect(await readStoredVault()).toEqual(vault)
    expect(await readLocalMetadata('ritual:morning')).toBe('feito')
    await clearLocalStorage()
    expect(await storedValue('vault', 'primary')).toBeUndefined()
    expect(await storedValue('kv', 'ritual:morning')).toBeUndefined()
  })
})

describe('metadados locais não sensíveis e limpeza do aparelho', () => {
  it('guarda marcadores estruturados em kv sem misturá-los ao cofre', async () => {
    const marker = { date: '2026-11-20', dismissed: true }
    expect(await readLocalMetadata('ritual:morning')).toBeUndefined()
    await writeLocalMetadata('ritual:morning', marker)
    expect(await readLocalMetadata('ritual:morning')).toEqual(marker)
    expect(await storedValue('kv', 'ritual:morning')).toEqual(marker)
    expect(await storedValue('vault', 'primary')).toBeUndefined()
  })

  it('preserva o marcador mais novo no fallback e volta ao IDB ao gravar com o banco recuperado', async () => {
    await writeLocalMetadata('ritual:morning', 'ontem')
    vi.stubGlobal('indexedDB', undefined)
    await writeLocalMetadata('ritual:morning', 'hoje')
    await writeLocalMetadata('suggestion:dismissed', ['uma-dica'])
    expect(await readLocalMetadata('ritual:morning')).toBe('hoje')
    vi.stubGlobal('indexedDB', factory)
    expect(await readLocalMetadata('ritual:morning')).toBe('hoje')
    await writeLocalMetadata('ritual:morning', 'amanhã')
    expect(await readLocalMetadata('ritual:morning')).toBe('amanhã')
    expect(await storedValue('kv', 'ritual:morning')).toBe('amanhã')
    expect(await readLocalMetadata('suggestion:dismissed')).toEqual(['uma-dica'])
  })

  it('apaga cofre e marcadores tanto do IDB quanto do fallback', async () => {
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito')
    vi.stubGlobal('indexedDB', undefined)
    await writeStoredVault({ ...vault, rev: vault.rev + 1 })
    await writeLocalMetadata('suggestion:dismissed', 'feito')
    vi.stubGlobal('indexedDB', factory)

    await clearLocalStorage()
    expect(await readStoredVault()).toBeNull()
    expect(await readLocalMetadata('ritual:morning')).toBeUndefined()
    expect(await readLocalMetadata('suggestion:dismissed')).toBeUndefined()
    expect(await storedValue('vault', 'primary')).toBeUndefined()
    expect(localStorage.length).toBe(0)
  })

  it('não ressuscita o cofre se o banco só ficar disponível depois da limpeza', async () => {
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito')
    vi.stubGlobal('indexedDB', undefined)
    await clearLocalStorage()
    expect(await readStoredVault()).toBeNull()
    vi.stubGlobal('indexedDB', factory)

    expect(await readStoredVault()).toBeNull()
    expect(await storedValue('vault', 'primary')).toBeUndefined()
    expect(await readLocalMetadata('ritual:morning')).toBeUndefined()
  })

  it('não ressuscita marcadores se a primeira leitura após a limpeza for diretamente em kv', async () => {
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito')
    vi.stubGlobal('indexedDB', undefined)
    await clearLocalStorage()
    vi.stubGlobal('indexedDB', factory)

    expect(await readLocalMetadata('ritual:morning')).toBeUndefined()
    expect(await readStoredVault()).toBeNull()
  })

  it('não mantém marcadores do espaço apagado ao gravar novo cofre antes da próxima leitura', async () => {
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito')
    vi.stubGlobal('indexedDB', undefined)
    await clearLocalStorage()
    vi.stubGlobal('indexedDB', factory)

    const replacement = { ...vault, rev: vault.rev + 1 }
    await writeStoredVault(replacement)
    expect(await readStoredVault()).toEqual(replacement)
    expect(await readLocalMetadata('ritual:morning')).toBeUndefined()
  })

  it('preserva cofre e marcadores novos no fallback durante uma limpeza pendente do IDB antigo', async () => {
    await writeStoredVault(vault)
    await writeLocalMetadata('ritual:morning', 'feito no espaço anterior')
    await writeLocalMetadata('ritual:night', 'antigo')
    vi.stubGlobal('indexedDB', undefined)
    await clearLocalStorage()

    const replacement = { ...vault, rev: vault.rev + 1 }
    await writeStoredVault(replacement)
    await writeLocalMetadata('ritual:morning', 'feito no espaço novo')
    expect(await readStoredVault()).toEqual(replacement)
    expect(await readLocalMetadata('ritual:morning')).toBe('feito no espaço novo')
    vi.stubGlobal('indexedDB', factory)

    expect(await readStoredVault()).toEqual(replacement)
    expect(await storedValue('vault', 'primary')).toEqual(replacement)
    expect(await readLocalMetadata('ritual:morning')).toBe('feito no espaço novo')
    expect(await readLocalMetadata('ritual:night')).toBeUndefined()
  })
})
