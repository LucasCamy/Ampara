import { useRef, useSyncExternalStore } from 'react'

export interface Store<T> {
  get: () => T
  set: (updater: (prev: T) => T) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (updater) => {
      const next = updater(state)
      if (Object.is(next, state)) return
      state = next
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/**
 * Lê uma fatia do store. Só re-renderiza quando a fatia muda (comparação rasa),
 * então abrir uma gaveta no uiStore não re-renderiza listas do dataStore.
 */
export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  const cache = useRef<{ state: T; selector: (s: T) => S; value: S } | null>(null)
  const getSnapshot = () => {
    const state = store.get()
    const c = cache.current
    if (c && Object.is(c.state, state) && c.selector === selector) return c.value
    const value = selector(state)
    if (c && shallowEqual(c.value, value)) {
      cache.current = { state, selector, value: c.value }
      return c.value
    }
    cache.current = { state, selector, value }
    return value
  }
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
