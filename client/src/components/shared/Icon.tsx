const PATHS: Record<string, string> = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  lock: 'M8 11V7a4 4 0 0 1 8 0v4M5 11h14v9H5z',
  photo: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM21 16l-5-4-4 4-3-2-6 5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  close: 'M6 6l12 12M18 6L6 18',
  'chevron-down': 'M6 9l6 6 6-6',
}

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
