import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SITE_ORIGIN,
  SOURCES,
  applyContentStatus,
  applyPublicationApprovals,
  applyPublicationHolds,
  applyReleasePolicy,
  buildAppFeed,
  buildSignalPulse,
  chooseLead,
  normalizeHouseArticle,
  normalizePayload,
  preserveStableClocks,
  productLabel,
} from './lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const cachePath = join(root, 'data', 'cache.json')
const appCopyPath = join(root, 'data', 'app-copy.json')
const publicationHoldsPath = join(root, 'data', 'publication-holds.json')
const publicationApprovalsPath = join(root, 'data', 'publication-approvals.json')
const contentStatusPath = join(root, 'data', 'content-status.json')
const releasePolicyPath = join(root, 'data', 'release-policy.json')
const BRAND_NAME = 'my quant doesn’t speak english'
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const escapeXml = escapeHtml
const isoDate = (value) => new Date(value).toISOString()
const shortDate = (value) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(value))

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': `mqdnse-builder/0.1 (+${SITE_ORIGIN})` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function readCache() {
  try { return await readJson(cachePath) } catch { return { feeds: {}, statuses: {} } }
}

async function syncFeeds() {
  const cached = await readCache()
  const feeds = {}
  const statuses = {}

  for (const source of SOURCES) {
    try {
      const payload = await fetchJson(source.url)
      const normalized = normalizePayload(payload, source)
      feeds[source.product] = preserveStableClocks(normalized, cached.feeds?.[source.product])
      statuses[source.product] = { state: 'live', detail: `${feeds[source.product].length} records` }
    } catch (error) {
      const fallback = Array.isArray(cached.feeds?.[source.product]) ? cached.feeds[source.product] : []
      if (!fallback.length) throw new Error(`${source.label}: ${error.message}; no cache available`)
      feeds[source.product] = fallback
      statuses[source.product] = { state: 'cached', detail: `${fallback.length} records · refresh failed` }
    }
  }

  const next = { schema: 'mqdnse.feed-cache.v1', syncedAt: new Date().toISOString(), feeds, statuses }
  await mkdir(dirname(cachePath), { recursive: true })
  const changed = JSON.stringify(cached.feeds) !== JSON.stringify(feeds)
    || JSON.stringify(cached.statuses) !== JSON.stringify(statuses)
  if (changed) {
    await writeFile(cachePath, `${JSON.stringify(next, null, 2)}\n`)
  }
  return next
}

async function loadHouseArticles() {
  const dir = join(root, 'content')
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()
  const records = []
  for (const name of names) {
    const raw = await readJson(join(dir, name))
    const normalized = normalizeHouseArticle(raw)
    if (!normalized) throw new Error(`${name}: invalid or unpublished house article`)
    records.push(normalized)
  }
  return records
}

function head({ title, description, canonical, type = 'website' }) {
  return `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/feed+json" href="${SITE_ORIGIN}/feed.json" title="${BRAND_NAME}">
  <link rel="alternate" type="application/atom+xml" href="${SITE_ORIGIN}/feed.xml" title="${BRAND_NAME}">
  <meta name="theme-color" content="#1746d1">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/og-card.svg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/assets/styles.css">`
}

function masthead() {
  return `<header class="site-head">
    <a class="wordmark" href="/" aria-label="${BRAND_NAME} home">
      <span>my quant</span><span>doesn’t speak</span><span>english.com</span>
    </a>
    <nav aria-label="Primary">
      <a href="/#signals">Signal map</a>
      <a href="/#wire">Every dispatch</a>
      <a href="https://myquant-app.vercel.app/">Open app preview</a>
      <a href="/articles/why-the-quant-needs-subtitles/">House rules</a>
      <a class="nav-ad" href="/advertise/">Advertise, tastefully</a>
    </nav>
  </header>`
}

function storyCard(story, index) {
  const label = productLabel(story.product)
  return `<li class="story-card" data-story data-product="${escapeHtml(story.product)}" data-search="${escapeHtml(`${story.title} ${story.dek} ${story.beat} ${label}`.toLowerCase())}">
    <div class="story-index">${String(index + 1).padStart(2, '0')}</div>
    <article>
      <div class="story-meta"><span class="product product-${escapeHtml(story.product)}">${escapeHtml(label)}</span><time datetime="${escapeHtml(isoDate(story.published))}">${escapeHtml(shortDate(story.published))}</time><span>${escapeHtml(story.editorialClass.replaceAll('_', ' '))}</span></div>
      ${story.contentNotice ? `<p class="content-notice"><strong>${escapeHtml(story.contentNotice.status)}</strong> · ${escapeHtml(story.contentNotice.summary)}</p>` : ''}
      <h3><a href="${escapeHtml(story.url)}">${escapeHtml(story.title)}</a></h3>
      <p>${escapeHtml(story.dek)}</p>
      <div class="evidence-line"><span>${escapeHtml(story.evidenceStatus)}</span><span>${escapeHtml(story.contribution)}</span></div>
    </article>
    <aside><b>Boundary</b><p>${escapeHtml(story.limitation)}</p><a href="${escapeHtml(story.url)}">Read the record ↗</a></aside>
  </li>`
}

function sourceStatus(cache, product, publicCount) {
  const status = cache.statuses[product] || { state: 'gap', detail: 'status unavailable' }
  const detail = status.state === 'cached'
    ? `${publicCount} public records · refresh failed`
    : `${publicCount} public records`
  return `<li data-state="${escapeHtml(status.state)}"><span>${escapeHtml(productLabel(product))}</span><b>${escapeHtml(status.state)}</b><small>${escapeHtml(detail)}</small></li>`
}

const GRAPH_PRODUCTS = [
  { id: 'seiche', label: 'Seiche', layer: 'System' },
  { id: 'myquant', label: 'House', layer: 'Editorial' },
]

function cadenceSvg(pulse, windowSize = 14) {
  const days = pulse.days.slice(-windowSize)
  const width = 760
  const height = 252
  const left = 46
  const right = 18
  const top = 22
  const baseline = 198
  const chartHeight = baseline - top
  const step = (width - left - right) / Math.max(1, days.length)
  const barWidth = Math.max(5, step - Math.min(10, step * 0.28))
  const max = Math.max(1, ...days.map((day) => Object.values(day.counts).reduce((sum, count) => sum + count, 0)))
  const labelEvery = Math.max(1, Math.ceil(days.length / 7))
  const bars = days.map((day, index) => {
    const x = left + index * step + (step - barWidth) / 2
    let y = baseline
    const total = Object.values(day.counts).reduce((sum, count) => sum + count, 0)
    const segments = GRAPH_PRODUCTS.map((product) => {
      const count = day.counts[product.id] || 0
      if (!count) return ''
      const segmentHeight = Math.max(4, count / max * chartHeight)
      y -= segmentHeight
      return `<rect class="pulse-${product.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segmentHeight.toFixed(2)}" rx="2" />`
    }).join('')
    const label = index % labelEvery === 0 || index === days.length - 1
      ? `<text x="${(x + barWidth / 2).toFixed(2)}" y="226" text-anchor="middle">${escapeHtml(day.date.slice(5))}</text>`
      : ''
    const detail = GRAPH_PRODUCTS.map((product) => `${product.label} ${day.counts[product.id] || 0}`).join(', ')
    return `<g class="cadence-day" data-date="${day.date}" tabindex="0"><title>${day.date}: ${total} records; ${detail}</title>${segments}${label}</g>`
  }).join('')
  const grid = [0, .5, 1].map((ratio) => {
    const y = baseline - ratio * chartHeight
    return `<g class="cadence-grid"><line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text x="${left - 10}" y="${y + 4}" text-anchor="end">${Math.round(max * ratio)}</text></g>`
  }).join('')
  return `<svg id="cadenceChart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Published records per day over the latest ${days.length} days, stacked by product"><desc>Interactive dispatch cadence chart. Use the range controls to show seven, fourteen, or twenty-eight days.</desc>${grid}${bars}</svg>`
}

function mixGraphic(pulse) {
  let offset = 0
  const rings = GRAPH_PRODUCTS.map((product) => {
    const count = pulse.totals[product.id] || 0
    const percent = pulse.recordCount ? count / pulse.recordCount * 100 : 0
    const circle = `<circle class="mix-${product.id}" cx="80" cy="80" r="58" pathLength="100" stroke-dasharray="${percent.toFixed(3)} ${(100 - percent).toFixed(3)}" stroke-dashoffset="${(-offset).toFixed(3)}"/>`
    offset += percent
    return circle
  }).join('')
  const legend = GRAPH_PRODUCTS.map((product) => {
    const count = pulse.totals[product.id] || 0
    const percent = pulse.recordCount ? Math.round(count / pulse.recordCount * 100) : 0
    return `<button type="button" data-route-filter="${product.id}"><i class="mix-${product.id}"></i><span>${product.label}</span><b>${count}</b><small>${percent}%</small></button>`
  }).join('')
  return `<div class="mix-wrap"><svg class="mix-ring" viewBox="0 0 160 160" role="img" aria-label="Source mix across ${pulse.recordCount} published records">${rings}<text x="80" y="75" text-anchor="middle">${pulse.recordCount}</text><text x="80" y="94" text-anchor="middle">records</text></svg><div class="mix-legend">${legend}</div></div>`
}

function signalMap() {
  return `<svg class="signal-map" viewBox="0 0 920 278" role="group" aria-labelledby="signal-map-title signal-map-desc">
    <title id="signal-map-title">The public evidence route</title>
    <desc id="signal-map-desc">Select Seiche for broad system-funding records or the house desk for plain-English editorial notes.</desc>
    <path class="route-line" d="M274 132 C380 30 540 30 646 132"/>
    <path class="route-current" d="M274 132 C380 30 540 30 646 132"/>
    <g class="route-node route-seiche" data-route-filter="seiche" role="button" tabindex="0" aria-label="Filter to Seiche system-funding dispatches" transform="translate(200 82)"><rect width="148" height="100" rx="50"/><text x="74" y="43" text-anchor="middle">01 / SYSTEM</text><text class="node-name" x="74" y="66" text-anchor="middle">SEICHE</text></g>
    <g class="route-node route-myquant" data-route-filter="myquant" role="button" tabindex="0" aria-label="Filter to original house reporting" transform="translate(562 82)"><rect width="168" height="100" rx="50"/><text x="84" y="43" text-anchor="middle">02 / EDITORIAL</text><text class="node-name" x="84" y="66" text-anchor="middle">SUBTITLES</text></g>
    <text class="map-hint" x="460" y="254" text-anchor="middle">CLICK A LAYER TO TUNE THE WIRE</text>
  </svg>`
}

function signalCockpit(pulse) {
  return `<section class="signal-cockpit" id="signals" aria-labelledby="signals-title">
    <header class="cockpit-head"><div><p class="eyebrow">THE PUBLIC EDITION, MAPPED</p><h2 id="signals-title">One evidence wire.<br><em>A translator at the end.</em></h2></div><p>Every mark below comes from records in the current public edition. Material held for review does not enter these counts.</p></header>
    <div class="cockpit-grid">
      <article class="flow-panel"><header><span>A / SIGNAL ROUTE</span><p>Broad system data becomes an explanation you can inspect.</p></header>${signalMap()}</article>
      <article class="cadence-panel"><header><div><span>B / DISPATCH CADENCE</span><p>Daily output, stacked by the desk that published it.</p></div><div class="range-buttons" role="group" aria-label="Dispatch cadence range"><button type="button" data-window="7">7D</button><button type="button" data-window="14" class="active">14D</button><button type="button" data-window="28">28D</button></div></header>${cadenceSvg(pulse)}</article>
      <article class="mix-panel"><header><span>C / SOURCE MIX</span><p>What this edition of the wire is actually made of.</p></header>${mixGraphic(pulse)}</article>
    </div>
    <script id="signalPulseData" type="application/json">${JSON.stringify(pulse).replaceAll('<', '\\u003c')}</script>
  </section>`
}

function renderHome(stories, cache, consumerCopy) {
  const lead = chooseLead(stories)
  const leadTranslation = consumerCopy?.[lead?.id]?.inEnglish || lead?.dek
  const counts = Object.fromEntries(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'].map((product) => [product, stories.filter((story) => story.product === product).length]))
  const ordered = [...stories].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  const pulse = buildSignalPulse(ordered, 28)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: BRAND_NAME,
    url: SITE_ORIGIN,
    description: 'A finite public edition of sourced market dispatches and plain-English editorial notes.',
    relatedLink: 'https://narcoscope.com/',
    hasPart: ordered.slice(0, 20).map((story) => ({ '@type': 'Article', headline: story.title, url: story.url, datePublished: isoDate(story.published) })),
  }

  return `<!doctype html>
<html lang="en"><head>${head({
    title: `${BRAND_NAME} — finance, with subtitles`,
    description: 'A finite public edition of sourced market dispatches, caveats, and plain-English explanations.',
    canonical: `${SITE_ORIGIN}/`,
  })}</head><body>
  <a class="skip" href="#wire">Skip to every dispatch</a>
  ${masthead()}
  <main>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">MARKET JARGON / TRANSLATED</p>
        <h1 id="hero-title">The numbers are fluent.<br><em>The headlines need subtitles.</em></h1>
        <p class="hero-dek">One finite wire for market plumbing and the explanation it deserves. Serious evidence. Less-serious furniture.</p>
        <a class="hero-jump" href="#wire">Read the evidence ↓</a>
      </div>
      <div class="hero-proof" aria-labelledby="hero-proof-title">
        <div class="proof-card">
          <div class="proof-head"><span>THE READING CONTRACT</span><span>FINITE EDITION</span></div>
          <div class="proof-body">
            <span class="proof-number" aria-hidden="true">05</span>
            <p class="proof-kicker">UP TO FIVE STORIES</p>
            <h2 id="hero-proof-title">Read the market.<br><em>Reach the end.</em></h2>
            <ul class="proof-list">
              <li><span>01</span> Plain-English translation</li>
              <li><span>02</span> The number that matters</li>
              <li><span>03</span> Sources and caveats attached</li>
            </ul>
          </div>
          <p class="proof-foot">NO INFINITE SCROLL / NO MYSTERY RECEIPTS</p>
        </div>
      </div>
    </section>

    <section class="subtitle-machine" aria-labelledby="translation-title">
      <div><span id="translation-title">QUANT SAYS</span><p>${escapeHtml(lead?.title || 'No lead passed the evidence gate.')}</p></div>
      <div><span>NORMAL PERSON HEARS</span><p>${escapeHtml(leadTranslation || 'The desk is checking the wires.')}</p></div>
      ${lead ? `<a href="${escapeHtml(lead.url)}">Open the evidence, not just the vibe ↗</a>` : ''}
    </section>

    <section class="app-launch" aria-labelledby="app-launch-title">
      <div>
        <p class="eyebrow">FREE APP PREVIEW</p>
        <h2 id="app-launch-title">my quant doesn’t speak english<br><em>now fits in your pocket.</em></h2>
        <p>Up to five market translations, each with its original claim, source, and evidence boundary attached. No account. No infinite scroll.</p>
      </div>
      <a href="https://myquant-app.vercel.app/">Open the free app preview <span aria-hidden="true">↗</span></a>
    </section>

    <section class="status-band" aria-labelledby="status-title">
      <div><p class="eyebrow" id="status-title">WIRE CHECK</p><p>Missing data prints as missing. A surprisingly radical feature.</p></div>
      <ul>${sourceStatus(cache, 'seiche', counts.seiche)}</ul>
    </section>

    ${signalCockpit(pulse)}
    <aside class="ad-slot ad-slot-top" aria-label="Advertisement opportunity">
      <span>AD BREAK / CURRENTLY JUST OXYGEN</span>
      <p>Put something useful here. We reject “guaranteed alpha,” yacht photos, and charts with the y-axis on parole.</p>
      <a href="/advertise/">See the honest media card →</a>
    </aside>

    <section class="wire" id="wire" aria-labelledby="wire-title">
      <header class="wire-head">
        <div><p class="eyebrow">THE WHOLE ARGUMENT</p><h2 id="wire-title">Every dispatch. No mystery pagination.</h2></div>
        <p><strong id="visibleCount">${ordered.length}</strong> of ${ordered.length} records visible</p>
      </header>
      <div class="filters" role="group" aria-label="Filter the evidence wire">
        <button type="button" class="active" data-filter="all">All <span>${ordered.length}</span></button>
        <button type="button" data-filter="seiche">Seiche <span>${counts.seiche}</span></button>
        <button type="button" data-filter="myquant">House <span>${counts.myquant}</span></button>
        <label><span>Find a nervous noun</span><input id="storySearch" type="search" placeholder="funding, caveat, liquidity…" autocomplete="off"></label>
      </div>
      <ol class="story-list" id="storyList">${ordered.map(storyCard).join('')}</ol>
      <p class="no-results" id="noResults" hidden>The quant found nothing. This time, the English is innocent.</p>
    </section>

    <section class="products" aria-labelledby="products-title">
      <p class="eyebrow">CURRENT PUBLIC INPUT</p><h2 id="products-title">The source that cleared today’s gate.</h2>
      <div>
        <a href="https://seiche.info"><span>01 / SYSTEM</span><h3>Seiche</h3><p>What changed in broad dollar-funding data?</p></a>
      </div>
    </section>

    <aside class="evidence-network" aria-labelledby="evidence-network-title">
      <div>
        <p class="eyebrow">BEYOND MARKETS / SAME EVIDENCE RULES</p>
        <h2 id="evidence-network-title">Different subject.<br>Same allergy to mystery meat.</h2>
      </div>
      <div class="evidence-network__route">
        <span>INDEPENDENT EVIDENCE DESK</span>
        <h3>NarcoScope</h3>
        <p>Official drug-market records, mapped and cited without converting administrative data into claims it cannot support.</p>
        <a href="https://narcoscope.com/">Open the public-interest evidence explorer →</a>
      </div>
    </aside>
  </main>
  <footer><p>General market reporting and plain-English explanations—not personalised investment advice or a transaction recommendation. Jokes are not evidence. Evidence is linked.</p><p><a href="/feed.xml">Atom</a> · <a href="/feed.json">JSON Feed</a> · <a href="/editorial/">Editorial standards</a> · <a href="/corrections/">Corrections</a> · <a href="/privacy/">Privacy</a> · <a href="/support/">Support</a> · <a href="/accessibility/">Accessibility</a></p></footer>
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>
  <script src="/assets/app.js" defer></script>
</body></html>`
}

function renderArticle(story) {
  const article = story.article
  const articleSchema = {
    '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
    description: article.dek, datePublished: isoDate(article.published_at), dateModified: isoDate(article.published_at),
    author: { '@type': 'Organization', name: article.author }, publisher: { '@type': 'Organization', name: BRAND_NAME },
    mainEntityOfPage: story.url, isAccessibleForFree: true,
  }
  return `<!doctype html><html lang="en"><head>${head({ title: `${article.title} — ${BRAND_NAME}`, description: article.dek, canonical: story.url, type: 'article' })}</head><body>
    <a class="skip" href="#article">Skip to article</a>${masthead()}
    <main class="article-page" id="article">
      <header><p class="eyebrow">${escapeHtml(article.editorial_class.replaceAll('_', ' '))} / ${escapeHtml(article.evidence_status)}</p><h1>${escapeHtml(article.title)}</h1><p class="article-dek">${escapeHtml(article.dek)}</p><div class="byline"><span>${escapeHtml(article.author)}</span><time datetime="${escapeHtml(isoDate(article.published_at))}">${escapeHtml(shortDate(article.published_at))}</time></div></header>
      ${story.contentNotice ? `<aside class="article-correction"><b>${escapeHtml(story.contentNotice.status)}</b><p>${escapeHtml(story.contentNotice.summary)}</p><time datetime="${escapeHtml(story.contentNotice.effectiveAt)}">Effective ${escapeHtml(shortDate(story.contentNotice.effectiveAt))}</time></aside>` : ''}
      <aside class="article-boundary"><b>What this adds</b><p>${escapeHtml(article.original_contribution)}</p><b>Boundary</b><p>${escapeHtml(article.limitations.join(' '))}</p></aside>
      <div class="article-body">${article.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}</div>
      <aside class="source-box"><p class="eyebrow">OPEN TABS, NOT MYSTERY MEAT</p><h2>Sources</h2><ol>${article.sources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.label)} ↗</a></li>`).join('')}</ol></aside>
    </main>
    <footer><p>General market reporting and plain-English explanations—not personalised investment advice or a transaction recommendation. Jokes are not evidence. Evidence is linked.</p><p><a href="/">Back to the wire</a> · <a href="/editorial/">Editorial standards</a> · <a href="/corrections/">Corrections</a> · <a href="/privacy/">Privacy</a></p></footer>
    <script type="application/ld+json">${JSON.stringify(articleSchema).replaceAll('<', '\\u003c')}</script>
  </body></html>`
}

function renderAdvertise() {
  return `<!doctype html><html lang="en"><head>${head({ title: `Advertise — ${BRAND_NAME}`, description: 'Clearly labelled sponsorship around evidence-led finance reporting.', canonical: `${SITE_ORIGIN}/advertise/` })}</head><body>
    <a class="skip" href="#advertise">Skip to media card</a>${masthead()}
    <main class="advertise-page" id="advertise">
      <section class="advertise-hero"><p class="eyebrow">BUY ATTENTION. RENT ZERO CONCLUSIONS.</p><h1>Advertise beside the argument.<br><em>Never inside it.</em></h1><p>Reach readers who care about market plumbing, liquidity, and where the caveat went.</p><a class="big-cta" href="mailto:mrinal@liquilens.in?subject=Advertising%20on%20myquantdoesntspeakenglish.com">Ask for the launch media card →</a></section>
      <section class="ad-principles"><article><span>01</span><h2>Clearly labelled</h2><p>Every paid placement says advertisement. Native camouflage is not a product.</p></article><article><span>02</span><h2>Evidence firewall</h2><p>Sponsors cannot buy a finding, ranking, omission, or friendlier adjective.</p></article><article><span>03</span><h2>Useful audience</h2><p>Finance, treasury, risk, and data readers who value source links, boundaries, and finite briefings.</p></article></section>
      <section class="placements"><p class="eyebrow">LAUNCH INVENTORY</p><h2>Two placements. Both visible. Neither sticky.</h2><div><article><b>A / THE INTERMISSION</b><p>Wide placement between the lead package and evidence wire.</p><span>Desktop 1200×180 · mobile 680×240</span></article><article><b>B / THE LAST WORD</b><p>End-of-wire placement before the product family routes.</p><span>Desktop 600×300 · mobile 680×300</span></article></div></section>
    </main><footer><p>No investment solicitation, illegal products, deceptive returns, or unlabeled advertorial.</p><p><a href="/">Back to the wire</a> · <a href="/privacy/">Privacy</a> · <a href="/support/">Support</a></p></footer>
  </body></html>`
}

function renderInfoPage({ slug, eyebrow, title, dek, sections }) {
  const canonical = `${SITE_ORIGIN}/${slug}/`
  return `<!doctype html><html lang="en"><head>${head({ title: `${title} — ${BRAND_NAME}`, description: dek, canonical })}</head><body>
    <a class="skip" href="#content">Skip to content</a>${masthead()}
    <main class="info-page" id="content">
      <header><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(dek)}</p></header>
      <div class="info-sections">${sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}</section>`).join('')}</div>
    </main>
    <footer><p>General market reporting and plain-English explanations—not personalised investment advice or a transaction recommendation.</p><p><a href="/">Home</a> · <a href="/editorial/">Editorial standards</a> · <a href="/corrections/">Corrections</a> · <a href="/privacy/">Privacy</a> · <a href="/support/">Support</a> · <a href="/accessibility/">Accessibility</a> · <a href="/security/">Security</a></p></footer>
  </body></html>`
}

function renderPrivacy() {
  return renderInfoPage({
    slug: 'privacy',
    eyebrow: 'PLAIN-ENGLISH PRIVACY NOTE / EFFECTIVE 13 AUG 2026',
    title: 'Your reading list is not our business model.',
    dek: `${BRAND_NAME} is designed to work without an account, advertising identifier, portfolio connection, or behavioural tracking profile.`,
    sections: [
      { heading: 'Who this covers', paragraphs: [
        'This notice covers the public website, the app evidence feed, the iOS and Android app, and messages sent to the published support address. The legal operator/controller name and postal address must be added before public store release; that identity is an explicit release blocker, not a fact this page guesses.',
      ] },
      { heading: 'What stays on your device', paragraphs: [
        'Stories you save and the topics you choose are stored locally on your device. We do not receive those choices. Removing the app or clearing its local data removes that local copy.',
      ] },
      { heading: 'What the app requests', paragraphs: [
        `The app downloads a public evidence feed from <a href="${SITE_ORIGIN}/app-feed/v1.json">${SITE_ORIGIN}/app-feed/v1.json</a>. Vercel hosts the website and feed and may process ordinary request information such as IP address, IP-derived city/country, timestamp, requested path, protocol, user-agent or device/browser details, and service/security diagnostics to deliver and protect the service. See <a href="https://vercel.com/legal/privacy-notice">Vercel’s privacy notice</a>.`,
        'The current app contains no advertising SDK, third-party analytics SDK, account system, location request, contacts access, portfolio import, or cross-app tracking.',
      ] },
      { heading: 'Website measurement and hosting logs', paragraphs: [
        'The delivered website does not load a client-side Vercel Web Analytics or Speed Insights script, and it does not contact a third-party font service. The current Vercel project has no log drain configured. On the current Hobby plan, available runtime logs are viewable for one hour; Vercel may retain separate service, abuse-prevention, billing, or security records under its own notice and terms.',
        'We use request information only to serve, secure, debug, and maintain the public service. We do not sell it, use it for cross-site advertising, or combine it with saved-story and topic choices, which remain on the device.',
      ] },
      { heading: 'Store and support data', paragraphs: [
        'Apple and Google process store-account, download, device, crash, diagnostics, and aggregate store-performance information under their own terms and privacy notices. The operator may access the reports those consoles make available.',
        'If you email support, the sender address, message, attachments, and any device details you choose to provide are processed by the email provider and authorised support personnel to answer, secure, or document the request. Do not send brokerage credentials, account numbers, or financial records.',
      ] },
      { heading: 'Links and sources', paragraphs: [
        'Source links open websites operated by cited publishers. Their privacy practices apply after you leave this app.',
      ] },
      { heading: 'Retention, questions, and requests', paragraphs: [
        'There is no server-side app account to delete. Device data remains until you remove it, clear app storage, or uninstall, subject to operating-system backup behaviour. Routine support messages should be retained only as long as needed to resolve and secure the request; legal holds, complaints, and statutory records may require longer retention once the operator and launch territories are confirmed.',
        'For access, correction, deletion, objection, or other privacy questions, email <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20privacy">mrinal@liquilens.in</a>. The applicable rights, regulator contact, legal bases, international-transfer details, and final retention schedule will be completed for the approved launch territories before store release. If the data practices change, this page and the store disclosures will be updated before the new collection begins.',
      ] },
    ],
  })
}

function renderEditorial() {
  return renderInfoPage({
    slug: 'editorial',
    eyebrow: 'EDITORIAL STANDARD / PUBLIC BETA',
    title: 'The joke can move. The evidence cannot.',
    dek: 'How records become plain-English stories, what stays attached, and what is not allowed onto the public wire.',
    sections: [
      { heading: 'A translation is not a new market claim', paragraphs: [
        'Every consumer story must preserve the source claim, canonical source link, evidence status, publication clock, and stated limitation. Plain language may explain scope or mechanism; it may not manufacture certainty, personalise advice, recommend a transaction, or predict an issuer outcome.',
      ] },
      { heading: 'Finite and positively approved', paragraphs: [
        'The public app edition is capped at five items. A record needs reviewed consumer copy and an unexpired channel approval tied to its exact content fingerprint. Product and story holds override approvals. Any changed source fingerprint falls out of distribution until it is reviewed again.',
      ] },
      { heading: 'High-risk lanes stay held', paragraphs: [
        'Named-issuer distress language, proprietary risk tiers, pre-registered market calls, ratings-like labels, personalised recommendations, and content lacking documented rights remain outside the public beta pending the required editorial, rights, securities, and media-law review.',
      ] },
      { heading: 'Conflicts and sponsorship', paragraphs: [
        'Paid placements must be visibly labelled. A sponsor cannot buy a finding, ranking, omission, source choice, or softened limitation. Material interests and relationships relevant to a story must be checked and disclosed under the policy approved for the launch territory.',
      ] },
      { heading: 'Report a concern', paragraphs: [
        'Send a precise concern, source, URL, and supporting record to <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20editorial%20concern">mrinal@liquilens.in</a>. Do not send confidential financial credentials or unlawfully obtained material.',
      ] },
    ],
  })
}

function renderCorrections(notices) {
  const noticeParagraphs = notices.length
    ? notices.map((notice) => `<strong>${escapeHtml(notice.status)}</strong> · ${escapeHtml(notice.id)} · <time datetime="${escapeHtml(notice.effectiveAt)}">${escapeHtml(shortDate(notice.effectiveAt))}</time><br>${escapeHtml(notice.summary)}${notice.replacementUrl ? ` <a href="${escapeHtml(notice.replacementUrl)}">Replacement record ↗</a>` : ''}`)
    : ['No public correction, retraction, or supersession notices are recorded in the current edition.']
  return renderInfoPage({
    slug: 'corrections',
    eyebrow: 'CORRECTIONS / VERSIONED AND VISIBLE',
    title: 'Fix the record, not just the vibe.',
    dek: 'Material errors receive a visible correction, retraction, or supersession notice that also travels to connected app clients.',
    sections: [
      { heading: 'Current notices', paragraphs: noticeParagraphs },
      { heading: 'What each label means', paragraphs: [
        '<strong>Corrected</strong> means the story remains available with a material change explained. <strong>Retracted</strong> means the central claim or publication basis is no longer supportable and normal distribution stops. <strong>Superseded</strong> means a replacement record should be used.',
      ] },
      { heading: 'Offline limitation', paragraphs: [
        'A connected app receives the notice contract and reconciles saved snapshots. A device that stays offline cannot receive a later correction or retraction; reconnect and refresh before relying on a saved copy.',
      ] },
      { heading: 'Request a review', paragraphs: [
        'Email <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20correction%20request">mrinal@liquilens.in</a> with the exact URL, disputed words or number, the reason, and the best primary evidence available. A request does not guarantee removal; it triggers an evidence and rights review.',
      ] },
    ],
  })
}

function renderAccessibility() {
  return renderInfoPage({
    slug: 'accessibility',
    eyebrow: 'ACCESSIBILITY / WORKING STANDARD',
    title: 'The translation should include everyone.',
    dek: 'The site and app are built for system text, keyboard and screen-reader use, reduced motion, visible focus, and plain-language navigation.',
    sections: [
      { heading: 'Current support', paragraphs: [
        'The website provides a skip link, semantic headings, visible keyboard focus, text alternatives for functional graphics, and reduced-motion handling. The app uses native accessibility labels, system text scaling, large tap targets, and labelled source links.',
      ] },
      { heading: 'Known verification boundary', paragraphs: [
        'This is not a claim of formal certification. Final signed iOS and Android builds still require device testing with VoiceOver and TalkBack, largest text sizes, switch/keyboard navigation, contrast checks, orientation, and reduced motion before each public territory is approved.',
      ] },
      { heading: 'Get help or report a barrier', paragraphs: [
        'Email <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20accessibility">mrinal@liquilens.in</a> with the page or screen, device, assistive technology, and the task you could not complete. Do not include financial credentials.',
      ] },
    ],
  })
}

function renderSecurity() {
  return renderInfoPage({
    slug: 'security',
    eyebrow: 'SECURITY / RESPONSIBLE REPORTING',
    title: 'Found a crack in the evidence pipe?',
    dek: 'A narrow disclosure channel for vulnerabilities affecting the public site, app, feed integrity, or release controls.',
    sections: [
      { heading: 'What to report', paragraphs: [
        'Report reproducible vulnerabilities that could alter published content, expose non-public records, bypass release controls, compromise deployment access, or affect user devices. Include the affected URL/version, steps, impact, and a safe proof of concept.',
      ] },
      { heading: 'Safe handling', paragraphs: [
        'Do not access unnecessary data, disrupt service, trade on non-public information, phish people, use social engineering, or publish exploit details before there is a reasonable opportunity to investigate and mitigate. This page does not authorise conduct prohibited by law.',
      ] },
      { heading: 'Contact', paragraphs: [
        'Email <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20security%20report">mrinal@liquilens.in</a>. Do not send secrets in ordinary email; first ask for a secure exchange method. No bounty is promised unless agreed in writing before work is performed.',
      ] },
    ],
  })
}

function renderSupport() {
  return renderInfoPage({
    slug: 'support',
    eyebrow: 'THE DESK BEHIND THE DESK',
    title: 'Something got lost in translation?',
    dek: `Help with the free ${BRAND_NAME} app, its current evidence feed, saved stories, and source links.`,
    sections: [
      { heading: 'Refresh the current edition', paragraphs: [
        'Pull down on Today to request the newest edition. If the network or evidence feed is unavailable, the app keeps the last valid edition or opens its bundled offline edition. A saved edition is labelled clearly; it is never presented as live.',
      ] },
      { heading: 'Saved stories and topics', paragraphs: [
        'Bookmarks and topic choices live only on the device. Reinstalling the app or clearing its storage resets them. The app intentionally has no login or cloud sync in this release.',
      ] },
      { heading: 'Report a problem', paragraphs: [
        'Email <a href="mailto:mrinal@liquilens.in?subject=my%20quant%20app%20support">mrinal@liquilens.in</a> with your device model, operating-system version, and what you expected to happen. Do not send brokerage credentials, account numbers, or other financial information.',
      ] },
      { heading: 'Service boundary', paragraphs: [
        'The app publishes general market reporting and plain-language explanations. It does not provide personalised investment advice, executable quotes, credit ratings, transaction recommendations, or predictions that an institution will fail.',
      ] },
    ],
  })
}

function renderFeedJson(stories) {
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1', title: BRAND_NAME,
    home_page_url: `${SITE_ORIGIN}/`, feed_url: `${SITE_ORIGIN}/feed.json`,
    description: 'A finite public edition of sourced market dispatches and plain-English editorial notes.',
    items: stories.map((story) => ({ id: story.id, url: story.url, title: story.title, summary: story.dek, date_published: isoDate(story.published), tags: [story.product, story.beat, story.evidenceStatus] })),
  }, null, 2)}\n`
}

function renderAppFeed(stories, generatedAt, consumerCopy, notices, releaseStatus) {
  return `${JSON.stringify(buildAppFeed(stories, generatedAt, consumerCopy, notices, releaseStatus), null, 2)}\n`
}

function renderFeedXml(stories) {
  const updated = stories[0]?.published || new Date().toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${BRAND_NAME}</title><subtitle>Finance, with subtitles and evidence links.</subtitle><id>${SITE_ORIGIN}/</id><link rel="alternate" href="${SITE_ORIGIN}/"/><link rel="self" href="${SITE_ORIGIN}/feed.xml"/><updated>${escapeXml(isoDate(updated))}</updated>${stories.map((story) => `<entry><id>${escapeXml(story.id)}</id><title>${escapeXml(story.title)}</title><link href="${escapeXml(story.url)}"/><published>${escapeXml(isoDate(story.published))}</published><updated>${escapeXml(isoDate(story.published))}</updated><summary>${escapeXml(story.dek)}</summary><category term="${escapeXml(story.product)}"/></entry>`).join('')}</feed>\n`
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

async function build() {
  const cache = await syncFeeds()
  const appCopy = await readJson(appCopyPath)
  const publicationHolds = await readJson(publicationHoldsPath)
  const publicationApprovals = await readJson(publicationApprovalsPath)
  const contentStatus = await readJson(contentStatusPath)
  const releasePolicy = await readJson(releasePolicyPath)
  if (appCopy.schema !== 'mqdnse.app-copy.v1' || !appCopy.stories || typeof appCopy.stories !== 'object') {
    throw new Error('data/app-copy.json: invalid app-copy contract')
  }
  const house = await loadHouseArticles()
  const allStories = [...Object.values(cache.feeds).flat(), ...house]
    .filter((story) => story.publicationStatus === 'PUBLISHED')
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  const emergencyOverride = process.env.MQ_PUBLICATION_STOP === '1'
  const siteApproved = applyPublicationApprovals(
    applyPublicationHolds(allStories, publicationHolds, 'site'),
    publicationApprovals,
    'site',
  )
  const appApproved = applyPublicationApprovals(
    applyPublicationHolds(allStories, publicationHolds, 'app-feed'),
    publicationApprovals,
    'app-feed',
  )
  const siteStatus = applyContentStatus(siteApproved, contentStatus, 'site')
  const appStatus = applyContentStatus(appApproved, contentStatus, 'app-feed')
  const siteRelease = applyReleasePolicy(siteStatus.stories, releasePolicy, 'site', emergencyOverride)
  const appRelease = applyReleasePolicy(appStatus.stories, releasePolicy, 'app-feed', emergencyOverride)
  const stories = siteRelease.stories
  const appStories = appRelease.stories
  const publicHouse = stories.filter((story) => story.product === 'myquant')

  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })
  await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true })
  await write(join(dist, 'index.html'), renderHome(stories, cache, appCopy.stories))
  await write(join(dist, 'advertise', 'index.html'), renderAdvertise())
  await write(join(dist, 'privacy', 'index.html'), renderPrivacy())
  await write(join(dist, 'support', 'index.html'), renderSupport())
  await write(join(dist, 'editorial', 'index.html'), renderEditorial())
  await write(join(dist, 'corrections', 'index.html'), renderCorrections(siteStatus.notices))
  await write(join(dist, 'accessibility', 'index.html'), renderAccessibility())
  await write(join(dist, 'security', 'index.html'), renderSecurity())
  for (const article of publicHouse) await write(join(dist, 'articles', article.article.slug, 'index.html'), renderArticle(article))
  await write(join(dist, 'feed.json'), renderFeedJson(stories))
  const appFeed = renderAppFeed(
    appStories,
    cache.syncedAt,
    appCopy.stories,
    appStatus.notices,
    appRelease.releaseStatus,
  )
  const appPublishedCount = JSON.parse(appFeed).stories.length
  await write(join(dist, 'app-feed', 'v1.json'), appFeed)
  await write(join(dist, 'feed.xml'), renderFeedXml(stories))
  await write(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`)
  const urls = [
    `${SITE_ORIGIN}/`,
    `${SITE_ORIGIN}/advertise/`,
    `${SITE_ORIGIN}/privacy/`,
    `${SITE_ORIGIN}/support/`,
    `${SITE_ORIGIN}/editorial/`,
    `${SITE_ORIGIN}/corrections/`,
    `${SITE_ORIGIN}/accessibility/`,
    `${SITE_ORIGIN}/security/`,
    ...publicHouse.map((story) => story.url),
  ]
  await write(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join('')}</urlset>\n`)
  await write(join(dist, 'llms.txt'), `# ${BRAND_NAME}\n\nA finite public edition of sourced market dispatches and plain-English editorial notes.\n\n- Home: ${SITE_ORIGIN}/\n- JSON Feed: ${SITE_ORIGIN}/feed.json\n- Atom: ${SITE_ORIGIN}/feed.xml\n- App feed: ${SITE_ORIGIN}/app-feed/v1.json\n- Editorial standard: ${SITE_ORIGIN}/editorial/\n- Corrections: ${SITE_ORIGIN}/corrections/\n- Privacy: ${SITE_ORIGIN}/privacy/\n- Source articles remain canonical at the cited publisher.\n- General market reporting and plain-English explanations, not personalised investment advice or a transaction recommendation.\n\n## Related evidence desk\n\n- NarcoScope, https://narcoscope.com/: an independent public-interest explorer for official drug-market records. It shares this network's evidence standards, not its financial subject.\n`)
  process.stdout.write(`Built ${stories.length}/${allStories.length} approved public records and ${appPublishedCount} app stories (${publicHouse.length}/${house.length} house; ${appRelease.releaseStatus}) into ${dist}\n`)
}

await build()
