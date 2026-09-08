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
  // This fixture's people have no last names, so there's nothing to
  // distinguish — no cluster box is drawn (see the cluster-boundary-fix
  // spec). The row-adjacency assertions above are what this test verifies.
  expect(meeraColumn.closest('.family-cluster')).toBeNull()
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
  // rendered via renderSiblingColumn's Couple call, a different call site
  // from the main ancestor row. Priya must light up as in-focus (she's
  // Sanjay's spouse) while Meera's own child Rohan — rendered but outside
  // Sanjay's immediate family — stays dimmed, proving renderSiblingColumn's
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

test("a revealed sibling from a different lineage than their married-in relative gets its own separate cluster, not their partner's", () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera3', 'Meera3'),
    named('sarika', 'Sarika', 'Gade'), named('mallikarjun', 'Mallikarjun', 'Gade'),
    named('hanmantrao', 'Hanmantrao', 'Khandgaonkar'), named('saraswati', 'Saraswati', 'Khandgaonkar'),
    named('santosh', 'Santosh', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika', to_id: 'mallikarjun' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika', to_id: 'meera3' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun', to_id: 'meera3' },
    { id: 'r4', type: 'spouse', from_id: 'hanmantrao', to_id: 'saraswati' },
    { id: 'r5', type: 'parent-child', from_id: 'hanmantrao', to_id: 'sarika' },
    { id: 'r6', type: 'parent-child', from_id: 'saraswati', to_id: 'sarika' },
    { id: 'r7', type: 'parent-child', from_id: 'hanmantrao', to_id: 'santosh' },
    { id: 'r8', type: 'parent-child', from_id: 'saraswati', to_id: 'santosh' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera3" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  fireEvent.click(screen.getByText('1'))
  // Santosh has a last name in this fixture, so PersonPatch renders "Santosh
  // Khandgaonkar" as a single text node (see PersonPatch.tsx's `name` join) —
  // exact: false matches the substring rather than requiring the whole node
  // text to equal 'Santosh'.
  expect(screen.getByText('Santosh', { exact: false })).toBeInTheDocument()

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  const santoshColumn = screen.getByText('Santosh', { exact: false }).closest('.gen-column')!

  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
  expect(khandgaonkarLabel.closest('.family-cluster')).toContainElement(santoshColumn)
  expect(gadeLabel.closest('.family-cluster')).not.toContainElement(santoshColumn)
})

test('a revealed sibling who shares their partner\'s surname does not get an unnecessary cluster box', () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera4', 'Meera4'),
    named('sarika4', 'Sarika4', 'Gade'), named('mallikarjun4', 'Mallikarjun4', 'Gade'),
    named('madhappa4', 'Madhappa4', 'Gade'), named('nagabai4', 'Nagabai4', 'Gade'),
    named('shobha4', 'Shobha4', 'Gade'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika4', to_id: 'mallikarjun4' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika4', to_id: 'meera4' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun4', to_id: 'meera4' },
    { id: 'r4', type: 'spouse', from_id: 'madhappa4', to_id: 'nagabai4' },
    { id: 'r5', type: 'parent-child', from_id: 'madhappa4', to_id: 'mallikarjun4' },
    { id: 'r6', type: 'parent-child', from_id: 'nagabai4', to_id: 'mallikarjun4' },
    { id: 'r7', type: 'parent-child', from_id: 'madhappa4', to_id: 'shobha4' },
    { id: 'r8', type: 'parent-child', from_id: 'nagabai4', to_id: 'shobha4' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera4" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  fireEvent.click(screen.getByText('1'))
  // Shobha4 has a last name in this fixture, so PersonPatch renders "Shobha4
  // Gade" as a single text node (see PersonPatch.tsx's `name` join) —
  // exact: false matches the substring rather than requiring the whole node
  // text to equal 'Shobha4'.
  expect(screen.getByText('Shobha4', { exact: false })).toBeInTheDocument()

  const shobhaColumn = screen.getByText('Shobha4', { exact: false }).closest('.gen-column')!
  expect(shobhaColumn.closest('.family-cluster')).toBeNull()
})

test('a unit with no resolvable surname in a multi-lineage row still gets boxed, just without a caption', () => {
  // row.units.length > 1 must keep forcing each unit's couple into its own
  // box (the two-unrelated-lineages guarantee), even when one unit's couple
  // has no resolvable last name (mismatched/missing surnames) and so would
  // otherwise render bare under the general null-label-stays-unboxed rule.
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    named('anna5', 'Anna5', 'Gade'), named('ravi5', 'Ravi5', 'Gade'), person('meera5', 'Meera5'),
    named('anna_dad5', 'AnnaDad5', 'Gade'), named('anna_mom5', 'AnnaMom5', 'Gade'),
    named('ravi_dad5', 'RaviDad5', 'Khandgaonkar'), person('ravi_mom5', 'RaviMom5'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'anna5', to_id: 'ravi5' },
    { id: 'r2', type: 'parent-child', from_id: 'anna5', to_id: 'meera5' },
    { id: 'r3', type: 'parent-child', from_id: 'ravi5', to_id: 'meera5' },
    { id: 'r4', type: 'spouse', from_id: 'anna_dad5', to_id: 'anna_mom5' },
    { id: 'r5', type: 'parent-child', from_id: 'anna_dad5', to_id: 'anna5' },
    { id: 'r6', type: 'parent-child', from_id: 'anna_mom5', to_id: 'anna5' },
    { id: 'r7', type: 'spouse', from_id: 'ravi_dad5', to_id: 'ravi_mom5' },
    { id: 'r8', type: 'parent-child', from_id: 'ravi_dad5', to_id: 'ravi5' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_mom5', to_id: 'ravi5' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera5" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  const gadeLabel = screen.getByText('Gade')
  const gadeCluster = gadeLabel.closest('.family-cluster')!
  expect(gadeCluster).not.toBeNull()
  expect(gadeCluster.querySelector('.family-cluster-label')).not.toBeNull()

  const raviDadColumn = screen.getByText('RaviDad5', { exact: false }).closest('.gen-column')!
  const raviDadCluster = raviDadColumn.closest('.family-cluster')!
  expect(raviDadCluster).not.toBeNull()
  expect(raviDadCluster).not.toBe(gadeCluster)
  expect(raviDadCluster.querySelector('.family-cluster-label')).toBeNull()
})

test('a null-label sibling column gets a spacer wrapper to stay baseline-aligned with a genuinely boxed sibling', () => {
  // Within a single-lineage unit (row.units.length === 1), distinctLabels
  // >= 2 triggers boxing. Here the person-side sibling ('Khandgaonkar') is
  // labeled — different from the couple's own 'Gade' — so shouldGroup is
  // true and a real box gets drawn. The spouse-side sibling (Shobha6) has
  // no resolvable surname; it must still render at the same vertical
  // baseline as its boxed neighbors via a `.family-cluster-spacer` wrapper
  // (matching padding/border, transparent border) rather than sitting bare
  // and higher in the row.
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera6', 'Meera6'),
    named('sarika6', 'Sarika6', 'Gade'), named('mallikarjun6', 'Mallikarjun6', 'Gade'),
    named('sarika6_parent', 'Sarika6Parent', 'Khandgaonkar'), named('sarika6_sib', 'Sarika6Sib', 'Khandgaonkar'),
    named('madhappa6', 'Madhappa6', 'Gade'), named('nagabai6', 'Nagabai6', 'Gade'),
    person('shobha6', 'Shobha6'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika6', to_id: 'mallikarjun6' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika6', to_id: 'meera6' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun6', to_id: 'meera6' },
    { id: 'r4', type: 'parent-child', from_id: 'sarika6_parent', to_id: 'sarika6' },
    { id: 'r5', type: 'parent-child', from_id: 'sarika6_parent', to_id: 'sarika6_sib' },
    { id: 'r6', type: 'spouse', from_id: 'madhappa6', to_id: 'nagabai6' },
    { id: 'r7', type: 'parent-child', from_id: 'madhappa6', to_id: 'mallikarjun6' },
    { id: 'r8', type: 'parent-child', from_id: 'nagabai6', to_id: 'mallikarjun6' },
    { id: 'r9', type: 'parent-child', from_id: 'madhappa6', to_id: 'shobha6' },
    { id: 'r10', type: 'parent-child', from_id: 'nagabai6', to_id: 'shobha6' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera6" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  let flap = document.querySelector<HTMLElement>('.sibling-bubble:not(.open)')
  while (flap) {
    fireEvent.click(flap)
    flap = document.querySelector<HTMLElement>('.sibling-bubble:not(.open)')
  }
  expect(screen.getByText('Shobha6', { exact: false })).toBeInTheDocument()

  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  expect(khandgaonkarLabel.closest('.family-cluster')).not.toBeNull()

  const shobhaColumn = screen.getByText('Shobha6', { exact: false }).closest('.gen-column')!
  expect(shobhaColumn.closest('.family-cluster')).toBeNull()
  expect(shobhaColumn.closest('.family-cluster-spacer')).not.toBeNull()
})

test('adjacent siblings sharing the couple\'s surname merge into the same cluster box as the couple', () => {
  // The headline merge behavior: 2+ adjacent same-label segments collapse
  // into ONE .family-cluster, not one box each. A full brother sharing the
  // couple's surname ('Gade') must land in the couple's own box, while a
  // spouse-side sibling from a different lineage ('Khandgaonkar') gets a
  // separate one.
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera7', 'Meera7'),
    named('sarika7', 'Sarika7', 'Gade'), named('mallikarjun7', 'Mallikarjun7', 'Gade'),
    named('gade_bro7', 'GadeBro7', 'Gade'),
    named('khand_sis7', 'KhandSis7', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika7', to_id: 'mallikarjun7' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika7', to_id: 'meera7' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun7', to_id: 'meera7' },
    // gade_bro7: full sibling of sarika7 (shares her parents implicitly via
    // the same siblingsOf() lookup — sibling detection here is by a shared
    // parent-child edge into a common parent; give them a shared parent).
    { id: 'r4', type: 'parent-child', from_id: 'shared_parent7', to_id: 'sarika7' },
    { id: 'r5', type: 'parent-child', from_id: 'shared_parent7', to_id: 'gade_bro7' },
    // khand_sis7: sibling of mallikarjun7 via a different shared parent.
    { id: 'r6', type: 'parent-child', from_id: 'shared_parent7b', to_id: 'mallikarjun7' },
    { id: 'r7', type: 'parent-child', from_id: 'shared_parent7b', to_id: 'khand_sis7' },
  ]
  const shared7 = person('shared_parent7', 'SharedParent7')
  const shared7b = person('shared_parent7b', 'SharedParent7b')
  render(
    <TreeView
      people={[...clusteredPeople, shared7, shared7b]}
      relationships={clusteredRelationships}
      focalId="meera7"
      onAddParent={() => {}}
      onOpenProfile={() => {}}
      onCenterOn={() => {}}
    />,
  )

  let flap = document.querySelector<HTMLElement>('.sibling-bubble:not(.open)')
  while (flap) {
    fireEvent.click(flap)
    flap = document.querySelector<HTMLElement>('.sibling-bubble:not(.open)')
  }
  const gadeBroColumn = screen.getByText('GadeBro7', { exact: false }).closest('.gen-column')!
  const khandSisColumn = screen.getByText('KhandSis7', { exact: false }).closest('.gen-column')!
  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')

  expect(gadeBroColumn.closest('.family-cluster')).toBe(gadeLabel.closest('.family-cluster'))
  expect(khandSisColumn.closest('.family-cluster')).toBe(khandgaonkarLabel.closest('.family-cluster'))
  expect(gadeBroColumn.closest('.family-cluster')).not.toBe(khandSisColumn.closest('.family-cluster'))
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
  const couple = annaColumn.querySelector('.couple')!
  expect(couple.parentElement).toBe(annaColumn)
  // No sibling flap is open here, so this renders via the grid path
  // (renderAncestorGrid), where the ancestor-row seam is its own grid item
  // (.ancestor-grid-connector) positioned by grid-row/grid-column — it is
  // not a DOM child of .gen-column at all, unlike the flex path's seam.
  // Still verifying the same substantive fact as before: the seam is not
  // nested inside .couple (a horizontal flex row that would lay a vertical
  // seam out sideways), and it lines up with Anna's own grid column.
  expect(annaColumn.querySelector('.seam-parent-child')).toBeNull()
  const annaItem = annaColumn.closest('.ancestor-grid-item') as HTMLElement
  const seam = document.querySelector('.ancestor-grid-connector') as HTMLElement
  expect(seam).not.toBeNull()
  expect(seam.parentElement).toBe(document.querySelector('.ancestor-grid'))
  expect(seam.style.gridColumn).toBe(annaItem.style.gridColumn)
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

test('renders ancestor rows via the precise grid layout when no sibling flap is open', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(container.querySelector('.ancestor-grid')).toBeInTheDocument()
})

test('opening a sibling flap falls back to the pre-existing flex rendering', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('2'))
  expect(container.querySelector('.ancestor-grid')).not.toBeInTheDocument()
  // `.gen` alone is too weak an assertion here — the unrelated
  // `.descendants` section also uses `.gen`, so it would pass even if the
  // ancestor section itself never switched to flex rendering. Anchor on a
  // known ancestor-row person (Anna, the focal person's parent) and confirm
  // her `.gen-column` sits inside a `.gen` that is NOT nested under
  // `.descendants` — i.e. she's rendered via the ancestor flex path.
  const annaColumn = screen.getByText('Anna').closest('.gen-column')!
  const annaGen = annaColumn.closest('.gen')
  expect(annaGen).not.toBeNull()
  expect(annaGen!.closest('.descendants')).toBeNull()
})

test("a couple's grid-column matches its computed span", () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera5', 'Meera5'),
    named('mangal5', 'Mangal5', 'Khandgaonkar'), named('kishan5', 'Kishan5', 'Talegave'),
    named('hanmantrao5', 'Hanmantrao5', 'Khandgaonkar'), named('saraswati5', 'Saraswati5', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'mangal5', to_id: 'kishan5' },
    { id: 'r2', type: 'parent-child', from_id: 'mangal5', to_id: 'meera5' },
    { id: 'r3', type: 'parent-child', from_id: 'kishan5', to_id: 'meera5' },
    { id: 'r4', type: 'spouse', from_id: 'hanmantrao5', to_id: 'saraswati5' },
    { id: 'r5', type: 'parent-child', from_id: 'hanmantrao5', to_id: 'mangal5' },
    { id: 'r6', type: 'parent-child', from_id: 'saraswati5', to_id: 'mangal5' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera5" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  // Mangal5's parents (Hanmantrao5+Saraswati5) span [0,2); Mangal5+Kishan5
  // themselves span [0,3) (2 for her side's ancestry + 1 reserved for
  // Kishan5's still-unrecorded side) — matching computeAncestorLayout's
  // own asymmetric-width test case.
  const hanmantraoItem = screen.getByText('Hanmantrao5 Khandgaonkar', { exact: false }).closest('.ancestor-grid-item') as HTMLElement
  expect(hanmantraoItem.style.gridColumn).toBe('1 / 3')
  const coupleItem = screen.getByText('Mangal5 Khandgaonkar', { exact: false }).closest('.ancestor-grid-item') as HTMLElement
  expect(coupleItem.style.gridColumn).toBe('1 / 4')
})

test('a row with two unrelated lineages boxes both units even with no siblings revealed', () => {
  // Reuses the same fixture shape as the existing multi-lineage
  // family-cluster test, but asserts the grid path (no flap open) also
  // boxes both units — this row.units.length > 1 behavior is unchanged
  // from the pre-existing flex path's own version of this rule.
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    named('anna6', 'Anna6', 'Gade'), named('ravi6', 'Ravi6', 'Gade'), person('meera6', 'Meera6'),
    named('anna_dad6', 'AnnaDad6', 'Gade'), named('anna_mom6', 'AnnaMom6', 'Gade'),
    named('ravi_dad6', 'RaviDad6', 'Khandgaonkar'), named('ravi_mom6', 'RaviMom6', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'anna6', to_id: 'ravi6' },
    { id: 'r2', type: 'parent-child', from_id: 'anna6', to_id: 'meera6' },
    { id: 'r3', type: 'parent-child', from_id: 'ravi6', to_id: 'meera6' },
    { id: 'r4', type: 'spouse', from_id: 'anna_dad6', to_id: 'anna_mom6' },
    { id: 'r5', type: 'parent-child', from_id: 'anna_dad6', to_id: 'anna6' },
    { id: 'r6', type: 'parent-child', from_id: 'anna_mom6', to_id: 'anna6' },
    { id: 'r7', type: 'spouse', from_id: 'ravi_dad6', to_id: 'ravi_mom6' },
    { id: 'r8', type: 'parent-child', from_id: 'ravi_dad6', to_id: 'ravi6' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_mom6', to_id: 'ravi6' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera6" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
})

test('a parent does not vanish from the grid when two co-parents have no recorded spouse relationship (Finding 1)', () => {
  // The app's own default guided "add a parent" flow (App.tsx) writes only
  // a parent-child edge per parent, and never auto-creates a spouse edge
  // between the two co-parents it prompts the user to add one after
  // another. buildAncestorRows then emits two separate units that both
  // have the same childId. Before the Finding 1 fix, computeAncestorLayout
  // silently overwrote one of those units in its childId-keyed map, so one
  // parent got no span and renderAncestorGrid's `if (!span) continue`
  // silently dropped them from the DOM entirely.
  const noSpousePeople = [person('kid', 'Kid'), person('dad', 'Dad'), person('mom', 'Mom')]
  const noSpouseRelationships: Relationship[] = [
    { id: 'r1', type: 'parent-child', from_id: 'dad', to_id: 'kid' },
    { id: 'r2', type: 'parent-child', from_id: 'mom', to_id: 'kid' },
  ]
  const { container } = render(
    <TreeView people={noSpousePeople} relationships={noSpouseRelationships} focalId="kid" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />,
  )
  // No sibling flap is open, so this exercises the grid path specifically.
  expect(container.querySelector('.ancestor-grid')).toBeInTheDocument()
  expect(screen.getByText('Dad')).toBeInTheDocument()
  expect(screen.getByText('Mom')).toBeInTheDocument()
})
