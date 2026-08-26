import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  publicStoryUrl,
  reviewedConsumerCopy,
  storySlug,
  validAppCopyDocument,
} from './lib.mjs'

const root = process.cwd()
const dist = join(root, 'dist')
const SITE_ORIGIN = 'https://myquantdoesntspeakenglish.com'
const read = (path) => readFile(join(dist, path), 'utf8')
const readSourceJson = (path) => readFile(join(root, path), 'utf8').then(JSON.parse)
const requiredPages = [
  'index.html',
  'follow/index.html',
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
const [cache, appCopy, contentStatus, releasePolicy] = await Promise.all([
  readSourceJson('data/cache.json'),
  readSourceJson('data/app-copy.json'),
  readSourceJson('data/content-status.json'),
  readSourceJson('data/release-policy.json'),
])
const houseNames = (await readdir(join(root, 'content'))).filter((name) => name.endsWith('.json'))
const houseRecords = await Promise.all(houseNames.map((name) => readSourceJson(join('content', name))))
const publicText = pages.join('\n').toLowerCase()
const homepage = pages[0]
const followPage = pages[requiredPages.indexOf('follow/index.html')]

if (!/<meta name="google-site-verification" content="[A-Za-z0-9_-]+">/.test(homepage)) {
  throw new Error('homepage is missing Google Search Console ownership verification')
}
if (!homepage.includes('<a href="/follow">Follow</a>')
  || !homepage.includes('class="hero-jump hero-jump--follow" href="/follow"')) {
  throw new Error('homepage does not expose the follow hub in navigation and hero')
}
for (const required of [
  'Close the tab.<br><em>Keep the signal.</em>',
  'No account, no cookie, no tracking pixel.',
  'https://t.me/LiquiLens_bot?start=myquant_follow_liquilens',
  'https://t.me/seiche_desk_bot?start=myquant_follow_seiche',
  'https://t.me/undertow_LiquiLens_bot?start=myquant_follow_undertow',
  'https://t.me/palimpsest_watch_bot?start=myquant_follow_palimpsest',
  'https://t.me/NarcoScopeEvidenceBot?start=ref_myquant_follow',
  'https://t.me/LiquidityLabDesk',
  'href="/feed.xml"',
  'href="/feed.json"',
]) {
  if (!followPage.includes(required)) throw new Error(`follow hub omits ${required}`)
}
if ((followPage.match(/rel="noopener noreferrer"/g) || []).length !== 6) {
  throw new Error('follow hub external delivery links are not consistently isolated')
}

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
const expectedSourceRecords = Object.values(cache.feeds || {}).flat()
  .filter((story) => story?.publicationStatus === 'PUBLISHED' && !withdrawnIds.has(story.id))
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

if (appFeed.schema !== 'mqdnse.app-feed.v1') throw new Error('unexpected app-feed schema')
if (!validAppCopyDocument(appCopy)) {
  throw new Error('reviewed copy does not use the revision-bound app-copy contract')
}
if (webFeed.version !== 'https://jsonfeed.org/version/1.1'
  || webFeed._mqdnse?.schema !== 'mqdnse.web-feed.v1'
  || webFeed._mqdnse?.itemSchema !== 'mqdnse.web-feed-item.v1'
  || webFeed._mqdnse?.authority !== 'PUBLIC_EDITORIAL_ARCHIVE'
  || webFeed._mqdnse?.appDistribution !== 'SUSPENDED_SEPARATE_CHANNEL') {
  throw new Error('web feed lost its channel or evidence contract')
}
if (releasePolicy.channels?.site?.mode !== 'SOURCE_PUBLISHED') throw new Error('website archive mode is not enabled')
if (releasePolicy.channels?.['app-feed']?.mode !== 'SUSPENDED') throw new Error('app feed is not explicitly suspended')
if (appFeed.releaseStatus !== 'SUSPENDED') throw new Error('app feed must report SUSPENDED')
if (!Array.isArray(appFeed.stories) || appFeed.stories.length !== 0) throw new Error('suspended app feed must contain zero stories')
if (!Array.isArray(appFeed.notices)) throw new Error('app feed lacks correction notices')
if (!Array.isArray(webFeed.items) || JSON.stringify(actualWebIds) !== JSON.stringify(expectedWebIds)) {
  throw new Error(`web archive mismatch: expected ${expectedWebIds.length}, received ${actualWebIds.length}`)
}
for (const item of webFeed.items) {
  const extension = item._mqdnse
  const evidence = extension?.evidence
  const copy = extension?.copy
  if (extension?.schema !== 'mqdnse.web-feed-item.v1'
    || extension.sourceRecordId !== item.id
    || !['INTERPRETED', 'MYQUANT_ANALYSIS'].includes(extension.lane)
    || !extension.product
    || !extension.beat
    || !extension.editorialClass
    || !extension.articleType
    || !extension.sourceUrl?.startsWith('https://')
    || !evidence?.status
    || !evidence?.eventTime
    || !evidence?.knowledgeTime
    || evidence.publicationStatus !== 'PUBLISHED'
    || !evidence?.contribution
    || !evidence?.limitation
    || !evidence?.sourceFingerprint
    || !copy?.state
    || !copy?.inEnglish
    || !copy?.whyItMatters
    || !copy?.uncertainty
    || !Array.isArray(extension.sources)
    || !extension.sources.length) {
    throw new Error(`web feed item lost its evidence extension: ${item.id}`)
  }
  if (item.summary !== copy.inEnglish) {
    throw new Error(`web feed summary diverges from its evidence extension: ${item.id}`)
  }
  if (extension.lane === 'INTERPRETED' && item.external_url !== extension.sourceUrl) {
    throw new Error(`interpreted web feed item lost its canonical source: ${item.id}`)
  }
}
if ((homepage.match(/data-story(?:\s|>)/g) || []).length !== expectedWebIds.length) {
  throw new Error('homepage does not render every website archive record')
}
if ((atomFeed.match(/<entry>/g) || []).length !== expectedWebIds.length) {
  throw new Error('Atom feed does not contain every website archive record')
}
for (const story of expectedSourceRecords) {
  const page = await read(join('interpreted', storySlug(story), 'index.html'))
  const expectedUrl = publicStoryUrl(story)
  const feedItem = webFeed.items.find((item) => item.id === story.id)
  if (feedItem?.url !== expectedUrl || feedItem?.external_url !== story.url) {
    throw new Error(`interpretation feed routes are incomplete for ${story.id}`)
  }
  if (feedItem?._mqdnse?.evidence?.sourceFingerprint !== story.fingerprint
    || feedItem?._mqdnse?.copy?.uncertainty !== story.limitation) {
    throw new Error(`interpretation feed evidence diverges from source cache for ${story.id}`)
  }
  const expectedCopyState = reviewedConsumerCopy(story, appCopy.stories[story.id])
    ? 'REVIEWED'
    : 'SOURCE_GROUNDED'
  if (feedItem?._mqdnse?.copy?.state !== expectedCopyState) {
    throw new Error(`interpretation copy state is not bound to the current source revision: ${story.id}`)
  }
  if (!page.includes(`href="${story.url.replaceAll('&', '&amp;')}"`)
    || !page.includes('INTERPRETED /')
    || !page.includes(story.limitation.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'))) {
    throw new Error(`interpretation page lost source provenance or boundary for ${story.id}`)
  }
  if (story.articleType === 'case_file') {
    if (story.pointInTimeStatus !== 'RECONSTRUCTED_LATER'
      || !story.verdicts
      || !page.includes('HISTORICAL CASE FILE / MISSES INCLUDED')
      || !Object.values(story.verdicts).every((verdict) => page.includes(`>${verdict}<`))) {
      throw new Error(`historical case file lost grading or point-in-time status for ${story.id}`)
    }
  }
}
for (const article of houseRecords.filter((record) => record.publication_status === 'PUBLISHED')) {
  const page = await read(join('articles', article.slug, 'index.html'))
  if (!page.includes(escapeHtml(article.original_contribution))
    || !article.limitations.every((limitation) => page.includes(escapeHtml(limitation)))
    || !article.sources.every((source) => page.includes(`href="${escapeHtml(source.url)}"`))) {
    throw new Error(`house article lost contribution, boundary, or sources: ${article.slug}`)
  }
  if (article.article_type === 'news_analysis') {
    const gateValues = [
      article.news_gate?.network_relevance,
      article.news_gate?.countercase,
      article.news_gate?.falsifier,
      article.news_gate?.revision_risk,
      article.news_gate?.forecast_boundary,
    ]
    if (!page.includes('NEWS ANALYSIS LEDGER / FAIL-CLOSED')
      || !gateValues.every((value) => page.includes(escapeHtml(value)))
      || !article.sources.filter((source) => source.type === 'primary_event')
        .every((source) => page.includes(escapeHtml(source.release_id)))) {
      throw new Error(`news analysis lost its public evidence ledger: ${article.slug}`)
    }
  }
}
const sitemap = await read('sitemap.xml')
if (expectedSourceRecords.some((story) => !sitemap.includes(publicStoryUrl(story)))) {
  throw new Error('sitemap omits a specialist interpretation page')
}
const htmlNames = (await readdir(dist, { recursive: true }))
  .filter((name) => name === 'index.html' || name.endsWith('/index.html'))
for (const name of htmlNames) {
  const page = await read(name)
  const canonical = page.match(/<link rel="canonical" href="([^"]+)">/)?.[1]
  const route = name === 'index.html' ? '/' : `/${name.replace(/\/index\.html$/, '')}`
  const expected = route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`
  if (canonical !== expected) throw new Error(`${name}: canonical ${canonical || 'missing'} does not match ${expected}`)
  if (!sitemap.includes(`<loc>${expected}</loc>`)) throw new Error(`${name}: canonical URL is absent from sitemap`)
}
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
if (sitemapUrls.some((url) => new URL(url).pathname !== '/' && new URL(url).pathname.endsWith('/'))) {
  throw new Error('sitemap contains a redirecting trailing-slash URL')
}
const structuredData = [...homepage.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)]
  .map((match) => JSON.parse(match[1]))
const graph = structuredData.find((value) => Array.isArray(value['@graph']))?.['@graph'] || []
for (const type of ['Organization', 'WebSite', 'CollectionPage']) {
  if (!graph.some((node) => node['@type'] === type)) throw new Error(`homepage schema is missing ${type}`)
}
const robots = await read('robots.txt')
for (const agent of ['Googlebot', 'Google-Extended', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
  if (!robots.includes(`User-agent: ${agent}\nAllow: /`)) throw new Error(`robots.txt does not explicitly allow ${agent}`)
}
const llms = await read('llms.txt')
for (const source of ['https://seiche.info/', 'https://liquilens.in/', 'https://liquilens-undertow.com/']) {
  if (!llms.includes(source)) throw new Error(`llms.txt omits specialist source ${source}`)
}
for (const route of ['/api/v1/capabilities', '/openapi.json', '/mcp', '/.well-known/mcp.json', '/.well-known/ai-catalog.json']) {
  if (!llms.includes(`${SITE_ORIGIN}${route}`)) throw new Error(`llms.txt omits discovery route ${route}`)
}
const [serverManifest, publicServerManifest, openapi, mcpDiscovery, aiCatalog] = await Promise.all([
  readSourceJson('server.json'),
  read('server.json').then(JSON.parse),
  read('openapi.json').then(JSON.parse),
  read('.well-known/mcp.json').then(JSON.parse),
  read('.well-known/ai-catalog.json').then(JSON.parse),
])
if (JSON.stringify(publicServerManifest) !== JSON.stringify(serverManifest)
  || serverManifest.name !== 'io.github.beepboop2025/myquant-editorial'
  || serverManifest.version !== '2.1.0'
  || serverManifest.remotes?.[0]?.url !== `${SITE_ORIGIN}/mcp`) {
  throw new Error('server.json does not describe the public editorial MCP endpoint')
}
if (openapi.openapi !== '3.1.0'
  || openapi.info?.version !== '1.1.0'
  || !openapi.paths?.['/api/v1/capabilities']?.get
  || !openapi.paths?.['/api/v1/health']?.get) {
  throw new Error('curated OpenAPI document is incomplete')
}
if (mcpDiscovery.canonicalCatalog !== `${SITE_ORIGIN}/.well-known/ai-catalog.json`
  || mcpDiscovery.servers?.length !== 1
  || mcpDiscovery.servers[0]?.name !== serverManifest.name
  || mcpDiscovery.servers[0]?.url !== `${SITE_ORIGIN}/mcp`) {
  throw new Error('well-known MCP discovery is not canonical')
}
const mcpEntry = aiCatalog.entries?.find((entry) => entry.type === 'application/json')
const openapiEntry = aiCatalog.entries?.find((entry) => entry.type === 'application/vnd.oai.openapi+json')
if (aiCatalog.specVersion !== '1.0'
  || JSON.stringify(mcpEntry?.data) !== JSON.stringify(serverManifest)
  || mcpEntry?.metadata?.releaseState !== 'available'
  || mcpEntry?.metadata?.publicToolCount !== 5
  || mcpEntry?.capabilities?.join(',') !== 'list_capabilities,get_health,latest_stories,get_story,search_stories'
  || openapiEntry?.url !== `${SITE_ORIGIN}/openapi.json`) {
  throw new Error('AI catalog is not bound to server.json and OpenAPI')
}
if (!homepage.includes('rel="ai-catalog"')
  || !homepage.includes('href="/.well-known/ai-catalog.json"')) {
  throw new Error('homepage does not advertise the AI catalog')
}
if (publicText.includes('fonts.googleapis.com') || publicText.includes('fonts.gstatic.com')) {
  throw new Error('public HTML contacts a third-party font host')
}
if (!homepage.includes('/assets/media/original-app-teaser-1080x1920.mp4')) {
  throw new Error('original website teaser is missing from the homepage')
}
if (homepage.includes('myquant-app.vercel.app')) throw new Error('paused app preview is still promoted')
const originalTeaser = await readFile(join(dist, 'assets', 'media', 'original-app-teaser-1080x1920.mp4'))
if (originalTeaser.byteLength < 100_000) throw new Error('original website teaser is missing or truncated')

const caseFileCount = expectedSourceRecords.filter((story) => story.articleType === 'case_file').length
process.stdout.write(`Verified ${expectedSourceRecords.length} specialist interpretations including ${caseFileCount} historical case files, ${webFeed.items.length} total web articles, suspended zero-story app feed, original teaser, ${appFeed.notices.length} notices, and ${requiredPages.length} required pages\n`)
