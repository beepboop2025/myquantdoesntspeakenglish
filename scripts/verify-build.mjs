import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const read = (path) => readFile(join(dist, path), 'utf8')
const requiredPages = [
  'index.html',
  'privacy/index.html',
  'support/index.html',
  'editorial/index.html',
  'corrections/index.html',
  'accessibility/index.html',
  'security/index.html',
]

const pages = await Promise.all(requiredPages.map(read))
const appFeed = JSON.parse(await read('app-feed/v1.json'))
const webFeed = JSON.parse(await read('feed.json'))
const publicText = pages.join('\n').toLowerCase()

if (appFeed.schema !== 'mqdnse.app-feed.v1') throw new Error('unexpected app-feed schema')
if (!['ACTIVE', 'SUSPENDED'].includes(appFeed.releaseStatus)) throw new Error('missing release status')
if (!Array.isArray(appFeed.stories) || appFeed.stories.length > 5) throw new Error('app edition exceeds five stories')
if (appFeed.releaseStatus === 'ACTIVE' && appFeed.stories.length === 0) throw new Error('empty edition must be suspended')
if (!Array.isArray(appFeed.notices)) throw new Error('app feed lacks correction notices')
if (!Array.isArray(webFeed.items) || webFeed.items.length > 5) throw new Error('web edition exceeds five stories')
if (publicText.includes('fonts.googleapis.com') || publicText.includes('fonts.gstatic.com')) {
  throw new Error('public HTML contacts a third-party font host')
}
if (publicText.includes('fzmovies') || publicText.includes('paramount') || publicText.includes('.mp4')) {
  throw new Error('restricted film material leaked into public HTML')
}

process.stdout.write(`Verified ${webFeed.items.length} web stories, ${appFeed.stories.length} app stories, ${appFeed.notices.length} notices, and ${requiredPages.length} trust pages\n`)
