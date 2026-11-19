/** The pictures in frontend-public/public/phone/img (the mockup's img/), with their sizes for width/height. */
import { asset } from './Tag'

const CAT_SIZE: Record<string, [number, number]> = {
  apparel: [300, 322], appliances: [300, 370], auto: [300, 212], baby: [300, 225], bedbath: [300, 224], crafts: [300, 256],
  decor: [300, 514], electronics: [300, 272], furniture: [300, 178], garden: [300, 286], health: [300, 273],
  household: [300, 453], kitchen: [300, 217], media: [300, 265], office: [300, 235], party: [300, 213], patio: [300, 285],
  pet: [300, 216], sports: [300, 221], storage: [300, 268], tools: [300, 401], toys: [300, 226],
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

export const HERO_SOFA = { src: asset('phone/img/hero-sofa.jpg'), width: 900, height: 536 }
