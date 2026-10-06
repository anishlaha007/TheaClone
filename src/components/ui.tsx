import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, Loader2, X } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'citrus'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-sm',
  citrus: 'bg-citrus text-[#1d1606] hover:brightness-105 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3.5 text-base',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function LinkButton({ to, variant = 'primary', className, children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={clsx('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98]', variants[variant], className)}
    >
      {children}
    </Link>
  )
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-3 text-muted', className)}>
      <Loader2 className="size-5 animate-spin text-brand" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  const needsSignIn = /sign in/i.test(msg)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
      <div className="flex-1 space-y-2">
        <p>{msg}</p>
        <div className="flex gap-2">
          {needsSignIn && <LinkButton to="/login" variant="secondary" className="!py-1.5">Sign in</LinkButton>}
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProgressRing({ value, size = 44, stroke = 5, color = 'var(--brand)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-bold">{children ?? `${Math.round(value)}%`}</div>
    </div>
  )
}

export function Bar({ value, color = 'var(--brand)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx('anim-pop max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect x="14" y="6" width="40" height="46" rx="10" fill="var(--citrus)" transform="rotate(10 34 29)" />
        <rect x="8" y="12" width="40" height="46" rx="10" fill="var(--brand)" />
        <path d="M20 40c0-6 4-10 9-10s9 4 9 10M29 30v-8" stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="29" cy="20" r="3.5" fill="var(--citrus)" />
      </svg>
      {withText && <span className="font-display text-2xl font-extrabold tracking-tight">aehT</span>}
    </span>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-lg px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>
}
