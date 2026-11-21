import { buildEmpty, buildSeed, defaultEnabledModules, normalizeState, withIdentity } from '../domain/seed'
import { COLLECTIONS, type Collections, type DataState, type PartnerId, type Pronoun, type SpaceMode, type SplitMode } from '../domain/types'
import { createStore, useStore } from '../store/createStore'
import { dataStore, LEGACY_PLAINTEXT_KEY, transact } from '../store/data'
import { ui, uiStore } from '../store/ui'
import { applySpaceMode } from '../domain/space'
import {
  AuthError,
  backupFileName,
  parseBackup,
  toBackup,
  changePassword as rewrap,
  claimInvite,
  createSingleVault,
  createVault,
  openCloud,
  sealCloud,
  lockoutMs,
  readData,
  reinvite,
  unlockVault,
  writeData,
  type Vault,
} from './vault'
import { clearLocalStorage, readStoredVault as loadVault, VAULT_KEY, writeStoredVault } from './storage'
export { VAULT_KEY } from './storage'

/**
 * Sessão de acesso. Regras (ver SECURITY.md):
 * - Nada do casal é lido antes do login; a chave fica só em memória (não extraível).
 * - "Lembrar neste aparelho" guarda a chave não extraível no IndexedDB por 14 dias.
 * - Sair, bloquear, trocar de pessoa ou trocar a senha invalida a sessão lembrada e avisa as outras abas.
 * - Sem "lembrar": bloqueio automático após 15 min sem interação.
 */

const ATTEMPTS_KEY = 'ampara:auth:attempts'
const REMEMBER_MS = 14 * 24 * 3600_000
const IDLE_MS = 15 * 60_000
const AUTH_EVENT_KEY = 'ampara:auth:event'

export interface PersonHeader {
  name: string
  pronoun: Pronoun
  status: 'active' | 'invited' | 'absent'
  /** a pessoa conectou a conta da nuvem neste aparelho */
  cloud: boolean
}

export type AuthStatus = 'loading' | 'setup' | 'welcome' | 'locked' | 'unlocked'

export interface AuthState {
  status: AuthStatus
  people: Record<PartnerId, PersonHeader> | null
  who: PartnerId | null
  /** pessoa pré-selecionada na tela de entrada (ex.: ao trocar de perspectiva) */
  preselect: PartnerId | null
  /** código exibido uma única vez logo após criar o espaço */
  welcomeInvite: string | null
  remembered: boolean
  hasLegacyData: boolean
}

export const authStore = createStore<AuthState>({
  status: 'loading',
  people: null,
  who: null,
  preselect: null,
  welcomeInvite: null,
  remembered: false,
  hasLegacyData: false,
})
export const useAuth = <S>(sel: (s: AuthState) => S) => useStore(authStore, sel)

export type LocalSaveStatus = 'saved' | 'saving' | 'error'
export const localSaveStore = createStore<LocalSaveStatus>('saved')
export const useLocalSaveStatus = () => useStore(localSaveStore, (s) => s)
let pendingSaves = 0
let saveFailed = false

let key: CryptoKey | null = null
let vault: Vault | null = null
let applyingRemote = false
let writeChain: Promise<void> = Promise.resolve()
let lastActivity = Date.now()

/* ---------- armazenamento ---------- */

function queueWrite<T>(run: () => Promise<T>): Promise<T> {
  const pending = writeChain.then(() => navigator.locks
    ? navigator.locks.request('ampara-vault-write', run)
    : run())
  writeChain = pending.then(() => undefined, () => undefined)
  return pending
}

function persistSnapshot(snapshot: DataState, k: CryptoKey) {
  const basedOnMode = vault?.spaceMode ?? 'COUPLE'
  pendingSaves++
  localSaveStore.set(() => 'saving')
  void queueWrite(async () => {
    const base = await loadVault() ?? vault
    if (!base || key !== k) return
    let persisted: DataState
    // Outra aba pode ter rotacionado a chave durante uma conversão para Solo.
    try {
      persisted = await readData(base, k)
    } catch {
      vault = base
      await forgetSession()
      if (key === k) closeSession(null)
      return
    }
    const who = authStore.get().who
    const currentCouple = persisted.couple.couple
    if (!who || base.people[who].status !== 'active' || (currentCouple?.mode === 'SOLO' && (currentCouple.soloOwnerId ?? 'A') !== who)) {
      vault = base
      await forgetSession()
      if (key === k) closeSession(null)
      return
    }
    // Receber Solo em outro aparelho não pede senha: a DEK pode continuar a mesma. Uma aba antiga
    // não pode restaurar o modo Casal nem apagar o arquivo que o pull já preservou no cofre.
    let safe = snapshot
    if (currentCouple && (currentCouple.mode ?? 'COUPLE') !== basedOnMode) {
      safe = applySpaceMode(snapshot, currentCouple)
    }
    const archives = [...(persisted.coupleArchives ?? []), ...(safe.coupleArchives ?? [])]
    if (archives.length) safe = { ...safe, coupleArchives: archives.filter((entry, i) => archives.findIndex((candidate) => candidate.ownerId === entry.ownerId && candidate.savedAt === entry.savedAt) === i) }
    const next = await writeData(base, k, safe)
    if (key !== k) return
    await saveVault(next)
    if (safe !== snapshot) {
      applyingRemote = true
      dataStore.set((cur) => {
        if (cur === snapshot) return safe
        const rebased = currentCouple && (currentCouple.mode ?? 'COUPLE') !== basedOnMode ? applySpaceMode(cur, currentCouple) : cur
        const all = [...(safe.coupleArchives ?? []), ...(rebased.coupleArchives ?? [])]
        return all.length ? { ...rebased, coupleArchives: all.filter((entry, i) => all.findIndex((candidate) => candidate.ownerId === entry.ownerId && candidate.savedAt === entry.savedAt) === i) } : rebased
      })
      applyingRemote = false
    }
    authStore.set((s) => ({ ...s, people: headerOf(next) }))
  }).then(() => {
    saveFailed = false
  }).catch(() => {
    saveFailed = true
    ui.toast('Não foi possível salvar no aparelho. Libere espaço e tente de novo.', { tone: 'warn' })
  }).finally(() => {
    pendingSaves--
    localSaveStore.set(() => pendingSaves > 0 ? 'saving' : saveFailed ? 'error' : 'saved')
  })
}

/** Reenvia o estado atual ao cofre quando o navegador volta a ter espaço. */
export function retryLocalSave() {
  if (key) persistSnapshot(dataStore.get(), key)
}

async function saveVault(v: Vault) {
  await writeStoredVault(v)
  vault = { ...v, spaceMode: v.spaceMode ?? vault?.spaceMode }
  broadcast('updated')
}

function removeLocal(name: string) {
  try {
    localStorage.removeItem(name)
  } catch {
    // O cofre usa IndexedDB; preferências indisponíveis não impedem o login.
  }
}

const headerOf = (v: Vault): Record<PartnerId, PersonHeader> => ({
  A: { name: v.people.A.name, pronoun: v.people.A.pronoun, status: v.people.A.status, cloud: !!v.people.A.cloud },
  B: { name: v.people.B.name, pronoun: v.people.B.pronoun, status: v.people.B.status, cloud: !!v.people.B.cloud },
})

function legacyData(): DataState | null {
  try {
    const raw = localStorage.getItem(LEGACY_PLAINTEXT_KEY)
    const parsed = raw ? (JSON.parse(raw) as DataState) : null
    return parsed?.schemaVersion === 1 ? normalizeState(parsed) : null
  } catch {
    return null
  }
}

/* ---------- sessão lembrada (IndexedDB guarda CryptoKey sem expor os bytes) ---------- */

interface RememberedSession {
  who: PartnerId
  key: CryptoKey
  expiresAt: number
}

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open('ampara-auth', 1)
    } catch {
      resolve(undefined)
      return
    }
    let blocked = false
    req.onupgradeneeded = () => req.result.createObjectStore('sessions')
    req.onerror = () => resolve(undefined)
    req.onblocked = () => {
      blocked = true
      resolve(undefined)
    }
    req.onsuccess = () => {
      const db = req.result
      if (blocked) return db.close()
      try {
        const tx = db.transaction('sessions', mode)
        const r = fn(tx.objectStore('sessions'))
        tx.oncomplete = () => {
          db.close()
          resolve(r ? (r.result as T) : undefined)
        }
        tx.onabort = tx.onerror = () => {
          db.close()
          resolve(undefined)
        }
      } catch {
        db.close()
        resolve(undefined)
      }
    }
  })
}

const rememberSession = (s: RememberedSession) => idb('readwrite', (st) => st.put(s, 'current'))
const forgetSession = () => idb('readwrite', (st) => st.delete('current'))
const loadRemembered = () => idb<RememberedSession>('readonly', (st) => st.get('current'))

/* ---------- abas: bloqueio e dados novos chegam a todas ---------- */

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ampara-auth') : null

function broadcast(type: 'lock' | 'wipe' | 'updated') {
  channel?.postMessage({ type })
  try {
    localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type, nonce: crypto.randomUUID() }))
  } catch {
    // BroadcastChannel continua disponível quando o localStorage está bloqueado.
  }
}

/* ---------- avisos de sessão (a nuvem escuta para conectar/desconectar) ---------- */

const listeners = new Set<() => void>()
export const onSessionChange = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = () => listeners.forEach((fn) => fn())

/** Esta pessoa é a única com acesso neste aparelho (o par usa o próprio celular)? */
export const isSingleDevice = () => {
  const s = authStore.get()
  return !!s.who && s.people?.[s.who === 'A' ? 'B' : 'A'].status === 'absent'
}

/* ---------- segredo da nuvem da pessoa conectada (cifrado com a chave de dados) ---------- */

export async function readCloudSecret(): Promise<string | null> {
  const who = authStore.get().who
  await writeChain
  const v = await loadVault() ?? vault
  const k = key
  if (!who || !v || !k) return null
  try {
    const secret = await openCloud(v, k, who)
    return key === k && authStore.get().who === who ? secret : null
  } catch {
    return null
  }
}

export async function writeCloudSecret(secret: string | null): Promise<void> {
  const who = authStore.get().who
  const k = key
  if (!who || !k) return
  await queueWrite(async () => {
    const v = await loadVault() ?? vault
    if (!v || key !== k) return
    const next = await sealCloud(v, k, who, secret)
    await saveVault({ ...next, rev: v.rev + 1 })
    authStore.set((s) => ({ ...s, people: headerOf(next) }))
  })
}

/** Aparelho novo entrando pela nuvem: cria o cofre só com esta pessoa e a mesma senha da conta */
export async function setupFromCloud(input: { who: PartnerId; password: string; data: DataState; remember: boolean; cloudSecret: string }) {
  const A = input.data.profiles.A!
  const B = input.data.profiles.B!
  const people = { A: { name: A.displayName, pronoun: A.pronoun }, B: { name: B.displayName, pronoun: B.pronoun } }
  const created = await createSingleVault(input.who, people, input.password, input.data)
  const v = await sealCloud(created.vault, created.key, input.who, input.cloudSecret)
  await saveVault(v)
  removeLocal(LEGACY_PLAINTEXT_KEY)
  await openSession(input.who, created.key, v, input.remember)
}

/* ---------- abrir / fechar sessão ---------- */

async function openSession(who: PartnerId, k: CryptoKey, v: Vault, remember: boolean, welcomeInvite: string | null = null) {
  const data = await readData(v, k)
  if (v.people[who].status !== 'active' || (data.couple.couple?.mode === 'SOLO' && (data.couple.couple.soloOwnerId ?? 'A') !== who)) {
    throw new AuthError('NOT_ACTIVATED', 'Este acesso está suspenso neste espaço.')
  }
  key = k
  vault = { ...v, spaceMode: data.couple.couple?.mode ?? 'COUPLE' }
  applyingRemote = true
  dataStore.set(() => data)
  applyingRemote = false
  ui.setViewer(who)
  lastActivity = Date.now()
  const remembered = remember ? !!await rememberSession({ who, key: k, expiresAt: Date.now() + REMEMBER_MS }) : false
  if (!remember) await forgetSession()
  if (key !== k) {
    await forgetSession()
    return
  }
  saveFailed = false
  localSaveStore.set(() => pendingSaves > 0 ? 'saving' : 'saved')
  authStore.set((s) => ({ ...s, status: welcomeInvite ? 'welcome' : 'unlocked', welcomeInvite, who, preselect: null, people: headerOf(v), remembered }))
  // Pede persistência sem tornar o desbloqueio dependente dessa permissão.
  try {
    void navigator.storage?.persist?.().catch(() => false)
  } catch {
    // API ausente ou navegador privado: o cofre continua utilizável.
  }
  emit()
}

function closeSession(preselect: PartnerId | null) {
  key = null
  saveFailed = false
  localSaveStore.set(() => 'saved')
  dataStore.set(() => buildEmpty(new Date()))
  ui.closeSheet()
  uiStore.set((s) => ({ ...s, toasts: [] }))
  const v = vault
  authStore.set((s) => ({
    ...s,
    status: v ? 'locked' : 'setup',
    who: null,
    preselect,
    welcomeInvite: null,
    remembered: false,
    people: v ? headerOf(v) : null,
  }))
  emit()
}

/** Bloqueia este aparelho (todas as abas) e esquece a sessão lembrada */
export async function lock(preselect: PartnerId | null = null) {
  await writeChain
  await forgetSession()
  closeSession(preselect)
  broadcast('lock')
}

/** Trocar a perspectiva exige a senha da outra pessoa */
export const switchPerson = (target: PartnerId) => lock(target)

/* ---------- tentativas e atraso progressivo ---------- */

type Attempts = Partial<Record<PartnerId, { failures: number; until: number }>>
let memoryAttempts: Attempts = {}
const readAttempts = (): Attempts => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? 'null')
    return value && typeof value === 'object' ? value as Attempts : memoryAttempts
  } catch {
    return memoryAttempts
  }
}

function saveAttempts(value: Attempts) {
  memoryAttempts = value
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(value))
  } catch {
    // Mantém o limite desta sessão mesmo se o localStorage estiver indisponível.
  }
}

export function lockedUntil(who: PartnerId): number {
  return readAttempts()[who]?.until ?? 0
}

function registerFailure(who: PartnerId) {
  const a = readAttempts()
  const failures = (a[who]?.failures ?? 0) + 1
  a[who] = { failures, until: Date.now() + lockoutMs(failures) }
  saveAttempts(a)
}

function clearFailures(who: PartnerId) {
  const a = readAttempts()
  delete a[who]
  saveAttempts(a)
}

function assertNotThrottled(who: PartnerId) {
  const until = lockedUntil(who)
  if (until > Date.now()) {
    const s = Math.ceil((until - Date.now()) / 1000)
    throw new AuthError('BAD_CREDENTIALS', `Muitas tentativas. Aguarde ${s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`} e tente de novo.`)
  }
}

/* ---------- API pública ---------- */

export interface SetupInput {
  mode?: SpaceMode
  cycle?: boolean
  a: { name: string; pronoun: Pronoun; password: string }
  b?: { name: string; pronoun: Pronoun }
  splitMode?: SplitMode
  shareA?: boolean
  demo?: boolean
  remember: boolean
}

/** Cria um espaço pessoal ou do casal. Só o casal tem código de convite. */
export async function setup(input: SetupInput): Promise<void> {
  const now = new Date()
  const mode = input.mode ?? 'COUPLE'
  const partner = input.b ?? { name: '', pronoun: 'ela' as const }
  if (mode === 'COUPLE' && !partner.name.trim()) throw new Error('Diga o nome de quem vai compartilhar este espaço.')
  const legacy = legacyData()
  if (legacy && mode === 'SOLO') throw new Error('Seus dados antigos são de casal. Proteja-os criando o espaço para um casal.')
  const base = legacy ?? (mode === 'COUPLE' && input.demo ? buildSeed(now) : buildEmpty(now, mode))
  let draft = withIdentity(base, { mode, a: input.a, b: partner, inviteCode: '', splitMode: input.splitMode, shareA: input.shareA, shareB: false })
  if (mode === 'SOLO') {
    draft = { ...draft, profiles: { ...draft.profiles, A: { ...draft.profiles.A!, sharePersonalFinances: false, enabledModules: { ...defaultEnabledModules('SOLO'), cycle: input.cycle ?? false } } } }
    const people = { A: { name: input.a.name, pronoun: input.a.pronoun }, B: partner }
    const created = await createSingleVault('A', people, input.a.password, draft)
    await saveVault(created.vault)
    removeLocal(LEGACY_PLAINTEXT_KEY)
    authStore.set((s) => ({ ...s, hasLegacyData: false }))
    await openSession('A', created.key, created.vault, input.remember)
    return
  }
  const created = await createVault({ a: input.a, b: partner, data: draft })
  const finalData = withIdentity(draft, { a: input.a, b: partner, inviteCode: created.invite })
  const v = await writeData(created.vault, created.key, finalData)
  await saveVault(v)
  removeLocal(LEGACY_PLAINTEXT_KEY)
  authStore.set((s) => ({ ...s, hasLegacyData: false }))
  await openSession('A', created.key, v, input.remember, created.invite)
}

export const enterApp = () => authStore.set((s) => ({ ...s, status: 'unlocked', welcomeInvite: null }))

export async function login(who: PartnerId, password: string, remember: boolean) {
  await writeChain
  const v = await loadVault()
  if (!v) throw new AuthError('BAD_CREDENTIALS', 'Nenhum espaço encontrado neste aparelho.')
  assertNotThrottled(who)
  try {
    const k = await unlockVault(v, who, password)
    clearFailures(who)
    await openSession(who, k, v, remember)
  } catch (e) {
    if (e instanceof AuthError && e.code === 'BAD_CREDENTIALS') registerFailure(who)
    throw e
  }
}

export async function activate(who: PartnerId, code: string, password: string, remember: boolean) {
  await writeChain
  const v = await loadVault()
  if (!v) throw new AuthError('BAD_CREDENTIALS', 'Nenhum espaço encontrado neste aparelho.')
  assertNotThrottled(who)
  try {
    const r = await claimInvite(v, who, code, password)
    await saveVault({ ...r.vault, rev: v.rev + 1 })
    clearFailures(who)
    await openSession(who, r.key, r.vault, remember)
  } catch (e) {
    if (e instanceof AuthError && e.code === 'BAD_CREDENTIALS') registerFailure(who)
    throw e
  }
}

export async function changeMyPassword(current: string, next: string) {
  const who = authStore.get().who
  await queueWrite(async () => {
    const v = await loadVault()
    if (!who || !v || who !== authStore.get().who || !key) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    const k = key
    const updated = await rewrap(v, who, current, next)
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    await saveVault({ ...updated, rev: v.rev + 1 })
  })
  // sessões lembradas e outras abas precisam entrar de novo
  await forgetSession()
  broadcast('lock')
  authStore.set((s) => ({ ...s, remembered: false }))
}

/** Apaga o espaço deste aparelho. Exige a senha de novo (confirmação forte). */
/**
 * Tira do Cache Storage qualquer resposta da API (o service worker antigo guardava, em texto claro).
 * O app (HTML, JS, ícones) fica, para continuar abrindo offline.
 */
async function purgeApiCache() {
  if (typeof caches === 'undefined') return
  try {
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) {
        const path = new URL(req.url).pathname
        if (path.startsWith('/rest/') || path.startsWith('/auth/')) await c.delete(req)
      }
    }
  } catch {
    // sem Cache Storage (modo privado): nada a limpar
  }
}

export async function wipeDevice(password: string) {
  const who = authStore.get().who
  const k = key
  await writeChain
  const v = await loadVault()
  if (!who || !v || !k) return
  await unlockVault(v, who, password)
  await queueWrite(async () => {
    if (key !== k || authStore.get().who !== who) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    await clearLocalStorage()
    removeLocal(ATTEMPTS_KEY)
    removeLocal('ampara:prefs')
    memoryAttempts = {}
    vault = null
    closeSession(null)
    broadcast('wipe')
  })
  await purgeApiCache()
  await forgetSession()
}

/** IndexedDB não emite storage: o aviso entre abas só leva o tipo, nunca os dados. */
async function refreshVault() {
  const k = key
  await writeChain
  const v = await loadVault()
  if (key !== k) return
  if (!v) {
    vault = null
    closeSession(null)
    return
  }
  if (!k) {
    vault = v
    authStore.set((s) => ({ ...s, status: 'locked', people: headerOf(v) }))
    return
  }
  if (JSON.stringify(v) === JSON.stringify(vault)) return
  const snapshot = dataStore.get()
  try {
    const data = await readData(v, k)
    if (key !== k) return
    const who = authStore.get().who
    if (who && (v.people[who].status !== 'active' || (data.couple.couple?.mode === 'SOLO' && (data.couple.couple.soloOwnerId ?? 'A') !== who))) {
      vault = v
      await forgetSession()
      closeSession(null)
      return
    }
    vault = { ...v, spaceMode: data.couple.couple?.mode ?? 'COUPLE' }
    applyingRemote = true
    // Uma edição feita enquanto o cofre era aberto continua na fila da sessão.
    dataStore.set((cur) => cur === snapshot ? data : cur)
    applyingRemote = false
    authStore.set((s) => ({ ...s, people: headerOf(v) }))
  } catch {
    if (key === k) {
      vault = v
      await forgetSession()
      closeSession(null)
    }
  }
}

/* ---------- inicialização ---------- */

let started = false
export async function startAuth() {
  if (started) return
  started = true

  // gravação cifrada a cada mudança enquanto a sessão está aberta (em fila, na ordem)
  dataStore.subscribe(() => {
    if (!key || applyingRemote) return
    persistSnapshot(dataStore.get(), key)
  })

  channel?.addEventListener('message', (e: MessageEvent<{ type: string }>) => {
    if (e.data?.type === 'lock' || e.data?.type === 'wipe') {
      if (e.data.type === 'wipe') vault = null
      closeSession(null)
    }
    if (e.data?.type === 'updated') void refreshVault()
  })

  // outra aba gravou: traz os dados novos em vez de sobrescrever com uma cópia velha
  window.addEventListener('storage', (e) => {
    if (e.key === VAULT_KEY) void refreshVault()
    if (e.key !== AUTH_EVENT_KEY || !e.newValue) return
    try {
      const event = JSON.parse(e.newValue) as { type?: string }
      if (event.type === 'wipe' || event.type === 'lock') {
        if (event.type === 'wipe') vault = null
        closeSession(null)
      }
      if (event.type === 'updated') void refreshVault()
    } catch {
      // Ignora eventos que não vieram de uma sessão do Ampara.
    }
  })

  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true })
  }
  setInterval(() => {
    const s = authStore.get()
    if (s.status === 'unlocked' && !s.remembered && Date.now() - lastActivity > IDLE_MS) void lock(s.who)
  }, 30_000)

  const v = await loadVault()
  if (!v) {
    authStore.set((s) => ({ ...s, status: 'setup', hasLegacyData: !!legacyData() }))
    return
  }
  vault = v
  const remembered = await loadRemembered()
  if (remembered && remembered.expiresAt > Date.now()) {
    try {
      await openSession(remembered.who, remembered.key, v, true)
      return
    } catch {
      await forgetSession()
    }
  } else if (remembered) {
    await forgetSession()
  }
  authStore.set((s) => ({ ...s, status: 'locked', people: headerOf(v) }))
}

/** Gera novo convite para o par (recuperação de senha esquecida). Exige a senha de quem está usando. */
export async function reinvitePartner(password: string): Promise<string> {
  const who = authStore.get().who
  const k = key
  const invite = await queueWrite(async () => {
    const v = await loadVault()
    if (!who || !v || !k || key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    if (dataStore.get().couple.couple?.mode === 'SOLO') throw new Error('Para convidar alguém, use Convidar alguém para este espaço.')
    const target: PartnerId = who === 'A' ? 'B' : 'A'
    const r = await reinvite(v, who, password, target)
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    const cur = dataStore.get()
    const couple = cur.couple.couple
    if (!couple) throw new Error('Espaço não encontrado.')
    const nextCouple = { ...couple, inviteCode: r.invite, updatedAt: new Date().toISOString() }
    const updated = await writeData(r.vault, k, { ...cur, couple: { couple: nextCouple } })
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    await saveVault(updated)
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    transact((tx) => {
      const current = tx.get('couple', 'couple')
      if (current) tx.put('couple', { ...current, inviteCode: r.invite, updatedAt: nextCouple.updatedAt })
    })
    authStore.set((s) => ({ ...s, people: headerOf(vault!) }))
    return r.invite
  })
  await writeChain
  return invite
}

/** Promove o mesmo espaço, preservando coleções, preferências e a identidade de quem usa Solo. */
export async function upgradeSoloToCouple(password: string, partner: { name: string; pronoun: Pronoun }): Promise<string> {
  if (!partner.name.trim()) throw new Error('Diga o nome de quem você quer convidar.')
  const k = key
  const who = authStore.get().who
  const target: PartnerId = who === 'A' ? 'B' : 'A'
  const invite = await queueWrite(async () => {
    const v = await loadVault()
    if (!k || !who || key !== k || authStore.get().who !== who || !v) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    const persisted = await readData(v, k).catch(() => { throw new Error('O espaço mudou em outra aba. Recarregue o app antes de continuar.') })
    if (v.rev !== vault?.rev || persisted.couple.couple?.mode !== 'SOLO') throw new Error('O espaço mudou em outra aba. Recarregue o app antes de continuar.')
    if (dataStore.get().couple.couple?.mode !== 'SOLO') throw new Error('Este espaço já é de um casal.')
    if ((dataStore.get().couple.couple?.soloOwnerId ?? 'A') !== who) throw new AuthError('BAD_CREDENTIALS', 'Este espaço pertence à outra pessoa.')
    const previous = dataStore.get().profiles[target]
    if (previous?.displayName && (previous.displayName !== partner.name.trim() || previous.pronoun !== partner.pronoun)) {
      throw new Error('Para preservar as autorias, retome este espaço com o mesmo par.')
    }
    const r = await reinvite(v, who, password, target)
    if (key !== k || dataStore.get().couple.couple?.mode !== 'SOLO') throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    const now = new Date().toISOString()
    const cur = dataStore.get()
    const couple = { ...cur.couple.couple!, mode: 'COUPLE' as const, soloOwnerId: null, inviteCode: r.invite, updatedAt: now }
    const profile = { ...cur.profiles[target]!, displayName: partner.name.trim(), pronoun: partner.pronoun, enabledModules: previous?.displayName ? previous.enabledModules : defaultEnabledModules('COUPLE'), updatedAt: now }
    const updated = await writeData(r.vault, k, { ...cur, couple: { couple }, profiles: { ...cur.profiles, [target]: profile } })
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    await saveVault(updated)
    if (key !== k) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    transact((tx) => {
      const currentCouple = tx.get('couple', 'couple')!
      const currentProfile = tx.get('profiles', target)!
      tx.put('couple', { ...currentCouple, mode: 'COUPLE', soloOwnerId: null, inviteCode: r.invite, updatedAt: now })
      tx.put('profiles', { ...currentProfile, displayName: profile.displayName, pronoun: profile.pronoun, enabledModules: profile.enabledModules, updatedAt: now })
    })
    authStore.set((s) => ({ ...s, people: headerOf(vault!) }))
    return r.invite
  })
  await writeChain
  return invite
}

export interface EncryptedBackup {
  name: string
  content: string
}

export interface SoloConversionReceipt {
  solo_owner_id: PartnerId
  updated_at: string
}

/** A nuvem confirma antes de trocar o cofre; sem servidor, toda a conversão é local. */
export async function convertCoupleToSolo(
  password: string,
  saveBackup: (backup: EncryptedBackup) => void | Promise<void>,
  commitRemote?: () => Promise<SoloConversionReceipt>,
): Promise<void> {
  const k = key
  const who = authStore.get().who
  const assertSession = () => {
    if (!k || !who || key !== k || authStore.get().who !== who) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
  }
  await queueWrite(async () => {
    assertSession()
    const v = await loadVault()
    if (!v || !k || !who) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
    const persisted = await readData(v, k).catch(() => { throw new Error('O espaço mudou em outra aba. Recarregue o app antes de continuar.') })
    if (v.rev !== vault?.rev) throw new Error('O espaço mudou em outra aba. Recarregue o app antes de continuar.')
    if (persisted.couple.couple?.mode === 'SOLO' && (!commitRemote || (persisted.couple.couple.soloOwnerId ?? 'A') !== who)) throw new Error('Este espaço já está em Solo.')
    const couple = dataStore.get().couple.couple
    if (!couple || (couple.mode === 'SOLO' && (!commitRemote || (couple.soloOwnerId ?? 'A') !== who))) throw new Error('Este espaço já está em Solo.')
    const resuming = couple.mode === 'SOLO'
    if (couple.spaceId && !commitRemote) throw new Error('Reconecte a nuvem para mudar este espaço em todos os aparelhos.')
    assertNotThrottled(who)
    try {
      await unlockVault(v, who, password)
      clearFailures(who)
    } catch (error) {
      registerFailure(who)
      throw error
    }
    assertSession()
    const original = await writeData(v, k, dataStore.get())
    const now = new Date()
    await saveBackup({ name: `ampara-antes-do-solo-${toDateKeyLocal(now)}.ampara`, content: toBackup(original, who, now.toISOString()) })
    assertSession()
    // Prepara a nova chave antes de suspender o acesso remoto do par.
    const people = { A: v.people.A, B: v.people.B }
    const created = await createSingleVault(who, people, password, dataStore.get(), v.people[who].iterations)
    const cloud = await openCloud(v, k, who)
    const prepared = await sealCloud(created.vault, created.key, who, cloud)
    assertSession()
    const receipt = commitRemote ? await commitRemote() : { solo_owner_id: who, updated_at: now.toISOString() }
    assertSession()
    if (receipt.solo_owner_id !== who) throw new Error('A nuvem não confirmou a pessoa dona deste espaço.')
    const archive = { ownerId: who, savedAt: receipt.updated_at, collections: Object.fromEntries(COLLECTIONS.map((c) => [c, dataStore.get()[c]])) as unknown as Collections }
    const converted = (cur: DataState): DataState => {
      const nextCouple = { ...cur.couple.couple!, mode: 'SOLO' as const, soloOwnerId: who, inviteCode: '', updatedAt: receipt.updated_at }
      return {
        ...cur,
        couple: { couple: nextCouple },
        ...(!resuming ? { coupleArchives: [...(cur.coupleArchives ?? []), archive] } : {}),
        outbox: cur.outbox.map((entry) => entry.entityType === 'couple' && entry.operation === 'UPSERT'
          ? { ...entry, payload: { ...(entry.payload as object), mode: 'SOLO', soloOwnerId: who, inviteCode: '', updatedAt: receipt.updated_at } }
          : entry),
      }
    }
    const updated = await writeData({ ...prepared, createdAt: v.createdAt, rev: original.rev }, created.key, converted(dataStore.get()))
    assertSession()
    await saveVault(updated)
    assertSession()
    key = created.key
    const remembered = authStore.get().remembered
    applyingRemote = true
    dataStore.set((cur) => converted(cur))
    applyingRemote = false
    authStore.set((s) => ({ ...s, people: headerOf(updated), welcomeInvite: null }))
    // Uma edição feita durante o commit também é cifrada com a chave nova.
    persistSnapshot(dataStore.get(), created.key)
    await forgetSession()
    if (remembered && key === created.key) await rememberSession({ who, key: created.key, expiresAt: Date.now() + REMEMBER_MS })
  })
  await writeChain
}

/* ---------- backup cifrado ---------- */

/** Exporta o cofre (já cifrado) depois de confirmar a senha de quem está usando */
export async function exportBackup(password: string): Promise<{ name: string; content: string }> {
  const who = authStore.get().who
  await writeChain
  const v0 = await loadVault()
  if (!who || !v0) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
  await unlockVault(v0, who, password)
  await writeChain // a última alteração já está no cofre
  const v = await loadVault() ?? v0
  const now = new Date()
  return { name: backupFileName(toDateKeyLocal(now)), content: toBackup(v, who, now.toISOString()) }
}

const toDateKeyLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Restaura um backup neste aparelho. Só troca o cofre depois que a senha abre o cofre do arquivo
 * (quem não tem a senha não consegue nem substituir os dados). Depois a pessoa entra normalmente.
 */
export async function restoreBackup(text: string, who: PartnerId, password: string): Promise<void> {
  const file = parseBackup(text)
  await unlockVault(file.vault, who, password)
  await writeChain
  await forgetSession()
  await saveVault(file.vault)
  removeLocal(ATTEMPTS_KEY)
  memoryAttempts = {}
  closeSession(who)
  broadcast('lock')
  authStore.set((s) => ({ ...s, status: 'locked', people: headerOf(file.vault) }))
}

/** Espera a última gravação cifrada terminar (antes de recarregar o app para atualizar) */
export async function flushSaves(): Promise<void> {
  await writeChain.catch(() => undefined)
}
