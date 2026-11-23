/**
 * Organizar uma captura com IA (ADR-0004/0005): monta o contrato, chama o provedor, passa tudo pelo
 * validador e só então grava (applyOrganization). Qualquer falha deixa a captura na Caixa de entrada.
 */
import { currentProvider, type AiProvider } from '../ai/provider'
import { ORGANIZER_SCHEMA, ORGANIZER_SYSTEM, ORGANIZER_VERSION, buildOrganizerInput, selectCandidates } from '../domain/ideasPrompt'
import { validateOrganization } from '../domain/ideasValidate'
import { dataStore } from './data'
import { applyOrganization, myIdeaMap } from './ideaActions'
import { uiStore } from './ui'

export interface AiOrganizeResult {
  logId: string
  /** "Saúde › Corrida" das ideias que receberam anotações */
  places: string[]
  inboxCount: number
  rejectedCount: number
}

const pending = new Set<string>()
export const isOrganizing = (captureId: string) => pending.has(captureId)

export async function organizeWithAi(captureId: string, provider: AiProvider | null = currentProvider()): Promise<AiOrganizeResult> {
  if (!provider) throw new Error('Nenhuma IA ligada neste aparelho. Organize à mão ou use o Ampara no PC.')
  if (pending.has(captureId)) throw new Error('Este pensamento já está sendo organizado.')
  const owner = uiStore.get().viewer
  const start = dataStore.get()
  const capture = start.ideaCaptures[captureId]
  if (!capture || capture.ownerId !== owner || capture.status !== 'PENDENTE') throw new Error('Este pensamento já foi organizado.')

  pending.add(captureId)
  try {
    const map = myIdeaMap(start, owner)
    const notes = Object.values(start.ideaNotes).filter((n) => n.ownerId === owner)
    const candidates = selectCandidates(map, notes, capture.text)
    const response = await provider.runStructured({ system: ORGANIZER_SYSTEM, schema: ORGANIZER_SCHEMA, input: buildOrganizerInput(capture.text, { ...map, ideas: candidates }, candidates) })
    // valida contra o mapa ATUAL (a pessoa pode ter mexido enquanto a IA pensava)
    const now = dataStore.get()
    if (uiStore.get().viewer !== owner) throw new Error('A pessoa usando o app mudou. Nada foi gravado.')
    const result = validateOrganization(capture.text, response.json, myIdeaMap(now, owner))
    const logId = applyOrganization(captureId, result, { provider: response.provider, model: response.model, promptVersion: ORGANIZER_VERSION })
    if (!logId) throw new Error('Este pensamento já foi organizado.')

    const after = dataStore.get()
    const places = new Set<string>()
    for (const n of Object.values(after.ideaNotes)) {
      if (n.captureId !== captureId || !n.ideaId) continue
      const idea = after.ideas[n.ideaId]
      const topic = idea ? after.ideaTopics[idea.topicId] : undefined
      const area = topic ? after.ideaAreas[topic.areaId] : undefined
      if (area && topic) places.add(`${area.name} › ${topic.name}`)
    }
    return { logId, places: [...places], inboxCount: result.inbox.length, rejectedCount: result.rejected.length }
  } finally {
    pending.delete(captureId)
  }
}

/** Frase curta para o aviso depois de organizar. */
export function describeAiResult(r: AiOrganizeResult): string {
  if (!r.places.length) return 'A IA não teve certeza. Ficou na Caixa de entrada para você decidir.'
  const where = r.places.length === 1 ? r.places[0] : `${r.places.length} lugares`
  return r.inboxCount ? `Organizei em ${where}. Uma parte ficou na Caixa de entrada.` : `Organizei em ${where}.`
}
