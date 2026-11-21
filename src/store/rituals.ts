import { useEffect, useLayoutEffect, useState } from 'react'
import { readLocalMetadata, writeLocalMetadata } from '../auth/storage'
import { toDateKey } from '../domain/dates'
import { pickRitualWindow, ritualDoneKey, ritualShownKey, RITUAL_WINDOWS, type RitualSchedules, type RitualWindow } from '../domain/rituals'
import type { DateKey, PartnerId } from '../domain/types'
import { createStore, useStore } from './createStore'

/** Apenas chaves de janela e booleanos, sem nomes, saúde ou conteúdo dos rituais. */
export const ritualCompletionsStore = createStore<Record<string, boolean>>({})
export const ritualPresentationsStore = createStore<Record<string, boolean>>({})
const loading = new Map<string, Promise<void>>()

export async function isRitualPresented(scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow): Promise<boolean> {
  const key = ritualShownKey(scope, viewer, date, window)
  if (ritualPresentationsStore.get()[key] === true) return true
  const saved = await readLocalMetadata<unknown>(key)
  const shown = saved === true || ritualPresentationsStore.get()[key] === true
  ritualPresentationsStore.set((current) => ({ ...current, [key]: current[key] === true || shown }))
  return shown
}

export async function isRitualDone(scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow): Promise<boolean> {
  const key = ritualDoneKey(scope, viewer, date, window)
  if (ritualCompletionsStore.get()[key] === true) return true
  const saved = await readLocalMetadata<unknown>(key)
  const done = saved === true || ritualCompletionsStore.get()[key] === true
  ritualCompletionsStore.set((current) => ({ ...current, [key]: current[key] === true || done }))
  return done
}

export async function loadRitualDay(scope: string, viewer: PartnerId, date: DateKey): Promise<void> {
  const key = `${scope}:${viewer}:${date}`
  const pending = loading.get(key)
  if (pending) return pending
  const request = Promise.all(RITUAL_WINDOWS.flatMap((window) => [isRitualDone(scope, viewer, date, window), isRitualPresented(scope, viewer, date, window)])).then(() => undefined).finally(() => loading.delete(key))
  loading.set(key, request)
  return request
}

/** Marca na própria interação; uma leitura iniciada antes dela nunca desfaz o marcador. */
export async function completeRitual(scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow): Promise<void> {
  const key = ritualDoneKey(scope, viewer, date, window)
  ritualCompletionsStore.set((current) => ({ ...current, [key]: true }))
  await writeLocalMetadata(key, true)
}

export interface RitualPresentationLease {
  key: string
  window: RitualWindow
  deliver(): void
  release(): void
}

export interface RitualPresentationOffer {
  accept(owner: symbol): RitualPresentationLease | null
}

interface PreparedPresentation {
  key: string
  window: RitualWindow
  holder: symbol | null
  delivered: boolean
  saved: Promise<boolean>
}

/** Uma preparação não entregue pode passar do effect cancelado para o effect ativo do StrictMode. */
const prepared = new Map<string, PreparedPresentation>()

function offerPresentation(entry: PreparedPresentation): RitualPresentationOffer {
  return {
    accept(owner) {
      if (entry.delivered || (entry.holder && entry.holder !== owner)) return null
      entry.holder = owner
      return {
        key: entry.key,
        window: entry.window,
        deliver() {
          if (entry.holder !== owner || entry.delivered) return
          entry.delivered = true
          prepared.delete(entry.key)
        },
        release() {
          if (!entry.delivered && entry.holder === owner) entry.holder = null
        },
      }
    },
  }
}

/** O marcador confirma no armazenamento antes de conceder a apresentação, inclusive num reload imediato. */
export async function prepareRitualPresentation(scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow): Promise<RitualPresentationOffer | null> {
  const key = ritualShownKey(scope, viewer, date, window)
  const pending = prepared.get(key)
  if (pending) return await pending.saved ? offerPresentation(pending) : null
  const entry: PreparedPresentation = { key, window, holder: null, delivered: false, saved: Promise.resolve(false) }
  const save = async () => {
    if (await isRitualPresented(scope, viewer, date, window)) return false
    await writeLocalMetadata(key, true)
    ritualPresentationsStore.set((current) => ({ ...current, [key]: true }))
    return true
  }
  entry.saved = save().catch(() => false)
  prepared.set(key, entry)
  if (await entry.saved) return offerPresentation(entry)
  prepared.delete(key)
  return null
}

export function useRitualWindow(scope: string, viewer: PartnerId, now: Date, schedules: RitualSchedules): RitualWindow | null {
  const date = toDateKey(now)
  const values = useStore(ritualCompletionsStore, (state) => RITUAL_WINDOWS.map((window) => state[ritualDoneKey(scope, viewer, date, window)]))
  const shown = useStore(ritualPresentationsStore, (state) => RITUAL_WINDOWS.map((window) => state[ritualShownKey(scope, viewer, date, window)]))
  const [owner] = useState(() => Symbol('ritual-presentation'))
  const [lease, setLease] = useState<RitualPresentationLease | null>(null)
  const ready = !values.some((value) => value === undefined) && !shown.some((value) => value === undefined)
  const done = new Set(RITUAL_WINDOWS.filter((_, index) => values[index] === true))
  const candidate = ready ? pickRitualWindow(schedules, now, done) : null
  const candidateKey = candidate ? ritualShownKey(scope, viewer, date, candidate) : null
  useEffect(() => {
    const refresh = () => { void loadRitualDay(scope, viewer, date) }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [scope, viewer, date])
  useEffect(() => {
    if (!candidate) return
    let active = true
    let held: RitualPresentationLease | null = null
    void prepareRitualPresentation(scope, viewer, date, candidate).then((offer) => {
      if (!active || !offer) return
      held = offer.accept(owner)
      if (held) setLease(held)
    })
    return () => { active = false; held?.release() }
  }, [scope, viewer, date, candidate, owner])
  useLayoutEffect(() => {
    if (lease?.key === candidateKey) lease.deliver()
  }, [lease, candidateKey])
  return lease?.key === candidateKey ? lease.window : null
}
