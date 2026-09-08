export function SiblingFlap({ count, open, onToggle }: SiblingFlapProps) {
  return (
    <button
      className={['sibling-bubble', open ? 'open' : ''].filter(Boolean).join(' ')}
      onClick={onToggle}
      aria-label={open ? 'Hide siblings' : `${count} sibling${count === 1 ? '' : 's'}`}
    >
      {count}
    </button>
  )
}

interface SiblingFlapProps {
  count: number
  open: boolean
  onToggle: () => void
}
