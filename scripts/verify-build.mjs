import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const read = (path) => readFile(join(dist, path), 'utf8')
const readSourceJson = (path) => readFile(join(root, path), 'utf8').then(JSON.parse)
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
const atomFeed = await read('feed.xml')
const [cache, contentStatus, releasePolicy] = await Promise.all([
  readSourceJson('data/cache.json'),
  readSourceJson('data/content-status.json'),
  readSourceJson('data/release-policy.json'),
])
const houseNames = (await readdir(join(root, 'content'))).filter((name) => name.endsWith('.json'))
const houseRecords = await Promise.all(houseNames.map((name) => readSourceJson(join('content', name))))
const publicText = pages.join('\n').toLowerCase()
const homepage = pages[0]

const appliesToSite = (entry) => Array.isArray(entry?.channels)
  && (entry.channels.includes('*') || entry.channels.includes('site'))
const withdrawnIds = new Set(Object.entries(contentStatus.entries || {})
  .filter(([, entry]) => appliesToSite(entry) && ['RETRACTED', 'SUPERSEDED'].includes(entry.status))
  .map(([id]) => id))
const expectedWebIds = [
  ...Object.values(cache.feeds || {}).flat()
    .filter((story) => story?.publicationStatus === 'PUBLISHED')
    .map((story) => story.id),
  ...houseRecords
    .filter((article) => article?.publication_status === 'PUBLISHED')
    .map((article) => `myquant:${article.slug}`),
].filter((id) => !withdrawnIds.has(id)).sort()
const actualWebIds = webFeed.items.map((item) => item.id).sort()

if (appFeed.schema !== 'mqdnse.app-feed.v1') throw new Error('unexpected app-feed schema')
if (releasePolicy.channels?.site?.mode !== 'SOURCE_PUBLISHED') throw new Error('website archive mode is not enabled')
if (releasePolicy.channels?.['app-feed']?.mode !== 'SUSPENDED') throw new Error('app feed is not explicitly suspended')
if (appFeed.releaseStatus !== 'SUSPENDED') throw new Error('app feed must report SUSPENDED')
if (!Array.isArray(appFeed.stories) || appFeed.stories.length !== 0) throw new Error('suspended app feed must contain zero stories')
if (!Array.isArray(appFeed.notices)) throw new Error('app feed lacks correction notices')
if (!Array.isArray(webFeed.items) || JSON.stringify(actualWebIds) !== JSON.stringify(expectedWebIds)) {
  throw new Error(`web archive mismatch: expected ${expectedWebIds.length}, received ${actualWebIds.length}`)
}
if ((homepage.match(/data-story(?:\s|>)/g) || []).length !== expectedWebIds.length) {
  throw new Error('homepage does not render every website archive record')
}
if ((atomFeed.match(/<entry>/g) || []).length !== expectedWebIds.length) {
  throw new Error('Atom feed does not contain every website archive record')
}
if (publicText.includes('fonts.googleapis.com') || publicText.includes('fonts.gstatic.com')) {
  throw new Error('public HTML contacts a third-party font host')
}
if (publicText.includes('fzmovies') || publicText.includes('paramount') || publicText.includes('quant-tape-')) {
  throw new Error('restricted film material leaked into public HTML')
}
if (!homepage.includes('/assets/media/original-app-teaser-1080x1920.mp4')) {
  throw new Error('original website teaser is missing from the homepage')
}
if (homepage.includes('myquant-app.vercel.app')) throw new Error('paused app preview is still promoted')
const originalTeaser = await readFile(join(dist, 'assets', 'media', 'original-app-teaser-1080x1920.mp4'))
if (originalTeaser.byteLength < 100_000) throw new Error('original website teaser is missing or truncated')

process.stdout.write(`Verified the complete ${webFeed.items.length}-record web archive, suspended zero-story app feed, original teaser, ${appFeed.notices.length} notices, and ${requiredPages.length} trust pages\n`)
