import { BookOpen } from 'lucide-react'
import { ChoiceChips, SectionHeader, Switch } from '../../components/ui'
import { ui, useUi, type ReadingFont } from '../../store/ui'

export function ReadingSection() {
  const font = useUi((s) => s.readingFont)
  const comfort = useUi((s) => s.readingComfort)
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="leitura" data-testid="reading-section">
      <SectionHeader id="leitura" title="Leitura do seu jeito" />
      <p className="mb-4 text-[14px] text-muted">Experimente a fonte e o espaçamento que deixam a leitura mais confortável para você. A escolha fica neste aparelho.</p>
      <ChoiceChips<ReadingFont>
        label="Fonte da interface"
        stack
        value={font}
        onChange={ui.setReadingFont}
        options={[
          { value: 'jakarta', label: 'Plus Jakarta Sans', hint: 'Fonte padrão do Ampara', testId: 'reading-font-jakarta' },
          { value: 'lexend', label: 'Lexend', hint: 'Formas abertas e mais espaço', testId: 'reading-font-lexend' },
          { value: 'atkinson', label: 'Atkinson Hyperlegible', hint: 'Letras com formas distintas', testId: 'reading-font-atkinson' },
        ]}
      />
      <div className="mt-4">
        <Switch
          label="Leitura ampla"
          description="Mais espaço entre linhas, letras e palavras."
          checked={comfort === 'wide'}
          onChange={(wide) => ui.setReadingComfort(wide ? 'wide' : 'default')}
          testId="reading-wide"
        />
      </div>
      <div className="mt-4 rounded-[18px] border border-line bg-subtle p-4" data-testid="reading-preview" aria-label="Prévia da leitura">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-muted"><BookOpen size={17} aria-hidden /> Prévia</p>
        <h3 className="mt-2 text-[18px] font-bold tracking-tight text-ink">Uma coisa de cada vez.</h3>
        <p className="mt-2 text-[15px] text-ink">O próximo passo pode ser pequeno. Há espaço para respirar e começar no seu ritmo.</p>
        <p className="font-data mt-3 text-[13px] text-muted">1 tarefa sua · hoje</p>
      </div>
    </section>
  )
}
