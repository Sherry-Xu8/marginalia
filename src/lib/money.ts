// Formats an amount in the trip's currency ("USD", "KRW", …). Falls back to "CODE 12.50"
// if the code isn't one the browser knows.
export function fmtMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}
