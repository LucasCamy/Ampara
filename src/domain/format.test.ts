import { describe, expect, it } from 'vitest'
import { describeBalance } from './finance'
import { firstName } from './format'

describe('firstName', () => {
  it('tira o primeiro nome de um cadastro completo', () => {
    expect(firstName('Julia Aparecida Belizario')).toBe('Julia')
    expect(firstName('  Lucas   Camy Leite ')).toBe('Lucas')
  })
  it('mantém nome único e lida com vazio', () => {
    expect(firstName('Lucas')).toBe('Lucas')
    expect(firstName('')).toBe('')
    expect(firstName(undefined)).toBe('')
  })
  it('o acerto do mês usa o primeiro nome', () => {
    const profiles = { A: { displayName: 'Lucas Camy Leite' }, B: { displayName: 'Julia Aparecida Belizario' } }
    expect(describeBalance(-11000, 'A', profiles, 'novembro')).toMatch(/para Julia para zerar novembro$/)
  })
})
