import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base = 'min-h-12 px-5 rounded-xl font-semibold text-[15px] disabled:opacity-50 transition-opacity'
  const styles = variant === 'primary'
    ? 'bg-accent text-white dark:text-bg'
    : 'bg-card text-accent border border-line'
  return <button className={`${base} ${styles} ${className}`} {...props} />
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <input
        className="min-h-12 px-4 rounded-xl border border-line bg-card text-ink text-[16px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        {...props}
      />
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-card rounded-2xl p-4 ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="text-sm text-danger">{children}</p> : null
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-full flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm flex flex-col gap-6">{children}</div>
    </main>
  )
}
