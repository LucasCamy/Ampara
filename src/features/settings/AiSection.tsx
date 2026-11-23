import { CircleCheck, CircleDashed, RefreshCw, SquareX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ChoiceChips, SectionHeader, StatusBadge } from '../../components/ui'
import { LOCAL_AI_MODEL, LOCAL_AI_URL, aiChoice, desktopBridge, localAiStatus, setAiChoice, type AiChoice } from '../../ai/provider'
import { ui } from '../../store/ui'

/**
 * Qual IA este aparelho usa (ADR-0010). Automático: a IA local do seu PC pela rede Tailscale (grátis, no PC e
 * no celular); sem ela, o Claude pela assinatura no app do PC. A escolha fica só neste aparelho.
 */
export function AiSection() {
  const [choice, setChoice] = useState<AiChoice>(aiChoice)
  const [status, setStatus] = useState<'checking' | 'ok' | 'down' | 'none'>(LOCAL_AI_URL ? 'checking' : 'none')
  const [loaded, setLoaded] = useState(false)
  const hasClaude = !!desktopBridge()

  const check = () => {
    if (!LOCAL_AI_URL) return
    setStatus('checking')
    void localAiStatus().then((s) => {
      setStatus(s.ok ? 'ok' : 'down')
      setLoaded(s.models.includes(LOCAL_AI_MODEL))
    })
  }
  useEffect(check, [])

  const options: { value: AiChoice; label: string; hint: string; testId: string }[] = [
    { value: 'auto', label: 'Automático', hint: 'IA local quando houver; senão, Claude no PC.', testId: 'ai-auto' },
    ...(LOCAL_AI_URL ? [{ value: 'local' as const, label: 'IA local (grátis)', hint: 'Roda no seu PC. Mais lenta.', testId: 'ai-local' }] : []),
    ...(hasClaude ? [{ value: 'claude' as const, label: 'Claude (assinatura)', hint: 'Só no app do PC. Mais rápido.', testId: 'ai-claude' }] : []),
    { value: 'off', label: 'Sem IA', hint: 'Você organiza à mão.', testId: 'ai-off' },
  ]

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="ia" data-testid="ai-section">
      <SectionHeader id="ia" title="Inteligência artificial" />
      <p className="mb-4 text-[14px] text-muted">Organiza pensamentos, sugere ações e responde perguntas sobre as suas ideias. O que ela propõe sempre passa pela conferência do app.</p>

      <div className="mb-4 flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">IA local no seu PC</span>
        {status === 'none' ? (
          <StatusBadge kind="skipped">Não configurada neste app</StatusBadge>
        ) : status === 'checking' ? (
          <StatusBadge kind="pending">Verificando…</StatusBadge>
        ) : status === 'ok' ? (
          <StatusBadge kind="ok">{loaded ? 'Conectada e pronta' : 'Conectada; o modelo carrega no primeiro uso'}</StatusBadge>
        ) : (
          <StatusBadge kind="late">Não respondeu</StatusBadge>
        )}
        {status === 'down' ? <p className="text-[13px] text-muted">Confira se o PC está ligado e se o Tailscale está conectado neste aparelho.</p> : null}
        {LOCAL_AI_URL ? <Button size="sm" variant="secondary" icon={RefreshCw} onClick={check} className="self-start" data-testid="ai-check">Verificar de novo</Button> : null}
      </div>

      <ChoiceChips<AiChoice>
        label="Qual IA usar neste aparelho"
        value={choice}
        onChange={(v) => {
          setChoice(v)
          setAiChoice(v)
          ui.toast(v === 'off' ? 'IA desligada neste aparelho' : 'Escolha da IA salva neste aparelho', { tone: 'info' })
        }}
        options={options.map((o) => ({ value: o.value, label: o.label, hint: o.hint, testId: o.testId, icon: o.value === 'off' ? SquareX : o.value === 'auto' ? CircleDashed : CircleCheck }))}
        cols={1}
      />
    </section>
  )
}
