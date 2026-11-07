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
        description: 'Compra, tareas, agenda, gastos y mudanza de la familia',
        id: '/',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4F5F1',
        theme_color: '#2D4BB3',
        // Android necesita iconos PNG para instalarla como app de verdad (WebAPK), que es lo que permite salir en «Compartir»
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ],
        // Aparece en el menú «Compartir» de Android: un anuncio de Idealista, Fotocasa… abre un piso nuevo en Buscamos
        // POST para poder recibir también capturas de pantalla (las recoge el service worker, ver push-handler.js)
        share_target: {
          action: '/compartir', method: 'POST', enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'shots', accept: ['image/*'] }] }
        }
      },
      workbox: {
        // Nunca cachear llamadas a Supabase: los datos siempre frescos y privados
        navigateFallbackDenylist: [/^\/auth/, /^\/renovar/],
        // El lector de texto (OCR) pesa varios MB: se descarga solo cuando se usa, no al instalar la app
        globIgnores: ['ocr/**'],
        runtimeCaching: [],
        importScripts: ['push-handler.js'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
})
