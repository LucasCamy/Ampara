import { describe, expect, it } from 'vitest'
import { buildSeed } from '../domain/seed'
import { normalizeInvite } from './crypto'
import { AuthError, changePassword, claimInvite, createVault, lockoutMs, readData, unlockVault, validatePassword, writeData } from './vault'

const IT = 1_000 // iterações reduzidas só no teste; produção usa 600.000
const data = buildSeed(new Date('2026-11-05T10:00:00'))
const make = () =>
  createVault({ a: { name: 'Lucas', pronoun: 'ele', password: 'uma frase longa do lucas' }, b: { name: 'Namorada', pronoun: 'ela' }, data }, IT)

describe('cofre local (autenticação + cifra em repouso)', () => {
  it('não grava senha nem dados em texto claro', async () => {
    const { vault } = await make()
    const raw = JSON.stringify(vault)
    expect(raw).not.toContain('uma frase longa do lucas')
    expect(raw).not.toContain('Supermercado')
    expect(raw).not.toContain('Venvanse')
    expect(vault.people.A.status).toBe('active')
    expect(vault.people.B.status).toBe('invited')
  })

  it('a senha certa abre os dados; a errada falha sem dizer o motivo exato', async () => {
    const { vault } = await make()
    const key = await unlockVault(vault, 'A', 'uma frase longa do lucas')
    expect((await readData(vault, key)).profiles.A?.displayName).toBe('Lucas')
    await expect(unlockVault(vault, 'A', 'senha errada qualquer')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
  })

  it('a chave da sessão não é extraível', async () => {
    const { key } = await make()
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy()
  })

  it('o par só entra depois de ativar com o código de convite', async () => {
    const { vault, invite } = await make()
    await expect(unlockVault(vault, 'B', 'qualquer coisa aqui')).rejects.toMatchObject({ code: 'NOT_ACTIVATED' })
    await expect(claimInvite(vault, 'B', 'AAAAA-AAAAA', 'senha nova da parceira')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    const claimed = await claimInvite(vault, 'B', invite.toLowerCase().replace('-', ' '), 'senha nova da parceira')
    expect(claimed.vault.people.B.status).toBe('active')
    const key = await unlockVault(claimed.vault, 'B', 'senha nova da parceira')
    expect((await readData(claimed.vault, key)).profiles.B?.displayName).toBe('Namorada')
    // o convite não pode ser reutilizado
    await expect(claimInvite(claimed.vault, 'B', invite, 'outra senha comprida')).rejects.toMatchObject({ code: 'ALREADY_ACTIVE' })
  })

  it('troca de senha invalida a senha antiga', async () => {
    const { vault } = await make()
    await expect(changePassword(vault, 'A', 'errada errada', 'nova frase do lucas')).rejects.toBeInstanceOf(AuthError)
    const next = await changePassword(vault, 'A', 'uma frase longa do lucas', 'nova frase do lucas')
    await expect(unlockVault(next, 'A', 'uma frase longa do lucas')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    await expect(unlockVault(next, 'A', 'nova frase do lucas')).resolves.toBeTruthy()
  })

  it('gravação incrementa a revisão e detecta adulteração (AES-GCM)', async () => {
    const { vault, key } = await make()
    const next = await writeData(vault, key, { ...data, lastSyncedAt: 'x' })
    expect(next.rev).toBe(vault.rev + 1)
    const tampered = { ...next, data: { ...next.data, ct: next.data.ct.slice(0, -4) + 'AAAA' } }
    await expect(readData(tampered, key)).rejects.toBeTruthy()
  })

  it('política de senha (NIST 800-63B)', () => {
    expect(validatePassword('curta')).toMatch(/10 caracteres/)
    expect(validatePassword('1234567890')).toMatch(/comum/)
    expect(validatePassword('lucas12345', { name: 'Lucas' })).toMatch(/nome/)
    expect(validatePassword('cafe com pao na varanda')).toBeNull()
  })

  it('atraso progressivo após 5 falhas', () => {
    expect(lockoutMs(4)).toBe(0)
    expect(lockoutMs(5)).toBe(30_000)
    expect(lockoutMs(6)).toBe(60_000)
    expect(lockoutMs(20)).toBe(15 * 60_000)
  })

  it('normaliza o código digitado', () => {
    expect(normalizeInvite('abcde fghjk')).toBe('ABCDE-FGHJK')
  })
})

describe('recuperação de acesso pelo par', () => {
  it('novo convite exige a senha de quem gera e invalida a senha antiga do par', async () => {
    const { vault, invite } = await make()
    const claimed = await claimInvite(vault, 'B', invite, 'senha antiga da parceira')
    const { reinvite } = await import('./vault')
    await expect(reinvite(claimed.vault, 'A', 'senha errada errada', 'B')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    const r = await reinvite(claimed.vault, 'A', 'uma frase longa do lucas', 'B')
    expect(r.vault.people.B.status).toBe('invited')
    await expect(unlockVault(r.vault, 'B', 'senha antiga da parceira')).rejects.toMatchObject({ code: 'NOT_ACTIVATED' })
    const again = await claimInvite(r.vault, 'B', r.invite, 'senha nova da parceira 2')
    await expect(unlockVault(again.vault, 'B', 'senha nova da parceira 2')).resolves.toBeTruthy()
  })
})
