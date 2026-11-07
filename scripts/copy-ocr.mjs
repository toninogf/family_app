// Copia a public/ocr los ficheros del lector de texto (Tesseract) para servirlos desde la propia app
// (sin CDN externos: la CSP solo permite scripts propios). El modelo de español ya está en el repositorio.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/ocr'
mkdirSync(out, { recursive: true })
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', join(out, 'worker.min.js'))
const core = 'node_modules/tesseract.js-core'
const files = readdirSync(core).filter(f => /^tesseract-core.*\.wasm(\.js)?$/.test(f))
if (!files.some(f => f.endsWith('.wasm.js'))) throw new Error('No se encuentran los ficheros de tesseract.js-core')
for (const f of files) copyFileSync(join(core, f), join(out, f))
console.log(`OCR: ${files.length + 1} ficheros copiados a ${out}`)
