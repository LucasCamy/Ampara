import { describe, expect, it } from 'vitest'
import { checkinId, checkinOf, comfortOf, MAX_COMFORT, needsComfort, validateComfort } from './mood'
import type { ComfortItem } from './types'

const c = (id: string, ownerId: 'A' | 'B', text = id): ComfortItem => ({ id, ownerId, text, createdAt: id, updatedAt: '' })

describe('check-in e o que me acalma', () => {
  it('um check-in por pessoa por dia', () => {
    const all = { [checkinId('B', '2026-11-06')]: { id: 'B@2026-11-06', ownerId: 'B' as const, date: '2026-11-06', mood: 'NEED_CARE' as const, note: '', updatedAt: '' } }
    expect(checkinOf(all, 'B', '2026-11-06')?.mood).toBe('NEED_CARE')
    expect(checkinOf(all, 'A', '2026-11-06')).toBeUndefined()
    expect(checkinOf(all, 'B', '2026-11-05')).toBeUndefined()
  })

  it('a lista aparece para o par só nos dias difíceis', () => {
    expect(needsComfort('NEED_CARE')).toBe(true)
    expect(needsComfort('OVERWHELMED')).toBe(true)
    expect(needsComfort('GOOD')).toBe(false)
    expect(needsComfort('NEED_SPACE')).toBe(false)
  })

  it('lista de cada um, em ordem, sem repetir e com limite', () => {
    const all = [c('2', 'B'), c('1', 'B'), c('3', 'A')]
    expect(comfortOf(all, 'B').map((x) => x.id)).toEqual(['1', '2'])
    expect(validateComfort('oi', [])).toMatch(/Escreva/)
    expect(validateComfort('Chá de camomila', [c('1', 'B', 'chá de camomila')])).toMatch(/já está/)
    expect(validateComfort('Abraço', Array.from({ length: MAX_COMFORT }, (_, i) => c(String(i), 'B')))).toMatch(/No máximo/)
    expect(validateComfort('Abraço apertado', [])).toBeUndefined()
  })
})
