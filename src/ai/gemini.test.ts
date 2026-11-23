import { describe, expect, it, vi } from 'vitest'
import { ORGANIZER_SCHEMA, ORGANIZER_SYSTEM } from '../domain/ideasPrompt'
import { geminiProvider } from './gemini'

const request = {
  system: ORGANIZER_SYSTEM,
  schema: ORGANIZER_SCHEMA,
  input: '{"captura":"quero testar a horta"}',
}
const credential = async () => ({ secret: 'chave-ficticia-do-teste' })

describe('Gemini com saída estruturada', () => {
  it('envia o contrato pelo corpo e a chave pelo cabeçalho, preservando enums anuláveis', async () => {
    const result = { versao: 'organizador@1', operacoes: [] }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      modelVersion: 'gemini-3.1-flash-lite',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'rascunho' }, { text: JSON.stringify(result) }] } }],
    }))
    await expect(geminiProvider(credential, fetchImpl).runStructured(request)).resolves.toEqual({
      provider: 'gemini', model: 'gemini-3.1-flash-lite', json: result,
    })
    const [url, options] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
    expect(options).toMatchObject({
      headers: { 'x-goog-api-key': 'chave-ficticia-do-teste' },
      redirect: 'error',
      credentials: 'omit',
    })
    expect(options!.body).not.toContain('chave-ficticia-do-teste')
    const payload = JSON.parse(String(options!.body))
    expect(payload.systemInstruction.parts[0].text).toBe(ORGANIZER_SYSTEM)
    expect(payload.contents[0].parts[0].text).toBe(request.input)
    expect(payload.generationConfig.responseMimeType).toBe('application/json')
    expect(payload.generationConfig.responseJsonSchema.properties.operacoes.maxItems).toBeUndefined()
    expect(ORGANIZER_SCHEMA.properties.operacoes.maxItems).toBe(50)
    const fields = payload.generationConfig.responseJsonSchema.properties.operacoes.items
    expect(fields.required).toEqual(ORGANIZER_SCHEMA.properties.operacoes.items.required)
    expect(fields.properties.natureza.anyOf).toEqual([
      { type: 'string', enum: ORGANIZER_SCHEMA.properties.operacoes.items.properties.natureza.enum.filter((value) => value !== null) },
      { type: 'null' },
    ])
    expect(fields.properties.tipo).toEqual(ORGANIZER_SCHEMA.properties.operacoes.items.properties.tipo)
  })

  it('impede chamada após bloqueio e não expõe o erro bruto da API', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      error: { message: 'chave-ficticia-do-teste' },
    }, { status: 429 }))
    const ctrl = new AbortController()
    ctrl.abort()
    const locked = geminiProvider(async () => ({ secret: 'chave-ficticia-do-teste', signal: ctrl.signal }), fetchImpl)
    await expect(locked.runStructured(request)).rejects.toThrow('Desbloqueie o cofre')
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(geminiProvider(credential, fetchImpl).runStructured(request)).rejects.toThrow('O Gemini atingiu o limite do projeto.')
  })

  it('entrega uma resposta truncada ao mecanismo de nova tentativa do organizador', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"versao":' }] } }],
    }))
    await expect(geminiProvider(credential, fetchImpl).runStructured(request)).resolves.toMatchObject({ json: null })
  })
})
