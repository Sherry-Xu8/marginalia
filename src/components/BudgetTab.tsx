import { useMemo, useState } from 'react'
import { fmtMoney } from '../lib/money'
import { shortDate, toISO } from '../lib/days'
import { addExpense, deleteExpense, setBudget, useAppData } from '../lib/store'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types'

function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="bar" aria-hidden>
      <div className={over ? 'over' : ''} style={{ width: pct + '%' }} />
    </div>
  )
}

export function BudgetTab() {
  const { trips, activeTripId, days, expenses, transfers } = useAppData()
  const trip = trips.find((t) => t.id === activeTripId)
  const [budgetText, setBudgetText] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('Food & drink')
  const [date, setDate] = useState(toISO(new Date()))
  const [error, setError] = useState('')

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
      <section>
        <h2>Budget</h2>
        <p className="muted">Create a trip first (on the Trip tab).</p>
      </section>
    )
  }

  const cur = trip.currency ?? 'USD'
  const money = (n: number) => fmtMoney(n, cur)
  const planned =
    tripDays.reduce((s, d) => s + d.items.reduce((t, i) => t + (i.cost ?? 0), 0), 0) +
    transfers.filter((t) => t.tripId === activeTripId).reduce((s, t) => s + (t.cost ?? 0), 0)
  const spent = mine.reduce((s, e) => s + e.amount, 0)
  const budget = trip.budget
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    c,
    total: mine.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  })).filter((x) => x.total > 0)
  const byDate = new Map<string, typeof mine>()
  for (const e of mine) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])

  function saveBudget(raw: string, currency: string) {
    const n = parseFloat(raw)
    setBudget(trip!.id, raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n, currency)
  }

  function add() {
    const n = parseFloat(amount)
    if (!title.trim()) return setError('What was it for?')
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    addExpense({ tripId: trip!.id, date, title: title.trim(), amount: n, category })
    setTitle('')
    setAmount('')
    setError('')
  }

  return (
    <section>
      <h2>Budget</h2>

      <div className="card">
        <div className="row">
          <label>
            Total budget
            <input
              inputMode="decimal"
              placeholder="e.g. 3000"
              value={budgetText ?? (budget !== undefined ? String(budget) : '')}
              onChange={(e) => {
                setBudgetText(e.target.value)
                saveBudget(e.target.value, cur)
              }}
              onBlur={() => setBudgetText(null)}
            />
          </label>
          <label style={{ maxWidth: 110 }}>
            Currency
            <input
              maxLength={4}
              value={cur}
              onChange={(e) => setBudget(trip.id, budget, e.target.value)}
              aria-label="Currency code, for example USD or KRW"
            />
          </label>
        </div>
        <p className="muted">Use a 3-letter currency code, such as USD, EUR or KRW.</p>

        <div className="stats">
          <div><span className="muted">Budget</span><strong>{budget !== undefined ? money(budget) : '—'}</strong></div>
          <div><span className="muted">Planned</span><strong>{money(planned)}</strong></div>
          <div><span className="muted">Spent</span><strong>{money(spent)}</strong></div>
        </div>
        {budget !== undefined && (
          <>
            <Bar value={spent} max={budget} over={spent > budget} />
            <p className={spent > budget ? 'error' : 'muted'}>
              {spent > budget
                ? `Over budget by ${money(spent - budget)}`
                : `${money(budget - spent)} left to spend`}
            </p>
            {planned > budget && <p className="error">Your planned costs ({money(planned)}) are more than your budget.</p>}
          </>
        )}
        {planned === 0 && <p className="muted">Tip: add a planned cost to places on the Days tab (tap a place).</p>}
      </div>

      <h3>Add an expense</h3>
      <div className="card form">
        <label>
          What was it for?
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner at Gwangjang Market" />
        </label>
        <div className="row">
          <label>
            Amount ({cur})
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary wide" onClick={add}>Add expense</button>
      </div>

      {byCategory.length > 0 && (
        <>
          <h3>Where it went</h3>
          <div className="card">
            {byCategory.map(({ c, total }) => (
              <div key={c}>
                <div className="row between"><span>{c}</span><strong>{money(total)}</strong></div>
                <Bar value={total} max={spent} />
              </div>
            ))}
          </div>
        </>
      )}

      {tripDays.some((d) => d.items.some((i) => i.cost) || mine.some((e) => e.date === d.date)) && (
        <>
          <h3>Plan vs spending, by day</h3>
          <div className="card">
            {tripDays.map((d) => {
              const p = d.items.reduce((s, i) => s + (i.cost ?? 0), 0)
              const sp = mine.filter((e) => e.date === d.date).reduce((s, e) => s + e.amount, 0)
              if (!p && !sp) return null
              return (
                <div key={d.id} className="row between day-money">
                  <span>{shortDate(d.date)}</span>
                  <span className="muted">planned {money(p)}</span>
                  <strong className={sp > p && p > 0 ? 'error' : ''}>spent {money(sp)}</strong>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h3>Expenses</h3>
      {mine.length === 0 && <p className="muted">Nothing logged yet.</p>}
      {[...byDate].map(([d, list]) => (
        <div key={d} className="card">
          <strong>{shortDate(d)}</strong>
          {list.map((e) => (
            <div key={e.id} className="check">
              <span style={{ flex: 1 }}>
                {e.title}
                <small className="muted"> · {e.category}</small>
              </span>
              <strong>{money(e.amount)}</strong>
              <button aria-label={`Delete ${e.title}`} onClick={() => confirm(`Delete “${e.title}”?`) && deleteExpense(e.id)}>×</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
