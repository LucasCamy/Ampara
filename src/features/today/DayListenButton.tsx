import { Square, Volume2 } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import type { DataState, PartnerId } from '../../domain/types'
import { buildDaySpeechSummary } from '../../domain/today'
import { canSpeak, isSpeaking, onSpeakingChange, speakText, stopSpeaking } from '../voice/speech'

/** O speak acontece na própria pilha do toque, como o Safari instalado precisa. */
export function DayListenButton({ state, viewer, now, testId = 'listen-day' }: { state: DataState; viewer: PartnerId; now: Date; testId?: string }) {
  const speaking = useSyncExternalStore(onSpeakingChange, isSpeaking, () => false)
  useEffect(() => () => stopSpeaking(), [])
  if (!canSpeak()) return null
  return <Button size="sm" variant="quiet" icon={speaking ? Square : Volume2} data-testid={testId} onClick={() => speaking ? stopSpeaking() : speakText(buildDaySpeechSummary(state, viewer, now))}>{speaking ? 'Parar' : 'Ouvir meu dia'}</Button>
}
