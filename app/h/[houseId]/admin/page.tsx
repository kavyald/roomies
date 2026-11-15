import { redirect } from 'next/navigation'

/** Admin became the House tab (T107); old links and notifications still land there. */
export default async function AdminMoved({ params }: PageProps<'/h/[houseId]/admin'>) {
  const { houseId } = await params
  redirect(`/h/${houseId}`)
}
