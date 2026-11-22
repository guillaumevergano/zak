/** Controls shared by the internal pages (zak://extensions, zak://settings). */

export function SmallButton(props: {
  onClick?: () => void
  danger?: boolean
  /** Submit button of a form (then no onClick). */
  submit?: boolean
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type={props.submit ? 'submit' : 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`cursor-pointer rounded-[10px] disabled:cursor-default disabled:opacity-50 border px-3 py-1 text-[12.5px] font-semibold ${
        props.danger
          ? 'border-pink-button bg-pink-button text-white hover:bg-pink'
          : 'border-cream-edge bg-cream-2 text-violet hover:border-violet/40'
      }`}
    >
      {props.children}
    </button>
  )
}

export function Toggle(props: { on: boolean; label: string; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      title={props.label}
      onClick={() => props.onChange(!props.on)}
      className={`relative mt-1 h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-150 ${
        props.on ? 'bg-violet' : 'bg-track'
      }`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow transition-[left] duration-150 ${
          props.on ? 'left-5' : 'left-1'
        }`}
      />
    </button>
  )
}
