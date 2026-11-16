// Si una pantalla falla al pintarse, en vez de quedarse en blanco: aviso, «Reintentar» y «Recargar la app»
import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; /** Al cambiar (p. ej. la ruta), se vuelve a intentar solo */ resetKey?: string }
type State = { error: Error | null; key?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }
  componentDidCatch(error: Error) { console.error('Pantalla con error:', error) }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="bg-card rounded-2xl p-5 mt-6 flex flex-col gap-3">
        <span className="text-[18px] font-bold">😕 Esta pantalla ha fallado</span>
        <p className="text-[14px] text-muted">No se ha perdido nada de lo guardado. Prueba a reintentar; si sigue igual, recarga la app o entra en otra sección.</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => this.setState({ error: null })} className="min-h-11 px-4 rounded-xl bg-accent text-white dark:text-bg font-semibold">Reintentar</button>
          <button onClick={() => location.reload()} className="min-h-11 px-4 rounded-xl border border-line font-semibold">Recargar la app</button>
        </div>
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer">Detalle del error (para contárselo a Claude)</summary>
          <pre className="whitespace-pre-wrap break-words mt-1">{error.message}</pre>
        </details>
      </div>
    )
  }
}
