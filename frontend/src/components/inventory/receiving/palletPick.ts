/**
 * Which pallet sides a pick of several photos fills (owner 2026-11-25: "when selecting files or drawer allow me to
 * select up to 4"). The first photo goes on the side that was clicked; the rest go on that pallet's other empty
 * sides, in the pallet's own order. A filled side is never written over, and photos past the empty sides are left out.
 */
export function sidesForPick<Side extends string>(clicked: Side, emptySides: readonly Side[], photos: number): Side[] {
  const order = [clicked, ...emptySides.filter((side) => side !== clicked)];
  return order.slice(0, Math.max(0, photos));
}
