import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'ghost'
  active?: boolean
}

export function Button({ variant, active, className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, active ? 'on' : '', className].filter(Boolean).join(' ')
  return <button className={classes} {...rest} />
}
