import { createHash } from 'node:crypto'

const ALLOWED_PRODUCTS = new Set(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'])

export const SITE_ORIGIN = 'https://myquantdoesntspeakenglish.com'
export const APP_FEED_SCHEMA = 'mqdnse.app-feed.v1'

export const SOURCES = [
  {
    product: 'liquilens',
    label: 'LiquiLens',
    url: 'https://api.liquilens.in/api/experimental/v1/desk/bits',
    home: 'https://liquilens.in/desk/',
  },
  {
    product: 'seiche',
    label: 'Seiche',
    url: 'https://seiche.info/dispatches/news.json',
    home: 'https://seiche.info/dispatches/',
  },
  {
    product: 'liquilens-undertow',
    label: 'Undertow',
    url: 'https://api.seiche.info/undertow/dispatch.json',
    home: 'https://liquilens-undertow.com/',
  },
]

// This is the deliberately small subjective layer. Evidence gates happen
// before ranking; these weights only choose the lead among publishable records.
export const EDITORIAL_WEIGHTS = Object.freeze({
  full_story: 52,
  house_investigation: 48,
  desk_brief: 31,
  house_note: 20,
  watch_note: 14,
})

// These are presentation-only expansions of contribution labels already
// supplied by the evidence feeds. Keeping the table explicit prevents the
// consumer feed from generating a new market claim while making desk taxonomy
// readable outside the specialist products.
const CONTRIBUTION_TRANSLATIONS = Object.freeze({
  bounded_no_change_record: 'It records that no qualifying change was observed within the stated boundary.',
  cross_bank_private_credit_concentration: 'It compares private-credit concentration across banks.',
  cross_engine_institution_synthesis: 'It brings signals from multiple institution screens together.',
  cross_sectional_review_breadth: 'It shows how broadly the review signal appears across the group.',
  cross_signal_divergence: "It shows where the source's signals disagree.",
  dated_forward_test: 'It names a dated check that can be revisited.',
  fresh_longitudinal_delta: 'It identifies what changed over time.',
  measurement_coverage_change: 'It records a change in measurement coverage.',
  peer_relative_change: 'It shows how the institution changed relative to its peers.',
  within_quarter_cross_bank_ranking: 'It compares banks within the same quarter.',
})

const APP_TOPICS = Object.freeze({
  seiche: 'funding',
  liquilens: 'institutions',
  'liquilens-undertow': 'market-exits',
  myquant: 'house',
})

const string = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
const array = (value) => Array.isArray(value) ? value : []

function reviewedConsumerCopy(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Boolean(string(value.inEnglish))
    && Boolean(string(value.whyItMatters))
}

export function validHttpsUrl(value, fallback) {
  try {
    const url = new URL(value || fallback)
    return url.protocol === 'https:' ? url.href : fallback
  } catch {
    return fallback
  }
}

export function normalizeRecord(raw, product, fallbackUrl) {
  if (!raw || typeof raw !== 'object' || !ALLOWED_PRODUCTS.has(product)) return null
  const clocks = raw.clocks && typeof raw.clocks === 'object' ? raw.clocks : {}
  const contribution = raw.original_contribution && typeof raw.original_contribution === 'object'
    ? raw.original_contribution
    : {}
  const contributionKinds = array(contribution.kinds)
  const claims = array(raw.claims)
  const limitations = array(raw.limitations)
  const published = string(raw.published_at, raw.generated, raw.modified_at, raw.date)
  const parsed = Date.parse(published)
  if (!string(raw.headline, raw.title) || !Number.isFinite(parsed)) return null

  const record = {
    id: string(raw.id, raw.slug, `${product}:${published}`),
    product,
    title: string(raw.headline, raw.title),
    dek: string(raw.dek, raw.summary, raw.lede, 'The source published no standfirst.'),
    url: validHttpsUrl(string(raw.canonical_url, raw.url, raw.source_url), fallbackUrl),
    beat: string(raw.beat, 'evidence-wire'),
    editorialClass: string(raw.editorial_class, raw.type, 'evidence_record'),
    publicationStatus: string(raw.publication_status, 'PUBLISHED'),
    published,
    eventTime: string(clocks.event_time, raw.event_time, raw.date, published),
    knowledgeTime: string(clocks.knowledge_time, raw.knowledge_time, published),
    evidenceStatus: string(raw.evidence_status, claims[0]?.evidence_status, raw.status, 'DECLARED'),
    contribution: contributionKinds.length
      ? contributionKinds.join(' · ')
      : string(contribution.statement, raw.original_contribution, 'evidence-backed desk finding'),
    limitation: string(limitations[0], raw.honesty, 'Read the source record for its evidence boundary.'),
    newsworthiness: Number.isFinite(raw.newsworthiness?.score) ? raw.newsworthiness.score : null,
  }
  record.fingerprint = createHash('sha256').update(JSON.stringify({
    id: record.id,
    title: record.title,
    dek: record.dek,
    url: record.url,
    beat: record.beat,
    editorialClass: record.editorialClass,
    publicationStatus: record.publicationStatus,
    eventTime: record.eventTime,
    evidenceStatus: record.evidenceStatus,
    contribution: record.contribution,
    limitation: record.limitation,
    newsworthiness: record.newsworthiness,
  })).digest('hex')
  return record
}

export function normalizePayload(payload, source) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid JSON root')
  let rows = []
  if (source.product === 'liquilens') rows = array(payload.bits)
  if (source.product === 'seiche') rows = array(payload.entries)
  if (source.product === 'liquilens-undertow') {
    const letters = payload.letters && typeof payload.letters === 'object' ? payload.letters : {}
    const dates = array(payload.entries).length ? payload.entries : Object.keys(letters).sort().reverse()
    const normalized = dates.map((date) => {
      const row = letters[date]?.story || letters[date]
      const datedRecord = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? `https://liquilens-undertow.com/dispatch/${date}.json`
        : source.home
      return normalizeRecord(row, source.product, datedRecord)
    }).filter(Boolean)
    if (!normalized.length) throw new Error('source supplied no usable records')
    return normalized
  }
  const normalized = rows.map((row) => normalizeRecord(row, source.product, source.home)).filter(Boolean)
  if (!normalized.length) throw new Error('source supplied no usable records')
  return normalized
}

export function normalizeHouseArticle(raw) {
  if (!raw || raw.publication_status !== 'PUBLISHED' || !array(raw.sources).length) return null
  const slug = string(raw.slug)
  const published = string(raw.published_at)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isFinite(Date.parse(published))) return null
  if (!array(raw.sections).every((section) => string(section.heading) && array(section.paragraphs).every((p) => string(p)))) return null
  if (!raw.sources.every((source) => string(source.label) && validHttpsUrl(source.url, '') === source.url)) return null

  return {
    id: `myquant:${slug}`,
    product: 'myquant',
    title: string(raw.title),
    dek: string(raw.dek),
    url: `${SITE_ORIGIN}/articles/${slug}/`,
    beat: string(raw.beat, 'house-desk'),
    editorialClass: string(raw.editorial_class, 'house_investigation'),
    publicationStatus: 'PUBLISHED',
    published,
    eventTime: string(raw.event_time, published),
    knowledgeTime: string(raw.knowledge_time, published),
    evidenceStatus: string(raw.evidence_status, 'DECLARED'),
    contribution: string(raw.original_contribution, 'original house analysis'),
    limitation: string(array(raw.limitations)[0], 'Read the cited sources and stated boundaries.'),
    newsworthiness: Number.isFinite(raw.newsworthiness?.score) ? raw.newsworthiness.score : null,
    article: raw,
  }
}

export function preserveStableClocks(records, cachedRecords = []) {
  const cachedById = new Map(cachedRecords.map((record) => [record.id, record]))
  return records.map((record) => {
    const cached = cachedById.get(record.id)
    if (!cached || !record.fingerprint || cached.fingerprint !== record.fingerprint) return record
    return { ...record, published: cached.published, knowledgeTime: cached.knowledgeTime }
  })
}

/**
 * Build the small, deterministic dataset used by the homepage signal graphics.
 * The clock is anchored to the newest published record rather than "today", so
 * a cached build never turns an upstream outage into a visually quiet day.
 */
export function buildSignalPulse(stories, horizon = 28) {
  const products = ['seiche', 'liquilens', 'liquilens-undertow', 'myquant']
  const usable = stories.filter((story) => products.includes(story.product) && Number.isFinite(Date.parse(story.published)))
  if (!usable.length) return { days: [], totals: Object.fromEntries(products.map((product) => [product, 0])), maxDaily: 0, recordCount: 0 }

  const latest = Math.max(...usable.map((story) => Date.parse(story.published)))
  const latestDay = new Date(latest)
  latestDay.setUTCHours(0, 0, 0, 0)
  const parsedHorizon = Number.parseInt(horizon, 10)
  const safeHorizon = Number.isNaN(parsedHorizon)
    ? 28
    : Math.max(1, Math.min(90, parsedHorizon))
  const days = Array.from({ length: safeHorizon }, (_, index) => {
    const date = new Date(latestDay)
    date.setUTCDate(date.getUTCDate() - (safeHorizon - index - 1))
    return {
      date: date.toISOString().slice(0, 10),
      counts: Object.fromEntries(products.map((product) => [product, 0])),
    }
  })
  const dayByDate = new Map(days.map((day) => [day.date, day]))
  usable.forEach((story) => {
    const day = dayByDate.get(new Date(story.published).toISOString().slice(0, 10))
    if (day) day.counts[story.product] += 1
  })
  const totals = Object.fromEntries(products.map((product) => [
    product,
    usable.filter((story) => story.product === product).length,
  ]))
  const maxDaily = Math.max(1, ...days.map((day) => Object.values(day.counts).reduce((sum, count) => sum + count, 0)))
  return { days, totals, maxDaily, recordCount: usable.length, latestDate: latestDay.toISOString().slice(0, 10) }
}

export function storyScore(story, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(story.published)) / 3_600_000)
  const freshness = Math.max(0, 36 - Math.min(36, ageHours / 4))
  const evidencePenalty = /(missing|stale|degraded|corrupt|gap)/i.test(story.evidenceStatus) ? 80 : 0
  const newsworthiness = Number.isFinite(story.newsworthiness) ? story.newsworthiness / 4 : 0
  return (EDITORIAL_WEIGHTS[story.editorialClass] || 10) + freshness + newsworthiness - evidencePenalty
}

export function chooseLead(stories, now = Date.now()) {
  return [...stories]
    .filter((story) => story.publicationStatus === 'PUBLISHED')
    .sort((a, b) => storyScore(b, now) - storyScore(a, now) || Date.parse(b.published) - Date.parse(a.published))[0] || null
}

export function productLabel(product) {
  return ({
    liquilens: 'LiquiLens',
    seiche: 'Seiche',
    'liquilens-undertow': 'Undertow',
    myquant: 'House desk',
  })[product] || product
}

function presentationLabel(value) {
  const readable = String(value || '').replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
  return readable ? `${readable[0].toUpperCase()}${readable.slice(1)}` : 'Evidence wire'
}

function appSlug(story) {
  const preferred = story.article?.slug || story.id
  return String(preferred || '')
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

function contributionExplanation(value) {
  const contribution = String(value || '').trim()
  if (!contribution) return 'Read the source record for what this adds.'

  const parts = contribution.split(/\s*·\s*/).filter(Boolean)
  if (parts.every((part) => /^[a-z0-9_-]+$/.test(part))) {
    return parts.map((part) => CONTRIBUTION_TRANSLATIONS[part]
      || `It adds ${part.replaceAll(/[_-]+/g, ' ')}.`).join(' ')
  }
  return contribution
}

function keyNumber(value) {
  const summary = String(value || '').trim()
  if (!summary) return null
  const match = summary.match(/(?:[$£€₹]\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s+(?:out of|of)\s+(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)?(?:\s?(?:%|bps?|basis points?|[$£€₹][KMBT]?|[KMBT](?:n|illion)?))?/i)
  if (!match) return null

  const start = Math.max(
    summary.lastIndexOf('.', match.index - 1),
    summary.lastIndexOf('!', match.index - 1),
    summary.lastIndexOf('?', match.index - 1),
  ) + 1
  const candidates = [summary.indexOf('.', match.index), summary.indexOf('!', match.index), summary.indexOf('?', match.index)]
    .filter((index) => index !== -1)
  const end = candidates.length ? Math.min(...candidates) + 1 : summary.length
  return { value: match[0].trim(), label: summary.slice(start, end).trim() }
}

function readingMinutes(story) {
  const articleCopy = array(story.article?.sections)
    .flatMap((section) => array(section?.paragraphs))
    .join(' ')
  const copy = [story.title, story.dek, story.contribution, story.limitation, articleCopy]
    .filter(Boolean)
    .join(' ')
  const words = copy.match(/\S+/g)?.length || 0
  return Math.max(1, Math.ceil(words / 225))
}

/**
 * Convert normalized evidence records into the versioned mobile-app contract.
 * Consumer wording is copied or deterministically expanded from the normalized
 * record; the original evidence fields remain alongside it for auditability.
 */
export function buildAppFeed(stories, generatedAt = new Date().toISOString(), consumerCopy = {}) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('invalid app-feed generation clock')
  if (!consumerCopy || typeof consumerCopy !== 'object' || Array.isArray(consumerCopy)) {
    throw new Error('invalid app-feed consumer copy')
  }

  const published = array(stories)
    .filter((story) => story?.publicationStatus === 'PUBLISHED' && reviewedConsumerCopy(consumerCopy[story.id]))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published) || String(a.id).localeCompare(String(b.id)))
  const slugs = new Set()
  const appStories = published.map((story) => {
    const slug = appSlug(story)
    if (!slug || slugs.has(slug)) throw new Error(`invalid or duplicate app-feed slug: ${slug || '(empty)'}`)
    slugs.add(slug)

    const source = { id: story.product, label: productLabel(story.product) }
    const citations = array(story.article?.sources).length
      ? story.article.sources.map(({ label, url }) => ({ label, url }))
      : [{ label: source.label, url: story.url }]
    const reviewed = consumerCopy[story.id]
    const reviewedNumber = reviewed.keyNumber && typeof reviewed.keyNumber === 'object'
      && string(reviewed.keyNumber.value) && string(reviewed.keyNumber.label)
      ? { value: reviewed.keyNumber.value.trim(), label: reviewed.keyNumber.label.trim() }
      : null
    const number = reviewedNumber || keyNumber(story.dek)
    const item = {
      id: story.id,
      slug,
      source,
      topic: APP_TOPICS[story.product],
      beat: presentationLabel(story.beat),
      quantSays: story.title,
      inEnglish: reviewed.inEnglish.trim(),
      whyItMatters: reviewed.whyItMatters.trim(),
      ...(number ? { keyNumber: number } : {}),
      uncertainty: story.limitation,
      publishedAt: new Date(story.published).toISOString(),
      readingMinutes: readingMinutes(story),
      sourceUrl: story.url,
      sources: citations,
      evidence: {
        status: story.evidenceStatus,
        contribution: story.contribution,
        limitation: story.limitation,
        eventTime: story.eventTime,
        knowledgeTime: story.knowledgeTime,
        publicationStatus: story.publicationStatus,
      },
    }
    item.fingerprint = createHash('sha256').update(JSON.stringify(item)).digest('hex')
    return item
  })

  return {
    schema: APP_FEED_SCHEMA,
    editionId: createHash('sha256').update(appStories.map(({ fingerprint }) => fingerprint).join('\n')).digest('hex'),
    generatedAt: new Date(generatedAt).toISOString(),
    stories: appStories,
  }
}
