import type { AlertActionId, AlertCandidate } from '../../domain/alerts'
import { respondHelp, seeNudge, snoozeDose, takeDose } from '../../store/actions'
import { joinFocus } from '../../store/togetherActions'
import { ui } from '../../store/ui'

/** id da dose: `${medId}@${data}@${hora}` (domain/medication logId) */
function parseLog(ref: string | undefined): [string, string, string] | null {
  if (!ref) return null
  const parts = ref.split('@')
  if (parts.length < 3) return null
  const time = parts.pop()!
  const date = parts.pop()!
  return [parts.join('@'), date, time]
}

/** Os botões do aviso fazem a mesma coisa que os botões da tela (com o Toast de Desfazer de sempre) */
export function runAlertAction(a: AlertCandidate, id: AlertActionId) {
  switch (id) {
    case 'take': {
      const p = parseLog(a.ref)
      if (p) takeDose(...p)
      return
    }
    case 'water': {
      const p = parseLog(a.ref)
      if (p) snoozeDose(...p)
      return
    }
    case 'help-take':
      if (a.ref) respondHelp(a.ref, 'TAKE_OVER')
      return
    case 'help-together':
      if (a.ref) respondHelp(a.ref, 'TOGETHER')
      return
    case 'nudge-seen':
      if (a.ref) seeNudge(a.ref)
      return
    case 'focus-join':
      if (a.ref) joinFocus(a.ref)
      return
    case 'open-today':
      ui.setTab('hoje')
      return
    case 'open-finance':
      ui.setTab('financas')
      return
  }
}
