import { createHash } from 'node:crypto'

const ALLOWED_PRODUCTS = new Set(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'])

export const SITE_ORIGIN = 'https://myquantdoesntspeakenglish.com'

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
    home: 'https://liquilens-undertow.com/dispatch/',
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

const string = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
const array = (value) => Array.isArray(value) ? value : []

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
    rows = dates.map((date) => letters[date]?.story || letters[date]).filter(Boolean)
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
