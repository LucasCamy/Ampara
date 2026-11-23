import { Maximize2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { desktopBridge } from '../../ai/provider'
import { CaptureBox } from './CaptureBox'

/**
 * Painel da bolinha no PC (ADR-0008): só o campo "O que está na sua cabeça?". Uma coisa por vez.
 * O resultado da IA aparece no aviso de sempre, com Desfazer.
 */
export function CompactCapture() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-4 p-4" data-testid="compact-capture">
      <p className="text-[20px] font-extrabold tracking-tight text-ink">
        Ampara<span className="text-action">.</span>
      </p>
      <CaptureBox />
      <Button variant="secondary" icon={Maximize2} onClick={() => desktopBridge()?.openFull?.()} data-testid="compact-open-full">
        Abrir o Ampara completo
      </Button>
    </main>
  )
}
