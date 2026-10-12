import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const build = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
}).format(new Date())

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(build)
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Family App',
        short_name: 'Familia',
        description: 'Compra, casa, niños y gastos de la familia',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4F5F1',
        theme_color: '#2D4BB3',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Nunca cachear llamadas a Supabase: los datos siempre frescos y privados
        navigateFallbackDenylist: [/^\/auth/],
        runtimeCaching: [],
        importScripts: ['push-handler.js'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
})
