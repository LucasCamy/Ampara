import type { DataState, PartnerId, Pronoun } from '../domain/types'
import { normalizeState } from '../domain/seed'
import { deriveKek, fromB64, generateDek, inviteCode, normalizeInvite, open, PBKDF2_ITERATIONS, randomBytes, seal, toB64, unwrapDek, wrapDek, type Sealed } from './crypto'

/**
 * Cofre local: os dados do casal ficam cifrados em repouso.
 * Só o cabeçalho (nomes para a tela de entrada) fica em texto claro.
 * Nenhuma senha ou hash de senha é gravado: a verificação é a própria abertura da DEK.
 */
export interface PersonSlot {
  name: string
  pronoun: Pronoun
  /** invited = ainda não criou senha (embrulho pelo convite); absent = usa o próprio aparelho, não entra neste */
  status: 'active' | 'invited' | 'absent'
  salt: string
  iterations: number
  wrapped: string
  /** sessão da nuvem (refresh token) cifrada com a chave de dados; só existe se a pessoa conectou */
  cloud?: Sealed
}

export interface Vault {
  v: 1
  createdAt: string
  /** incrementa a cada gravação: protege contra aba antiga sobrescrevendo dados novos */
  rev: number
  people: Record<PartnerId, PersonSlot>
  data: Sealed
}

const DATA_AAD = 'ampara:data:v1'

export class AuthError extends Error {
  constructor(
    public code: 'BAD_CREDENTIALS' | 'NOT_ACTIVATED' | 'ALREADY_ACTIVE' | 'WEAK_PASSWORD',
    message: string,
  ) {
    super(message)
  }
}

const COMMON = new Set([
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'senha12345',
  'senhasenha',
  'password123',
  'iloveyou123',
  'amor123456',
  'teamo12345',
  'ampara1234',
  'abcdefghij',
  '0123456789',
  'aaaaaaaaaa',
])

/** NIST 800-63B: comprimento mínimo, sem regras de composição, bloqueia senhas óbvias */
export function validatePassword(password: string, ctx: { name?: string } = {}): string | null {
  if (password.length < 10) return 'Use pelo menos 10 caracteres. Uma frase curta funciona bem.'
  if (password.length > 128) return 'Use no máximo 128 caracteres.'
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'Essa senha é muito comum. Tente uma frase só de vocês.'
  if (ctx.name && ctx.name.trim().length >= 3 && lower.includes(ctx.name.trim().toLowerCase()) && password.length < 16) {
    return 'Evite usar o próprio nome na senha.'
  }
  return null
}

async function slotFor(name: string, pronoun: Pronoun, dek: CryptoKey, secret: string, status: PersonSlot['status'], iterations: number): Promise<PersonSlot> {
  const salt = randomBytes(16)
  const kek = await deriveKek(secret, salt, iterations)
  return { name, pronoun, status, salt: toB64(salt), iterations, wrapped: await wrapDek(dek, kek) }
}

async function sessionKeyFrom(dek: CryptoKey): Promise<CryptoKey> {
  // cópia não extraível para a sessão: nem um script injetado consegue ler os bytes da chave
  const raw = await crypto.subtle.exportKey('raw', dek)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export interface CreateInput {
  a: { name: string; pronoun: Pronoun; password: string }
  b: { name: string; pronoun: Pronoun }
  data: DataState
}

export async function createVault(input: CreateInput, iterations = PBKDF2_ITERATIONS): Promise<{ vault: Vault; key: CryptoKey; invite: string }> {
  const weak = validatePassword(input.a.password, { name: input.a.name })
  if (weak) throw new AuthError('WEAK_PASSWORD', weak)
  const dek = await generateDek()
  const invite = inviteCode()
  const people = {
    A: await slotFor(input.a.name, input.a.pronoun, dek, input.a.password, 'active', iterations),
    B: await slotFor(input.b.name, input.b.pronoun, dek, normalizeInvite(invite), 'invited', iterations),
  }
  const key = await sessionKeyFrom(dek)
  const vault: Vault = { v: 1, createdAt: new Date().toISOString(), rev: 0, people, data: { iv: '', ct: '' } }
  return { vault: await writeData(vault, key, input.data), key, invite }
}

async function kekFor(slot: PersonSlot, secret: string) {
  return deriveKek(secret, fromB64(slot.salt), slot.iterations)
}

/** Abre a sessão de uma pessoa. Mensagem genérica: não revela se o erro foi pessoa ou senha. */
export async function unlockVault(vault: Vault, who: PartnerId, password: string): Promise<CryptoKey> {
  const slot = vault.people[who]
  if (slot.status === 'absent') throw new AuthError('NOT_ACTIVATED', 'Esta pessoa usa o próprio aparelho.')
  if (slot.status !== 'active') throw new AuthError('NOT_ACTIVATED', 'Primeiro acesso: use o código de convite para criar a senha.')
  try {
    return await unwrapDek(slot.wrapped, await kekFor(slot, password))
  } catch {
    throw new AuthError('BAD_CREDENTIALS', 'Senha incorreta. Confira e tente de novo.')
  }
}

/** Primeiro acesso do par: troca o embrulho pelo código de convite por um embrulho com a senha */
export async function claimInvite(vault: Vault, who: PartnerId, code: string, password: string): Promise<{ vault: Vault; key: CryptoKey }> {
  const slot = vault.people[who]
  if (slot.status !== 'invited') throw new AuthError('ALREADY_ACTIVE', 'Este acesso já foi ativado. Entre com a senha.')
  const weak = validatePassword(password, { name: slot.name })
  if (weak) throw new AuthError('WEAK_PASSWORD', weak)
  let dek: CryptoKey
  try {
    dek = await unwrapDek(slot.wrapped, await kekFor(slot, normalizeInvite(code)), true)
  } catch {
    throw new AuthError('BAD_CREDENTIALS', 'Código de convite inválido.')
  }
  const next = await slotFor(slot.name, slot.pronoun, dek, password, 'active', slot.iterations)
  return { vault: { ...vault, people: { ...vault.people, [who]: next } }, key: await sessionKeyFrom(dek) }
}

export async function changePassword(vault: Vault, who: PartnerId, current: string, nextPassword: string): Promise<Vault> {
  const slot = vault.people[who]
  const weak = validatePassword(nextPassword, { name: slot.name })
  if (weak) throw new AuthError('WEAK_PASSWORD', weak)
  let dek: CryptoKey
  try {
    dek = await unwrapDek(slot.wrapped, await kekFor(slot, current), true)
  } catch {
    throw new AuthError('BAD_CREDENTIALS', 'Senha atual incorreta.')
  }
  const next = await slotFor(slot.name, slot.pronoun, dek, nextPassword, 'active', slot.iterations)
  return { ...vault, people: { ...vault.people, [who]: next } }
}

export async function readData(vault: Vault, key: CryptoKey): Promise<DataState> {
  return normalizeState(JSON.parse(await open(key, vault.data, DATA_AAD)) as DataState)
}

/** Grava os dados cifrados e sincroniza os nomes do cabeçalho com os perfis */
export async function writeData(vault: Vault, key: CryptoKey, data: DataState): Promise<Vault> {
  const people = { ...vault.people }
  for (const id of ['A', 'B'] as PartnerId[]) {
    const p = data.profiles[id]
    if (p && (p.displayName !== people[id].name || p.pronoun !== people[id].pronoun)) {
      people[id] = { ...people[id], name: p.displayName, pronoun: p.pronoun }
    }
  }
  return { ...vault, people, rev: vault.rev + 1, data: await seal(key, JSON.stringify(data), DATA_AAD) }
}

/** Atraso progressivo após falhas: 5 tentativas livres, depois 30 s dobrando até 15 min */
export function lockoutMs(failures: number): number {
  if (failures < 5) return 0
  return Math.min(30_000 * 2 ** (failures - 5), 15 * 60_000)
}

export function isVault(x: unknown): x is Vault {
  const v = x as Vault
  return !!v && v.v === 1 && !!v.people?.A && !!v.people?.B && typeof v.data?.ct === 'string'
}

/**
 * Recuperação sem servidor: quem está com acesso confirma a própria senha (step-up) e
 * gera um novo convite para o par. A senha antiga do par deixa de funcionar.
 */
export async function reinvite(vault: Vault, by: PartnerId, password: string, target: PartnerId): Promise<{ vault: Vault; invite: string }> {
  if (by === target) throw new AuthError('BAD_CREDENTIALS', 'Para trocar a sua senha, use Trocar senha.')
  const mine = vault.people[by]
  let dek: CryptoKey
  try {
    dek = await unwrapDek(mine.wrapped, await kekFor(mine, password), true)
  } catch {
    throw new AuthError('BAD_CREDENTIALS', 'Senha incorreta.')
  }
  const invite = inviteCode()
  const slot = vault.people[target]
  const next = await slotFor(slot.name, slot.pronoun, dek, normalizeInvite(invite), 'invited', slot.iterations)
  return { vault: { ...vault, people: { ...vault.people, [target]: next } }, invite }
}

/** Aparelho novo que entrou pela nuvem: só a pessoa que entrou tem acesso aqui */
export async function createSingleVault(
  who: PartnerId,
  people: Record<PartnerId, { name: string; pronoun: Pronoun }>,
  password: string,
  data: DataState,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ vault: Vault; key: CryptoKey }> {
  const dek = await generateDek()
  const other: PartnerId = who === 'A' ? 'B' : 'A'
  const slots = {
    [who]: await slotFor(people[who].name, people[who].pronoun, dek, password, 'active', iterations),
    [other]: { name: people[other].name, pronoun: people[other].pronoun, status: 'absent', salt: '', iterations, wrapped: '' },
  } as Record<PartnerId, PersonSlot>
  const key = await sessionKeyFrom(dek)
  const vault: Vault = { v: 1, createdAt: new Date().toISOString(), rev: 0, people: slots, data: { iv: '', ct: '' } }
  return { vault: await writeData(vault, key, data), key }
}

const cloudAad = (who: PartnerId) => `ampara:cloud:${who}`

export async function sealCloud(vault: Vault, key: CryptoKey, who: PartnerId, secret: string | null): Promise<Vault> {
  const slot = { ...vault.people[who] }
  if (secret === null) delete slot.cloud
  else slot.cloud = await seal(key, secret, cloudAad(who))
  return { ...vault, people: { ...vault.people, [who]: slot } }
}

export async function openCloud(vault: Vault, key: CryptoKey, who: PartnerId): Promise<string | null> {
  const sealed = vault.people[who].cloud
  return sealed ? open(key, sealed, cloudAad(who)) : null
}

/* ---------- backup (o próprio cofre cifrado, num arquivo) ---------- */

export const BACKUP_FORMAT = 'ampara-backup'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: string
  /** quem exportou (só para a tela de restauração; não dá acesso a nada) */
  exportedBy: PartnerId
  vault: Vault
}

/** Arquivo de backup: o cofre continua cifrado; nada é decifrado para exportar */
export function toBackup(vault: Vault, by: PartnerId, nowIso: string): string {
  const file: BackupFile = { format: BACKUP_FORMAT, version: 1, exportedAt: nowIso, exportedBy: by, vault }
  return JSON.stringify(file)
}

/** Lê um arquivo de backup. Erro em português quando não é um backup do Ampara. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Este arquivo não é um backup do Ampara.')
  }
  const f = parsed as BackupFile
  if (!f || f.format !== BACKUP_FORMAT || f.version !== 1 || !isVault(f.vault)) throw new Error('Este arquivo não é um backup do Ampara.')
  return f
}

export const backupFileName = (date: string) => `ampara-backup-${date}.ampara`
