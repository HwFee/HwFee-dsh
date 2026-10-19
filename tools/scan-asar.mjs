// Scan every .js file in an asar for byte needles; print matching paths.
// Usage: node tools/scan-asar.mjs <asar> <needle1> [needle2...]
import fs from 'node:fs'

const [asar, ...needles] = process.argv.slice(2)
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const hs = head.readUInt32LE(12)
const hb = Buffer.alloc(hs)
fs.readSync(fd, hb, 0, hs, 16)
const header = JSON.parse(hb.toString())
const files = []
function walk(o, pp) {
  for (const k of Object.keys(o.files || {})) {
    const f = o.files[k]
    const np = pp ? pp + '/' + k : k
    if (f.size !== undefined && f.offset !== undefined) files.push({ np, off: 16 + hs + parseInt(f.offset, 10), size: f.size })
    if (f.files) walk(f, np)
  }
}
walk(header, '')
const nbs = needles.map((n) => Buffer.from(n))
for (const h of files) {
  if (h.size > 8 * 1024 * 1024) continue
  const buf = Buffer.alloc(h.size)
  fs.readSync(fd, buf, 0, h.size, h.off)
  const hit = needles.filter((n, i) => buf.includes(nbs[i]))
  if (hit.length) console.log(h.np + '  (' + h.size + ')  hits: ' + hit.join(', '))
}
fs.closeSync(fd)
