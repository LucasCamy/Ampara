import { Title } from '../../components/ui'
import { useIsSolo, usePeople } from '../../store/hooks'
import { DatesGiftsSection } from './DatesGiftsSection'
import { FocusSection } from './FocusSection'
import { ComfortSection } from './MoodSection'
import { ShoppingSection } from './ShoppingSection'

/** "Nós": o que é da casa e do casal */
export function UsScreen() {
  const isSolo = useIsSolo()
  const { me } = usePeople()
  return (
    <div data-testid="us-screen">
      <div className="mb-5">
        <Title anchor={isSolo ? 'Seu espaço,' : 'Nós dois,'} rest={isSolo ? 'pequenas coisas que amparam seu dia.' : 'o que é da casa e do casal.'} />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {me.enabledModules?.shopping !== false ? <ShoppingSection /> : null}
          <FocusSection />
          <ComfortSection />
        </div>
        <DatesGiftsSection />
      </div>
    </div>
  )
}
