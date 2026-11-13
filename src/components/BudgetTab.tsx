import { AmountInput } from './AmountInput'
import { addExpenseIn, entryCurrency, homeCurrencyOf, tripCurrency } from '../lib/convert'
import { BedDouble, Pencil, Plus, ShoppingBag, Ticket, TrainFront, Utensils, Wallet, X, type LucideIcon } from 'lucide-react'
import { createPortal } from 'react-dom'
import { bookingsOf, type Booking } from '../lib/bookings'
import { StaySheet } from './StaySheet'
import { TransferSheet } from './TransferSheet'
import { useMemo, useState } from 'react'
import { shortDate, toISO } from '../lib/days'
import { fmtMoney, normaliseCurrency } from '../lib/money'
import { useRate } from '../lib/rates'
import { deleteExpense, setBudget, setFoodPerDay, setHomeCurrency, useAppData } from '../lib/store'
import { TAG_STYLE } from '../lib/tagging'
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type Trip } from '../types'
import { deleteWithUndo } from '../lib/toast'
import { FormError } from './FormError'

// Each kind of spending borrows a colour and icon from the place categories, so the app looks consistent.
const CAT: Record<ExpenseCategory, { Icon: LucideIcon; style: keyof typeof TAG_STYLE }> = {
  'Food & drink': { Icon: Utensils, style: 'Food' },
  Transport: { Icon: TrainFront, style: 'Transport' },
  Accommodation: { Icon: BedDouble, style: 'Accommodation' },
  Activities: { Icon: Ticket, style: 'Sightseeing' },
  Shopping: { Icon: ShoppingBag, style: 'Shopping' },
  Other: { Icon: Wallet, style: 'Other' },
}

function CatTile({ cat, size = 40 }: { cat: ExpenseCategory; size?: number }) {
  const { Icon, style } = CAT[cat]
  const t = TAG_STYLE[style]
  return (
    <span className="tile" aria-hidden style={{ width: size, height: size, background: t.tint, color: t.ink }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
    </span>
  )
}

function Bar({ value, max, colour }: { value: number; max: number; colour?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="bar" aria-hidden>
      <div style={{ width: pct + '%', background: colour }} />
    </div>
  )
}

export function BudgetTab() {
  const { trips, activeTripId, days, expenses, transfers, places } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const [adding, setAdding] = useState(false)
  const [editBooking, setEditBooking] = useState<Booking | null>(null)
  const [showSettings, setShowSettings] = useState<boolean | null>(null)
  const [budgetText, setBudgetText] = useState<string | null>(null)
  const [showFx, setShowFxState] = useState(() => {
    try {
      return localStorage.getItem('show-fx') === 'on'
    } catch {
      return false
    }
  })
  const setShowFx = (on: boolean) => {
    setShowFxState(on)
    try {
      localStorage.setItem('show-fx', on ? 'on' : 'off')
    } catch {
      // not saved — fine
    }
  }
  const local = tripCurrency(trip)
  const home = homeCurrencyOf(trip)
  const hasHome = /^[A-Z]{3}$/.test(home) && home !== local
  const { rate: fxRate } = useRate(local, hasHome ? home : local)

  const mine = useMemo(
    () => expenses.filter((e) => e.tripId === activeTripId).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, activeTripId],
  )
  const tripDays = useMemo(
    () => days.filter((d) => d.tripId === activeTripId).sort((a, b) => a.date.localeCompare(b.date)),
    [days, activeTripId],
  )

  if (!trip) {
    return (
      <div className="page">
        <h1 className="display">Spending</h1>
        <p className="muted">Create a trip first.</p>
      </div>
    )
  }

  const money = (n: number) => fmtMoney(n, local)
  const homeOf = (n: number) => (showFx && hasHome && fxRate ? fmtMoney(n * fxRate.rate, home) : null)
  const Fx = ({ n }: { n: number }) => {
    const v = homeOf(n)
    return v ? <small className="fx">≈ {v}</small> : null
  }

  const foodPerDay = trip.foodPerDay ?? 0
  // Hotels and journeys with a price count as booked and paid (spent), unless marked "Not paid yet".
  const bookings = bookingsOf(trip, transfers, places)
  const paidBookings = bookings.filter((b) => !b.unpaid)
  const booked = paidBookings.reduce((s, b) => s + b.amount, 0)
  const ticketsPlanned =
    tripDays.reduce((s, d) => s + d.items.reduce((t, i) => t + (i.cost ?? 0), 0), 0) +
    bookings.filter((b) => b.unpaid).reduce((s, b) => s + b.amount, 0)
  const planned = ticketsPlanned + foodPerDay * tripDays.length
  const spent = mine.reduce((s, e) => s + e.amount, 0) + booked
  const budget = trip.budget
  const left = budget !== undefined ? budget - spent : undefined
  const over = left !== undefined && left < 0
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    c,
    total: mine.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) + paidBookings.filter((x) => x.category === c).reduce((s, x) => s + x.amount, 0),
  }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
  const byDate = new Map<string, Expense[]>()
  for (const e of mine) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])

  // Per-day bars: what you planned and what you spent, for days where either exists.
  const dayData = tripDays
    .map((d) => ({
      date: d.date,
      planned: d.items.reduce((s, i) => s + (i.cost ?? 0), 0) + foodPerDay,
      spent: mine.filter((e) => e.date === d.date).reduce((s, e) => s + e.amount, 0) + paidBookings.filter((x) => x.date === d.date).reduce((s, x) => s + x.amount, 0),
    }))
    .filter((d) => d.planned > 0 || d.spent > 0)
  const dayMax = Math.max(1, ...dayData.map((d) => Math.max(d.planned, d.spent)))

  const settingsOpen = showSettings ?? (budget === undefined || !trip.currency)

  return (
    <div className="page money-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Budget and expenses</p>
          <h1 className="display">Spending</h1>
        </div>
        <div className="head-actions">
          {hasHome && (
            <label className="switch">
              <input type="checkbox" checked={showFx} onChange={(e) => setShowFx(e.target.checked)} />
              <span>Show {home}</span>
            </label>
          )}
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={18} /> Add expense
          </button>
        </div>
      </header>

      {!trip.currency && (mine.length > 0 || trip.budget !== undefined) && (
        <div className="card currency-notice">
          <p>
            This trip had no currency set, so its amounts now show in pounds, £ (older versions showed dollars). If you spend in something else, change “Local currency” below.
          </p>
          <button onClick={() => setBudget(trip.id, trip.budget, 'GBP')}>Keep pounds</button>
        </div>
      )}

      <section className="money-hero">
        <div className="money-hero-main">
          <p className="eyebrow">Spent so far</p>
          <strong className="display money-big">{money(spent)}</strong>
          <Fx n={spent} />
          {budget !== undefined ? (
            <>
              <div className="money-progress" aria-hidden>
                <div className={over ? 'over' : ''} style={{ width: Math.min(100, budget > 0 ? (spent / budget) * 100 : 0) + '%' }} />
              </div>
              <p className="money-sub">
                of {money(budget)}
                {' · '}
                {over ? <b className="over-text">{money(-left!)} over budget</b> : <b>{money(left!)} left</b>}
              </p>
            </>
          ) : (
            <p className="money-sub">Set a total budget below to see how much is left.</p>
          )}
        </div>
        <div className="money-tiles">
          <div><span>Budget</span><strong>{budget !== undefined ? money(budget) : '—'}</strong>{budget !== undefined && <Fx n={budget} />}</div>
          {booked > 0 && <div><span>Booked</span><strong>{money(booked)}</strong><Fx n={booked} /></div>}
          {planned > 0 && <div><span>Still to come</span><strong>{money(planned)}</strong><Fx n={planned} /></div>}
        </div>
      </section>
      {planned > 0 && budget !== undefined && spent + planned > budget && (
        <p className="error">What you’ve spent plus what’s still planned ({money(spent + planned)}) is more than your budget.</p>
      )}

      <div className="money-grid">
        <div className="money-left">
          <section className="card panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Where it went</p>
                <h2 className="display">By category</h2>
              </div>
            </header>
            {byCategory.length === 0 ? (
              <p className="note">Nothing logged yet. Add an expense, or log one from a place on your Days tab.</p>
            ) : (
              byCategory.map(({ c, total }) => (
                <div key={c} className="cat-row">
                  <CatTile cat={c} size={36} />
                  <div className="cat-main">
                    <div className="row between">
                      <span>{c}</span>
                      <strong className="amt">
                        {money(total)}
                        <Fx n={total} />
                      </strong>
                    </div>
                    <Bar value={total} max={spent} colour={TAG_STYLE[CAT[c].style].colour} />
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="card panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Hotels and journeys</p>
                <h2 className="display">Bookings</h2>
              </div>
            </header>
            {bookings.length === 0 ? (
              <p className="note">A price on a hotel or journey shows up here and counts as spent. Add one from the Overview tab.</p>
            ) : (
              bookings.map((b) => (
                <div key={b.id} className="exp-row">
                  <CatTile cat={b.category} />
                  <div className="exp-main">
                    <span className="exp-title">{b.title}</span>
                    <small className="muted">
                      {[
                        b.kind === 'stay' && b.stay ? `${shortDate(b.stay.checkIn)} → ${shortDate(b.stay.checkOut)}` : [shortDate(b.date), b.detail].filter(Boolean).join(' · '),
                        b.paid ? `paid ${fmtMoney(b.paid.amount, b.paid.currency)}` : '',
                        b.unpaid ? 'Not paid yet' : '',
                      ].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <strong className="amt">
                    {money(b.amount)}
                    <Fx n={b.amount} />
                  </strong>
                  <button className="icon-btn" aria-label={`Edit ${b.title}`} onClick={() => setEditBooking(b)}>
                    <Pencil size={16} />
                  </button>
                </div>
              ))
            )}
          </section>

          {dayData.length > 0 && (
            <section className="card panel">
              <header className="panel-head">
                <div>
                  <p className="eyebrow">Day by day</p>
                  <h2 className="display">Plan and spending</h2>
                </div>
              </header>
              <div className="day-bars" role="img" aria-label="Planned and spent amounts for each day">
                {dayData.map((d) => (
                  <div key={d.date} className="day-bar" title={`${shortDate(d.date)}: planned ${money(d.planned)}, spent ${money(d.spent)}`}>
                    <div className="day-bar-cols">
                      <i className="planned" style={{ height: (d.planned / dayMax) * 100 + '%' }} />
                      <i className={'spent' + (d.planned > 0 && d.spent > d.planned ? ' over' : '')} style={{ height: (d.spent / dayMax) * 100 + '%' }} />
                    </div>
                    <small>{new Date(d.date + 'T00:00:00').getDate()}</small>
                  </div>
                ))}
              </div>
              <p className="muted legend"><i className="planned" /> planned <i className="spent" /> spent</p>
            </section>
          )}

          <section className={'fold' + (settingsOpen ? ' open' : '')}>
            <button className="fold-head" aria-expanded={settingsOpen} onClick={() => setShowSettings(!settingsOpen)}>
              <span className="fold-title">Budget and currencies</span>
              <span className="tag-pill">{local}{hasHome ? ` → ${home}` : ''}</span>
            </button>
            {settingsOpen && (
              <div className="fold-body">
                <label>
                  Total budget
                  <input
                    inputMode="decimal"
                    placeholder="e.g. 3000000"
                    value={budgetText ?? (budget !== undefined ? String(budget) : '')}
                    onChange={(e) => {
                      setBudgetText(e.target.value)
                      const n = parseFloat(e.target.value)
                      setBudget(trip.id, e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n, local)
                    }}
                    onBlur={() => setBudgetText(null)}
                  />
                </label>
                <label>
                  Daily food and drink allowance
                  <input
                    inputMode="decimal"
                    placeholder="e.g. 60000 — optional"
                    defaultValue={trip.foodPerDay ?? ''}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value)
                      setFoodPerDay(trip.id, e.target.value.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n)
                    }}
                  />
                </label>
                <div className="row">
                  <label>
                    Local currency (where you spend)
                    <input
                      maxLength={12}
                      defaultValue={local}
                      key={local}
                      placeholder="KRW"
                      onBlur={(e) => setBudget(trip.id, budget, normaliseCurrency(e.target.value) || 'GBP')}
                      aria-label="Local currency code, for example KRW"
                    />
                  </label>
                  <label>
                    Home currency
                    <input
                      maxLength={12}
                      defaultValue={home}
                      key={'h' + home}
                      placeholder="GBP"
                      onBlur={(e) => setHomeCurrency(trip.id, normaliseCurrency(e.target.value))}
                      aria-label="Your home currency code, for example GBP"
                    />
                  </label>
                </div>
                <p className="muted">
                  Use 3-letter codes: KRW for Korean won, JPY for yen, USD for dollars, GBP for pounds. Typing a name such as “won” also works.
                  {hasHome && fxRate && ` 1 ${local} ≈ ${fxRate.rate.toPrecision(3)} ${home} (${fxRate.source}, ${fxRate.asOf}${fxRate.stale ? ', offline: an older rate' : ''}).`}
                  {hasHome && !fxRate && ' Looking up the exchange rate…'}
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="money-right">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Every spend</p>
              <h2 className="display">Expenses</h2>
            </div>
          </header>
          {mine.length === 0 && (
            <div className="empty">
              <span className="empty-icon"><Wallet size={30} /></span>
              <h3 className="display">{booked > 0 ? 'No other expenses yet.' : 'Nothing spent yet.'}</h3>
              <p className="muted">Log an expense here, or from any place on your Days tab.{booked > 0 ? ' Your hotels and journeys are counted under Bookings.' : ''}</p>
              <button className="soft-btn" onClick={() => setAdding(true)}><Plus size={18} /> Add your first expense</button>
            </div>
          )}
          {[...byDate].map(([d, list]) => {
            const dayTotal = list.reduce((s, e) => s + e.amount, 0)
            return (
              <div key={d} className="card exp-day">
                <div className="row between exp-day-head">
                  <strong>{shortDate(d)}</strong>
                  <span className="muted">{money(dayTotal)}{homeOf(dayTotal) ? ` · ≈ ${homeOf(dayTotal)}` : ''}</span>
                </div>
                {list.map((e) => (
                  <div key={e.id} className="exp-row">
                    <CatTile cat={e.category} />
                    <div className="exp-main">
                      <span className="exp-title">{e.title}</span>
                      <small className="muted">{e.category}{e.paid ? ` · paid ${fmtMoney(e.paid.amount, e.paid.currency)}` : ''}</small>
                    </div>
                    <strong className="amt">
                      {money(e.amount)}
                      <Fx n={e.amount} />
                    </strong>
                    <button className="icon-btn" aria-label={`Delete ${e.title}`} onClick={() => deleteWithUndo(`Deleted “${e.title}”`, ['expenses'], () => deleteExpense(e.id))}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </section>
      </div>

      {editBooking?.stay && createPortal(<StaySheet trip={trip} stay={editBooking.stay} onClose={() => setEditBooking(null)} />, document.body)}
      {editBooking?.transfer && createPortal(<TransferSheet trip={trip} date={editBooking.transfer.date} transfer={editBooking.transfer} onClose={() => setEditBooking(null)} />, document.body)}
      {adding && <AddExpenseSheet trip={trip} tripId={trip.id} local={local} onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddExpenseSheet({ trip, tripId, local, onClose }: { trip: Trip; tripId: string; local: string; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('Food & drink')
  const [date, setDate] = useState(toISO(new Date()))
  const [currency, setCurrency] = useState(entryCurrency(trip))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const n = parseFloat(amount)
    if (!title.trim()) return setError('What was it for?')
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    // Paid in another currency: the trip-currency equivalent is stored (so budgets add up) and what you paid is remembered.
    setBusy(true)
    const ok = await addExpenseIn({ tripId, date, title: title.trim(), category }, n, currency, local)
    setBusy(false)
    if (!ok) return setError(`Couldn’t get the ${currency}→${local} exchange rate. Try again, or enter the amount in ${local}.`)
    onClose()
  }

  return (
    <div className="sheet" role="dialog" aria-label="Add an expense">
      <div className="sheet-head">
        <strong>Add an expense</strong>
        <button onClick={onClose}><X size={16} /> Close</button>
      </div>
      <div className="sheet-body">
        <label>
          What was it for?
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner at Gwangjang Market" />
        </label>
        <div className="row">
          <AmountInput label="Amount" trip={trip} amount={amount} currency={currency} onChange={(a, c) => { setAmount(a); setCurrency(c); setError('') }} onEnter={add} />
        </div>
        <div className="row">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {(category === 'Accommodation' || category === 'Transport') && (
          <p className="muted">Hotels and journeys you’ve entered on the Overview tab are already counted under Bookings, so only add this if it’s something else.</p>
        )}
        <FormError message={error} />
        <button className="primary wide" disabled={busy} onClick={add}>{busy ? 'Converting…' : 'Add expense'}</button>
      </div>
    </div>
  )
}
