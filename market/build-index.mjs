#!/usr/bin/env node
// Regenerate market/index.json from the plugins in this repository.
//
// The index is format 1 (`@deepseek-ai/dsh-plugin-market-index`): each plugin
// declares its published versions, and the install spec is built as
// `name@version`. Two consequences drive this script:
//
//   * `source` is `{ type: "npm" }`. A git source needs a commit that actually
//     contains the plugin, and a git subdirectory is not installable anyway
//     (pnpm installs the repository root and ignores `&path:`).
//   * only the version in the manifest is listed. Older versions are not
//     offered: `@hwfee/dsh-usage-stats@0.1.1` registers the pre-rename bundle id
//     and takes the whole web boot down, so a market that offered it would be a
//     trap. Publish first, then run this.
//
// Usage: node market/build-index.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const registry = 'https://registry.npmjs.org'

// Category per package. Deliberately explicit: a new plugin must be filed by a
// person, not dropped into a default bucket.
const categories = {
  'dsh-cds-theme': 'appearance',
  'dsh-system-fonts': 'appearance',
  '@hwfee/dsh-genui': 'interface',
  '@hwfee/dsh-predict': 'interface',
  '@hwfee/dsh-git-bash': 'tools',
  '@hwfee/dsh-usage-stats': 'usage',
}

const categoryTitles = {
  appearance: { en: 'Appearance', zh: '外观' },
  interface: { en: 'Interface', zh: '界面' },
  tools: { en: 'Tools', zh: '工具' },
  usage: { en: 'Usage & cost', zh: '用量与费用' },
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))

async function publishTimestamp(name, version) {
  // Ask the registry directly rather than shelling out to npm: on Windows the
  // npm entry point is a .cmd, which Node refuses to spawn without a shell.
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`cannot read ${name} from npm (HTTP ${response.status})`)
  const time = (await response.json()).time ?? {}
  const stamp = time[version]
  if (!stamp) throw new Error(`${name}@${version} is not on npm - publish before building the index`)
  return Math.floor(Date.parse(stamp) / 1000)
}

const pluginDirs = readdirSync(join(root, 'plugins'))
  .filter((dir) => statSync(join(root, 'plugins', dir)).isDirectory())
  .sort()

const plugins = []
for (const dir of pluginDirs) {
  const dirPath = join(root, 'plugins', dir)
  const manifest = read(join(dirPath, 'package.json'))
  const en = read(join(dirPath, 'locale', 'en.json'))
  const zh = read(join(dirPath, 'locale', 'zh.json'))
  const category = categories[manifest.name]
  if (!category) throw new Error(`${manifest.name} has no category - add it to market/build-index.mjs`)
  if (!categoryTitles[category]) throw new Error(`category ${category} has no title in market/build-index.mjs`)
  if (!existsSync(join(dirPath, 'icon.svg'))) throw new Error(`${dir} has no icon.svg`)
  if (!en.meta?.title || !en.meta?.description) throw new Error(`${dir}/locale/en.json has no meta.title/description`)

  plugins.push({
    name: manifest.name,
    title: { en: en.meta.title, zh: zh.meta?.title ?? en.meta.title },
    icon: `https://raw.githubusercontent.com/HwFee/HwFee-dsh/master/plugins/${dir}/icon.svg`,
    description: { en: en.meta.description, zh: zh.meta?.description ?? en.meta.description },
    repository: { url: 'https://github.com/HwFee/HwFee-dsh', directory: `plugins/${dir}` },
    metadata: {
      category,
      keywords: manifest.keywords ?? [],
      labels: [],
      sortKeys: {},
    },
    versions: [
      {
        version: manifest.version,
        publishTimestamp: await publishTimestamp(manifest.name, manifest.version),
        source: { type: 'npm' },
        engines: { dsh: '>=0.2.1-rc.2' },
      },
    ],
  })
}

const used = [...new Set(plugins.map((plugin) => plugin.metadata.category))]
const index = {
  format: 1,
  title: { en: 'HwFee DSH Plugins', zh: 'HwFee 插件集' },
  description: {
    en: 'Generative UI, a prompt predictor, a Git Bash shell, a Claude Design System theme, system fonts and a usage panel for DeepSeek Harness.',
    zh: 'DeepSeek Harness 的生成式界面、下一句预测、Git Bash shell、Claude 设计系统主题、系统字体与用量面板。',
  },
  metadata: {
    categories: Object.fromEntries(used.map((id) => [id, categoryTitles[id]])),
    labels: {},
    sortKeys: {},
  },
  plugins,
}

writeFileSync(join(root, 'market', 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log(`market/index.json: ${plugins.length} plugins, ${used.length} categories`)