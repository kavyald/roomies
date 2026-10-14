import { redirect } from 'next/navigation'

/** The House tab became Admin (T67); old links and notifications still land there. */
export default async function HouseTabMoved({ params }: PageProps<'/h/[houseId]/house'>) {
  const { houseId } = await params
  redirect(`/h/${houseId}/admin`)
}
