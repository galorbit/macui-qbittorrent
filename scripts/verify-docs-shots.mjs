/**
 * Independent check that the README screenshots contain real content.
 *
 * Decoding the PNG gives per-pixel colour data, so "is this blank?" can be
 * answered without looking at the image. A blank page is a near-uniform
 * background gradient; a rendered page has text and controls, which shows up as
 * many distinct colours and a wide spread of luminance.
 *
 * This is deliberately NOT the same code that produced the images — a separate
 * measure is what makes it a check rather than a restatement.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/** Minimal PNG decoder: enough for RGBA/RGB non-interlaced files. */
function decodePng(buf) {
  let pos = 8
  const idat = []
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
    pos += 12 + len
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error(`unsupported colour type ${colorType}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)

  // Undo the per-scanline filters.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 0xff
    }
  }

  return { width, height, channels, pixels: out }
}

const dir = process.argv[2] ?? 'docs/screenshots'
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()

let failures = 0
console.log('Screenshot content check (decoded pixels, not file size)\n')

for (const file of files) {
  const { width, height, channels, pixels } = decodePng(fs.readFileSync(path.join(dir, file)))

  // Sample a grid — every 4th pixel is plenty.
  const colours = new Set()
  let min = 255
  let max = 0
  let n = 0
  let bright = 0

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * channels
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      colours.add((r << 16) | (g << 8) | b)
      const lum = (r * 299 + g * 587 + b * 114) / 1000
      if (lum < min) min = lum
      if (lum > max) max = lum
      if (lum > 90) bright += 1
      n += 1
    }
  }

  const spread = max - min
  const brightPct = (bright / n) * 100

  /*
   * Thresholds, CALIBRATED against a known-blank screenshot rather than guessed.
   *
   * The blank settings.png that shipped (a bare background gradient) measured:
   *     colours=132   bright=0.0%   spread=17
   * The real screenshots measure:
   *     colours 750-1063   bright 1.1-3.8%   spread ~233
   *
   * So the two populations are separated by roughly 6x on colour count and by
   * the entire bright-pixel range. An earlier guess of "colours > 3000" rejected
   * every good image, because a dark theme legitimately uses few distinct
   * colours — the check must be calibrated, not imagined.
   *
   * `spread` (luminance range) is the most robust signal: a gradient spans ~17
   * levels, a page with text and controls spans the full range.
   */
  const ok = colours.size > 400 && brightPct > 0.3 && spread > 120

  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${file.padEnd(22)} ${width}x${height}  colours=${String(colours.size).padStart(6)}  bright=${brightPct.toFixed(1)}%  spread=${spread.toFixed(0)}`,
  )
}

console.log(
  failures === 0
    ? `\nRESULT: all ${files.length} screenshots contain rendered content`
    : `\nRESULT: ${failures} screenshot(s) look blank`,
)
process.exit(failures === 0 ? 0 : 1)
