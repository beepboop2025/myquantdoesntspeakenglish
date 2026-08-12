import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SITE_ORIGIN,
  SOURCES,
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
  <link rel="alternate" type="application/feed+json" href="${SITE_ORIGIN}/feed.json" title="My Quant Doesn't Speak English">
  <link rel="alternate" type="application/atom+xml" href="${SITE_ORIGIN}/feed.xml" title="My Quant Doesn't Speak English">
  <meta name="theme-color" content="#1746d1">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/og-card.svg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css">`
}

function masthead() {
  return `<header class="site-head">
    <a class="wordmark" href="/" aria-label="My Quant Doesn't Speak English home">
      <span>my quant</span><span>doesn’t speak</span><span>english.com</span>
    </a>
    <nav aria-label="Primary">
      <a href="/#signals">Signal map</a>
      <a href="/#wire">Every dispatch</a>
      <a href="/#telegram">Telegram desks</a>
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
      <h3><a href="${escapeHtml(story.url)}">${escapeHtml(story.title)}</a></h3>
      <p>${escapeHtml(story.dek)}</p>
      <div class="evidence-line"><span>${escapeHtml(story.evidenceStatus)}</span><span>${escapeHtml(story.contribution)}</span></div>
    </article>
    <aside><b>Boundary</b><p>${escapeHtml(story.limitation)}</p><a href="${escapeHtml(story.url)}">Read the record ↗</a></aside>
  </li>`
}

function sourceStatus(cache, product) {
  const status = cache.statuses[product] || { state: 'gap', detail: 'status unavailable' }
  return `<li data-state="${escapeHtml(status.state)}"><span>${escapeHtml(productLabel(product))}</span><b>${escapeHtml(status.state)}</b><small>${escapeHtml(status.detail)}</small></li>`
}

const GRAPH_PRODUCTS = [
  { id: 'seiche', label: 'Seiche', layer: 'System' },
  { id: 'liquilens', label: 'LiquiLens', layer: 'Institution' },
  { id: 'liquilens-undertow', label: 'Undertow', layer: 'Market' },
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
    <title id="signal-map-title">The Liquidity Lab stress chain</title>
    <desc id="signal-map-desc">Select a layer to filter the editorial wire: Seiche for system funding, LiquiLens for institutions, Undertow for market exits, and the house desk for synthesis.</desc>
    <path class="route-line" d="M126 132 C220 30 248 30 342 132 S464 234 558 132 S680 30 774 132"/>
    <path class="route-current" d="M126 132 C220 30 248 30 342 132 S464 234 558 132 S680 30 774 132"/>
    <g class="route-node route-seiche" data-route-filter="seiche" role="button" tabindex="0" aria-label="Filter to Seiche system funding dispatches" transform="translate(52 82)"><rect width="148" height="100" rx="50"/><text x="74" y="43" text-anchor="middle">01 / SYSTEM</text><text class="node-name" x="74" y="66" text-anchor="middle">SEICHE</text></g>
    <g class="route-node route-liquilens" data-route-filter="liquilens" role="button" tabindex="0" aria-label="Filter to LiquiLens institution dispatches" transform="translate(268 82)"><rect width="148" height="100" rx="50"/><text x="74" y="43" text-anchor="middle">02 / INSTITUTION</text><text class="node-name" x="74" y="66" text-anchor="middle">LIQUILENS</text></g>
    <g class="route-node route-undertow" data-route-filter="liquilens-undertow" role="button" tabindex="0" aria-label="Filter to Undertow market exit dispatches" transform="translate(484 82)"><rect width="148" height="100" rx="50"/><text x="74" y="43" text-anchor="middle">03 / MARKET</text><text class="node-name" x="74" y="66" text-anchor="middle">UNDERTOW</text></g>
    <g class="route-node route-myquant" data-route-filter="myquant" role="button" tabindex="0" aria-label="Filter to original house reporting" transform="translate(700 82)"><rect width="168" height="100" rx="50"/><text x="84" y="43" text-anchor="middle">04 / EDITORIAL</text><text class="node-name" x="84" y="66" text-anchor="middle">SUBTITLES</text></g>
    <text class="map-hint" x="460" y="254" text-anchor="middle">CLICK A LAYER TO TUNE THE WIRE</text>
  </svg>`
}

function signalCockpit(pulse) {
  return `<section class="signal-cockpit" id="signals" aria-labelledby="signals-title">
    <header class="cockpit-head"><div><p class="eyebrow">THE LAB, AS A LIVING SYSTEM</p><h2 id="signals-title">One chain. Three instruments.<br><em>A translator at the end.</em></h2></div><p>Every mark below comes from the published records already in this wire. No analytics theatre; zero is allowed to look like zero.</p></header>
    <div class="cockpit-grid">
      <article class="flow-panel"><header><span>A / SIGNAL ROUTE</span><p>Pressure becomes institution risk, then exit cost, then an argument you can read.</p></header>${signalMap()}</article>
      <article class="cadence-panel"><header><div><span>B / DISPATCH CADENCE</span><p>Daily output, stacked by the desk that published it.</p></div><div class="range-buttons" role="group" aria-label="Dispatch cadence range"><button type="button" data-window="7">7D</button><button type="button" data-window="14" class="active">14D</button><button type="button" data-window="28">28D</button></div></header>${cadenceSvg(pulse)}</article>
      <article class="mix-panel"><header><span>C / SOURCE MIX</span><p>What this edition of the wire is actually made of.</p></header>${mixGraphic(pulse)}</article>
    </div>
    <script id="signalPulseData" type="application/json">${JSON.stringify(pulse).replaceAll('<', '\\u003c')}</script>
  </section>`
}

function telegramDesk() {
  const cards = [
    ['PLUMBING BOT', 'Seiche in Telegram', 'Ask for the current funding regime, the week ahead, or a source trail.', 'https://t.me/seiche_desk_bot?start=mqdnse_signals', 'Open @seiche_desk_bot'],
    ['INSTITUTION BOT', 'LiquiLens in Telegram', 'Carry the bank and lender screen into the place you already check.', 'https://t.me/LiquiLens_bot?start=mqdnse_signals', 'Open @LiquiLens_bot'],
    ['MARKET BOT', 'Undertow in Telegram', 'Check exit cost and liquidity conditions without opening the full desk.', 'https://t.me/undertow_LiquiLens_bot?start=ref_mqdnse_signals', 'Open @undertow_LiquiLens_bot'],
    ['DAILY CHANNEL', 'The lab’s free read', 'One opt-in channel for reviewed dispatches across the financial stack.', 'https://t.me/LiquidityLabDesk', 'Join @LiquidityLabDesk'],
  ]
  return `<section class="telegram-desk" id="telegram" aria-labelledby="telegram-title"><header><p class="eyebrow">TAKE THE DESK WITH YOU</p><h2 id="telegram-title">The website explains.<br><em>Telegram taps your shoulder.</em></h2><p>Choose one instrument or the daily channel. Every destination is opt-in; none of them needs your phone number on this website.</p></header><div class="telegram-grid">${cards.map(([kicker, title, copy, href, label]) => `<a data-telegram href="${href}" target="_blank" rel="noopener"><span>${kicker}</span><h3>${title}</h3><p>${copy}</p><b>${label} ↗</b></a>`).join('')}</div></section>`
}

function renderHome(stories, cache) {
  const lead = chooseLead(stories)
  const counts = Object.fromEntries(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'].map((product) => [product, stories.filter((story) => story.product === product).length]))
  const ordered = [...stories].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  const pulse = buildSignalPulse(ordered, 28)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "My Quant Doesn't Speak English",
    url: SITE_ORIGIN,
    description: 'Evidence-led dispatches and investigations from Seiche, LiquiLens, and LiquiLens—Undertow.',
    relatedLink: 'https://narcoscope.com/',
    hasPart: ordered.slice(0, 20).map((story) => ({ '@type': 'Article', headline: story.title, url: story.url, datePublished: isoDate(story.published) })),
  }

  return `<!doctype html>
<html lang="en"><head>${head({
    title: "My Quant Doesn't Speak English — finance, with subtitles",
    description: 'Every Seiche, LiquiLens, and Undertow dispatch in one evidence-led, occasionally funny wire.',
    canonical: `${SITE_ORIGIN}/`,
  })}</head><body>
  <a class="skip" href="#wire">Skip to every dispatch</a>
  ${masthead()}
  <main>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">THE BIG SHORT REFERENCE HAS ESCAPED CONTAINMENT</p>
        <h1 id="hero-title">The numbers are fluent.<br><em>The headlines need subtitles.</em></h1>
        <p class="hero-dek">One wire for the plumbing, the institutions, and the exits. Serious evidence. Less-serious furniture.</p>
      </div>
      <div class="subtitle-machine" aria-label="Lead story translation">
        <div><span>QUANT SAYS</span><p>${escapeHtml(lead?.title || 'No lead passed the evidence gate.')}</p></div>
        <div><span>NORMAL PERSON HEARS</span><p>${escapeHtml(lead?.dek || 'The desk is checking the wires.')}</p></div>
        ${lead ? `<a href="${escapeHtml(lead.url)}">Open the evidence, not just the vibe ↗</a>` : ''}
      </div>
    </section>

    <section class="status-band" aria-labelledby="status-title">
      <div><p class="eyebrow" id="status-title">WIRE CHECK</p><p>Missing data prints as missing. A surprisingly radical feature.</p></div>
      <ul>${['liquilens', 'seiche', 'liquilens-undertow'].map((product) => sourceStatus(cache, product)).join('')}</ul>
    </section>

    ${signalCockpit(pulse)}
    ${telegramDesk()}

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
        <button type="button" data-filter="liquilens">LiquiLens <span>${counts.liquilens}</span></button>
        <button type="button" data-filter="liquilens-undertow">Undertow <span>${counts['liquilens-undertow']}</span></button>
        <button type="button" data-filter="myquant">House <span>${counts.myquant}</span></button>
        <label><span>Find a nervous noun</span><input id="storySearch" type="search" placeholder="repo, bank, liquidity…" autocomplete="off"></label>
      </div>
      <ol class="story-list" id="storyList">${ordered.map(storyCard).join('')}</ol>
      <p class="no-results" id="noResults" hidden>The quant found nothing. This time, the English is innocent.</p>
    </section>

    <section class="products" aria-labelledby="products-title">
      <p class="eyebrow">THE THREE DIALECTS</p><h2 id="products-title">Same desk. Different ways to ruin lunch.</h2>
      <div>
        <a href="https://seiche.info"><span>01 / SYSTEM</span><h3>Seiche</h3><p>Is dollar-funding stress building?</p></a>
        <a href="https://liquilens.in"><span>02 / INSTITUTION</span><h3>LiquiLens</h3><p>Which lender is drifting toward review?</p></a>
        <a href="https://liquilens-undertow.com"><span>03 / MARKET</span><h3>Undertow</h3><p>What will a position-sized exit cost?</p></a>
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
  <footer><p>Research and market data, not investment advice. Jokes are not evidence. Evidence is linked.</p><p><a href="/feed.xml">Atom</a> · <a href="/feed.json">JSON Feed</a> · <a href="#telegram">Telegram desks</a> · <a href="/advertise/">Advertise</a> · <a href="https://narcoscope.com/">NarcoScope</a></p></footer>
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>
  <script src="/assets/app.js" defer></script>
</body></html>`
}

function renderArticle(story) {
  const article = story.article
  const articleSchema = {
    '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
    description: article.dek, datePublished: isoDate(article.published_at), dateModified: isoDate(article.published_at),
    author: { '@type': 'Organization', name: article.author }, publisher: { '@type': 'Organization', name: "My Quant Doesn't Speak English" },
    mainEntityOfPage: story.url, isAccessibleForFree: true,
  }
  return `<!doctype html><html lang="en"><head>${head({ title: `${article.title} — My Quant Doesn't Speak English`, description: article.dek, canonical: story.url, type: 'article' })}</head><body>
    <a class="skip" href="#article">Skip to article</a>${masthead()}
    <main class="article-page" id="article">
      <header><p class="eyebrow">${escapeHtml(article.editorial_class.replaceAll('_', ' '))} / ${escapeHtml(article.evidence_status)}</p><h1>${escapeHtml(article.title)}</h1><p class="article-dek">${escapeHtml(article.dek)}</p><div class="byline"><span>${escapeHtml(article.author)}</span><time datetime="${escapeHtml(isoDate(article.published_at))}">${escapeHtml(shortDate(article.published_at))}</time></div></header>
      <aside class="article-boundary"><b>What this adds</b><p>${escapeHtml(article.original_contribution)}</p><b>Boundary</b><p>${escapeHtml(article.limitations.join(' '))}</p></aside>
      <div class="article-body">${article.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}</div>
      <aside class="source-box"><p class="eyebrow">OPEN TABS, NOT MYSTERY MEAT</p><h2>Sources</h2><ol>${article.sources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.label)} ↗</a></li>`).join('')}</ol></aside>
    </main>
    <footer><p>Research and market data, not investment advice. Jokes are not evidence. Evidence is linked.</p><p><a href="/">Back to the wire</a></p></footer>
    <script type="application/ld+json">${JSON.stringify(articleSchema).replaceAll('<', '\\u003c')}</script>
  </body></html>`
}

function renderAdvertise() {
  return `<!doctype html><html lang="en"><head>${head({ title: "Advertise — My Quant Doesn't Speak English", description: 'Clearly labelled sponsorship around evidence-led finance reporting.', canonical: `${SITE_ORIGIN}/advertise/` })}</head><body>
    <a class="skip" href="#advertise">Skip to media card</a>${masthead()}
    <main class="advertise-page" id="advertise">
      <section class="advertise-hero"><p class="eyebrow">BUY ATTENTION. RENT ZERO CONCLUSIONS.</p><h1>Advertise beside the argument.<br><em>Never inside it.</em></h1><p>Reach readers who care about market plumbing, institution risk, liquidity, and where the caveat went.</p><a class="big-cta" href="mailto:mrinal@liquilens.in?subject=Advertising%20on%20myquantdoesntspeakenglish.com">Ask for the launch media card →</a></section>
      <section class="ad-principles"><article><span>01</span><h2>Clearly labelled</h2><p>Every paid placement says advertisement. Native camouflage is not a product.</p></article><article><span>02</span><h2>Evidence firewall</h2><p>Sponsors cannot buy a finding, ranking, omission, or friendlier adjective.</p></article><article><span>03</span><h2>Useful audience</h2><p>Finance, treasury, risk, data, and research readers arriving through three specialist products.</p></article></section>
      <section class="placements"><p class="eyebrow">LAUNCH INVENTORY</p><h2>Two placements. Both visible. Neither sticky.</h2><div><article><b>A / THE INTERMISSION</b><p>Wide placement between the lead package and evidence wire.</p><span>Desktop 1200×180 · mobile 680×240</span></article><article><b>B / THE LAST WORD</b><p>End-of-wire placement before the product family routes.</p><span>Desktop 600×300 · mobile 680×300</span></article></div></section>
    </main><footer><p>No investment solicitation, illegal products, deceptive returns, or unlabeled advertorial.</p><p><a href="/">Back to the wire</a></p></footer>
  </body></html>`
}

function renderFeedJson(stories) {
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1', title: "My Quant Doesn't Speak English",
    home_page_url: `${SITE_ORIGIN}/`, feed_url: `${SITE_ORIGIN}/feed.json`,
    description: 'Evidence-led dispatches from Seiche, LiquiLens, Undertow, and the house desk.',
    items: stories.map((story) => ({ id: story.id, url: story.url, title: story.title, summary: story.dek, date_published: isoDate(story.published), tags: [story.product, story.beat, story.evidenceStatus] })),
  }, null, 2)}\n`
}

function renderFeedXml(stories) {
  const updated = stories[0]?.published || new Date().toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>My Quant Doesn't Speak English</title><subtitle>Finance, with subtitles and evidence links.</subtitle><id>${SITE_ORIGIN}/</id><link rel="alternate" href="${SITE_ORIGIN}/"/><link rel="self" href="${SITE_ORIGIN}/feed.xml"/><updated>${escapeXml(isoDate(updated))}</updated>${stories.map((story) => `<entry><id>${escapeXml(story.id)}</id><title>${escapeXml(story.title)}</title><link href="${escapeXml(story.url)}"/><published>${escapeXml(isoDate(story.published))}</published><updated>${escapeXml(isoDate(story.published))}</updated><summary>${escapeXml(story.dek)}</summary><category term="${escapeXml(story.product)}"/></entry>`).join('')}</feed>\n`
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

async function build() {
  const cache = await syncFeeds()
  const house = await loadHouseArticles()
  const stories = [...Object.values(cache.feeds).flat(), ...house]
    .filter((story) => story.publicationStatus === 'PUBLISHED')
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))

  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })
  await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true })
  await write(join(dist, 'index.html'), renderHome(stories, cache))
  await write(join(dist, 'advertise', 'index.html'), renderAdvertise())
  for (const article of house) await write(join(dist, 'articles', article.article.slug, 'index.html'), renderArticle(article))
  await write(join(dist, 'feed.json'), renderFeedJson(stories))
  await write(join(dist, 'feed.xml'), renderFeedXml(stories))
  await write(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`)
  const urls = [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/advertise/`, ...house.map((story) => story.url)]
  await write(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join('')}</urlset>\n`)
  await write(join(dist, 'llms.txt'), `# My Quant Doesn't Speak English\n\nEditorial and advertising hub for Seiche, LiquiLens, and LiquiLens—Undertow.\n\n- Home: ${SITE_ORIGIN}/\n- JSON Feed: ${SITE_ORIGIN}/feed.json\n- Atom: ${SITE_ORIGIN}/feed.xml\n- Source articles remain canonical at their product domains.\n- Research and market data, not investment advice.\n\n## Telegram desks\n\n- Seiche bot: https://t.me/seiche_desk_bot\n- LiquiLens bot: https://t.me/LiquiLens_bot\n- Undertow bot: https://t.me/undertow_LiquiLens_bot\n- Free reviewed dispatch channel: https://t.me/LiquidityLabDesk\n\n## Related evidence desk\n\n- NarcoScope, https://narcoscope.com/: an independent public-interest explorer for official drug-market records. It shares this network's evidence standards, not its financial subject.\n`)
  process.stdout.write(`Built ${stories.length} records (${house.length} house) into ${dist}\n`)
}

await build()
