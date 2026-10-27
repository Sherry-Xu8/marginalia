import {
  BedDouble,
  CircleHelp,
  Landmark,
  MapPin,
  ShoppingBag,
  TrainFront,
  TreePine,
  Utensils,
  Wine,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { TAG_STYLE } from '../lib/tagging'
import type { Place } from '../types'

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  'Food & drink': Utensils,
  Sightseeing: Landmark,
  Accommodation: BedDouble,
  Shopping: ShoppingBag,
  'Nature & outdoors': TreePine,
  Nightlife: Wine,
  Transport: TrainFront,
  Other: MapPin,
  Untagged: CircleHelp,
}

export const tagName = (p: Pick<Place, 'tag'>): string => p.tag ?? 'Untagged'

// A soft coloured square with the category's line icon.
export function TagIcon({ tag, size = 36 }: { tag: string; size?: number }) {
  const style = TAG_STYLE[tag as keyof typeof TAG_STYLE] ?? TAG_STYLE.Untagged
  const Icon = ICONS[tag] ?? MapPin
  return (
    <span
      className="tile"
      aria-hidden
      style={{ width: size, height: size, background: style.tint, color: style.ink }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
    </span>
  )
}
