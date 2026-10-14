import type { RoomKind } from '@/lib/domain/house'
import type { RoomGroup } from '@/lib/domain/rooms'

/** Headings for the three room groups (FRONTEND §5.11), shared by House → Rooms and the picker. */
export const ROOM_GROUP_LABEL: Record<RoomGroup, string> = {
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  spaces: 'Spaces',
}

const KIND_LABEL: Record<RoomKind, string> = {
  bedroom: 'bedroom',
  bath: 'bathroom',
  common: 'shared space',
  entry: 'entry',
  utility: 'utility room',
  outdoor: 'outdoors',
}

/** What VoiceOver says after a room's name: "Fire, bedroom". */
export const roomKindLabel = (kind: RoomKind): string => KIND_LABEL[kind]
