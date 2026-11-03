import { useEffect, useState } from 'react'
import { currencyChoices, tripCurrency } from '../lib/convert'
import { fmtMoney, normaliseCurrency } from '../lib/money'
import { toTripAmount } from '../lib/convert'
import { useRate } from '../lib/rates'
import type { Trip } from '../types'

const OTHER = '__other'

// An amount with a currency to go with it. The hint underneath shows what it comes to in the trip's currency.
export function AmountInput({
  label,
  trip,
  amount,
  currency,
  onChange,
  onEnter,
  onBlur,
  autoFocus,
}: {
  label: string
  trip: Pick<Trip, 'currency' | 'homeCurrency'>
  amount: string
  currency: string
  onChange: (amount: string, currency: string) => void
  onEnter?: () => void
  onBlur?: () => void
  autoFocus?: boolean
}) {
  const target = tripCurrency(trip)
  const [custom, setCustom] = useState(false)
  const n = parseFloat(amount)
  const { rate } = useRate(currency, target)
  const hint =
    currency !== target && Number.isFinite(n) && n > 0 && rate ? `≈ ${fmtMoney(n * rate.rate, target)}${rate.stale ? ' (older rate)' : ''}` : ''
  return (
    <label>
      {label}
      <span className="amount-row">
        <input
          autoFocus={autoFocus}
          inputMode="decimal"
          value={amount}
          onChange={(e) => onChange(e.target.value, currency)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          onBlur={onBlur}
        />
        {custom ? (
          <input
            className="cur-input"
            maxLength={12}
            placeholder="CHF"
            aria-label="Currency code"
            autoFocus
            onBlur={(e) => {
              const c = normaliseCurrency(e.target.value)
              if (c) onChange(amount, c)
              setCustom(false)
            }}
          />
        ) : (
          <select
            className="cur-select"
            aria-label="Currency"
            value={currency}
            onChange={(e) => (e.target.value === OTHER ? setCustom(true) : onChange(amount, e.target.value))}
          >
            {currencyChoices(trip, currency).map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
        )}
      </span>
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

// A cost typed straight into a card (it saves as you go): converted to the trip's currency when you leave the field.
export function CostField({
  label,
  trip,
  value,
  onCommit,
}: {
  label: string
  trip: Pick<Trip, 'currency' | 'homeCurrency'>
  value?: number
  onCommit: (cost: number | undefined) => void
}) {
  const local = tripCurrency(trip)
  const [amount, setAmount] = useState(value !== undefined ? String(value) : '')
  const [currency, setCurrency] = useState(local)
  const [error, setError] = useState('')
  useEffect(() => {
    setAmount(value !== undefined ? String(value) : '')
    setCurrency(local)
  }, [value, local])

  async function commit(a: string, c: string) {
    const n = parseFloat(a)
    if (a.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError('')
      return onCommit(undefined)
    }
    const r = await toTripAmount(n, c, local)
    if (!r) return setError(`Couldn’t get the ${c}→${local} exchange rate. Try again, or enter it in ${local}.`)
    setError('')
    onCommit(r.amount)
  }

  return (
    <>
      <AmountInput
        label={label}
        trip={trip}
        amount={amount}
        currency={currency}
        onChange={(a, c) => {
          setAmount(a)
          if (c !== currency) {
            setCurrency(c)
            void commit(a, c)
          }
        }}
        onBlur={() => void commit(amount, currency)}
      />
      {error && <p className="error">{error}</p>}
    </>
  )
}
