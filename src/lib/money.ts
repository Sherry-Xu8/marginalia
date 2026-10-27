// Formats an amount in a currency ("USD", "KRW", …) with that currency's usual number of decimals
// (none for won or yen, two for dollars). Falls back to "CODE 12.50" if the browser doesn't know the code.
export function fmtMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// Rounds to the smallest unit the currency uses (whole won, whole yen, cents for dollars).
export function roundToCurrency(amount: number, currency: string): number {
  try {
    const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    const f = 10 ** digits
    return Math.round(amount * f) / f
  } catch {
    return Math.round(amount * 100) / 100
  }
}
