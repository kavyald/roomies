import { AppShell } from '@/components/shell/AppShell'

export default async function HouseLayout({ children, params }: LayoutProps<'/h/[houseId]'>) {
  const { houseId } = await params
  return <AppShell base={`/h/${houseId}`}>{children}</AppShell>
}
