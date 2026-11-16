// Las pruebas no hablan con la base de datos: el cliente de Supabase se sustituye por uno vacío
import { vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))
