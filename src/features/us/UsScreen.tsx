import { Title } from '../../components/ui'
import { DatesGiftsSection } from './DatesGiftsSection'
import { ShoppingSection } from './ShoppingSection'

/** "Nós": o que é da casa e do casal */
export function UsScreen() {
  return (
    <div data-testid="us-screen">
      <div className="mb-5">
        <Title anchor="Nós dois," rest="o que é da casa e do casal." />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ShoppingSection />
        <DatesGiftsSection />
      </div>
    </div>
  )
}
