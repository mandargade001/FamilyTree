import { Icon } from '../shared/Icon'

export function AddParentSlot({ onClick }: { onClick: () => void }) {
  return (
    <div className="add-parent-slot" onClick={onClick}>
      <Icon name="plus" size={13} />
      Add Parent
    </div>
  )
}
