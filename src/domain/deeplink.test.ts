import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deeplink'

describe('destino ao abrir o app', () => {
  it('notificação de remédio abre a confirmação', () => {
    expect(parseDeepLink('/?quick=med')).toEqual({ tab: null, quick: 'med', params: {} })
  })
  it('aba pelo hash', () => {
    expect(parseDeepLink('/#/hoje')).toEqual({ tab: 'hoje', quick: null, params: {} })
    expect(parseDeepLink('/#/rotinas')?.tab).toBe('rotinas')
  })
  it('gaveta com valores pré-preenchidos, limitados', () => {
    expect(parseDeepLink('/?quick=expense&amount=12,50&title=Padaria')).toEqual({ tab: null, quick: 'expense', params: { amount: '12,50', title: 'Padaria' } })
    expect(parseDeepLink(`/?quick=task&title=${'x'.repeat(200)}`)?.params.title).toHaveLength(80)
  })
  it('destino desconhecido não faz nada', () => {
    expect(parseDeepLink('/?quick=apagar-tudo')).toBeNull()
    expect(parseDeepLink('/#/admin')).toBeNull()
    expect(parseDeepLink('/')).toBeNull()
  })
})
