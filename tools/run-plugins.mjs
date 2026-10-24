import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const task = process.argv[2]
if (!['build', 'test'].includes(task)) throw new Error('Use: node tools/run-plugins.mjs build|test')
const npm = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
if (!existsSync(npm)) throw new Error('Run this task through npm run build or npm test')
const plugins = readdirSync(join(root, 'plugins'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(root, 'plugins', entry.name))
  .filter(dir => existsSync(join(dir, 'package.json')))
  .filter(dir => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh?.bundle)
if (!plugins.length) throw new Error('No plugins found')
const failed = []
for (const dir of plugins) {
  console.log(`\n${task}: ${dir}`)
  const result = spawnSync(process.execPath, [npm, 'run', task], { cwd: dir, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) failed.push(dir)
}
console.log(`\n${plugins.length - failed.length}/${plugins.length} plugins passed ${task}`)
if (failed.length) {
  console.error(failed.join('\n'))
  process.exitCode = 1
}
