/**
 * Primitivas criptográficas do cofre local (WebCrypto, sem dependências).
 * - Senha -> KEK: PBKDF2-HMAC-SHA256, 600.000 iterações (OWASP Password Storage 2023), sal de 16 bytes.
 * - DEK aleatória AES-GCM 256 cifra os dados; a DEK é embrulhada (AES-KW) pela KEK de cada pessoa.
 * - AES-GCM com IV aleatório de 12 bytes por gravação.
 */

export const PBKDF2_ITERATIONS = 600_000

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ])
}

/** DEK extraível só para poder ser embrulhada; a sessão usa uma cópia não extraível */
export const generateDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return toB64(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW'))
}

/** Lança erro se a KEK estiver errada (AES-KW tem verificação de integridade embutida) */
export async function unwrapDek(wrapped: string, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey('raw', fromB64(wrapped), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])
}

export interface Sealed {
  iv: string
  ct: string
}

export async function seal(key: CryptoKey, plaintext: string, aad?: string): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) }, key, enc.encode(plaintext))
  return { iv: toB64(iv), ct: toB64(ct) }
}

export async function open(key: CryptoKey, sealed: Sealed, aad?: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(sealed.iv), ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    fromB64(sealed.ct),
  )
  return dec.decode(pt)
}

/** Código de convite: 10 símbolos de um alfabeto de 31 sem ambíguos (~49 bits), sem viés de módulo */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function inviteCode(): string {
  const limit = 256 - (256 % ALPHABET.length)
  const chars: string[] = []
  while (chars.length < 10) {
    for (const b of randomBytes(16)) {
      if (b < limit && chars.length < 10) chars.push(ALPHABET[b % ALPHABET.length]!)
    }
  }
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`
}

export const normalizeInvite = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{5})(.{5})$/, '$1-$2')
