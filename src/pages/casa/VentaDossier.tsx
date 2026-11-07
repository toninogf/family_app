import { useState } from 'react'
import { FEATURES, photoUrl, price, saleDocUrl, type Mudanza } from '../../lib/mudanza'
import { Sheet } from '../../components/Sheet'

// Las fuentes estándar del PDF solo tienen letras latinas: se quitan emojis y símbolos raros
const clean = (s: string) => s.replace(/[^ -ÿ€\n–—“”‘’…•]/g, '').replace(/[ \t]+/g, ' ').trim()

async function imageData(url: string, max = 1400): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height }
  } catch {
    return null
  }
}

/** Dossier para compradores: ficha, fotos y certificado energético, en PDF para compartir por WhatsApp */
export function DossierSheet({ m, onClose }: { m: Mudanza; onClose: () => void }) {
  const l = m.listing
  const photos = m.salePhotos.filter(p => p.kind === 'foto')
  const cee = m.saleDocs.find(d => d.doc_key === 'cee' && d.path)
  const [withAddress, setWithAddress] = useState(false)
  const [withPrice, setWithPrice] = useState(true)
  const [maxPhotos, setMaxPhotos] = useState(Math.min(8, photos.length))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState<File[] | null>(null)

  async function build() {
    if (!l) return
    setBusy('Preparando…'); setError(''); setReady(null)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210, M = 16, CW = W - 2 * M
      let y = M
      const ensure = (h: number) => { if (y + h > 297 - M) { doc.addPage(); y = M } }
      const para = (text: string, size = 11, style: 'normal' | 'bold' = 'normal', gap = 1.5) => {
        doc.setFont('helvetica', style); doc.setFontSize(size)
        const lines = doc.splitTextToSize(clean(text), CW) as string[]
        for (const line of lines) { ensure(size * 0.45); doc.text(line, M, y + size * 0.35); y += size * 0.45 }
        y += gap
      }

      // Portada: título, precio, lugar
      const where = [withAddress ? l.address : null, l.zone, l.municipality].filter(Boolean).join(' · ')
      para(l.title || [l.property_type ?? 'Vivienda', l.municipality].filter(Boolean).join(' en '), 20, 'bold', 2)
      if (where) para(where, 12, 'normal', 2)
      if (withPrice && l.price_cents) {
        doc.setTextColor(46, 139, 87)
        para(price(l.price_cents), 18, 'bold', 3)
        doc.setTextColor(0, 0, 0)
      }

      // Primera foto grande
      setBusy('Cargando fotos…')
      const imgs: { data: string; w: number; h: number }[] = []
      for (const p of photos.slice(0, maxPhotos)) {
        const u = await photoUrl(p.path)
        const d = u ? await imageData(u) : null
        if (d) imgs.push(d)
        setBusy(`Cargando fotos… ${imgs.length}/${maxPhotos}`)
      }
      if (imgs[0]) {
        const h = Math.min(110, (CW * imgs[0].h) / imgs[0].w)
        const w = (h * imgs[0].w) / imgs[0].h
        ensure(h); doc.addImage(imgs[0].data, 'JPEG', M + (CW - w) / 2, y, w, h); y += h + 6
      }

      // Datos principales
      setBusy('Montando el PDF…')
      const facts: [string, string][] = ([
        ['Tipo', l.property_type],
        ['Superficie construida', l.size_m2 ? `${Number(l.size_m2)} m²` : null],
        ['Superficie útil', l.useful_m2 ? `${Number(l.useful_m2)} m²` : null],
        ['Parcela', l.plot_m2 ? `${Number(l.plot_m2)} m²` : null],
        ['Habitaciones', l.rooms != null ? String(l.rooms) : null],
        ['Baños', l.baths != null ? String(l.baths) : null],
        ['Planta', l.floor],
        ['Año de construcción', l.year_built ? String(l.year_built) : null],
        ['Certificado energético', l.energy ? `Letra ${l.energy}` : null],
        ['Comunidad', l.community_fee_cents != null ? `${price(l.community_fee_cents)}/mes` : null],
        ['IBI', l.ibi_cents != null ? `${price(l.ibi_cents)}/año` : null],
        ['Precio por m²', withPrice && l.price_cents && l.size_m2 ? `${price(Math.round(l.price_cents / Number(l.size_m2)))}/m²` : null]
      ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])
      if (facts.length) {
        para('Características', 14, 'bold', 1)
        doc.setFontSize(11)
        const colW = CW / 2
        facts.forEach(([k, v], i) => {
          if (i % 2 === 0) ensure(6)
          const x = M + (i % 2) * colW
          doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110); doc.text(clean(k), x, y + 4)
          doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.text(clean(v), x + colW - 4, y + 4, { align: 'right' })
          if (i % 2 === 1 || i === facts.length - 1) y += 6.5
        })
        y += 3
      }
      if (l.features.length) para(`Extras: ${l.features.map(f => FEATURES[f] ?? f).join(', ')}`, 11, 'normal', 3)
      if (l.description) { para('Descripción', 14, 'bold', 1); para(l.description, 10.5, 'normal', 4) }

      // Resto de fotos, de dos en dos
      if (imgs.length > 1) {
        doc.addPage(); y = M
        para('Fotos', 14, 'bold', 2)
        const cw = (CW - 6) / 2, ch = cw * 0.75
        imgs.slice(1).forEach((im, i) => {
          if (i % 2 === 0) ensure(ch + 6)
          const scale = Math.min(cw / im.w, ch / im.h)
          const w = im.w * scale, h = im.h * scale
          const x = M + (i % 2) * (cw + 6) + (cw - w) / 2
          doc.addImage(im.data, 'JPEG', x, y + (ch - h) / 2, w, h)
          if (i % 2 === 1 || i === imgs.length - 2) y += ch + 6
        })
      }

      // Certificado energético: si es una foto va dentro; si es PDF se comparte aparte
      const files: File[] = []
      if (cee?.path) {
        const u = await saleDocUrl(cee.path)
        if (u) {
          const blob = await (await fetch(u)).blob()
          if (blob.type === 'application/pdf') files.push(new File([blob], 'Certificado energético.pdf', { type: 'application/pdf' }))
          else {
            const im = await imageData(u, 1800)
            if (im) {
              doc.addPage(); y = M
              para('Certificado energético', 14, 'bold', 2)
              const scale = Math.min(CW / im.w, (297 - 2 * M - 12) / im.h)
              doc.addImage(im.data, 'JPEG', M, y, im.w * scale, im.h * scale)
            }
          }
        }
      }
      doc.setFontSize(8); doc.setTextColor(140, 140, 140)
      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.text(`${i}/${pages}`, W - M, 297 - 8, { align: 'right' }) }

      const name = clean(`Dossier ${l.property_type ?? 'vivienda'} ${l.municipality ?? ''}`).replace(/\s+/g, ' ').trim()
      files.unshift(new File([doc.output('blob')], `${name}.pdf`, { type: 'application/pdf' }))
      setReady(files)
    } catch (e) {
      setError(`No se ha podido crear el PDF (${(e as Error).message}).`)
    }
    setBusy(null)
  }

  async function share(files: File[]) {
    if (navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: files[0].name.replace(/\.pdf$/, '') }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    download(files)
  }
  function download(files: File[]) {
    for (const f of files) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(f); a.download = f.name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    }
  }

  return (
    <Sheet title="Dossier para compradores" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Un PDF con la ficha del piso, las fotos y el certificado energético, para mandarlo por WhatsApp a quien pregunte.</p>
        {!l?.title && !l?.size_m2 && <p className="text-sm text-danger">Rellena antes la ficha del anuncio para que el dossier tenga datos.</p>}
        <ul className="text-sm flex flex-col gap-1">
          <li>{photos.length ? `🖼️ ${photos.length} foto${photos.length > 1 ? 's' : ''} del piso` : '🖼️ Sin fotos: súbelas en «Fotos del piso»'}</li>
          <li>{cee ? '⚡ Certificado energético incluido' : '⚡ Sin certificado energético subido (en Documentos)'}</li>
        </ul>
        {photos.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Fotos en el dossier: {maxPhotos}</span>
            <input type="range" min={1} max={Math.min(16, photos.length)} value={maxPhotos} onChange={e => setMaxPhotos(Number(e.target.value))} className="accent-[var(--app-accent)]" />
          </label>
        )}
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={withPrice} onChange={() => setWithPrice(!withPrice)} className="w-5 h-5 accent-[var(--app-accent)]" />
          <span className="text-[15px]">Incluir el precio</span>
        </label>
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={withAddress} onChange={() => setWithAddress(!withAddress)} className="w-5 h-5 accent-[var(--app-accent)]" />
          <span className="text-[15px]">Incluir la dirección exacta</span>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted">{busy}</p>}
        {!ready ? (
          <button onClick={build} disabled={!!busy || !l} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px] disabled:opacity-50">Crear el dossier</button>
        ) : (
          <div className="flex flex-col gap-2">
            <button onClick={() => share(ready)} className="py-3.5 rounded-xl bg-accent text-white dark:text-bg font-bold text-[16px]">Compartir (WhatsApp…)</button>
            <button onClick={() => download(ready)} className="min-h-11 rounded-xl border border-line text-sm font-semibold">Descargar</button>
            <button onClick={() => setReady(null)} className="min-h-10 text-sm text-muted">Cambiar opciones</button>
            {ready.length > 1 && <p className="text-xs text-muted">Se comparten dos archivos: el dossier y el certificado energético en PDF.</p>}
          </div>
        )}
      </div>
    </Sheet>
  )
}
