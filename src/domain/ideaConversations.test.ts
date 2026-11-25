import { describe, expect, it } from 'vitest'
import { chatInput, conversationTitle, parseChatReply, transcriptForCapture } from './ideaConversations'
import { IDEA_LIMITS, type ConversationMessage } from './ideas'

const m = (role: 'PESSOA' | 'IA', text: string): ConversationMessage => ({ role, text })

describe('conversas', () => {
  it('título vem das primeiras palavras da pessoa', () => {
    expect(conversationTitle([m('IA', 'oi'), m('PESSOA', 'quero organizar a mudança de casa para dezembro com calma')])).toBe('Quero organizar a mudança de casa para')
    expect(conversationTitle([])).toBe('Conversa')
  })

  it('a transcrição marca quem falou e cabe no limite de uma captura', () => {
    expect(transcriptForCapture([m('PESSOA', 'oi'), m('IA', 'olá')])).toBe('Eu: oi Ampara: olá')
    const long = Array.from({ length: 40 }, (_, i) => m(i % 2 ? 'IA' : 'PESSOA', `fala ${i} ${'x'.repeat(500)}`))
    const t = transcriptForCapture(long)
    expect(t.length).toBeLessThanOrEqual(IDEA_LIMITS.captureMaxChars)
    expect(t).toContain('fala 39')
    expect(t).not.toContain('fala 0 ')
  })

  it('a entrada para a IA leva só as últimas falas', () => {
    const many = Array.from({ length: 30 }, (_, i) => m('PESSOA', `n${i}`))
    expect(chatInput(many).split('\n\n')).toHaveLength(12)
  })

  it('só aceita resposta no formato combinado', () => {
    expect(parseChatReply({ resposta: ' Certo. ' })).toBe('Certo.')
    expect(parseChatReply({ resposta: '' })).toBeNull()
    expect(parseChatReply({ outra: 'x' })).toBeNull()
    expect(parseChatReply(null)).toBeNull()
  })
})
