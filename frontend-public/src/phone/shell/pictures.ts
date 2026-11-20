/** The pictures in frontend-public/public/phone/img (the mockup's img/), with their sizes for width/height. */
import { asset } from './Tag'

const CAT_SIZE: Record<string, [number, number]> = {
  apparel: [300, 156], appliances: [300, 294], auto: [300, 203], baby: [300, 274], bedbath: [300, 190],
  crafts: [300, 241], decor: [300, 296], electronics: [300, 163], furniture: [300, 150], garden: [300, 202],
  health: [300, 208], household: [300, 358], kitchen: [300, 193], media: [300, 204], office: [300, 258],
  party: [300, 228], patio: [300, 227], pet: [300, 241], sports: [300, 305], storage: [300, 188], tools: [300, 230],
  toys: [300, 247],
}

/** A category's studio picture: `{src, width, height}`, or null (`other` has none). */
export function catPic(cat: string): { src: string; width: number; height: number } | null {
  const size = CAT_SIZE[cat]
  return size ? { src: asset(`phone/img/d-${cat}.jpg`), width: size[0], height: size[1] } : null
}

/** A picture much wider than tall (the category tile gives it more room). */
export function isWide(cat: string): boolean {
  const size = CAT_SIZE[cat]
  return Boolean(size && size[0] / size[1] >= 1.6)
}

export const HERO_SOFA = { src: asset('phone/img/hero-sofa.jpg'), width: 900, height: 508 }
