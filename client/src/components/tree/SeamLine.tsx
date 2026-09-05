interface SeamLineProps {
  kind: 'parent-child' | 'spouse'
  dimmed?: boolean
}

export function SeamLine({ kind, dimmed }: SeamLineProps) {
  const classes = ['seam', `seam-${kind}`, dimmed ? 'dimmed' : ''].filter(Boolean).join(' ')
  return <div className={classes} />
}
