import { createHash } from 'node:crypto'

const ALLOWED_PRODUCTS = new Set(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'])

export const SITE_ORIGIN = 'https://myquantdoesntspeakenglish.com'
export const APP_FEED_SCHEMA = 'mqdnse.app-feed.v1'
export const INTERPRETATION_SCHEMA = 'mqdnse.interpretation.v1'
export const PUBLICATION_HOLDS_SCHEMA = 'mqdnse.publication-holds.v1'
export const PUBLICATION_APPROVALS_SCHEMA = 'mqdnse.publication-approvals.v1'
export const CONTENT_STATUS_SCHEMA = 'mqdnse.content-status.v1'
export const RELEASE_POLICY_SCHEMA = 'mqdnse.release-policy.v1'

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

const MENTAL_MODELS = Object.freeze({
  seiche: 'Picture the market funding system as plumbing. Seiche watches pressure, buffers, and dates when several pipes may tighten together. A stress label describes that system; it does not predict a crash.',
  liquilens: 'Think of a smoke detector, not a verdict. LiquiLens points to public records that deserve a closer look. A review tier does not prove that an institution will fail or that a loan is bad.',
  'liquilens-undertow': 'Picture a crowded room with a narrow exit. Undertow asks whether many holders could try to leave while the doorway is getting tighter. An unscored market stays unknown; it does not become calm.',
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

  const record = {
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
  record.fingerprint = createHash('sha256').update(JSON.stringify({
    id: record.id,
    title: record.title,
    dek: record.dek,
    beat: record.beat,
    editorialClass: record.editorialClass,
    published: record.published,
    eventTime: record.eventTime,
    evidenceStatus: record.evidenceStatus,
    contribution: record.contribution,
    limitation: record.limitation,
    sections: raw.sections,
    sources: raw.sources,
  })).digest('hex')
  return record
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

/**
 * Remove records that have an explicit legal/editorial hold for a public
 * channel. Source records remain in the private cache for audit and review.
 */
export function applyPublicationHolds(stories, holds, channel) {
  if (holds?.schema !== PUBLICATION_HOLDS_SCHEMA
    || !holds.stories || typeof holds.stories !== 'object' || Array.isArray(holds.stories)
    || !holds.products || typeof holds.products !== 'object' || Array.isArray(holds.products)) {
    throw new Error('invalid publication-holds contract')
  }
  const appliesTo = (hold) => Array.isArray(hold?.channels)
    && (hold.channels.includes('*') || hold.channels.includes(channel))
  const heldIds = new Set(Object.entries(holds.stories)
    .filter(([, hold]) => appliesTo(hold))
    .map(([id]) => id))
  const heldProducts = new Set(Object.entries(holds.products)
    .filter(([, hold]) => appliesTo(hold))
    .map(([product]) => product))
  return array(stories).filter((story) => story?.id
    && !heldIds.has(story.id)
    && !heldProducts.has(story.product))
}

const PUBLIC_CHANNELS = new Set(['site', 'app-feed'])
const CONTENT_STATUSES = new Set(['CORRECTED', 'RETRACTED', 'SUPERSEDED'])
const RELEASE_MODES = new Set(['APPROVALS_ONLY', 'SOURCE_PUBLISHED', 'SUSPENDED'])

function appliesToChannel(value, channel) {
  return Array.isArray(value?.channels)
    && (value.channels.includes('*') || value.channels.includes(channel))
}

/**
 * Positive publication gate. A source record is publishable only while an
 * approval for its exact content fingerprint is current on that channel.
 * This is a distribution control, not a representation of legal clearance.
 */
export function applyPublicationApprovals(stories, approvals, channel, now = Date.now()) {
  if (!PUBLIC_CHANNELS.has(channel)
    || approvals?.schema !== PUBLICATION_APPROVALS_SCHEMA
    || approvals.defaultAction !== 'DENY'
    || !approvals.approvals || typeof approvals.approvals !== 'object' || Array.isArray(approvals.approvals)) {
    throw new Error('invalid publication-approvals contract')
  }

  return array(stories).filter((story) => {
    const approval = approvals.approvals[story?.id]
    return story?.id
      && string(story.fingerprint)
      && approval?.status === 'APPROVED_FOR_RELEASE'
      && approval.legalClearanceClaimed === false
      && appliesToChannel(approval, channel)
      && approval.sourceFingerprint === story.fingerprint
      && Number.isFinite(Date.parse(approval.reviewedAt))
      && Number.isFinite(Date.parse(approval.expiresAt))
      && Date.parse(approval.expiresAt) > now
  })
}

/**
 * Choose which records enter a channel before corrections and volume policy.
 * SOURCE_PUBLISHED is an operator-directed web archive mode: it republishes the
 * source-supplied metadata for every PUBLISHED record without representing that
 * each record received legal clearance. The app can remain independently
 * suspended while the website uses this mode.
 */
export function selectPublicationCandidates(
  stories,
  holds,
  approvals,
  policy,
  channel,
  now = Date.now(),
) {
  const mode = policy?.channels?.[channel]?.mode
  if (!PUBLIC_CHANNELS.has(channel) || !RELEASE_MODES.has(mode)) {
    throw new Error('invalid release-policy contract')
  }
  if (mode === 'SUSPENDED') return []
  if (mode === 'SOURCE_PUBLISHED') return array(stories).filter((story) => story?.id)
  return applyPublicationApprovals(
    applyPublicationHolds(stories, holds, channel),
    approvals,
    channel,
    now,
  )
}

/**
 * Apply visible correction notices and remove retracted/superseded stories
 * from normal distribution. Notices are returned even when an old story is no
 * longer present, allowing connected clients to reconcile saved snapshots.
 */
export function applyContentStatus(stories, contract, channel) {
  if (!PUBLIC_CHANNELS.has(channel)
    || contract?.schema !== CONTENT_STATUS_SCHEMA
    || !contract.entries || typeof contract.entries !== 'object' || Array.isArray(contract.entries)) {
    throw new Error('invalid content-status contract')
  }

  const notices = Object.entries(contract.entries)
    .filter(([, entry]) => appliesToChannel(entry, channel))
    .map(([id, entry]) => {
      if (!CONTENT_STATUSES.has(entry.status)
        || !Number.isFinite(Date.parse(entry.effectiveAt))
        || !string(entry.summary)
        || (entry.replacementUrl && validHttpsUrl(entry.replacementUrl, '') !== entry.replacementUrl)) {
        throw new Error(`invalid content-status entry: ${id}`)
      }
      return {
        id,
        status: entry.status,
        effectiveAt: new Date(entry.effectiveAt).toISOString(),
        summary: entry.summary.trim(),
        ...(string(entry.replacementId) ? { replacementId: entry.replacementId.trim() } : {}),
        ...(string(entry.replacementUrl) ? { replacementUrl: entry.replacementUrl.trim() } : {}),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const noticeById = new Map(notices.map((notice) => [notice.id, notice]))
  const publishable = array(stories).flatMap((story) => {
    const notice = noticeById.get(story?.id)
    if (!notice) return [story]
    if (notice.status === 'RETRACTED' || notice.status === 'SUPERSEDED') return []
    return [{ ...story, contentNotice: notice }]
  })
  return { stories: publishable, notices }
}

/**
 * Emergency and volume policy sits outside editorial ranking. The environment
 * override gives an operator a one-variable stop switch during an incident.
 */
export function applyReleasePolicy(stories, policy, channel, emergencyOverride = false) {
  const channelPolicy = policy?.channels?.[channel]
  if (!PUBLIC_CHANNELS.has(channel)
    || policy?.schema !== RELEASE_POLICY_SCHEMA
    || typeof policy.emergencyStop !== 'boolean'
    || !channelPolicy
    || !RELEASE_MODES.has(channelPolicy.mode)
    || !Number.isInteger(channelPolicy.maxItems)
    || channelPolicy.maxItems < 0) {
    throw new Error('invalid release-policy contract')
  }
  if (policy.emergencyStop || emergencyOverride || channelPolicy.mode === 'SUSPENDED') {
    return { stories: [], releaseStatus: 'SUSPENDED' }
  }
  const limited = array(stories).slice(0, channelPolicy.maxItems)
  return { stories: limited, releaseStatus: limited.length ? 'ACTIVE' : 'SUSPENDED' }
}

function presentationLabel(value) {
  const readable = String(value || '').replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
  return readable ? `${readable[0].toUpperCase()}${readable.slice(1)}` : 'Evidence wire'
}

export function storySlug(story) {
  const preferred = story.article?.slug || story.id
  return String(preferred || '')
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

/**
 * Source articles keep their specialist canonical URL, while the audience gets
 * a stable MyQuant reading URL. House reporting is already canonical here.
 */
export function publicStoryUrl(story) {
  if (story?.product === 'myquant') return story.url
  const slug = storySlug(story)
  return slug ? `${SITE_ORIGIN}/interpreted/${slug}/` : ''
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

function reviewedKeyNumber(value) {
  return value?.keyNumber && typeof value.keyNumber === 'object'
    && string(value.keyNumber.value) && string(value.keyNumber.label)
    ? { value: value.keyNumber.value.trim(), label: value.keyNumber.label.trim() }
    : null
}

function signedWord(value) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number) || number === 0) return 'unchanged'
  return `${Math.abs(number)} point${Math.abs(number) === 1 ? '' : 's'} ${number > 0 ? 'higher' : 'lower'}`
}

function sourceGroundedPlainEnglish(story) {
  const dek = String(story.dek || '').trim()
  if (story.product === 'seiche') {
    const current = dek.match(/^The board reads ([\d.]+) out of 100, ([A-Z_]+); the dated reserve path contributes ([+-]?[\d.]+) points; the pooled five-business-day event read is ([\d.]+)%; plumbing leads market pricing by ([+-]?[\d.]+) percentile points\. The index is ([+-]?[\d.]+) against the last published letter\.$/)
    if (current) {
      return `Seiche's funding score is ${current[1]} out of 100, in its ${current[2]} regime, and is ${signedWord(current[6])} than in the previous letter. Its plumbing measures lead its market-price screens by ${current[5]} percentile points. The dated reserve path adds ${current[3]} points, and the five-business-day event reading is ${current[4]}%.`
    }
    const legacy = dek.match(/^The composite reads ([\d.]+), regime ([A-Z_]+)\.(?: That is ([+-]?[\d.]+) on the day\.)? The Tell reads ([+-]?[\d.]+)\./)
    if (legacy) {
      const move = legacy[3] ? ` It is ${signedWord(legacy[3])} on the day.` : ''
      return `Seiche's funding composite is ${legacy[1]}, classified ${legacy[2]}.${move} Its internal plumbing-versus-price gap, called the Tell, is ${legacy[4]}.`
    }
    const weekAhead = dek.match(/^Issue (\d+) of the Monday letter\. The composite reads ([\d.]+), regime ([A-Z_]+)\. (\d+) pre-registered calls for the week and (\d+) dated items on the calendar\.(?: Last week's calls graded (\d+) of (\d+), misses first\.| The first issue, so there is nothing to grade yet\.)$/)
    if (weekAhead) {
      const grade = weekAhead[6]
        ? ` The previous week's calls graded ${weekAhead[6]} out of ${weekAhead[7]}, with misses disclosed first.`
        : ' This was the first edition, so no earlier calls could be graded.'
      return `Before the week began, Seiche registered ${weekAhead[4]} calls and ${weekAhead[5]} dated events. Its funding composite was ${weekAhead[2]}, classified ${weekAhead[3]}.${grade}`
    }
  }

  if (story.product === 'liquilens-undertow') {
    const coverage = dek.match(/^(\d+) of (\d+) segments score today; (.+?) still accrue history\. The funding overlay reads ([A-Z_]+)\./)
    if (coverage) {
      const disagreement = /disagree inside at least one scored cell/i.test(dek)
        ? ' At least one scored segment contains measures pointing in different directions.'
        : ''
      return `Undertow can score ${coverage[1]} of ${coverage[2]} market segments today. ${coverage[3]} still lack enough history, so those gaps are not an all-clear. Its separate funding overlay reads ${coverage[4]}.${disagreement}`
    }
  }

  if (story.product === 'liquilens') {
    const breadth = story.title.match(/^(\d+) of (\d+) covered (.+?) sit above green$/i)
    if (breadth) {
      return `${breadth[1]} of the ${breadth[2]} covered ${breadth[3]} are in a review tier above green. This is a count inside the freshly checked list, not a score for the whole financial system.`
    }
    const concentration = story.title.match(/^(.+?) reports (.+?) equal to ([\d.]+) times (.+)$/i)
    if (concentration) {
      return `${concentration[1]} reports ${concentration[2]} equal to ${concentration[3]} times ${concentration[4]}. LiquiLens uses that ratio as a concentration screen; by itself, it is not a finding of failure or liquidity stress.`
    }
    const ranking = story.title.match(/^(.+?) ranks highest on the current within-quarter (.+?) screen$/i)
    if (ranking) {
      return `${ranking[1]} ranks highest on this quarter's covered ${ranking[2]} screen. The ranking compares only this run and is not a default forecast.`
    }
    const reviewTier = story.title.match(/^(.+?) sits in the (.+?) public-record review tier$/i)
    if (reviewTier) {
      return `${reviewTier[1]} is in LiquiLens's ${reviewTier[2]} review queue. That is an instruction to inspect its public records, not a prediction of distress or failure.`
    }
  }

  return dek
}

/**
 * Build an auditable plain-language wrapper around a specialist record. This
 * function never changes the source claim, source URL, fingerprint, or caveat.
 * Reviewed wording is optional; the deterministic fallback only rearranges
 * fields the source already published and expands a controlled taxonomy.
 */
export function buildInterpretation(story, consumerCopy = {}) {
  if (!story || story.product === 'myquant' || story.publicationStatus !== 'PUBLISHED') return null
  const slug = storySlug(story)
  const url = publicStoryUrl(story)
  if (!slug || !url || !MENTAL_MODELS[story.product]) return null

  const reviewed = reviewedConsumerCopy(consumerCopy)
  const inEnglish = reviewed ? consumerCopy.inEnglish.trim() : sourceGroundedPlainEnglish(story)
  const number = reviewedKeyNumber(consumerCopy) || keyNumber(inEnglish) || keyNumber(story.dek) || keyNumber(story.title)
  const interpretation = {
    schema: INTERPRETATION_SCHEMA,
    id: story.id,
    slug,
    url,
    lane: 'INTERPRETED',
    copyState: reviewed ? 'REVIEWED' : 'SOURCE_GROUNDED',
    title: story.title,
    quantSays: story.title,
    sourceSummary: story.dek,
    inEnglish,
    whyItMatters: reviewed ? consumerCopy.whyItMatters.trim() : contributionExplanation(story.contribution),
    mentalModel: MENTAL_MODELS[story.product],
    ...(number ? { keyNumber: number } : {}),
    uncertainty: story.limitation,
    publishedAt: new Date(story.published).toISOString(),
    evidence: {
      status: story.evidenceStatus,
      contribution: story.contribution,
      limitation: story.limitation,
      eventTime: story.eventTime,
      knowledgeTime: story.knowledgeTime,
      publicationStatus: story.publicationStatus,
    },
    source: {
      id: story.id,
      product: story.product,
      label: productLabel(story.product),
      url: story.url,
      fingerprint: story.fingerprint,
      beat: story.beat,
      editorialClass: story.editorialClass,
    },
    ...(story.contentNotice ? { contentNotice: story.contentNotice } : {}),
  }
  interpretation.fingerprint = createHash('sha256').update(JSON.stringify(interpretation)).digest('hex')
  return interpretation
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
export function buildAppFeed(
  stories,
  generatedAt = new Date().toISOString(),
  consumerCopy = {},
  notices = [],
  releaseStatus = 'ACTIVE',
) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('invalid app-feed generation clock')
  if (!consumerCopy || typeof consumerCopy !== 'object' || Array.isArray(consumerCopy)) {
    throw new Error('invalid app-feed consumer copy')
  }
  if (!Array.isArray(notices) || !['ACTIVE', 'SUSPENDED'].includes(releaseStatus)) {
    throw new Error('invalid app-feed release state')
  }

  const published = array(stories)
    .filter((story) => story?.publicationStatus === 'PUBLISHED' && reviewedConsumerCopy(consumerCopy[story.id]))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published) || String(a.id).localeCompare(String(b.id)))
  const slugs = new Set()
  const appStories = published.map((story) => {
    const slug = storySlug(story)
    if (!slug || slugs.has(slug)) throw new Error(`invalid or duplicate app-feed slug: ${slug || '(empty)'}`)
    slugs.add(slug)

    const source = { id: story.product, label: productLabel(story.product) }
    const citations = array(story.article?.sources).length
      ? story.article.sources.map(({ label, url }) => ({ label, url }))
      : [{ label: source.label, url: story.url }]
    const reviewed = consumerCopy[story.id]
    const reviewedNumber = reviewedKeyNumber(reviewed)
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
      ...(story.contentNotice ? { contentNotice: story.contentNotice } : {}),
    }
    item.fingerprint = createHash('sha256').update(JSON.stringify(item)).digest('hex')
    return item
  })

  const normalizedNotices = notices.map((notice) => ({ ...notice }))
  return {
    schema: APP_FEED_SCHEMA,
    releaseStatus,
    editionId: createHash('sha256').update(JSON.stringify({
      releaseStatus,
      stories: appStories.map(({ fingerprint }) => fingerprint),
      notices: normalizedNotices,
    })).digest('hex'),
    generatedAt: new Date(generatedAt).toISOString(),
    stories: appStories,
    notices: normalizedNotices,
  }
}
