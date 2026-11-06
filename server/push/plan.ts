import { minutesOf } from '../../src/domain/dates'
import { isScheduledOn, logId } from '../../src/domain/medication'
import type { DoseStatus, Medication, PartnerId } from '../../src/domain/types'

/**
 * Decide QUAIS lembretes mandar agora. Função pura (sem banco, sem rede): o worker só busca os dados,
 * chama isto e envia. Usa as mesmas regras de dose do app (dias da semana, pausa da cartela).
 */

export interface PushSub {
  endpoint: string
  coupleId: string
  partnerId: PartnerId
  tz: string
  showDetails: boolean
}

export interface DoseLog {
  id: string
  coupleId: string
  medicationId: string
  status: DoseStatus
  snoozeUntil: string | null
  snoozeCount: number
}

export interface OpenHelp {
  id: string
  coupleId: string
  requesterId: PartnerId
  situation: string
  createdAt: string
}

export interface PlanInput {
  subs: PushSub[]
  /** remédios e rotinas (não excluídos), com o casal */
  meds: (Medication & { coupleId: string })[]
  logs: DoseLog[]
  help: OpenHelp[]
  /** nome de exibição por casal e pessoa */
  names: Record<string, Partial<Record<PartnerId, string>>>
}

export interface PushMessage {
  endpoint: string
  /** chave única: o mesmo lembrete nunca sai duas vezes para o mesmo aparelho */
  key: string
  title: string
  body: string
  /** agrupa no aparelho (uma dose substitui a notificação anterior da mesma dose) */
  tag: string
  url: string
}

/** Janela para mandar o lembrete do horário (cobre o worker parado por alguns minutos) */
export const DUE_WINDOW_MIN = 10
/** Até quanto tempo depois do limite o par ainda é avisado do atraso */
export const LATE_WINDOW_MIN = 60
export const HELP_WINDOW_MIN = 15

/** Data e hora locais no fuso do aparelho */
export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch {
    return localParts(now, 'America/Sao_Paulo')
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

const first = (name: string | undefined, fallback: string) => (name?.trim().split(/\s+/)[0] ?? '') || fallback

export function planNotifications(input: PlanInput, now: Date): PushMessage[] {
  const out: PushMessage[] = []
  const logs = new Map(input.logs.map((l) => [`${l.coupleId}|${l.id}`, l]))
  const resolved = (s: DoseStatus | undefined) => s === 'TAKEN' || s === 'SKIPPED'

  for (const sub of input.subs) {
    const { date, minutes } = localParts(now, sub.tz)
    const partnerName = first(input.names[sub.coupleId]?.[sub.partnerId === 'A' ? 'B' : 'A'], 'Seu par')
    const push = (m: Omit<PushMessage, 'endpoint'>) => out.push({ endpoint: sub.endpoint, ...m, key: `${m.key}|${sub.endpoint}` })

    for (const med of input.meds) {
      if (med.coupleId !== sub.coupleId || !isScheduledOn(med, date)) continue
      const routine = med.kind === 'ROUTINE'
      // remédio: só a dona; rotina: quem é o responsável, ou os dois
      const mine = routine ? !med.assignee || med.assignee === sub.partnerId : med.ownerId === sub.partnerId
      const partnersMed = !routine && med.ownerId !== null && med.ownerId !== sub.partnerId && med.notifyPartnerOnDelay

      for (const time of med.times) {
        const id = logId(med.id, date, time)
        const log = logs.get(`${sub.coupleId}|${id}`)
        if (resolved(log?.status)) continue
        const late = minutes - minutesOf(time)
        const snoozing = log?.status === 'SNOOZED_WATER' && !!log.snoozeUntil && new Date(log.snoozeUntil) > now

        // 1) chegou a hora (para quem toma ou faz)
        if (mine && !snoozing && !log?.snoozeCount && late >= 0 && late <= DUE_WINDOW_MIN) {
          push({
            key: `due:${id}`,
            tag: `dose-${id}`,
            url: '/?quick=med',
            title: routine ? (sub.showDetails ? `Rotina: ${med.name}` : 'Uma rotina da casa está na hora') : sub.showDetails ? `Hora do remédio: ${med.name}` : 'Hora do seu remédio',
            body: sub.showDetails ? `${time} · ${med.dosage}. Já engoliu ou vai pegar água?` : `${time}. Abra o Ampara para confirmar.`,
          })
        }

        // 2) acabou o "pegando água" (5 min) e ainda não confirmou
        if (mine && !routine && log?.status === 'SNOOZED_WATER' && log.snoozeUntil) {
          const over = (now.getTime() - new Date(log.snoozeUntil).getTime()) / 60_000
          if (over >= 0 && over <= DUE_WINDOW_MIN) {
            push({
              key: `snooze:${id}#${log.snoozeCount}`,
              tag: `dose-${id}`,
              url: '/?quick=med',
              title: 'Pegou a água?',
              body: sub.showDetails ? `Hora de confirmar ${med.name}.` : 'Hora de confirmar o remédio.',
            })
          }
        }

        // 3) rede de apoio: o remédio do par passou do limite
        if (partnersMed && !snoozing && late >= med.delayMinutesThreshold && late <= med.delayMinutesThreshold + LATE_WINDOW_MIN) {
          push({
            key: `late:${id}`,
            tag: `late-${id}`,
            url: '/',
            title: 'Rede de apoio',
            body: sub.showDetails
              ? `O remédio das ${time} de ${partnerName} (${med.name}) ainda consta pendente. Um lembrete gentil ajuda.`
              : `Um remédio de ${partnerName} ainda consta pendente.`,
          })
        }
      }
    }

    // 4) pedido de ajuda do par
    for (const h of input.help) {
      if (h.coupleId !== sub.coupleId || h.requesterId === sub.partnerId) continue
      const age = (now.getTime() - new Date(h.createdAt).getTime()) / 60_000
      // tolera relógio do banco um pouco à frente do worker
      if (age < -2 || age > HELP_WINDOW_MIN) continue
      push({
        key: `help:${h.id}`,
        tag: `help-${h.id}`,
        url: '/',
        title: `${partnerName} pediu ajuda`,
        body: sub.showDetails ? h.situation : 'Abra o Ampara para ver.',
      })
    }
  }
  return out
}
