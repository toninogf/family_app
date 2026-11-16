// Pruebas de los cálculos (nota, precio recomendado, calculadora, cuestionario): `npm test`
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/lib/__tests__/setup.ts']
  }
})
