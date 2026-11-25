import { CircleCheck, CircleDashed, RefreshCw, SquareX } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, ChoiceChips, FieldError, SectionHeader, StatusBadge } from '../../components/ui'
import { LOCAL_AI_MODEL, LOCAL_AI_URL, aiChoice, desktopBridge, localAiStatus, setAiChoice, type AiChoice } from '../../ai/provider'
import { useAuth, writeGeminiSecret } from '../../auth/session'
import { AuthError } from '../../auth/vault'
import { ui } from '../../store/ui'
import { Field } from './CloudSection'

function GeminiSettings({ reserve = false }: { reserve?: boolean }) {
  const ready = useAuth((s) => s.geminiReady)
  const saved = useAuth((s) => !!s.who && !!s.people?.[s.who].gemini)
  const [apiKey, setApiKey] = useState('')
  const [password, setPassword] = useState('')
  const [keyError, setKeyError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (secret: string | null) => {
    setKeyError('')
    setPasswordError('')
    setFormError('')
    if (secret !== null && !/^[\w.-]{16,256}$/.test(secret)) {
      setKeyError('Cole a chave de API do Google AI Studio.')
      return
    }
    if (!password) {
      setPasswordError('Confirme sua senha do Ampara.')
      return
    }
    setBusy(true)
    try {
      await writeGeminiSecret(secret, password)
      setApiKey('')
      setPassword('')
      ui.toast(secret ? 'Chave do Gemini salva no seu cofre' : 'Chave do Gemini removida', { tone: 'info' })
    } catch (error) {
      if (error instanceof AuthError) setPasswordError(error.message)
      else setFormError('Não foi possível guardar a alteração no cofre. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save(apiKey.trim())
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4" aria-label="Configurar Gemini" noValidate>
      {reserve ? <p className="text-[14px] font-semibold text-ink">Reserva para quando o PC estiver desligado (opcional).</p> : null}
      <p className="text-[14px] text-muted">
        Com o Gemini ligado, o Ampara envia novas capturas e o contexto necessário das suas ideias ao Google quando usa a IA.
        No plano gratuito, o Google pode usar esse conteúdo. Para pensamentos reais, use uma chave paga.
      </p>
      <p className="text-[14px] text-muted">
        Sua chave fica no seu cofre neste aparelho. A cota e o faturamento dependem do projeto da chave.
      </p>
      <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" className="inline-flex min-h-11 self-start items-center font-semibold text-ink underline underline-offset-4">
        Abrir Google AI Studio
      </a>
      <StatusBadge kind={ready ? 'ok' : 'pending'}>{ready ? 'Chave disponível' : saved ? 'Entre de novo para usar a chave' : 'Chave necessária'}</StatusBadge>
      <Field label="Chave de API do Gemini" type="password" value={apiKey} maxLength={256} onChange={(value) => {
        setApiKey(value)
        setKeyError('')
      }} autoComplete="off" testId="gemini-key" error={keyError} />
      <Field label="Sua senha do Ampara" type="password" value={password} onChange={(value) => {
        setPassword(value)
        setPasswordError('')
      }} autoComplete="current-password" testId="gemini-password" error={passwordError} />
      {formError ? <FieldError>{formError}</FieldError> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy} data-testid="gemini-save">Salvar chave</Button>
        {saved ? <Button variant="secondary" disabled={busy} onClick={() => void save(null)} data-testid="gemini-remove">Remover chave</Button> : null}
      </div>
    </form>
  )
}

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
    { value: 'auto', label: 'Automático', hint: 'IA local primeiro. Se o PC não responder, Gemini (com chave) e depois Claude no PC.', testId: 'ai-auto' },
    ...(LOCAL_AI_URL ? [{ value: 'local' as const, label: 'IA local (grátis)', hint: 'Roda no seu PC. Mais lenta.', testId: 'ai-local' }] : []),
    ...(hasClaude ? [{ value: 'claude' as const, label: 'Claude (assinatura)', hint: 'Só no app do PC. Mais rápido.', testId: 'ai-claude' }] : []),
    { value: 'gemini', label: 'Gemini 3.1 Flash-Lite', hint: 'Usa sua chave do Google e precisa de internet.', testId: 'ai-gemini' },
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
        label="Qual IA você quer usar neste aparelho"
        value={choice}
        onChange={(v) => {
          setChoice(v)
          setAiChoice(v)
          ui.toast(v === 'off' ? 'IA desligada neste aparelho' : 'Escolha da IA salva neste aparelho', { tone: 'info' })
        }}
        options={options.map((o) => ({ value: o.value, label: o.label, hint: o.hint, testId: o.testId, icon: o.value === 'off' ? SquareX : o.value === 'auto' ? CircleDashed : CircleCheck }))}
        cols={1}
      />
      {choice === 'gemini' || choice === 'auto' ? <GeminiSettings reserve={choice === 'auto'} /> : null}
    </section>
  )
}
