'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
