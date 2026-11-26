import { closestCenter, pointerWithin, type CollisionDetection, type UniqueIdentifier } from '@dnd-kit/core'

/**
 * One DndContext for the whole chrome UI (tabs can be dropped into the sidebar), so draggable
 * ids are namespaced: `tab:<id>`, `fav:<id>`, `folder:<id>`, and drop zones `zone:root` /
 * `zone:<folderId>` (a folder's grid, or the root mosaic), `row:<n>` (a row of the root mosaic)
 * and `row:new` (under its last row: a new line).
 */
export type DndKind = 'tab' | 'fav' | 'folder' | 'zone' | 'row'

export const dndId = (kind: DndKind, id: string | number): string => `${kind}:${id}`

export function parseDndId(id: UniqueIdentifier): { kind: DndKind; id: string } {
  const text = String(id)
  const i = text.indexOf(':')
  return { kind: text.slice(0, i) as DndKind, id: text.slice(i + 1) }
}

export const ROOT_ZONE = 'root'
export const NEW_ROW = 'new'

/** Which targets each kind of drag can land on. */
const TARGETS: Record<DndKind, DndKind[]> = {
  tab: ['tab', 'fav', 'row', 'zone', 'folder'],
  fav: ['fav', 'row', 'zone', 'folder'],
  folder: ['folder'],
  zone: [],
  row: []
}

/** When the pointer is inside several targets, the most specific wins: a tile, its row, its grid, then the folder. */
const specificity: Record<DndKind, number> = { tab: 0, fav: 0, row: 1, zone: 2, folder: 3 }

/**
 * Pointer-based first (precise across the sidebar's grids: a tile beats the zone around it),
 * then the closest item of the same kind (reordering in the tab strip or the folder list).
 */
export const collisionDetection: CollisionDetection = (args) => {
  const kind = parseDndId(args.active.id).kind
  const allowed = TARGETS[kind]
  const candidates = args.droppableContainers.filter((c) => allowed.includes(parseDndId(c.id).kind))
  const within = pointerWithin({ ...args, droppableContainers: candidates })
  if (within.length > 0) {
    return [...within].sort((a, b) => specificity[parseDndId(a.id).kind] - specificity[parseDndId(b.id).kind])
  }
  return closestCenter({
    ...args,
    droppableContainers: candidates.filter((c) => parseDndId(c.id).kind === kind)
  })
}
