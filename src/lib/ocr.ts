// Lectura de texto de imágenes (OCR) en el propio móvil, sin enviar las capturas a ningún servicio.
// Usa Tesseract con el modelo de español servido desde la propia app (/ocr): la primera vez descarga unos 4 MB.

export type OcrProgress = { image: number; total: number; pct: number }

export async function readImages(files: File[], onProgress?: (p: OcrProgress) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  let current = 0
  const worker = await createWorker('spa', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    workerBlobURL: false,
    logger: m => { if (m.status === 'recognizing text') onProgress?.({ image: current + 1, total: files.length, pct: Math.round(m.progress * 100) }) }
  })
  try {
    const parts: string[] = []
    for (current = 0; current < files.length; current++) {
      onProgress?.({ image: current + 1, total: files.length, pct: 0 })
      const { data } = await worker.recognize(files[current])
      parts.push(data.text)
    }
    return parts.join('\n')
  } finally {
    await worker.terminate()
  }
}
