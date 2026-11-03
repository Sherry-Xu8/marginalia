import type { Expense, Trip } from '../types'
import { addExpense } from './store'
import { normaliseCurrency, roundToCurrency } from './money'
import { getRate } from './rates'

// Money entered anywhere in the app can be in any currency. It is stored in the trip's own currency
// (so budgets add up), and, for stays, journeys and expenses, what you actually paid is remembered too.

export const DEFAULT_CURRENCY = 'GBP'
export const COMMON_CURRENCIES = ['GBP', 'USD', 'EUR', 'SGD', 'MYR', 'KRW', 'JPY', 'THB', 'AUD', 'CNY', 'HKD', 'IDR', 'VND', 'INR']

// The currency a trip's budget and costs are kept in (the one you spend in).
export const tripCurrency = (t?: Pick<Trip, 'currency'>): string => normaliseCurrency(t?.currency ?? '') || DEFAULT_CURRENCY
// Your own currency, for showing equivalents. Pounds unless you choose another.
export const homeCurrencyOf = (t?: Pick<Trip, 'homeCurrency'>): string => normaliseCurrency(t?.homeCurrency ?? '') || DEFAULT_CURRENCY

// The currencies offered when entering an amount: the trip's, your home one, then the usual ones.
export function currencyChoices(t?: Pick<Trip, 'currency' | 'homeCurrency'>, current?: string): string[] {
  return [...new Set([tripCurrency(t), homeCurrencyOf(t), ...(current ? [current] : []), ...COMMON_CURRENCIES])]
}

export type Converted = { amount: number; paid?: { amount: number; currency: string } }

// An amount in `from` as an amount in the trip's currency (null if no exchange rate could be found).
export async function toTripAmount(n: number, from: string, to: string): Promise<Converted | null> {
  if (from === to) return { amount: n }
  const r = await getRate(from, to)
  if (!r) return null
  return { amount: roundToCurrency(n * r.rate, to), paid: { amount: n, currency: from } }
}

// Logs an expense typed in any currency. Returns false if no exchange rate could be found.
export async function addExpenseIn(e: Omit<Expense, 'id' | 'amount' | 'paid'>, n: number, from: string, to: string): Promise<boolean> {
  const r = await toTripAmount(n, from, to)
  if (!r) return false
  addExpense({ ...e, amount: r.amount, paid: r.paid })
  return true
}
