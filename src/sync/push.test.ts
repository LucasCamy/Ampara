import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./cloud', () => ({ cloudRpc: vi.fn() }))

const requestPermission = vi.fn()
const subscription = { getSubscription: vi.fn().mockResolvedValue(null) }

beforeEach(() => {
  vi.resetModules()
  requestPermission.mockReset().mockResolvedValue('denied')
  vi.stubGlobal('window', { PushManager: class {}, Notification: {} })
  vi.stubGlobal('navigator', { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0, serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: subscription }) } })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})

afterEach(() => vi.unstubAllGlobals())

describe('Web Push no iPhone', () => {
  it('pede instalação antes de considerar capabilities do Safari', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla iPhone Safari', serviceWorker: {} })
    const { enablePush, pushSupport } = await import('./push')
    expect(pushSupport()).toBe('needs-install')
    await expect(enablePush()).rejects.toThrow('Tela de Início')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('reconhece iPad com agente de desktop e permite app em standalone', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5, serviceWorker: {} })
    const { pushSupport } = await import('./push')
    expect(pushSupport()).toBe('needs-install')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(pushSupport()).toBe('ok')
  })

  it('a permissão é solicitada imediatamente na chamada do toque, antes de qualquer rede', async () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone Safari', standalone: true, serviceWorker: {} })
    const { enablePush } = await import('./push')
    const enabling = enablePush()
    expect(requestPermission).toHaveBeenCalledTimes(1)
    await expect(enabling).rejects.toThrow('bloqueadas')
  })

  it('preferência de detalhes fica na memória se localStorage bloquear', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    const { pushStore, setShowDetails } = await import('./push')
    expect(pushStore.get().showDetails).toBe(false)
    await setShowDetails(true)
    expect(pushStore.get().showDetails).toBe(true)
  })
})
