'use client'

import { useToast } from '@/components/ui/Toast'

/** Copies text and says so (or explains how to copy by hand). */
export const useCopy = () => {
  const toast = useToast()
  return async (text: string, done = 'Copied.') => {
    try {
      await navigator.clipboard.writeText(text)
      toast(done)
    } catch {
      toast('Couldn’t copy. Press and hold to copy it.')
    }
  }
}
