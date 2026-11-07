import { buildEmpty, buildSeed, normalizeState, withIdentity } from '../domain/seed'
import type { DataState, PartnerId, Pronoun, SplitMode } from '../domain/types'
import { createStore, useStore } from '../store/createStore'
import { dataStore, LEGACY_PLAINTEXT_KEY } from '../store/data'
import { ui, uiStore } from '../store/ui'
import {
  AuthError,
  backupFileName,
  parseBackup,
  toBackup,
  changePassword as rewrap,
  claimInvite,
  createSingleVault,
  createVault,
  isVault,
  openCloud,
  sealCloud,
  lockoutMs,
  readData,
  reinvite,
  unlockVault,
  writeData,
  type Vault,
} from './vault'

/**
 * Sessão de acesso. Regras (ver SECURITY.md):
 * - Nada do casal é lido antes do login; a chave fica só em memória (não extraível).
 * - "Lembrar neste aparelho" guarda a chave não extraível no IndexedDB por 14 dias.
 * - Sair, bloquear, trocar de pessoa ou trocar a senha invalida a sessão lembrada e avisa as outras abas.
 * - Sem "lembrar": bloqueio automático após 15 min sem interação.
 */

export const VAULT_KEY = 'ampara:vault:v1'
const ATTEMPTS_KEY = 'ampara:auth:attempts'
const REMEMBER_MS = 14 * 24 * 3600_000
const IDLE_MS = 15 * 60_000

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

let key: CryptoKey | null = null
let vault: Vault | null = null
let applyingRemote = false
let writeChain: Promise<void> = Promise.resolve()
let lastActivity = Date.now()

/* ---------- armazenamento ---------- */

function loadVault(): Vault | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) ?? 'null') as unknown
    return isVault(parsed) ? parsed : null
  } catch {
    return null
  }
}

function saveVault(v: Vault) {
  vault = v
  localStorage.setItem(VAULT_KEY, JSON.stringify(v))
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
    const req = indexedDB.open('ampara-auth', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('sessions')
    req.onerror = () => resolve(undefined)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('sessions', mode)
      const r = fn(tx.objectStore('sessions'))
      tx.oncomplete = () => {
        db.close()
        resolve(r ? (r.result as T) : undefined)
      }
      tx.onerror = () => {
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

function broadcast(type: 'lock' | 'wipe') {
  channel?.postMessage({ type })
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
  const v = loadVault() ?? vault
  if (!who || !v || !key) return null
  try {
    return await openCloud(v, key, who)
  } catch {
    return null
  }
}

export async function writeCloudSecret(secret: string | null): Promise<void> {
  const who = authStore.get().who
  const k = key
  if (!who || !k) return
  writeChain = writeChain.then(async () => {
    const v = loadVault() ?? vault
    if (!v || key !== k) return
    const next = await sealCloud(v, k, who, secret)
    saveVault(next)
    authStore.set((s) => ({ ...s, people: headerOf(next) }))
  })
  await writeChain
}

/** Aparelho novo entrando pela nuvem: cria o cofre só com esta pessoa e a mesma senha da conta */
export async function setupFromCloud(input: { who: PartnerId; password: string; data: DataState; remember: boolean; cloudSecret: string }) {
  const A = input.data.profiles.A!
  const B = input.data.profiles.B!
  const people = { A: { name: A.displayName, pronoun: A.pronoun }, B: { name: B.displayName, pronoun: B.pronoun } }
  const created = await createSingleVault(input.who, people, input.password, input.data)
  const v = await sealCloud(created.vault, created.key, input.who, input.cloudSecret)
  saveVault(v)
  localStorage.removeItem(LEGACY_PLAINTEXT_KEY)
  await openSession(input.who, created.key, v, input.remember)
}

/* ---------- abrir / fechar sessão ---------- */

async function openSession(who: PartnerId, k: CryptoKey, v: Vault, remember: boolean, welcomeInvite: string | null = null) {
  const data = await readData(v, k)
  key = k
  vault = v
  applyingRemote = true
  dataStore.set(() => data)
  applyingRemote = false
  ui.setViewer(who)
  lastActivity = Date.now()
  authStore.set((s) => ({ ...s, status: welcomeInvite ? 'welcome' : 'unlocked', welcomeInvite, who, preselect: null, people: headerOf(v), remembered: remember }))
  if (remember) await rememberSession({ who, key: k, expiresAt: Date.now() + REMEMBER_MS })
  else await forgetSession()
  emit()
}

function closeSession(preselect: PartnerId | null) {
  key = null
  emit()
  dataStore.set(() => buildEmpty(new Date()))
  ui.closeSheet()
  uiStore.set((s) => ({ ...s, toasts: [] }))
  const v = vault ?? loadVault()
  authStore.set((s) => ({
    ...s,
    status: v ? 'locked' : 'setup',
    who: null,
    preselect,
    welcomeInvite: null,
    remembered: false,
    people: v ? headerOf(v) : null,
  }))
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
const readAttempts = (): Attempts => {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Attempts
  } catch {
    return {}
  }
}

export function lockedUntil(who: PartnerId): number {
  return readAttempts()[who]?.until ?? 0
}

function registerFailure(who: PartnerId) {
  const a = readAttempts()
  const failures = (a[who]?.failures ?? 0) + 1
  a[who] = { failures, until: Date.now() + lockoutMs(failures) }
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a))
}

function clearFailures(who: PartnerId) {
  const a = readAttempts()
  delete a[who]
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a))
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
  a: { name: string; pronoun: Pronoun; password: string }
  b: { name: string; pronoun: Pronoun }
  splitMode: SplitMode
  shareA: boolean
  demo: boolean
  remember: boolean
}

/** Cria o espaço do casal (T01). A pessoa A entra; a B recebe um código de convite. */
export async function setup(input: SetupInput): Promise<void> {
  const now = new Date()
  const base = legacyData() ?? (input.demo ? buildSeed(now) : buildEmpty(now))
  const draft = withIdentity(base, { a: input.a, b: input.b, inviteCode: '', splitMode: input.splitMode, shareA: input.shareA, shareB: false })
  const created = await createVault({ a: input.a, b: input.b, data: draft })
  const finalData = withIdentity(draft, { a: input.a, b: input.b, inviteCode: created.invite })
  const v = await writeData(created.vault, created.key, finalData)
  saveVault(v)
  localStorage.removeItem(LEGACY_PLAINTEXT_KEY)
  authStore.set((s) => ({ ...s, hasLegacyData: false }))
  await openSession('A', created.key, v, input.remember, created.invite)
}

export const enterApp = () => authStore.set((s) => ({ ...s, status: 'unlocked', welcomeInvite: null }))

export async function login(who: PartnerId, password: string, remember: boolean) {
  const v = loadVault()
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
  const v = loadVault()
  if (!v) throw new AuthError('BAD_CREDENTIALS', 'Nenhum espaço encontrado neste aparelho.')
  assertNotThrottled(who)
  try {
    const r = await claimInvite(v, who, code, password)
    saveVault(r.vault)
    clearFailures(who)
    await openSession(who, r.key, r.vault, remember)
  } catch (e) {
    if (e instanceof AuthError && e.code === 'BAD_CREDENTIALS') registerFailure(who)
    throw e
  }
}

export async function changeMyPassword(current: string, next: string) {
  const who = authStore.get().who
  const v = loadVault()
  if (!who || !v) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
  await writeChain
  saveVault(await rewrap(v, who, current, next))
  // sessões lembradas e outras abas precisam entrar de novo
  await forgetSession()
  broadcast('lock')
  authStore.set((s) => ({ ...s, remembered: false }))
}

/** Apaga o espaço deste aparelho. Exige a senha de novo (confirmação forte). */
export async function wipeDevice(password: string) {
  const who = authStore.get().who
  const v = loadVault()
  if (!who || !v) return
  await unlockVault(v, who, password)
  await writeChain
  localStorage.removeItem(VAULT_KEY)
  localStorage.removeItem(ATTEMPTS_KEY)
  localStorage.removeItem('ampara:prefs')
  await forgetSession()
  vault = null
  closeSession(null)
  broadcast('wipe')
}

/* ---------- inicialização ---------- */

let started = false
export async function startAuth() {
  if (started) return
  started = true

  // gravação cifrada a cada mudança enquanto a sessão está aberta (em fila, na ordem)
  dataStore.subscribe(() => {
    if (!key || applyingRemote) return
    const k = key
    const snapshot = dataStore.get()
    writeChain = writeChain
      .then(async () => {
        const base = loadVault() ?? vault
        if (!base || key !== k) return
        const next = await writeData(base, k, snapshot)
        saveVault(next)
        const people = headerOf(next)
        authStore.set((s) => ({ ...s, people }))
      })
      .catch(() => ui.toast('Não foi possível salvar no aparelho. Libere espaço e tente de novo.', { tone: 'warn' }))
  })

  channel?.addEventListener('message', (e: MessageEvent<{ type: string }>) => {
    if (e.data?.type === 'lock' || e.data?.type === 'wipe') {
      if (e.data.type === 'wipe') vault = null
      closeSession(null)
    }
  })

  // outra aba gravou: traz os dados novos em vez de sobrescrever com uma cópia velha
  window.addEventListener('storage', (e) => {
    if (e.key !== VAULT_KEY || !key) return
    const v = loadVault()
    if (!v) return closeSession(null)
    const k = key
    void readData(v, k)
      .then((data) => {
        vault = v
        applyingRemote = true
        dataStore.set(() => data)
        applyingRemote = false
      })
      .catch(() => closeSession(null))
  })

  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true })
  }
  setInterval(() => {
    const s = authStore.get()
    if (s.status === 'unlocked' && !s.remembered && Date.now() - lastActivity > IDLE_MS) void lock(s.who)
  }, 30_000)

  const v = loadVault()
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
  const v = loadVault()
  if (!who || !v || !key) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
  const target: PartnerId = who === 'A' ? 'B' : 'A'
  await writeChain
  const r = await reinvite(v, who, password, target)
  saveVault(r.vault)
  const couple = dataStore.get().couple.couple
  if (couple) dataStore.set((s) => ({ ...s, couple: { couple: { ...couple, inviteCode: r.invite } } }))
  authStore.set((s) => ({ ...s, people: headerOf(r.vault) }))
  return r.invite
}

/* ---------- backup cifrado ---------- */

/** Exporta o cofre (já cifrado) depois de confirmar a senha de quem está usando */
export async function exportBackup(password: string): Promise<{ name: string; content: string }> {
  const who = authStore.get().who
  const v0 = loadVault()
  if (!who || !v0) throw new AuthError('BAD_CREDENTIALS', 'Sessão encerrada.')
  await unlockVault(v0, who, password)
  await writeChain // a última alteração já está no cofre
  const v = loadVault() ?? v0
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
  saveVault(file.vault)
  localStorage.removeItem(ATTEMPTS_KEY)
  closeSession(who)
  broadcast('lock')
  authStore.set((s) => ({ ...s, status: 'locked', people: headerOf(file.vault) }))
}

/** Espera a última gravação cifrada terminar (antes de recarregar o app para atualizar) */
export async function flushSaves(): Promise<void> {
  await writeChain.catch(() => undefined)
}
