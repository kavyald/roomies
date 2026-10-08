'use client'

import { Check, CheckCircle, Phone, ShoppingBag, Sparkles, Wind } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip, RoomChip, TierChip } from '@/components/ui/Chip'
import { Disclosure, DisclosureGroup } from '@/components/ui/Disclosure'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { OverflowMenu } from '@/components/ui/OverflowMenu'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { Swipeable } from '@/components/ui/Swipeable'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { houseTabs } from '@/components/shell/tabs'
import { TabBar } from '@/components/ui/TabBar'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Contents() {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [sheet, setSheet] = useState(false)
  const toast = useToast()
  return (
    <div className="grid gap-6">
      <Section title="Type">
        <h1 className="m-0 text-[1.75rem] font-extrabold">Home</h1>
        <p className="m-0 text-xl font-bold">Needs attention</p>
        <p className="m-0">Body text, 17pt. This one&apos;s been waiting a couple days.</p>
        <p className="m-0 text-[0.8rem] font-medium text-ink-soft">
          Kitchen · Wren · Needed by Fri
        </p>
        <p className="m-0 font-semibold tabular-nums">$62.40 · due Oct 3</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Share with the house</Button>
          <Button variant="secondary">Cancel</Button>
          <Button size="small">Did it</Button>
          <Button disabled>Add</Button>
        </div>
        <Button block onClick={() => setSheet(true)}>
          Open a sheet
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => toast('Shared. The house can see how you feel. 💛')}
        >
          Show a toast
        </Button>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-1.5">
          <TierChip tier="top" />
          <TierChip tier="high" />
          <TierChip tier="normal" />
          <TierChip tier="low" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={ShoppingBag}>Need</Chip>
          <Chip icon={Sparkles}>About every 7 days</Chip>
          <Chip icon={CheckCircle}>Task</Chip>
          <Chip icon={Phone}>Handled by: Super</Chip>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <RoomChip name="Air" element="air" />
          <RoomChip name="Fire" element="fire" />
          <RoomChip name="Water" element="water" />
          <RoomChip name="Earth" element="earth" />
          <RoomChip name="Kitchen" />
        </div>
      </Section>

      <Section title="Avatars">
        <div className="flex items-center gap-3">
          <Avatar name="Kavya D" element="air" size={64} />
          <Avatar name="Maya" element="fire" size={48} />
          <Avatar name="Wren" element="water" />
          <Avatar name="Sam" element="earth" />
          <Avatar name="Guest" size={20} />
        </div>
      </Section>

      <Section title="Segmented control">
        <SegmentedControl
          label="Whose items"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'all', label: 'All' },
          ]}
        />
      </Section>

      <Section title="Card">
        <Card onClick={() => toast('Opened')}>
          <div className="flex min-h-6 items-center justify-between gap-2">
            <TierChip tier="top" />
            <span className="text-[0.8rem] font-bold text-ink-soft">😤 1</span>
          </div>
          <h3 className="m-0 text-[1.0625rem] leading-tight font-bold">Leak under the sink</h3>
          <div className="flex flex-wrap gap-1.5">
            <Chip icon={CheckCircle}>Task</Chip>
            <Chip icon={Phone}>Landlord</Chip>
            <RoomChip name="Kitchen" />
          </div>
          <div className="flex items-center gap-2 text-[0.8rem] font-semibold text-ink-soft">
            <Avatar name="Kavya D" element="air" size={20} />
            This one&apos;s been waiting a bit
          </div>
        </Card>
      </Section>

      <Section title="Swipe">
        <Swipeable
          className="rounded-[20px]"
          right={{
            label: 'Done',
            icon: <Check aria-hidden className="size-5" strokeWidth={3} />,
            className: 'bg-accent text-on-accent',
            onSwipe: () => toast('Done. 💛'),
          }}
          left={{
            label: 'Feeling',
            icon: <span aria-hidden>🙂</span>,
            className: 'bg-top-fill text-top-ink',
            onSwipe: () => toast('The emoji tray opens'),
          }}
        >
          <Card onClick={() => toast('Opened')}>
            <h3 className="m-0 text-[1.0625rem] leading-tight font-bold">Swipe me either way</h3>
          </Card>
        </Swipeable>
      </Section>

      <Section title="List rows">
        <ListGroup label="Roommates">
          <ListRow
            leading={<Avatar name="Maya" element="fire" />}
            title="Maya"
            subtitle="Fire room"
          />
          <ListRow
            leading={<Wind aria-hidden className="size-5 text-air-ink" />}
            title="Air"
            subtitle="First floor"
            trailing={<span className="text-[0.8rem] font-bold text-ink-soft tabular-nums">3</span>}
            onClick={() => toast('Air')}
          />
        </ListGroup>
      </Section>

      <Section title="Sections">
        <DisclosureGroup>
          <Disclosure title="Why is this here?" summary={<TierChip tier="high" />}>
            <p className="m-0 text-sm">Normal priority +25 · 😤 Kavya +15</p>
          </Disclosure>
          <Disclosure title="Costs" summary="$189.00">
            <p className="m-0 text-sm">$189.00 · Wren paid</p>
          </Disclosure>
        </DisclosureGroup>
      </Section>

      <Section title="Overflow menu">
        <div className="flex justify-end">
          <OverflowMenu
            label="More actions"
            items={[
              { label: 'Edit', onSelect: () => toast('Edit') },
              { label: 'Delete', tone: 'soft', onSelect: () => toast('Delete') },
            ]}
          />
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState icon={Sparkles} action={<Button size="small">Add a chore</Button>}>
          Nothing to do. Enjoy the quiet.
        </EmptyState>
      </Section>

      <Section title="Tab bar">
        <TabBar inline tabs={houseTabs('/h/demo')} current="/h/demo/needs" />
      </Section>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="How do you feel about this?"
        description="Only if it matters to you. The house will see it."
      >
        <p className="m-0">Sheet content goes here.</p>
        <Button block onClick={() => setSheet(false)}>
          Done
        </Button>
      </Sheet>
    </div>
  )
}

export function Kit({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      data-theme={theme}
      className="w-[375px] max-w-full rounded-[28px] bg-paper p-4 text-ink shadow-[0_0_0_1.5px_var(--line)]"
    >
      <p className="mt-0 mb-4 text-[0.8rem] font-bold text-ink-soft">
        {theme === 'light' ? 'Light · daytime' : 'Dark · cozy night'}
      </p>
      <ToastProvider>
        <Contents />
      </ToastProvider>
    </div>
  )
}
