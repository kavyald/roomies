import { redirect } from 'next/navigation'

/** The House tab is the house's own page (T107); old /house links land there. */
export default async function HouseTabMoved({ params }: PageProps<'/h/[houseId]/house'>) {
  const { houseId } = await params
  redirect(`/h/${houseId}`)
}
