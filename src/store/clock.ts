import { createStore, useStore } from './createStore'

/** Relógio de minuto (telas) e de segundo (só contadores regressivos) */
export const minuteClock = createStore<number>(Date.now())
export const secondClock = createStore<number>(Date.now())

let started = false
export function startClocks() {
  if (started) return
  started = true
  setInterval(() => secondClock.set(() => Date.now()), 1000)
  setInterval(() => minuteClock.set(() => Date.now()), 15000)
}

/** Força o relógio a atualizar já (após uma ação) */
export function tickNow() {
  const n = Date.now()
  minuteClock.set(() => n)
  secondClock.set(() => n)
}

export const useNow = () => new Date(useStore(minuteClock, (s) => s))
export const useSecondNow = () => useStore(secondClock, (s) => s)
