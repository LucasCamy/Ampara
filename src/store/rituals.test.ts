import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLocalMetadata } from '../auth/storage'
import { ritualDoneKey, ritualShownKey } from '../domain/rituals'
import { completeRitual, isRitualDone, isRitualPresented, loadRitualDay, prepareRitualPresentation, ritualCompletionsStore, ritualPresentationsStore } from './rituals'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } })
  ritualCompletionsStore.set(() => ({}))
  ritualPresentationsStore.set(() => ({}))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('marcadores de ritual por aparelho', () => {
  it('guarda somente o booleano em kv e não repete após recarregar a memória', async () => {
    await completeRitual('space-one', 'A', '2026-11-21', 'morning')
    const key = ritualDoneKey('space-one', 'A', '2026-11-21', 'morning')
    expect(await readLocalMetadata(key)).toBe(true)
    ritualCompletionsStore.set(() => ({}))
    expect(await isRitualDone('space-one', 'A', '2026-11-21', 'morning')).toBe(true)
    expect(await isRitualDone('space-one', 'A', '2026-11-22', 'morning')).toBe(false)
    expect(await isRitualDone('space-one', 'B', '2026-11-21', 'morning')).toBe(false)
    expect(await isRitualDone('space-two', 'A', '2026-11-21', 'morning')).toBe(false)
  })

  it('uma leitura assíncrona anterior nunca desfaz uma conclusão ocorrida enquanto ela aguardava', async () => {
    const pendingRead = loadRitualDay('space-one', 'A', '2026-11-21')
    const completing = completeRitual('space-one', 'A', '2026-11-21', 'morning')
    await Promise.all([pendingRead, completing])
    expect(ritualCompletionsStore.get()[ritualDoneKey('space-one', 'A', '2026-11-21', 'morning')]).toBe(true)
    expect(await isRitualDone('space-one', 'A', '2026-11-21', 'afternoon')).toBe(false)
  })

  it('confirma apresentação no IDB antes de conceder a lease e não repete após ignorar e recarregar', async () => {
    const offer = await prepareRitualPresentation('presentation', 'A', '2026-11-21', 'morning')
    expect(offer).not.toBeNull()
    expect(await readLocalMetadata(ritualShownKey('presentation', 'A', '2026-11-21', 'morning'))).toBe(true)
    const lease = offer!.accept(Symbol('first-mount'))!
    lease.deliver()
    // A apresentação continua com a instância atual mesmo sem resposta; não marca o ritual como concluído.
    expect(lease.window).toBe('morning')
    expect(await isRitualDone('presentation', 'A', '2026-11-21', 'morning')).toBe(false)
    ritualPresentationsStore.set(() => ({}))
    expect(await isRitualPresented('presentation', 'A', '2026-11-21', 'morning')).toBe(true)
    expect(await isRitualPresented('presentation', 'B', '2026-11-21', 'morning')).toBe(false)
    expect(await isRitualPresented('another-space', 'A', '2026-11-21', 'morning')).toBe(false)
    expect(await prepareRitualPresentation('presentation', 'A', '2026-11-21', 'morning')).toBeNull()
  })

  it('permite apresentar a próxima janela e o próximo dia após ignorar uma manhã', async () => {
    const morning = await prepareRitualPresentation('next-window', 'A', '2026-11-21', 'morning')
    morning!.accept(Symbol('morning'))!.deliver()
    const afternoon = await prepareRitualPresentation('next-window', 'A', '2026-11-21', 'afternoon')
    expect(afternoon).not.toBeNull()
    afternoon!.accept(Symbol('afternoon'))!.deliver()
    const tomorrow = await prepareRitualPresentation('next-window', 'A', '2026-11-22', 'morning')
    expect(tomorrow).not.toBeNull()
    tomorrow!.accept(Symbol('tomorrow'))!.deliver()
  })

  it('transfere a preparação de um effect cancelado para o effect ativo no StrictMode sem consumir cedo', async () => {
    const canceledEffect = prepareRitualPresentation('strict-mode', 'A', '2026-11-21', 'morning')
    const activeEffect = prepareRitualPresentation('strict-mode', 'A', '2026-11-21', 'morning')
    const [canceledOffer, activeOffer] = await Promise.all([canceledEffect, activeEffect])
    // O effect cancelado não chama accept. O marcador já confirmado pode ser entregue ao effect ativo.
    const lease = activeOffer!.accept(Symbol('active-effect'))
    expect(lease).not.toBeNull()
    lease!.deliver()
    expect(canceledOffer!.accept(Symbol('late-canceled-effect'))).toBeNull()
    expect(await prepareRitualPresentation('strict-mode', 'A', '2026-11-21', 'morning')).toBeNull()
  })

  it('libera uma lease ainda não exibida e impede duas instâncias de apresentarem simultaneamente', async () => {
    const offer = await prepareRitualPresentation('released', 'A', '2026-11-21', 'morning')
    const first = offer!.accept(Symbol('canceled-render'))!
    expect(offer!.accept(Symbol('another-mount'))).toBeNull()
    first.release()
    const nextOffer = await prepareRitualPresentation('released', 'A', '2026-11-21', 'morning')
    const replacement = nextOffer!.accept(Symbol('current-render'))
    expect(replacement).not.toBeNull()
    replacement!.deliver()
  })

  it('não concede apresentação quando nenhum armazenamento consegue confirmar o marcador', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Sem espaço', 'QuotaExceededError') })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Bloqueado', 'SecurityError') })
    expect(await prepareRitualPresentation('storage-error', 'A', '2026-11-21', 'morning')).toBeNull()
    expect(ritualPresentationsStore.get()[ritualShownKey('storage-error', 'A', '2026-11-21', 'morning')]).not.toBe(true)
  })
})
