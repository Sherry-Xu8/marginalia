// Helpers for place names that mix English with Korean, Chinese or Japanese text.

const NON_LATIN = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/g

export const hasNonLatin = (name: string): boolean => new RegExp(NON_LATIN.source).test(name)

// "수변최고돼지국밥 본점 - Pork Head Soup" → "Pork Head Soup". Returns null if there's no usable English left.
// The name is cut into parts at " - " and " | ". A part that was mixed with Korean/Chinese/Japanese is kept
// only if what's left reads like a real name (2+ words), so stray fragments like "MBC" are dropped.
export function englishPart(name: string): string | null {
  if (!hasNonLatin(name)) return null
  const parts = name
    .split(/\s+[-–—|]\s+/)
    .flatMap((part) => {
      const mixed = hasNonLatin(part)
      const latin = part.replace(NON_LATIN, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—|:,/·]+|[\s\-–—|:,/·]+$/g, '')
      if (!/[A-Za-z]{3,}/.test(latin)) return []
      if (mixed && latin.split(' ').length < 2) return []
      return [latin]
    })
  return parts.length > 0 ? parts.join(' - ') : null
}
