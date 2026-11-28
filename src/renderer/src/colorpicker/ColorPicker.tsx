import { useEffect, useRef, useState } from 'react'
import { inkOn, toHex } from '@shared/colors'
import { t } from '@shared/i18n'

const api = window.zak

/** Pixels around the pointer shown in the magnifier (odd: the middle one is the color). */
const GRID = 13
/** Size of a pixel in the magnifier. */
const CELL = 11
const LOUPE = GRID * CELL

/**
 * The eyedropper (CLAUDE.md §6.8): one of these windows per screen, over everything, shows a
 * picture of the screen taken just before. A magnifier follows the pointer, pixel by pixel; a click
 * (or Enter) takes the color under it, Esc gives up. The arrow keys move by one pixel.
 */
export function ColorPicker(): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  /** Pointer, in CSS pixels of the window. */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [hex, setHex] = useState<string | null>(null)
  const [hint, setHint] = useState(true)
  const source = useRef<{ canvas: HTMLCanvasElement; data: ImageData } | null>(null)
  const loupe = useRef<HTMLCanvasElement>(null)
  const done = useRef(false)

  const finish = (value: string | null): void => {
    if (done.current) return
    done.current = true
    void api.invoke('colorpicker:pick', value)
  }

  useEffect(() => {
    let url: string | null = null
    void api.invoke('colorpicker:setup').then((setup) => {
      if (!setup) return finish(null)
      url = URL.createObjectURL(new Blob([new Uint8Array(setup.image)], { type: 'image/png' }))
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0)
        source.current = { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) }
        setSrc(url)
        if (setup.cursor) setPos(setup.cursor)
      }
      img.src = url
    })
    const timer = setTimeout(() => setHint(false), 2600)
    return () => {
      clearTimeout(timer)
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  /** The picture's pixel under a window point. */
  const pixelAt = (p: { x: number; y: number }): { x: number; y: number } | null => {
    const s = source.current
    if (!s) return null
    const x = Math.min(s.data.width - 1, Math.max(0, Math.floor((p.x * s.data.width) / window.innerWidth)))
    const y = Math.min(s.data.height - 1, Math.max(0, Math.floor((p.y * s.data.height) / window.innerHeight)))
    return { x, y }
  }

  // The magnifier and the color under the pointer.
  useEffect(() => {
    const s = source.current
    const canvas = loupe.current
    const pixel = pos && pixelAt(pos)
    if (!s || !canvas || !pixel) return
    const i = (pixel.y * s.data.width + pixel.x) * 4
    setHex(toHex({ r: s.data.data[i]!, g: s.data.data[i + 1]!, b: s.data.data[i + 2]! }))
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, LOUPE, LOUPE)
    const half = (GRID - 1) / 2
    ctx.drawImage(s.canvas, pixel.x - half, pixel.y - half, GRID, GRID, 0, 0, LOUPE, LOUPE)
    ctx.strokeStyle = 'rgb(255 255 255 / 0.14)'
    ctx.lineWidth = 1
    for (let n = 1; n < GRID; n++) {
      ctx.beginPath()
      ctx.moveTo(n * CELL + 0.5, 0)
      ctx.lineTo(n * CELL + 0.5, LOUPE)
      ctx.moveTo(0, n * CELL + 0.5)
      ctx.lineTo(LOUPE, n * CELL + 0.5)
      ctx.stroke()
    }
    // The pixel taken.
    ctx.lineWidth = 2
    ctx.strokeStyle = '#000'
    ctx.strokeRect(half * CELL, half * CELL, CELL, CELL)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.strokeRect(half * CELL + 1.5, half * CELL + 1.5, CELL - 3, CELL - 3)
  }, [pos, src])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(null)
      } else if (e.key === 'Enter' && hex) {
        e.preventDefault()
        finish(hex)
      } else if (e.key.startsWith('Arrow') && pos) {
        e.preventDefault()
        // One picture pixel (a CSS pixel may hold two on a Retina screen).
        const s = source.current
        const step = s ? window.innerWidth / s.data.width : 1
        const by = e.shiftKey ? 10 * step : step
        const dx = e.key === 'ArrowLeft' ? -by : e.key === 'ArrowRight' ? by : 0
        const dy = e.key === 'ArrowUp' ? -by : e.key === 'ArrowDown' ? by : 0
        setPos({ x: Math.min(window.innerWidth - 1, Math.max(0, pos.x + dx)), y: Math.min(window.innerHeight - 1, Math.max(0, pos.y + dy)) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hex, pos])

  // The magnifier sits centred on the pointer, its label below (above near the bottom).
  const labelBelow = pos ? pos.y + LOUPE / 2 + 40 < window.innerHeight : true
  return (
    <div
      data-testid="color-picker"
      data-hex={hex ?? ''}
      className="fixed inset-0 cursor-none select-none overflow-hidden bg-black"
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
      onMouseDown={(e) => {
        if (e.button !== 0) return finish(null)
        const point = { x: e.clientX, y: e.clientY }
        const s = source.current
        const pixel = pixelAt(point)
        if (!s || !pixel) return
        const i = (pixel.y * s.data.width + pixel.x) * 4
        finish(toHex({ r: s.data.data[i]!, g: s.data.data[i + 1]!, b: s.data.data[i + 2]! }))
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {src && <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full" style={{ imageRendering: 'pixelated' }} />}
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 rounded-full bg-[#2E1F2D]/90 px-4 py-2 text-[13px] font-semibold text-[#F3EBF1] shadow-lg">
          {t('Cliquez pour prendre une couleur · Échap pour annuler')}
        </div>
      )}
      {pos && src && (
        <div className="pointer-events-none absolute" style={{ left: pos.x - LOUPE / 2, top: pos.y - LOUPE / 2 }}>
          <canvas
            ref={loupe}
            width={LOUPE}
            height={LOUPE}
            className="block rounded-full shadow-[0_0_0_3px_#fff,0_0_0_4px_rgb(0_0_0/0.35),0_10px_30px_rgb(0_0_0/0.45)]"
            style={{ width: LOUPE, height: LOUPE }}
          />
          {hex && (
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 font-mono text-[12.5px] font-semibold shadow-[0_0_0_1px_rgb(0_0_0/0.2),0_6px_18px_rgb(0_0_0/0.35)]"
              style={{ background: hex, color: inkOn(hex), [labelBelow ? 'top' : 'bottom']: LOUPE + 10 }}
            >
              {hex}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
