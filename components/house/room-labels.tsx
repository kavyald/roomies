import {
  Bath,
  BedDouble,
  DoorOpen,
  Sofa,
  Trees,
  WashingMachine,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { elementIcon } from '@/components/ui/elements'
import type { Room, RoomKind } from '@/lib/domain/house'
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

const KIND_ICON: Record<RoomKind, LucideIcon> = {
  bedroom: BedDouble,
  bath: Bath,
  common: Sofa,
  entry: DoorOpen,
  utility: WashingMachine,
  outdoor: Trees,
}

/** A bedroom shows its element's icon; every other room the icon for its kind. */
export function RoomIcon({ room, ...props }: { room: Room } & LucideProps) {
  const Icon = room.element ? elementIcon[room.element] : KIND_ICON[room.kind]
  return <Icon aria-hidden strokeWidth={2} {...props} />
}
