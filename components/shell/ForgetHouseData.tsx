'use client'

import { useForgetHouseData } from '@/lib/client/device-cache'

/** Removes any house's lists kept on this device (T114), on pages for someone with no house. */
export function ForgetHouseData() {
  useForgetHouseData()
  return null
}
