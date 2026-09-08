import { render, screen, fireEvent, act } from '@testing-library/react'
import { TreeView } from './TreeView'
import type { Person, Relationship } from '../../types'

vi.mock('../../api/photos', () => ({ getPrimaryPhoto: vi.fn().mockResolvedValue(null) }))

function person(id: string, first: string, updatedAt = ''): Person {
  return {
    id, first_name: first, last_name: null, gender: null, birth_date: null,
    death_date: null, birth_place: null, occupation: null, bio: null,
    created_at: '', updated_at: updatedAt,
  }
}

const people = [person('anna', 'Anna'), person('ravi', 'Ravi'), person('meera', 'Meera'), person('sanjay', 'Sanjay'), person('deepak', 'Deepak')]
const relationships: Relationship[] = [
  { id: 'r1', type: 'spouse', from_id: 'anna', to_id: 'ravi' },
  { id: 'r2', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r3', type: 'parent-child', from_id: 'ravi', to_id: 'meera' },
  { id: 'r4', type: 'parent-child', from_id: 'anna', to_id: 'sanjay' },
  { id: 'r5', type: 'parent-child', from_id: 'ravi', to_id: 'sanjay' },
  { id: 'r6', type: 'parent-child', from_id: 'anna', to_id: 'deepak' },
  { id: 'r7', type: 'parent-child', from_id: 'ravi', to_id: 'deepak' },
]

test('renders the focal person and their parent couple', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.getByText('Meera')).toBeInTheDocument()
  expect(screen.getByText('Anna')).toBeInTheDocument()
  expect(screen.getByText('Ravi')).toBeInTheDocument()
})

test('siblings start collapsed behind a flap showing the correct count', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.queryByText('Sanjay')).not.toBeInTheDocument()
})

test('clicking the sibling flap reveals the siblings as row-adjacent columns, not nested under the owner', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('2'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Deepak')).toBeInTheDocument()

  const meeraColumn = screen.getByText('Meera').closest('.gen-column')!
  const sanjayColumn = screen.getByText('Sanjay').closest('.gen-column')!
  expect(sanjayColumn).not.toBe(meeraColumn)
  expect(sanjayColumn.parentElement).toBe(meeraColumn.parentElement)
  expect(meeraColumn.parentElement).toHaveClass('family-cluster')
  expect(container.querySelector('.sibling-list')).not.toBeInTheDocument()
})

test('shows an Add Parent slot above a person with no recorded parents', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  // Anna and Ravi are both parentless in this fixture, so both members of the
  // couple independently get their own slot.
  expect(screen.getAllByText('Add Parent')).toHaveLength(2)
})

test('clicking an Add Parent slot calls onAddParent with that specific person', () => {
  const onAddParent = vi.fn()
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  const addParentButtons = screen.getAllByText('Add Parent')
  fireEvent.click(addParentButtons[0])
  expect(onAddParent).toHaveBeenCalledWith('anna')
})

test("renders the focal person's own children by default, below them", () => {
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.getByText('Rohan')).toBeInTheDocument()
})

test("a child's own children stay collapsed behind a toggle until clicked", () => {
  const withGrandchild = [...people, person('rohan', 'Rohan'), person('aditi', 'Aditi')]
  const relsWithGrandchild: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
    { id: 'r9', type: 'parent-child', from_id: 'rohan', to_id: 'aditi' },
  ]
  render(<TreeView people={withGrandchild} relationships={relsWithGrandchild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.queryByText('Aditi')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Show Rohan’s children'))
  expect(screen.getByText('Aditi')).toBeInTheDocument()
})

test('shows an Add Parent slot for a shallower person even when another lineage traces back further', () => {
  // Ravi's parents (RaviDad & RaviMom) are recorded, pushing that lineage to
  // depth 2 and making it the tree's deepest row — but Anna's parents are not
  // recorded. Anna sits at the shallower depth 1, and must still get her own
  // Add Parent slot rather than only whoever is at the single deepest row.
  // RaviDad and RaviMom, each having no recorded parents of their own,
  // independently get a slot too: three total, one per parentless person.
  const asymmetricPeople = [...people, person('ravi_dad', 'RaviDad'), person('ravi_mom', 'RaviMom')]
  const asymmetricRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'ravi_dad', to_id: 'ravi_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_dad', to_id: 'ravi' },
    { id: 'r10', type: 'parent-child', from_id: 'ravi_mom', to_id: 'ravi' },
  ]
  const onAddParent = vi.fn()
  render(<TreeView people={asymmetricPeople} relationships={asymmetricRelationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))
  const addParentButtons = screen.getAllByText('Add Parent')
  expect(addParentButtons).toHaveLength(3)
  addParentButtons.forEach((button) => fireEvent.click(button))
  expect(onAddParent).toHaveBeenCalledWith('anna')
  expect(onAddParent).toHaveBeenCalledWith('ravi_dad')
  expect(onAddParent).toHaveBeenCalledWith('ravi_mom')
  expect(onAddParent).not.toHaveBeenCalledWith('ravi')
})

test('shows an Add Parent slot for the spouse side of a couple, not just the anchor', () => {
  // Give Anna (the row unit's anchor, per relationship ordering) her own
  // recorded parents, while Ravi (her spouse in the unit) stays parentless.
  // Only Ravi should get a slot — proving the check isn't anchored to
  // unit.personId alone.
  const spousePeople = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const spouseRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  const onAddParent = vi.fn()
  render(<TreeView people={spousePeople} relationships={spouseRelationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  screen.getAllByText('Add Parent').forEach((button) => fireEvent.click(button))
  expect(onAddParent).toHaveBeenCalledWith('ravi')
  expect(onAddParent).not.toHaveBeenCalledWith('anna')
})

test('shows a sibling flap for the spouse side of a couple, not just the anchor', () => {
  // Ravi (the unit's spouse, not the anchor Anna) has his own recorded
  // parent and sibling — Anna has none of her own. Only Ravi should get a
  // sibling flap, proving the check isn't anchored to unit.personId alone.
  const siblingSpousePeople = [...people, person('ravi_parent', 'RaviParent'), person('ravi_sibling', 'RaviSibling')]
  const siblingSpouseRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi_sibling' },
  ]
  render(<TreeView people={siblingSpousePeople} relationships={siblingSpouseRelationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.getByText('1')).toBeInTheDocument()
  fireEvent.click(screen.getByText('1'))
  expect(screen.getByText('RaviSibling')).toBeInTheDocument()
})

test('clicking a sibling in an opened flap calls onCenterOn instead of onOpenProfile', async () => {
  // PersonPatch holds a single click's onOpen call behind a ~250ms timer (so
  // a real double-click's first `click` doesn't fire the recenter before the
  // `dblclick` arrives) — advance past that window for the single-click side
  // effect to actually land.
  vi.useFakeTimers()
  try {
    const onCenterOn = vi.fn()
    const onOpenProfile = vi.fn()
    render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={onOpenProfile} onCenterOn={onCenterOn} />)
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('Sanjay').closest('.patch')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(onCenterOn).toHaveBeenCalledWith('sanjay')
    expect(onOpenProfile).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('a real double-click sequence on a sibling (click, click, dblclick) focuses them and never recenters', async () => {
  // fireEvent.doubleClick alone dispatches only a lone `dblclick`, which
  // doesn't model a real browser: an actual double-click always fires
  // `click` twice (mousedown/mouseup/click, twice) before `dblclick`. Firing
  // that real sequence on the same element is what actually proves
  // PersonPatch's debounce works — a shallower test using only
  // fireEvent.doubleClick would pass even without the fix, since it never
  // exercises the `click` events that the fix exists to guard against.
  vi.useFakeTimers()
  try {
    const onCenterOn = vi.fn()
    render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={onCenterOn} />)
    fireEvent.click(screen.getByText('2'))
    const sanjayPatch = screen.getByText('Sanjay').closest('.patch')!
    fireEvent.click(sanjayPatch)
    fireEvent.click(sanjayPatch)
    fireEvent.doubleClick(sanjayPatch)
    // Advance well past the single-click debounce window to prove no
    // orphaned timer from either of the two `click` events survives to fire
    // onCenterOn late.
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(sanjayPatch).toHaveClass('in-focus')
    expect(onCenterOn).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('double-clicking a person focuses their immediate family and dims everyone else', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)

  expect(screen.getByText('Anna').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Ravi').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')
})

test('focus mode auto-expands a collapsed sibling flap to reveal a focused sibling', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Anna').closest('.patch')!)
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Sanjay').closest('.patch')).toHaveClass('in-focus')
})

test('Exit focus clears the focused state', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  fireEvent.click(screen.getByText('Exit focus'))
  expect(screen.getByText('Meera').closest('.patch')).not.toHaveClass('in-focus')
})

test('double-clicking the focal person also glows their own children below them', () => {
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  expect(screen.getByText('Rohan').closest('.patch')).toHaveClass('in-focus')
})

test('double-clicking the spouse side of the ancestor couple focuses the anchor side too', () => {
  // Anna is the row unit's anchor (personId) and Ravi is the spouse
  // (spouseId), per buildAncestorRows' ordering. Double-clicking Ravi's
  // patch — the spouse side, not the anchor — must still glow Anna, proving
  // Couple threads inFocus/dimmed independently to both sides.
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Ravi').closest('.patch')!)

  expect(screen.getByText('Ravi').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Anna').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')
})

test('focusing a sibling dims an unrelated person but not the sibling\'s own spouse, in the sibling list', () => {
  // Sanjay (a sibling in meera's sibling flap) has his own spouse Priya —
  // rendered via renderSiblingColumns' Couple call, a different call site
  // from the main ancestor row. Priya must light up as in-focus (she's
  // Sanjay's spouse) while Meera's own child Rohan — rendered but outside
  // Sanjay's immediate family — stays dimmed, proving renderSiblingColumns'
  // Couple call also threads personState/spouseState correctly rather than
  // only handling the sibling anchor.
  const extendedPeople = [...people, person('priya', 'Priya'), person('rohan', 'Rohan')]
  const extendedRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'sanjay', to_id: 'priya' },
    { id: 'r9', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
  ]
  render(<TreeView people={extendedPeople} relationships={extendedRelationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('2'))
  fireEvent.doubleClick(screen.getByText('Sanjay').closest('.patch')!)

  expect(screen.getByText('Sanjay').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Priya').closest('.patch')).toHaveClass('in-focus')
  expect(screen.getByText('Rohan').closest('.patch')).toHaveClass('dimmed')
})

test('focus mode auto-expands a collapsed flap that lives on the spouse side of a unit', () => {
  // Ravi (the spouse side of the anna/ravi ancestor unit, not the anchor)
  // has his own parent and sibling. Focusing RaviParent — Ravi's own
  // ancestor, rendered one row further up — must auto-expand *Ravi's* flap
  // (not Anna's) to reveal RaviSibling, proving the auto-expand loop checks
  // unit.spouseId's siblings independently of unit.personId's.
  const extendedPeople = [...people, person('ravi_parent', 'RaviParent'), person('ravi_sibling', 'RaviSibling')]
  const extendedRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi_sibling' },
  ]
  render(<TreeView people={extendedPeople} relationships={extendedRelationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.queryByText('RaviSibling')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Show more ancestors'))
  fireEvent.doubleClick(screen.getByText('RaviParent').closest('.patch')!)

  expect(screen.getByText('RaviSibling')).toBeInTheDocument()
  expect(screen.getByText('RaviSibling').closest('.patch')).toHaveClass('in-focus')
})

test('pressing Escape clears the focused state', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')

  fireEvent.keyDown(window, { key: 'Escape' })

  expect(screen.getByText('Meera').closest('.patch')).not.toHaveClass('in-focus')
  expect(screen.queryByText('Exit focus')).not.toBeInTheDocument()
})

test('clicking the tree background clears the focused state', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')

  fireEvent.click(container.querySelector('.tree')!)

  expect(screen.getByText('Meera').closest('.patch')).not.toHaveClass('in-focus')
})

test('clicking a patch while focused does not clear focus via the background handler', async () => {
  vi.useFakeTimers()
  try {
    const onOpenProfile = vi.fn()
    render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={onOpenProfile} onCenterOn={() => {}} />)
    fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
    expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')

    // A plain single click on a patch (focus mode off) opens the profile —
    // the click bubbles to the tree background handler too, which must not
    // also clear focus out from under it. The single-click side effect is
    // held behind PersonPatch's ~250ms debounce timer, so advance past it.
    fireEvent.click(screen.getByText('Anna').closest('.patch')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })

    expect(onOpenProfile).toHaveBeenCalledWith('anna')
    expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')
  } finally {
    vi.useRealTimers()
  }
})

test('shows the fresh-stitch badge for a recently-updated person and not for a stale one, on both sides of a couple', () => {
  // Anna (the row unit's anchor) was just edited; Ravi (her spouse) was
  // edited long ago. Both sides of a couple must get independently computed
  // freshness — this project has a documented history of "only fixed for one
  // side of a couple" bugs.
  const now = new Date('2026-09-06T12:00:00.000Z')
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const freshAt = new Date(now.getTime() - 60 * 1000).toISOString() // 1 minute ago
  const staleAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
  const freshPeople = [
    person('anna', 'Anna', freshAt),
    person('ravi', 'Ravi', staleAt),
    person('meera', 'Meera', staleAt),
    person('sanjay', 'Sanjay', staleAt),
    person('deepak', 'Deepak', staleAt),
  ]
  try {
    render(<TreeView people={freshPeople} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

    expect(screen.getByText('Anna').closest('.patch')!.querySelector('.fresh-badge')).toBeInTheDocument()
    expect(screen.getByText('Ravi').closest('.patch')!.querySelector('.fresh-badge')).not.toBeInTheDocument()
    expect(screen.getByText('Meera').closest('.patch')!.querySelector('.fresh-badge')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('the Focus Mode toggle makes a single click focus a person instead of opening their profile', async () => {
  vi.useFakeTimers()
  try {
    const onOpenProfile = vi.fn()
    render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={onOpenProfile} onCenterOn={() => {}} />)
    fireEvent.click(screen.getByText('Focus Mode'))
    fireEvent.click(screen.getByText('Meera').closest('.patch')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })

    expect(onOpenProfile).not.toHaveBeenCalled()
    expect(screen.getByText('Meera').closest('.patch')).toHaveClass('in-focus')
    expect(screen.getByText('Anna').closest('.patch')).toHaveClass('in-focus')
  } finally {
    vi.useRealTimers()
  }
})

test('the Focus Mode toggle makes a single click on a sibling patch focus them instead of re-centering', async () => {
  // Fix 7: the sibling column's onOpen was wired straight to onCenterOn,
  // bypassing the same Focus Mode check every other patch goes through —
  // this proves a sibling patch now respects the toggle too.
  vi.useFakeTimers()
  try {
    const onCenterOn = vi.fn()
    render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={onCenterOn} />)
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('Focus Mode'))
    fireEvent.click(screen.getByText('Sanjay').closest('.patch')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })

    expect(onCenterOn).not.toHaveBeenCalled()
    expect(screen.getByText('Sanjay').closest('.patch')).toHaveClass('in-focus')
  } finally {
    vi.useRealTimers()
  }
})

test('ancestor rows deeper than 1 generation stay collapsed by default, with a toggle to reveal more', () => {
  const withGrandparents = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const relsWithGrandparents: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  render(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.queryByText('AnnaDad')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Show more ancestors'))
  expect(screen.getByText('AnnaDad')).toBeInTheDocument()
})

test('wraps a row unit with multiple lineages in labeled family clusters', () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    named('anna2', 'Anna', 'Gade'), named('ravi2', 'Ravi', 'Gade'), person('meera2', 'Meera'),
    named('anna_dad', 'AnnaDad', 'Gade'), named('anna_mom', 'AnnaMom', 'Gade'),
    named('ravi_dad', 'RaviDad', 'Khandgaonkar'), named('ravi_mom', 'RaviMom', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'anna2', to_id: 'ravi2' },
    { id: 'r2', type: 'parent-child', from_id: 'anna2', to_id: 'meera2' },
    { id: 'r3', type: 'parent-child', from_id: 'ravi2', to_id: 'meera2' },
    { id: 'r4', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r5', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna2' },
    { id: 'r6', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna2' },
    { id: 'r7', type: 'spouse', from_id: 'ravi_dad', to_id: 'ravi_mom' },
    { id: 'r8', type: 'parent-child', from_id: 'ravi_dad', to_id: 'ravi2' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_mom', to_id: 'ravi2' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera2" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
  expect(gadeLabel.closest('.family-cluster')).not.toBeNull()
})

test('re-centering resets the ancestor depth, open sibling flaps, and focus state back to the default', () => {
  const withGrandparents = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const relsWithGrandparents: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  const { rerender } = render(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))
  expect(screen.getByText('AnnaDad')).toBeInTheDocument()
  fireEvent.click(screen.getByText('2'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  fireEvent.doubleClick(screen.getByText('Meera').closest('.patch')!)
  expect(screen.getByText('Exit focus')).toBeInTheDocument()

  rerender(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="sanjay" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  // Ancestor depth reset: the previously-revealed grandparent row is gone.
  expect(screen.queryByText('AnnaDad')).not.toBeInTheDocument()
  // Open sibling flaps reset: Meera, previously revealed as Sanjay's sibling
  // via the opened flap, is no longer in the document after re-centering to
  // a different person's tree.
  expect(screen.queryByText('Meera')).not.toBeInTheDocument()
  // Focus state reset (Fix 2): no lingering "Exit focus" button from the
  // stale focus built around the old focal person.
  expect(screen.queryByText('Exit focus')).not.toBeInTheDocument()
})

test('renders a parent-child connecting seam below each ancestor-row Couple, as a DOM sibling of .couple not nested inside it', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  const annaColumn = screen.getByText('Anna').closest('.gen-column')!
  const seam = annaColumn.querySelector('.seam-parent-child')
  const couple = annaColumn.querySelector('.couple')!
  expect(seam).not.toBeNull()
  // Placement, not just presence: the seam must be a direct child of
  // .gen-column and a sibling of .couple — not nested inside .couple, which
  // is a horizontal flex row that would lay a vertical seam out sideways.
  expect(seam!.parentElement).toBe(annaColumn)
  expect(couple.parentElement).toBe(annaColumn)
})

test("the ancestor-row seam doesn't dangle below the focal person's own row when they have no recorded children", () => {
  // Sanjay (this test's focal person) has no recorded children, so the
  // depth-0 row's seam should not render at all — otherwise it'd be a
  // dashed stub pointing at nothing below a childless focal person's card.
  render(<TreeView people={people} relationships={relationships} focalId="sanjay" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  const sanjayColumn = screen.getByText('Sanjay').closest('.gen-column')!
  expect(sanjayColumn.querySelector('.seam-parent-child')).toBeNull()
})

test("renders a parent-child connecting seam below a descendant's Couple, as a DOM sibling of .couple not nested inside it, regardless of whether they have their own children", () => {
  // Renamed from a prior version of this test whose name and assertion
  // contradicted each other (named "...when they have children" but actually
  // asserted the seam was ABSENT). Per Fix 4, the seam represents the
  // connection UP to this descendant's own parent — which always exists for
  // anyone rendered via DescendantBranch — so it renders unconditionally,
  // not gated on the descendant having children of their own.
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  // Rohan (Meera's child) has no children of his own, yet still gets the seam.
  const rohanColumn = screen.getByText('Rohan').closest('.gen-column')!
  const rohanSeam = rohanColumn.querySelector('.seam-parent-child')
  expect(rohanSeam).not.toBeNull()
  expect(rohanSeam!.parentElement).toBe(rohanColumn)
  expect(rohanColumn.querySelector('.couple')!.parentElement).toBe(rohanColumn)
})
