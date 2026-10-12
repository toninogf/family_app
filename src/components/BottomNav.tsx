import { NavLink } from 'react-router-dom'

const icons = {
  hoy: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  compra: <><path d="M3 4h2l2.4 11h10.8L21 7H6.2" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>,
  casa: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  ninos: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  dinero: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>
}

const items = [
  { to: '/', label: 'Hoy', icon: icons.hoy },
  { to: '/compra', label: 'Compra', icon: icons.compra },
  { to: '/casa', label: 'Casa', icon: icons.casa },
  { to: '/agenda', label: 'Agenda', icon: icons.ninos },
  { to: '/dinero', label: 'Dinero', icon: icons.dinero }
]

export default function BottomNav() {
  return (
    <nav aria-label="Secciones" className="fixed bottom-0 inset-x-0 bg-card border-t border-line pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
      <ul className="grid grid-cols-5 max-w-xl mx-auto">
        {items.map(item => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 min-h-12 text-[11px] ${isActive ? 'text-accent font-bold' : 'text-muted font-medium'}`
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
