import { Title } from '../../components/ui'
import { DatesGiftsSection } from './DatesGiftsSection'
import { ComfortSection } from './MoodSection'
import { ShoppingSection } from './ShoppingSection'

/** "Nós": o que é da casa e do casal */
export function UsScreen() {
  return (
    <div data-testid="us-screen">
      <div className="mb-5">
        <Title anchor="Nós dois," rest="o que é da casa e do casal." />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <ShoppingSection />
          <ComfortSection />
        </div>
        <DatesGiftsSection />
      </div>
    </div>
  )
}
