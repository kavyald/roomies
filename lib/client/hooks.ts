'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NewContact } from '../domain/contacts'
import type { AppCommands } from './app-client'
import type { ContactId, HouseId, InviteId } from '../domain/ids'
import type { NewInvite } from '../domain/invites'
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

export const useInvites = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.invites(houseId), queryFn: () => queries.invites(houseId) })
}

export const useCreateInvite = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewInvite) => commands.createInvite(input),
    onSuccess: (r) => {
      if (r.ok) return qc.invalidateQueries({ queryKey: keys.invites(houseId) })
    },
  })
}

export const useRevokeInvite = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: InviteId) => commands.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(houseId) }),
  })
}

/**
 * A command that refreshes some of the house's queries when it works. Every House-tab change
 * goes through here; the activity log refreshes too, since changes write to it.
 */
const useHouseCommand = <I, R extends { ok: boolean }>(
  houseId: HouseId,
  run: (commands: ReturnType<typeof useAppClient>['commands'], input: I) => Promise<R>,
  affects: (keyof typeof keys)[],
) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: I) => run(commands, input),
    onSuccess: (r) => {
      if (!r.ok) return
      return Promise.all(
        [...affects, 'activity' as const].map((k) =>
          qc.invalidateQueries({ queryKey: keys[k](houseId) }),
        ),
      )
    },
  })
}

export const useEditContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['editContact']>[0]) => c.editContact(i), [
    'contacts',
  ])
export const useRemoveContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ContactId) => c.removeContact(id), ['contacts'])
export const useAddContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: NewContact) => c.createContact(i), ['contacts'])
export const useMoveOut = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['moveOut']>[0]) => c.moveOut(i), [
    'members',
  ])
export const useSetRole = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['setRole']>[0]) => c.setRole(i), [
    'members',
  ])
export const useRenameRoom = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['renameRoom']>[0]) => c.renameRoom(i), [
    'rooms',
  ])
export const useMoveRoom = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['moveRoom']>[0]) => c.moveRoom(i), [
    'rooms',
  ])

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
