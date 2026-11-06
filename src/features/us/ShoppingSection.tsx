import { Check, CircleDashed, Pill, Plus, ReceiptText, ShoppingCart, X } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, cx, EmptyState, FieldError, SectionHeader, Segmented } from '../../components/ui'
import { isLowStock } from '../../domain/medication'
import { findDuplicate, SHOP_CATEGORY, SHOP_ORDER, shoppingView } from '../../domain/shopping'
import type { ShopCategory, ShoppingItem } from '../../domain/types'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { addShoppingItem, finishShopping, removeShoppingItem, toggleShoppingItem } from '../../store/shoppingActions'
import { ui } from '../../store/ui'

export function ShoppingSection() {
  const { viewer, profiles } = usePeople()
  const all = useData((s) => s.shoppingItems)
  const meds = useData((s) => s.meds)
  const [line, setLine] = useState('')
  const [category, setCategory] = useState<ShopCategory>('MARKET')
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)

  const v = useMemo(() => shoppingView(Object.values(all)), [all])
  // remédio meu (ou da casa) acabando e que ainda não está na lista
  const lowMeds = useMemo(() => {
    const list = Object.values(all)
    return Object.values(meds).filter(
      (m) => (m.ownerId === viewer || m.ownerId === null) && isLowStock(m) && !list.some((i) => i.sourceMedicationId === m.id && !i.checked) && !findDuplicate(list, m.name),
    )
  }, [meds, all, viewer])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!line.trim()) {
      setError('Escreva o que falta (ex.: 2 kg arroz).')
      input.current?.focus()
      return
    }
    addShoppingItem(line, category)
    // repetido também limpa: o item já está na lista, não há o que corrigir
    setLine('')
    input.current?.focus()
  }

  return (
    <section aria-labelledby="compras-title" data-testid="shopping-section">
      <SectionHeader id="compras-title" title="Lista de compras" rest={v.pending ? `· ${v.pending} ${v.pending === 1 ? 'item' : 'itens'}` : '· os dois veem'} />
      <form onSubmit={submit} className="card p-4" noValidate data-testid="shopping-form">
        <label htmlFor="shopping-line" className="mb-2 block text-[14px] font-semibold text-ink">
          O que falta?
        </label>
        <div className="flex gap-2">
          <input
            ref={input}
            id="shopping-line"
            value={line}
            onChange={(e) => {
              setLine(e.target.value)
              setError(undefined)
            }}
            placeholder="Ex.: 2 kg arroz"
            maxLength={80}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'shopping-line-err' : 'shopping-line-hint'}
            data-testid="shopping-input"
            className={cx('min-h-12 w-full min-w-0 flex-1 rounded-[16px] border bg-bg px-4 text-[16px] text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
          />
          <Button type="submit" variant="primary" icon={Plus} aria-label="Adicionar à lista" data-testid="shopping-add" className="shrink-0 px-3.5">
            <span className="hidden sm:inline">Adicionar</span>
          </Button>
        </div>
        {error ? (
          <FieldError id="shopping-line-err">{error}</FieldError>
        ) : (
          <p id="shopping-line-hint" className="mt-1.5 text-[13px] text-muted">
            Quantidade vai junto: “3 leite”, “ovos 1 dz”.
          </p>
        )}
        <div className="mt-3">
          <Segmented<ShopCategory>
            label="Onde comprar"
            value={category}
            onChange={setCategory}
            size="sm"
            fill
            options={SHOP_ORDER.map((c) => ({ value: c, label: SHOP_CATEGORY[c].label, testId: `shop-cat-${c}` }))}
          />
        </div>
      </form>

      {lowMeds.length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Remédios acabando">
          {lowMeds.map((m) => (
            <Button key={m.id} size="sm" variant="quiet" icon={Pill} onClick={() => addShoppingItem(m.name, 'PHARMACY', m.id)} data-testid="shopping-low-med">
              Repor {m.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        {v.groups.length === 0 && v.inCart.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Lista vazia." text="Lembrou de algo que acabou? Escreva acima: aparece na hora no celular do seu par." />
        ) : null}
        {v.groups.map((g) => (
          <div key={g.category} className="card p-2" data-testid={`shop-group-${g.category}`}>
            <h3 className="px-2 pt-1 pb-1 text-[13px] font-bold text-muted">
              {SHOP_CATEGORY[g.category].label} · <span className="font-data">{g.items.length}</span>
            </h3>
            <ul>
              {g.items.map((i) => (
                <ShopRow key={i.id} item={i} who={i.addedBy === viewer ? 'você' : profiles[i.addedBy].displayName.split(' ')[0]!} />
              ))}
            </ul>
          </div>
        ))}
        {v.inCart.length ? (
          <div className="card ledger-ok p-2" data-testid="shop-cart">
            <h3 className="flex items-center gap-2 px-2 pt-1 pb-1 text-[13px] font-bold text-ok">
              <ShoppingCart size={15} aria-hidden /> No carrinho · <span className="font-data">{v.inCart.length}</span>
            </h3>
            <ul>
              {v.inCart.map((i) => (
                <ShopRow key={i.id} item={i} who={i.checkedBy === viewer ? 'você' : i.checkedBy ? profiles[i.checkedBy].displayName.split(' ')[0]! : ''} />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 p-2">
              <Button variant="primary" icon={Check} onClick={finishShopping} data-testid="shop-finish" className="grow basis-[150px]">
                Terminei a compra
              </Button>
              <Button variant="secondary" icon={ReceiptText} onClick={() => ui.openSheet('expense', { title: 'Compras do mercado' })} data-testid="shop-expense" className="grow basis-[150px]">
                Registrar o gasto
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ShopRow({ item, who }: { item: ShoppingItem; who: string }) {
  return (
    <li className="flex items-center gap-1" data-testid="shop-row" data-title={item.title} data-checked={item.checked}>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.checked ? `Tirar do carrinho: ${item.title}` : `Peguei: ${item.title}`}
        onClick={() => toggleShoppingItem(item.id)}
        className={cx('press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]', item.checked ? 'text-ok' : 'hoverable text-muted')}
      >
        {item.checked ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ok text-surface">
            <Check size={18} strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <CircleDashed size={26} aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <p className={cx('text-[15px] leading-snug font-semibold break-words text-ink', item.checked && 'text-muted line-through decoration-1')}>
          {item.quantity ? <span className="font-data mr-1.5 text-action">{item.quantity}</span> : null}
          {item.title}
        </p>
        {who ? <p className="text-[12px] text-muted">{item.checked ? `pego por ${who}` : `pedido por ${who}`}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => removeShoppingItem(item.id)}
        aria-label={`Tirar da lista: ${item.title}`}
        className="press hoverable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
      >
        <X size={18} aria-hidden />
      </button>
    </li>
  )
}
