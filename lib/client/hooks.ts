'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NewContact } from '../domain/contacts'
import type { HouseId } from '../domain/ids'
import { useAppClient } from './provider'
import { keys } from './query-keys'

export const useHouse = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.house(houseId), queryFn: () => queries.house(houseId) })
}

export const useMembers = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.members(houseId), queryFn: () => queries.members(houseId) })
}

export const useProfiles = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.profiles(houseId), queryFn: () => queries.profiles(houseId) })
}

export const useRooms = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.rooms(houseId), queryFn: () => queries.rooms(houseId) })
}

export const useContacts = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.contacts(houseId), queryFn: () => queries.contacts(houseId) })
}

const ACTIVITY_PAGE = 30

/** The activity log, a page at a time (newest first). */
export const useActivity = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useInfiniteQuery({
    queryKey: keys.activity(houseId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      queries.activity(houseId, { before: pageParam, limit: ACTIVITY_PAGE }),
    getNextPageParam: (last) => last.before ?? undefined,
  })
}

/** Whether the person using the app is an admin of this house. */
export const useIsAdmin = (houseId: HouseId): boolean => {
  const { me } = useAppClient()
  const members = useMembers(houseId)
  return (
    members.data?.some((m) => m.userId === me && m.role === 'admin' && m.status.active) ?? false
  )
}

/** Resolves to the command's Result; refreshes the house's contacts when it worked. */
export const useCreateContact = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewContact) => commands.createContact(input),
    onSuccess: (r) => {
      if (r.ok) return qc.invalidateQueries({ queryKey: keys.contacts(houseId) })
    },
  })
}
