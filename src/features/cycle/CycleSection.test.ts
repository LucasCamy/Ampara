import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCycleSettings } from '../../domain/cycle'
import { buildEmpty } from '../../domain/seed'
import { otherPartner, type PartnerId } from '../../domain/types'

vi.mock('../../store/ui', async () => {
  const { createStore, useStore } = await import('../../store/createStore')
  const store = createStore({ viewer: 'A' as PartnerId })
  return {
    uiStore: store,
    useUi: <S>(selector: (state: { viewer: PartnerId }) => S) => useStore(store, selector),
    ui: { toast: vi.fn(), openSheet: vi.fn() },
  }
})

const { dataStore } = await import('../../store/data')
const { minuteClock } = await import('../../store/clock')
const { uiStore } = await import('../../store/ui')
const { CycleSection, CycleTodayCards } = await import('./CycleSection')
const now = new Date('2026-11-21T12:00:00Z')

beforeEach(() => {
  minuteClock.set(() => now.getTime())
})

describe('ciclo após preservar o espaço no modo Solo', () => {
  it.each(['A', 'B'] as const)('dono %s vê apenas o próprio ciclo, sem aviso nem controle do perfil ausente', (viewer) => {
    const partner = otherPartner(viewer)
    uiStore.set((state) => ({ ...state, viewer }))
    const state = buildEmpty(now, 'SOLO', viewer)
    state.cycleSettings[partner] = { ...defaultCycleSettings(partner, ''), share: 'FULL' }
    state.cycleLogs.partner = { id: 'partner', ownerId: partner, startDate: '2026-10-26', endDate: '2026-10-30', updatedAt: '' }
    dataStore.set(() => state)
    const intro = renderToStaticMarkup(createElement(CycleSection))
    expect(intro).toContain('data-testid="cycle-intro"')
    expect(intro).not.toContain('data-testid="partner-cycle"')
    expect(intro).not.toContain('data-testid="period-row"')
    expect(renderToStaticMarkup(createElement(CycleTodayCards))).toBe('')

    dataStore.set((current) => ({
      ...current,
      profiles: { ...current.profiles, [viewer]: { ...current.profiles[viewer]!, energy: 'FULL' } },
      cycleSettings: { ...current.cycleSettings, [viewer]: defaultCycleSettings(viewer, '') },
      cycleLogs: { ...current.cycleLogs, own: { id: 'own', ownerId: viewer, startDate: '2026-11-20', endDate: null, updatedAt: '' } },
    }))
    const mine = renderToStaticMarkup(createElement(CycleSection))
    expect(mine).toContain('data-testid="period-row"')
    expect(mine).toContain('20/11')
    expect(mine).not.toContain('26/10')
    expect(mine).not.toContain('data-testid="cycle-share-FULL"')
    const today = renderToStaticMarkup(createElement(CycleTodayCards))
    expect(today).toContain('data-testid="cycle-suggest"')
    expect(today).not.toContain('data-testid="partner-cycle-warn"')

    dataStore.set((current) => ({ ...current, couple: { couple: { ...current.couple.couple!, mode: 'COUPLE', soloOwnerId: null } } }))
    expect(renderToStaticMarkup(createElement(CycleTodayCards))).toContain('data-testid="partner-cycle-warn"')
  })
})
