// Extract files from an asar archive to .repro/, mirroring paths.
// Usage: node tools/extract-asar.mjs <asar> <outdir> <path-in-asar> [<path-in-asar>...]
//        node tools/extract-asar.mjs <asar> --list <substr>   — list matching paths
import fs from 'node:fs'
import path from 'node:path'

const [asar, outdirOrList, ...targets] = process.argv.slice(2)
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const headerBuf = Buffer.alloc(headerSize)
fs.readSync(fd, headerBuf, 0, headerSize, 16)
const header = JSON.parse(headerBuf.toString())

function walk(o, p, fn) {
  for (const k of Object.keys(o.files || {})) {
    const f = o.files[k]
    const np = p ? p + '/' + k : k
    fn(np, f)
    if (f.files) walk(f, np, fn)
  }
}

if (outdirOrList === '--list') {
  const sub = targets[0] || ''
  walk(header, '', (np) => { if (np.includes(sub)) console.log(np) })
  process.exit(0)
}

const outdir = outdirOrList
for (const target of targets) {
  let found = null
  walk(header, '', (np, f) => { if (np === target) found = { np, f } })
  if (!found) { console.error('NOT FOUND: ' + target); continue }
  const off = 16 + headerSize + parseInt(found.f.offset, 10)
  const buf = Buffer.alloc(found.f.size)
  fs.readSync(fd, buf, 0, found.f.size, off)
  const dest = path.join(outdir, found.np)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  console.log(found.np + ' -> ' + dest + ' (' + found.f.size + ')')
}
fs.closeSync(fd)
