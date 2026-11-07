import { BellOff, BellRing, Share, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, FieldError, SectionHeader, StatusBadge, Switch } from '../../components/ui'
import { ui } from '../../store/ui'
import { useCloud } from '../../sync/cloud'
import { disablePush, enablePush, permission, pushSupport, refreshPushState, setShowDetails, usePush } from '../../sync/push'

/** Ajustes: lembretes com a tela bloqueada (remédio na hora, "pegou a água?", atraso do par e pedido de ajuda) */
export function NotificationsSection() {
  const cloud = useCloud((s) => s.status)
  const { subscribed, showDetails, busy } = usePush((s) => s)
  const [error, setError] = useState<string>()
  const support = pushSupport()

  useEffect(() => {
    void refreshPushState()
  }, [])

  const run = async (fn: () => Promise<void>, done?: string) => {
    setError(undefined)
    try {
      await fn()
      if (done) ui.toast(done)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.')
    }
  }

  const connected = cloud === 'connected'
  const denied = permission() === 'denied'

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="lembretes" data-testid="push-section">
      <SectionHeader id="lembretes" title="Lembretes no celular" rest="· mesmo com a tela bloqueada" />
      <p className="text-[14px] text-muted">
        Remédio na hora, “pegou a água?” depois de 5 min, aviso quando o remédio do par atrasa (rede de apoio) e pedido de ajuda.
      </p>

      {support === 'needs-install' ? (
        <div className="mt-3 flex items-start gap-2 rounded-[16px] bg-subtle p-3 text-[14px] text-ink" data-testid="push-needs-install">
          <Share size={18} aria-hidden className="mt-0.5 shrink-0 text-action" />
          <p>
            No iPhone os lembretes só funcionam com o Ampara na Tela de Início: toque em <strong>Compartilhar</strong> e em{' '}
            <strong>Adicionar à Tela de Início</strong>, abra por lá e volte aqui.
          </p>
        </div>
      ) : support === 'unsupported' ? (
        <p className="mt-3 text-[14px] text-muted" data-testid="push-unsupported">
          Este navegador não recebe notificações. Use o Chrome, o Edge ou o Safari (iPhone com o app na Tela de Início).
        </p>
      ) : !connected ? (
        <p className="mt-3 flex items-start gap-2 text-[14px] text-muted" data-testid="push-needs-cloud">
          <Smartphone size={18} aria-hidden className="mt-0.5 shrink-0" /> Conecte a nuvem acima: é o servidor que avisa na hora, mesmo com o app fechado.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {subscribed ? (
              <StatusBadge kind="ok">Ativo neste aparelho</StatusBadge>
            ) : (
              <StatusBadge kind="pending">{denied ? 'Bloqueado no navegador' : 'Desligado neste aparelho'}</StatusBadge>
            )}
          </div>
          {subscribed ? (
            <>
              <Switch
                checked={showDetails}
                onChange={(v) => void run(() => setShowDetails(v))}
                testId="push-details"
                label="Mostrar o nome do remédio"
                description="Desligado, a tela bloqueada diz só “Hora do seu remédio”. Quem pegar o celular não vê o que você toma."
              />
              <Button variant="secondary" icon={BellOff} busy={busy} onClick={() => void run(disablePush, 'Lembretes desligados neste aparelho')} data-testid="push-disable" className="self-start">
                Desligar neste aparelho
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={BellRing} busy={busy} onClick={() => void run(enablePush, 'Lembretes ativados neste aparelho')} data-testid="push-enable" className="self-start">
              {busy ? 'Ativando...' : 'Ativar lembretes'}
            </Button>
          )}
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
      )}
    </section>
  )
}
