interface CollapseToggleProps {
  expanded: boolean
  label: string
  onToggle: () => void
}

export function CollapseToggle({ expanded, label, onToggle }: CollapseToggleProps) {
  return (
    <button className="collapse-dot" aria-label={label} onClick={onToggle}>
      {expanded ? '−' : '+'}
    </button>
  )
}
