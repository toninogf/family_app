# Family App

App familiar privada: lista de la compra, tareas de casa, actividades de los niños y gastos (presupuesto y saldos al estilo Settle Up).

## Stack

- React + TypeScript + Vite + Tailwind CSS, instalable como PWA
- Supabase (Postgres con RLS, Auth con 2FA obligatorio) — proyecto `family-app`, región eu-west-3
- Cloudflare Pages (publicación) + Cloudflare Access (puerta de entrada)

## Seguridad

- Solo pueden crear cuenta los emails dados de alta como adultos en `members` (trigger en `auth.users`).
- Todas las tablas tienen RLS: solo filas del hogar del usuario y solo con sesión `aal2` (2FA completado).
- La clave del navegador es la publicable; la clave secreta nunca va en este repo.

## Desarrollo

```bash
npm install
npm run dev
```

## Publicación en Cloudflare Pages

- Framework: ninguno (Vite)
- Comando de build: `npm run build`
- Directorio de salida: `dist`
- Variable de entorno: `NODE_VERSION=22`

Las migraciones de la base de datos están en `supabase/migrations/`.
