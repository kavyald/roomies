import { Onboarding } from '@/components/onboarding/Onboarding'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Welcome · Roomies' }

/** Onboarding (T110): where joining and setup land, before House. */
export default async function WelcomePage({ params }: PageProps<'/h/[houseId]/welcome'>) {
  const { houseId } = await params
  return (
    <main className="grid min-h-[calc(100dvh-48px)] content-center">
      <Onboarding houseId={houseId as HouseId} />
    </main>
  )
}
