import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { COLLECTIONS, type PartnerId } from '../domain/types'
import { createVault, readData, unlockVault, type Vault } from './vault'

vi.mock('../store/ui', async () => {
  const { createStore } = await import('../store/createStore')
  return {
    ui: { setViewer: vi.fn(), closeSheet: vi.fn(), toast: vi.fn() },
    uiStore: createStore({ toasts: [] }),
  }
})

const PASSWORD = 'cafe com pao na varanda'
let values: Map<string, string>
let persist: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  values = new Map()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('BroadcastChannel', undefined)
  persist = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('navigator', { storage: { persist } })
  vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function solo(remember = false) {
  const session = await import('./session')
  await session.startAuth()
  await session.setup({ mode: 'SOLO', a: { name: 'Lucas', pronoun: 'ele', password: PASSWORD }, remember })
  const { dataStore, transact } = await import('../store/data')
  const storage = await import('./storage')
  return { ...session, dataStore, transact, storage }
}

async function coupleAs(who: PartnerId) {
  const s = await solo(true)
  const invite = await s.upgradeSoloToCouple(PASSWORD, { name: 'Marina', pronoun: 'ela' })
  await s.lock('B')
  await s.activate('B', invite, 'cha de hortela no jardim', true)
  if (who === 'A') {
    await s.lock('A')
    await s.login('A', PASSWORD, true)
  }
  return s
}

describe('sessão com IndexedDB cifrado', () => {
  it.each(['A', 'B'] as const)('converte o espaço inteiro para Solo de %s sem remapear registros e troca a chave do cofre', async (who) => {
    const s = await coupleAs(who)
    const password = who === 'A' ? PASSWORD : 'cha de hortela no jardim'
    const other = who === 'A' ? 'B' : 'A'
    const oldPassword = other === 'A' ? PASSWORD : 'cha de hortela no jardim'
    s.transact((tx) => {
      tx.put('comfortItems', { id: 'calma-par', ownerId: other, text: 'Registro original do par', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' })
      tx.put('profiles', { ...tx.get('profiles', who)!, monthlyBudgetCents: 81234, enabledModules: { cycle: true, shopping: false, goals: true } })
    })
    await s.flushSaves()
    const oldVault = await s.storage.readStoredVault() as Vault
    const oldKey = await unlockVault(oldVault, other, oldPassword)
    const before = s.dataStore.get()
    let backup = ''
    await s.convertCoupleToSolo(password, (file) => { backup = file.content })
    const after = s.dataStore.get()
    for (const collection of COLLECTIONS.filter((c) => c !== 'couple')) expect(after[collection]).toEqual(before[collection])
    expect(after.couple.couple).toMatchObject({ mode: 'SOLO', soloOwnerId: who, inviteCode: '' })
    expect(after.coupleArchives).toHaveLength(1)
    expect(after.coupleArchives?.[0]?.collections.couple).toEqual(before.couple)
    expect(after.profiles[who]?.monthlyBudgetCents).toBe(81234)
    expect(s.authStore.get()).toMatchObject({ who, remembered: true })
    expect(s.authStore.get().people?.[other].status).toBe('absent')
    const vault = await s.storage.readStoredVault() as Vault
    expect(vault.people[other].wrapped).toBe('')
    await expect(readData(vault, oldKey)).rejects.toBeTruthy()
    expect(JSON.stringify(vault)).not.toContain('Registro original do par')
    const { parseBackup } = await import('./vault')
    const backedUp = parseBackup(backup)
    const original = await readData(backedUp.vault, await unlockVault(backedUp.vault, who, password))
    expect(original.couple.couple?.mode).toBe('COUPLE')
    expect(original.comfortItems).toEqual(before.comfortItems)
    await s.lock()
    await expect(s.login(other, oldPassword, false)).rejects.toMatchObject({ code: 'NOT_ACTIVATED' })
    await s.login(who, password, false)
    expect(s.dataStore.get().coupleArchives?.[0]?.collections.comfortItems).toEqual(before.comfortItems)
    // O mesmo par pode voltar sem trocar os ids, o orçamento ou as autorias.
    await s.upgradeSoloToCouple(password, { name: before.profiles[other]!.displayName, pronoun: before.profiles[other]!.pronoun })
    expect(s.dataStore.get().couple.couple).toMatchObject({ mode: 'COUPLE', soloOwnerId: null })
    expect(s.authStore.get().people?.[other].status).toBe('invited')
  })

  it('senha incorreta e falha no download impedem a conversão e a chamada remota', async () => {
    const s = await coupleAs('A')
    const save = vi.fn()
    const commit = vi.fn().mockResolvedValue({ solo_owner_id: 'A', updated_at: '2026-11-21T12:00:00Z' })
    const original = await s.storage.readStoredVault()
    await expect(s.convertCoupleToSolo('senha incorreta', save, commit)).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    expect(save).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    await expect(s.convertCoupleToSolo(PASSWORD, () => { throw new Error('Download indisponível') }, commit)).rejects.toThrow('Download indisponível')
    expect(commit).not.toHaveBeenCalled()
    expect(await s.storage.readStoredVault()).toEqual(original)
    expect(s.dataStore.get().couple.couple?.mode).toBe('COUPLE')
  })

  it('falha da nuvem mantém o cofre original e permite repetir a conversão', async () => {
    const s = await coupleAs('A')
    s.transact((tx) => tx.put('couple', { ...tx.get('couple', 'couple')!, spaceId: 'espaco-remoto' }))
    await s.flushSaves()
    const original = await s.storage.readStoredVault()
    await expect(s.convertCoupleToSolo(PASSWORD, vi.fn())).rejects.toThrow('Reconecte a nuvem')
    const save = vi.fn()
    await expect(s.convertCoupleToSolo(PASSWORD, save, async () => { throw new Error('Sem conexão') })).rejects.toThrow('Sem conexão')
    expect(save).toHaveBeenCalledOnce()
    expect(await s.storage.readStoredVault()).toEqual(original)
    expect(s.dataStore.get().couple.couple?.mode).toBe('COUPLE')
    await s.convertCoupleToSolo(PASSWORD, vi.fn(), async () => ({ solo_owner_id: 'A', updated_at: '2026-11-21T12:00:00Z' }))
    expect(s.dataStore.get().couple.couple).toMatchObject({ mode: 'SOLO', spaceId: 'espaco-remoto', soloOwnerId: 'A' })
  })

  it('preserva edição concorrente e o segredo da nuvem cifrado, sem incluir o segredo no backup', async () => {
    const s = await coupleAs('B')
    const password = 'cha de hortela no jardim'
    await s.writeCloudSecret('refresh-token-privado')
    let backup = ''
    await s.convertCoupleToSolo(password, (file) => { backup = file.content }, async () => {
      s.transact((tx) => tx.put('comfortItems', { id: 'novo', ownerId: 'B', text: 'Edição durante a conversão', createdAt: '2026-11-21T12:00:00Z', updatedAt: '2026-11-21T12:00:00Z' }))
      return { solo_owner_id: 'B', updated_at: '2026-11-21T12:00:00Z' }
    })
    expect(await s.readCloudSecret()).toBe('refresh-token-privado')
    expect(backup).not.toContain('refresh-token-privado')
    expect(JSON.parse(backup).vault.people.B.cloud).toBeUndefined()
    await s.lock()
    await s.login('B', password, false)
    expect(s.dataStore.get().comfortItems.novo?.text).toBe('Edição durante a conversão')
    expect(await s.readCloudSecret()).toBe('refresh-token-privado')
  })

  it('bloqueio durante a preparação cancela a conversão sem reabrir a sessão', async () => {
    const s = await coupleAs('A')
    const commit = vi.fn()
    await expect(s.convertCoupleToSolo(PASSWORD, () => {
      window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ampara:auth:event', newValue: JSON.stringify({ type: 'lock' }) }))
    }, commit)).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    expect(commit).not.toHaveBeenCalled()
    expect(s.authStore.get().status).toBe('locked')
    const vault = await s.storage.readStoredVault() as Vault
    const data = await readData(vault, await unlockVault(vault, 'A', PASSWORD))
    expect(data.couple.couple?.mode).toBe('COUPLE')
  })

  it('falha local depois da confirmação remota não apaga o cofre e a repetição recupera a conversão', async () => {
    const s = await coupleAs('A')
    await s.flushSaves()
    const before = await s.storage.readStoredVault()
    const receipt = { solo_owner_id: 'A' as const, updated_at: '2026-11-21T12:00:00Z' }
    const commit = vi.fn().mockResolvedValue(receipt)
    vi.spyOn(s.storage, 'writeStoredVault').mockRejectedValueOnce(new Error('Disco cheio'))
    await expect(s.convertCoupleToSolo(PASSWORD, vi.fn(), commit)).rejects.toThrow('Disco cheio')
    expect(await s.storage.readStoredVault()).toEqual(before)
    expect(s.dataStore.get().couple.couple?.mode).toBe('COUPLE')
    await s.convertCoupleToSolo(PASSWORD, vi.fn(), commit)
    expect(commit).toHaveBeenCalledTimes(2)
    expect(s.dataStore.get().couple.couple?.mode).toBe('SOLO')
    expect(s.dataStore.get().coupleArchives).toHaveLength(1)
  })

  it('finaliza a troca de chave mesmo se um pull já trouxe Solo depois de falhar o commit local', async () => {
    const s = await coupleAs('A')
    const { applySpaceMode } = await import('../domain/space')
    const before = await s.storage.readStoredVault() as Vault
    const oldKey = await unlockVault(before, 'A', PASSWORD)
    const commit = vi.fn().mockResolvedValue({ solo_owner_id: 'A', updated_at: '2026-11-21T12:00:00Z' })
    vi.spyOn(s.storage, 'writeStoredVault').mockRejectedValueOnce(new Error('Gravação interrompida'))
    await expect(s.convertCoupleToSolo(PASSWORD, vi.fn(), commit)).rejects.toThrow('Gravação interrompida')
    s.dataStore.set((cur) => applySpaceMode(cur, { mode: 'SOLO', soloOwnerId: 'A' }))
    await s.flushSaves()
    expect((await s.storage.readStoredVault())?.people.B.status).toBe('absent')
    await s.convertCoupleToSolo(PASSWORD, vi.fn(), commit)
    const stored = await s.storage.readStoredVault() as Vault
    await expect(readData(stored, oldKey)).rejects.toBeTruthy()
    expect((await readData(stored, await unlockVault(stored, 'A', PASSWORD))).couple.couple?.mode).toBe('SOLO')
  })

  it('uma aba com a chave antiga não sobrescreve um cofre que outra aba converteu', async () => {
    const s = await coupleAs('B')
    const { createSingleVault } = await import('./vault')
    const original = s.dataStore.get()
    const soloData = { ...original, couple: { couple: { ...original.couple.couple!, mode: 'SOLO' as const, soloOwnerId: 'A' as const, inviteCode: '' } } }
    const external = await createSingleVault('A', { A: { name: 'Lucas', pronoun: 'ele' }, B: { name: 'Marina', pronoun: 'ela' } }, PASSWORD, soloData, 1000)
    await s.storage.writeStoredVault(external.vault)
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'B')!, monthlyBudgetCents: 99999 }))
    await s.flushSaves()
    expect(s.authStore.get().status).toBe('locked')
    expect(await s.storage.readStoredVault()).toEqual(external.vault)
    const recovered = await readData(external.vault, await unlockVault(external.vault, 'A', PASSWORD))
    expect(recovered.couple.couple?.mode).toBe('SOLO')
    expect(recovered.profiles.B?.monthlyBudgetCents).not.toBe(99999)
  })

  it('uma aba do dono com a mesma chave respeita Solo remoto e preserva o arquivo cifrado', async () => {
    const s = await coupleAs('A')
    const { writeData } = await import('./vault')
    const before = await s.storage.readStoredVault() as Vault
    const k = await unlockVault(before, 'A', PASSWORD)
    const original = s.dataStore.get()
    const archive = { ownerId: 'A' as const, savedAt: '2026-11-21T12:00:00Z', collections: Object.fromEntries(COLLECTIONS.map((c) => [c, original[c]])) }
    const external = await writeData(before, k, { ...original, couple: { couple: { ...original.couple.couple!, mode: 'SOLO', soloOwnerId: 'A', inviteCode: '' } }, coupleArchives: [archive as unknown as NonNullable<typeof original.coupleArchives>[number]] })
    await s.storage.writeStoredVault(external)
    s.transact((tx) => tx.put('couple', { ...tx.get('couple', 'couple')!, ratioABps: 7200 }))
    await s.flushSaves()
    const stored = await s.storage.readStoredVault() as Vault
    const data = await readData(stored, k)
    expect(data.couple.couple).toMatchObject({ mode: 'SOLO', soloOwnerId: 'A', ratioABps: 7200 })
    expect(s.dataStore.get().couple.couple?.mode).toBe('SOLO')
    expect(data.coupleArchives).toEqual([archive])
    expect(data.outbox.filter((entry) => entry.entityType === 'couple').every((entry) => (entry.payload as { mode: string }).mode === 'SOLO')).toBe(true)
    expect(stored.people.B.status).toBe('absent')
  })

  it('uma aba Solo antiga não apaga o convite depois da retomada em outra aba', async () => {
    const s = await solo()
    const { reinvite, writeData } = await import('./vault')
    const before = await s.storage.readStoredVault() as Vault
    const k = await unlockVault(before, 'A', PASSWORD)
    const invitation = await reinvite(before, 'A', PASSWORD, 'B')
    const original = s.dataStore.get()
    const external = await writeData(invitation.vault, k, { ...original, couple: { couple: { ...original.couple.couple!, mode: 'COUPLE', soloOwnerId: null, inviteCode: invitation.invite } } })
    await s.storage.writeStoredVault(external)
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 45000 }))
    await s.flushSaves()
    const stored = await s.storage.readStoredVault() as Vault
    expect((await readData(stored, k)).couple.couple?.mode).toBe('COUPLE')
    expect((await readData(stored, k)).couple.couple?.inviteCode).toBe(invitation.invite)
    expect(stored.people.B.status).toBe('invited')
    expect(stored.people.B.wrapped).toBe(external.people.B.wrapped)
    expect(s.dataStore.get().profiles.A?.monthlyBudgetCents).toBe(45000)
  })

  it('sessão lembrada antiga do par não abre o Solo depois de reiniciar o app', async () => {
    const s = await coupleAs('A')
    const before = await s.storage.readStoredVault() as Vault
    const oldKey = await unlockVault(before, 'B', 'cha de hortela no jardim')
    await s.convertCoupleToSolo(PASSWORD, vi.fn())
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ampara-auth', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('sessions', 'readwrite')
        tx.objectStore('sessions').put({ who: 'B', key: oldKey, expiresAt: Date.now() + 60_000 }, 'current')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    })
    vi.resetModules()
    const next = await import('./session')
    await next.startAuth()
    expect(next.authStore.get()).toMatchObject({ status: 'locked', who: null, remembered: false })
    const { dataStore } = await import('../store/data')
    expect(dataStore.get().couple.couple?.mode).toBe('COUPLE')
    expect(next.authStore.get().people?.B.status).toBe('absent')
  })

  it('Solo abre direto, sem convite nem dados de exemplo; senha fica só em memória', async () => {
    const s = await solo()
    expect(s.authStore.get()).toMatchObject({ status: 'unlocked', who: 'A', welcomeInvite: null, remembered: false })
    expect(s.authStore.get().people?.B.status).toBe('absent')
    expect(s.dataStore.get().couple.couple).toMatchObject({ mode: 'SOLO', inviteCode: '' })
    expect(s.dataStore.get().profiles.A?.enabledModules).toEqual({ cycle: false, shopping: true, goals: true })
    expect(Object.keys(s.dataStore.get().tasks)).toHaveLength(0)
    expect(persist).toHaveBeenCalledOnce()
    const vault = await s.storage.readStoredVault()
    expect(JSON.stringify(vault)).not.toContain(PASSWORD)
    expect(values.has(s.VAULT_KEY)).toBe(false)
  })

  it('grava alterações em fila, bloqueia sem dados e reabre com os dados atuais', async () => {
    const s = await solo()
    s.transact((tx) => tx.put('comfortItems', { id: 'calma', ownerId: 'A', text: 'Caminhar pela praça', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' }))
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 12345 }))
    await s.flushSaves()
    expect(JSON.stringify(await s.storage.readStoredVault())).not.toContain('Caminhar pela praça')
    await s.lock()
    expect(s.authStore.get().status).toBe('locked')
    expect(Object.keys(s.dataStore.get().comfortItems)).toHaveLength(0)
    await expect(s.login('A', 'errada errada', false)).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    await s.login('A', PASSWORD, false)
    expect(s.dataStore.get().comfortItems.calma?.text).toBe('Caminhar pela praça')
    expect(s.dataStore.get().profiles.A?.monthlyBudgetCents).toBe(12345)
  })

  it('só informa salvo depois do commit e permite repetir uma gravação que falhou', async () => {
    const s = await solo()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const write = s.storage.writeStoredVault
    const spy = vi.spyOn(s.storage, 'writeStoredVault').mockImplementationOnce(async (v) => {
      await gate
      return write(v)
    })
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 34500 }))
    expect(s.localSaveStore.get()).toBe('saving')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce())
    expect(s.localSaveStore.get()).toBe('saving')
    release()
    await s.flushSaves()
    await vi.waitFor(() => expect(s.localSaveStore.get()).toBe('saved'))

    spy.mockRejectedValueOnce(new Error('Sem espaço'))
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 45600 }))
    await s.flushSaves()
    await vi.waitFor(() => expect(s.localSaveStore.get()).toBe('error'))
    s.retryLocalSave()
    await s.flushSaves()
    await vi.waitFor(() => expect(s.localSaveStore.get()).toBe('saved'))
    const vault = await s.storage.readStoredVault() as Vault
    const data = await readData(vault, await unlockVault(vault, 'A', PASSWORD))
    expect(data.profiles.A?.monthlyBudgetCents).toBe(45600)
  })

  it('upgrade exige a senha e preserva registros, orçamento e preferências pessoais', async () => {
    const s = await solo()
    s.transact((tx) => {
      tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 50000, enabledModules: { cycle: true, shopping: false, goals: true } })
      tx.put('comfortItems', { id: 'calma', ownerId: 'A', text: 'Um copo de água', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' })
    })
    await expect(s.upgradeSoloToCouple('senha errada', { name: 'Marina', pronoun: 'ela' })).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    expect(s.dataStore.get().couple.couple?.mode).toBe('SOLO')
    const before = s.dataStore.get()
    const invite = await s.upgradeSoloToCouple(PASSWORD, { name: 'Marina', pronoun: 'ela' })
    expect(invite).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    const after = s.dataStore.get()
    expect(after.couple.couple).toMatchObject({ mode: 'COUPLE', inviteCode: invite })
    expect(after.profiles.A).toEqual(before.profiles.A)
    expect(after.comfortItems).toEqual(before.comfortItems)
    expect(after.profiles.B).toMatchObject({ displayName: 'Marina', pronoun: 'ela', enabledModules: { cycle: true, shopping: true, goals: true } })
    expect(s.authStore.get().people?.B.status).toBe('invited')
    await s.lock('B')
    await s.activate('B', invite, 'cha de hortela no jardim', false)
    expect(s.authStore.get().who).toBe('B')
    expect(s.dataStore.get().comfortItems.calma?.text).toBe('Um copo de água')
    await expect(s.upgradeSoloToCouple(PASSWORD, { name: 'Outra', pronoun: 'ela' })).rejects.toBeTruthy()
  })

  it('Solo não pode gerar convite de recuperação por fora do upgrade', async () => {
    const s = await solo()
    await expect(s.reinvitePartner(PASSWORD)).rejects.toThrow('Convidar alguém')
    expect(s.authStore.get().people?.B.status).toBe('absent')
  })

  it('setup Solo também recusa senha fraca quando chamado sem o formulário', async () => {
    const s = await import('./session')
    await s.startAuth()
    await expect(s.setup({ mode: 'SOLO', a: { name: 'Lucas', pronoun: 'ele', password: 'curta' }, remember: false })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
    const storage = await import('./storage')
    expect(await storage.readStoredVault()).toBeNull()
    expect(s.authStore.get().status).toBe('setup')
  })

  it('bloqueio de outra aba durante a gravação da sessão lembrada cancela a abertura', async () => {
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, name?: IDBValidKey) {
      const request = put.call(this, value, name)
      if (this.name === 'sessions') request.addEventListener('success', () => {
        window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ampara:auth:event', newValue: JSON.stringify({ type: 'lock' }) }))
      })
      return request
    })
    const s = await solo(true)
    expect(s.authStore.get()).toMatchObject({ status: 'locked', who: null, remembered: false })
    expect(s.dataStore.get().profiles.A?.displayName).toBe('Lucas')
    await s.login('A', PASSWORD, false)
    expect(s.authStore.get().status).toBe('unlocked')
  })

  it('bloqueio durante a confirmação da senha cancela o upgrade sem reabrir os dados', async () => {
    const s = await solo()
    const vaultModule = await import('./vault')
    const reinvite = vaultModule.reinvite
    vi.spyOn(vaultModule, 'reinvite').mockImplementation(async (...args) => {
      window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ampara:auth:event', newValue: JSON.stringify({ type: 'lock' }) }))
      return reinvite(...args)
    })
    await expect(s.upgradeSoloToCouple(PASSWORD, { name: 'Marina', pronoun: 'ela' })).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' })
    expect(s.authStore.get()).toMatchObject({ status: 'locked', who: null })
    const stored = await s.storage.readStoredVault() as Vault
    const data = await readData(stored, await unlockVault(stored, 'A', PASSWORD))
    expect(data.couple.couple?.mode).toBe('SOLO')
    expect(stored.people.B.status).toBe('absent')
  })

  it('backup e restauração mantêm Solo e exigem a senha antes de substituir', async () => {
    const s = await solo()
    s.transact((tx) => tx.put('profiles', { ...tx.get('profiles', 'A')!, monthlyBudgetCents: 98765 }))
    const backup = await s.exportBackup(PASSWORD)
    expect(backup.content).not.toContain(PASSWORD)
    expect(backup.content).not.toContain('98765')
    const stored = await s.storage.readStoredVault()
    await expect(s.restoreBackup(backup.content, 'A', 'senha errada')).rejects.toBeTruthy()
    expect(await s.storage.readStoredVault()).toEqual(stored)
    await s.restoreBackup(backup.content, 'A', PASSWORD)
    expect(s.authStore.get().status).toBe('locked')
    await s.login('A', PASSWORD, false)
    expect(s.dataStore.get().profiles.A?.monthlyBudgetCents).toBe(98765)
    expect(s.dataStore.get().couple.couple?.mode).toBe('SOLO')
  })

  it('migra cofre antigo sem decifrar dados antes do login e abre como Casal', async () => {
    const oldData = buildEmpty(new Date('2026-11-20T10:00:00Z'))
    delete oldData.couple.couple!.mode
    delete oldData.profiles.A!.enabledModules
    const created = await createVault({ a: { name: 'Lucas', pronoun: 'ele', password: PASSWORD }, b: { name: 'Marina', pronoun: 'ela' }, data: oldData }, 1000)
    values.set('ampara:vault:v1', JSON.stringify(created.vault))
    const s = await import('./session')
    const { dataStore } = await import('../store/data')
    await s.startAuth()
    expect(s.authStore.get().status).toBe('locked')
    expect(dataStore.get().profiles.B?.displayName).not.toBe('Marina')
    expect(values.has('ampara:vault:v1')).toBe(false)
    await s.login('A', PASSWORD, false)
    expect(dataStore.get().couple.couple?.mode).toBe('COUPLE')
    expect(dataStore.get().profiles.A?.enabledModules).toEqual({ cycle: true, shopping: true, goals: true })
  })

  it('sem IndexedDB usa apenas o cofre cifrado no fallback e não finge lembrar a sessão', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const s = await solo(true)
    expect(s.authStore.get().remembered).toBe(false)
    expect(values.has(s.VAULT_KEY)).toBe(true)
    await s.lock()
    await s.login('A', PASSWORD, true)
    expect(s.authStore.get().status).toBe('unlocked')
    expect(s.authStore.get().remembered).toBe(false)
    await s.wipeDevice(PASSWORD)
    expect(s.authStore.get().status).toBe('setup')
    expect(await s.storage.readStoredVault()).toBeNull()
  })

  it('IndexedDB funciona com localStorage bloqueado e persist rejeitado', async () => {
    const denied = () => { throw new DOMException('Bloqueado', 'SecurityError') }
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied, removeItem: denied })
    persist.mockRejectedValue(new Error('Indisponível'))
    const s = await solo()
    await s.lock()
    await s.login('A', PASSWORD, false)
    await s.wipeDevice(PASSWORD)
    expect(s.authStore.get().status).toBe('setup')
    expect(await s.storage.readStoredVault()).toBeNull()
    await s.flushSaves()
    expect(await s.storage.readStoredVault()).toBeNull()
  })

  it('aviso entre abas atualiza dados cifrados e nunca reabre uma sessão bloqueada', async () => {
    const s = await solo()
    const stored = await s.storage.readStoredVault() as Vault
    const k = await unlockVault(stored, 'A', PASSWORD)
    const data = await readData(stored, k)
    const { writeData } = await import('./vault')
    const next = await writeData(stored, k, { ...data, profiles: { ...data.profiles, A: { ...data.profiles.A!, monthlyBudgetCents: 45000 } } })
    await s.storage.writeStoredVault(next)
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ampara:auth:event', newValue: JSON.stringify({ type: 'updated' }) }))
    await vi.waitFor(() => expect(s.dataStore.get().profiles.A?.monthlyBudgetCents).toBe(45000))
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ampara:auth:event', newValue: JSON.stringify({ type: 'lock' }) }))
    expect(s.authStore.get().status).toBe('locked')
    expect(s.dataStore.get().profiles.A?.monthlyBudgetCents).toBeNull()
  })
})
