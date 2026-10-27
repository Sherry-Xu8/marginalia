import { TAGS, type Tag } from '../types'

// ---- How tagging is organised ----
// A "tagger" looks at places and suggests a category for the ones it recognises.
// The app runs the taggers in order; each later one only sees places the earlier
// ones couldn't tag. To add AI tagging later, write another Tagger (e.g. one that
// calls an AI service) and add it to the `taggers` list at the bottom — nothing
// else needs to change.

export type TagInput = { id: string; name: string; description: string; layer: string }

export type Tagger = {
  id: string
  suggest(places: TagInput[]): Promise<Map<string, Tag>> | Map<string, Tag>
}

// ---- Keyword rules ----
// The order of this list is also the tie-break: if two categories score the same,
// the one listed first wins (so "Station Exit 2 – Tteok" is Food, not Transport).

const KEYWORDS: Record<Exclude<Tag, 'Other'>, string[]> = {
  'Food & drink': [
    'restaurant', 'cafe', 'café', 'coffee', 'bakery', 'bread', 'bagel', 'bbq', 'grill', 'ramen',
    'sushi', 'noodle', 'soup', 'rice', 'pork', 'beef', 'chicken', 'seafood', 'dessert', 'tea',
    'dumpling', 'pizza', 'burger', 'brunch', 'bistro', 'kitchen', 'eatery', 'diner', 'street food',
    'food street', 'food', 'tteok', 'tteokbokki', 'tteokboki', 'bibimbap', 'gopchang', 'jokbal',
    'galbi', 'dakgalbi', 'gejang', 'samgyetang', 'hotteok', 'toast', 'bingsu', 'ice cream', 'gelato',
    'donut', 'pastry', 'sandwich', 'curry', 'udon', 'tempura', 'fried', 'porridge', 'jjajangmyeon',
    'gamjatang', 'claypot', 'braised', 'italian', 'korean', 'japanese', 'bakeries', 'tapas',
    '식당', '카페', '국밥', '죽', '곱창', '족발', '떡볶이', '맛집',
  ],
  Sightseeing: [
    'museum', 'temple', 'palace', 'tower', 'gallery', 'monument', 'castle', 'shrine', 'cathedral',
    'church', 'viewpoint', 'observatory', 'landmark', 'historic', 'heritage', 'hanok', 'memorial',
    'fortress', 'aquarium', 'zoo', 'theme park', 'sightseeing', 'attraction', '궁', '사찰',
  ],
  Accommodation: [
    'hotel', 'hostel', 'guesthouse', 'guest house', 'motel', 'resort', 'inn', 'airbnb', 'apartment',
    'lodge', 'ryokan', 'b&b', 'suites', 'accommodation', 'hotels', '호텔', '모텔', '게스트하우스',
  ],
  Shopping: [
    'shop', 'store', 'mall', 'market', 'boutique', 'outlet', 'department store', 'supermarket',
    'duty free', 'olive young', 'daiso', 'souvenir', 'bookstore', 'gift', 'shopping', '시장',
  ],
  'Nature & outdoors': [
    'park', 'beach', 'mountain', 'hike', 'hiking', 'trail', 'garden', 'lake', 'river', 'island',
    'waterfall', 'forest', 'valley', 'cliff', 'bay', 'national park', 'cape', 'coast', '공원',
    '해수욕장',
  ],
  Nightlife: [
    'bar', 'pub', 'club', 'nightclub', 'cocktail', 'brewery', 'izakaya', 'lounge', 'karaoke',
    'speakeasy', 'wine bar', 'soju', 'nightlife', '술집',
  ],
  Transport: [
    'station', 'airport', 'terminal', 'subway', 'metro', 'bus', 'train', 'ferry', 'port', 'ktx',
    'bus stop', 'taxi', 'rail',
  ],
}

// Whole-word match for latin words (so "bar" doesn't match "barbecue"); plain substring for Korean.
const matchers = Object.entries(KEYWORDS).map(([tag, words]) => ({
  tag: tag as Tag,
  tests: words.map((w) => {
    const plain = /^[\x00-\x7F]+$/.test(w) === false
    if (plain) return (text: string) => text.includes(w)
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?($|[^a-z0-9])`)
    return (text: string) => re.test(text)
  }),
}))

function scoreText(tests: ((t: string) => boolean)[], text: string): number {
  return tests.filter((t) => t(text)).length
}

// Name counts most, then the layer name, then the description.
export function keywordTag(p: Pick<TagInput, 'name' | 'description' | 'layer'>): Tag | null {
  const name = p.name.toLowerCase()
  const layer = p.layer.toLowerCase()
  const desc = p.description.toLowerCase()
  let best: Tag | null = null
  let bestScore = 0
  for (const { tag, tests } of matchers) {
    const score = 3 * scoreText(tests, name) + 2 * scoreText(tests, layer) + scoreText(tests, desc)
    if (score > bestScore) {
      best = tag
      bestScore = score
    }
  }
  return best
}

export const keywordTagger: Tagger = {
  id: 'keywords',
  suggest(places) {
    const out = new Map<string, Tag>()
    for (const p of places) {
      const tag = keywordTag(p)
      if (tag) out.set(p.id, tag)
    }
    return out
  },
}

// Add future taggers (e.g. an AI one) here, after the keyword rules.
export const taggers: Tagger[] = [keywordTagger]

export async function suggestTags(places: TagInput[]): Promise<Map<string, Tag>> {
  const result = new Map<string, Tag>()
  let remaining = places
  for (const tagger of taggers) {
    if (remaining.length === 0) break
    const found = await tagger.suggest(remaining)
    found.forEach((tag, id) => result.set(id, tag))
    remaining = remaining.filter((p) => !found.has(p.id))
  }
  return result
}

// colour = map pin, tint/ink = the soft tile and its icon colour in lists.
export const TAG_STYLE: Record<Tag | 'Untagged', { colour: string; tint: string; ink: string }> = {
  'Food & drink': { colour: '#C2582F', tint: '#F6E1D6', ink: '#8F3F1E' },
  Sightseeing: { colour: '#3F6E73', tint: '#D9E8E8', ink: '#274B4F' },
  Accommodation: { colour: '#8A6B4F', tint: '#EBDFD3', ink: '#5C4530' },
  Shopping: { colour: '#C9993A', tint: '#F5E8C8', ink: '#7A5814' },
  'Nature & outdoors': { colour: '#4A7461', tint: '#DCE7DD', ink: '#2F5646' },
  Nightlife: { colour: '#26352E', tint: '#D8DFDA', ink: '#1B2822' },
  Transport: { colour: '#8A918B', tint: '#E5E8E6', ink: '#4A5250' },
  Other: { colour: '#B5A48B', tint: '#EFE9DE', ink: '#6E5F48' },
  Untagged: { colour: '#A5A89F', tint: '#ECEBE6', ink: '#6B665A' },
}

export { TAGS }
