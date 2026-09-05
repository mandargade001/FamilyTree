import { Icon } from '../shared/Icon'

interface SiblingFlapProps {
  count: number
  open: boolean
  onToggle: () => void
}

export function SiblingFlap({ count, open, onToggle }: SiblingFlapProps) {
  return (
    <div className={['flap', open ? 'open' : ''].filter(Boolean).join(' ')} onClick={onToggle}>
      <span>{open ? 'hide siblings' : `${count} sibling${count === 1 ? '' : 's'}`}</span>
      <Icon name="chevron-down" size={12} />
    </div>
  )
}
