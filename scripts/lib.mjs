import { createHash } from 'node:crypto'

const ALLOWED_PRODUCTS = new Set(['liquilens', 'seiche', 'liquilens-undertow', 'myquant'])

export const FLEET_REGISTRY_SCHEMA = 'mqdnse.fleet-registry.v1'
export const REGISTERED_FLEET_IDS = Object.freeze([
  'liquilens',
  'liquilens-lab',
  'liquilens-v5',
  'seiche',
  'riptide',
  'undertow',
  'undertow-mm',
  'v5-backtest-harness',
  'v5-case-study-2019-nbfc',
  'v5-m1-ce-timing',
  'v5-m2-velocity',
  'v5-m3-graph-contagion',
  'v5-m4-concentration',
  'liquilens-cli',
  'liquilens-mcp',
  'undertow-mcp',
  'myquantdoesntspeakenglish',
  'myquant-intelligence',
  'myquant-app',
  'liquilens-site',
  'palimpsest',
  'scamshield',
  'fleet-bots',
])

export const SITE_ORIGIN = 'https://myquantdoesntspeakenglish.com'
export const APP_FEED_SCHEMA = 'mqdnse.app-feed.v1'
export const APP_COPY_SCHEMA = 'mqdnse.app-copy.v2'
export const INTERPRETATION_SCHEMA = 'mqdnse.interpretation.v1'
export const PUBLICATION_HOLDS_SCHEMA = 'mqdnse.publication-holds.v1'
export const PUBLICATION_APPROVALS_SCHEMA = 'mqdnse.publication-approvals.v1'
export const CONTENT_STATUS_SCHEMA = 'mqdnse.content-status.v1'
export const RELEASE_POLICY_SCHEMA = 'mqdnse.release-policy.v1'

export const SOURCES = [
  {
    id: 'liquilens-desk',
    product: 'liquilens',
    label: 'LiquiLens',
    channel: 'desk',
    expectedSchema: 'liquilens.desk-bit-feed.v1',
    url: 'https://api.liquilens.in/api/experimental/v1/desk/bits',
    home: 'https://liquilens.in/desk/',
  },
  {
    id: 'liquilens-investigations',
    product: 'liquilens',
    label: 'LiquiLens investigations',
    channel: 'article-index',
    url: 'https://liquilens.in/investigations/index.json',
    home: 'https://liquilens.in/investigations/',
  },
  {
    id: 'liquilens-case-files',
    product: 'liquilens',
    label: 'LiquiLens case files',
    channel: 'article-index',
    url: 'https://liquilens.in/replay/index.json',
    home: 'https://liquilens.in/replay/',
  },
  {
    id: 'seiche-dispatches',
    product: 'seiche',
    label: 'Seiche',
    channel: 'dispatch',
    url: 'https://seiche.info/dispatches/news.json',
    home: 'https://seiche.info/dispatches/',
  },
  {
    id: 'seiche-investigations',
    product: 'seiche',
    label: 'Seiche investigations',
    channel: 'article-index',
    url: 'https://seiche.info/investigations/index.json',
    home: 'https://seiche.info/investigations/',
  },
  {
    id: 'undertow-dispatches',
    product: 'liquilens-undertow',
    label: 'Undertow',
    channel: 'dispatch',
    url: 'https://api.seiche.info/undertow/dispatch.json',
    home: 'https://liquilens-undertow.com/',
  },
  {
    id: 'undertow-investigations',
    product: 'liquilens-undertow',
    label: 'Undertow investigations',
    channel: 'article-index',
    url: 'https://liquilens-undertow.com/investigations/index.json',
    home: 'https://liquilens-undertow.com/investigations/',
  },
]

// This is the deliberately small subjective layer. Evidence gates happen
// before ranking; these weights only choose the lead among publishable records.
export const EDITORIAL_WEIGHTS = Object.freeze({
  investigation: 56,
  full_story: 52,
  house_investigation: 48,
  case_file: 35,
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
  coverage_gate_explanation: 'It explains why incomplete evidence prevents a public tier.',
  dated_forward_test: 'It names a dated check that can be revisited.',
  fresh_longitudinal_delta: 'It identifies what changed over time.',
  historical_case_file: 'It reconstructs what each historical lens showed before the recorded event.',
  misses_included: 'It keeps misses and unscoreable cases in the published record.',
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

const CASE_FILE_MENTAL_MODEL = 'Imagine checking two smoke alarms after a fire. An alarm that rang before the event is a hit; silence is a miss; an alarm that could not be tested is void. Because this replay was reconstructed later, it is not the same as a warning delivered in real time.'

const string = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''
const array = (value) => Array.isArray(value) ? value : []
const SHA256 = /^sha256:[a-f0-9]{64}$/
const SOURCE_FINGERPRINT = /^[a-f0-9]{64}$/
const SUPPORT_FIELDS = Object.freeze(['inEnglish', 'whyItMatters', 'uncertainty', 'keyNumber'])
const SUPPORT_PREFIXES = Object.freeze(['/evidence/', '/clocks/', '/lineage/', '/source/'])

const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const sentence = (value, fallback = '') => {
  const readable = string(value, fallback)
  if (!readable || /[.!?]$/.test(readable)) return readable
  return `${readable}.`
}

const FLEET_GROUPS = new Set(['core', 'module', 'adjacent'])
const FLEET_ANALYSIS_MODES = new Set([
  'DIRECT_READING_SOURCE',
  'UPSTREAM_EVIDENCE',
  'UPSTREAM_VIA_PRODUCT',
  'RESEARCH_ONLY',
  'DELIVERY_SURFACE',
  'EDITORIAL_PUBLISHER',
  'PRIVATE_AUTHORITY',
  'PAUSED_CLIENT',
  'ADJACENT_EVIDENCE',
])

/**
 * Validate the reviewed fleet snapshot before the website can call its
 * coverage complete. This registry describes coverage and routing only; it
 * never makes a non-publishing project look like an editorial source.
 */
export function fleetRegistryIssues(value) {
  const issues = []
  if (!object(value) || value.schema !== FLEET_REGISTRY_SCHEMA) return ['invalid fleet-registry schema']
  if (!validTimestamp(value.reviewedAt)) issues.push('fleet registry needs a timezone-qualified review clock')
  if (!object(value.source)
    || !/^[a-f0-9]{40}$/.test(string(value.source.revision))
    || !validHttpsUrl(value.source.url, '')) {
    issues.push('fleet registry needs an immutable HTTPS source revision')
  }
  if (!Array.isArray(value.projects)) return [...issues, 'fleet registry projects must be an array']

  const ids = value.projects.map((project) => string(project?.id)).filter(Boolean)
  if (ids.length !== value.projects.length || new Set(ids).size !== ids.length) {
    issues.push('fleet registry project IDs must be present and unique')
  }
  const expected = new Set(REGISTERED_FLEET_IDS)
  const missing = REGISTERED_FLEET_IDS.filter((id) => !ids.includes(id))
  const unexpected = ids.filter((id) => !expected.has(id))
  if (missing.length) issues.push(`fleet registry is missing: ${missing.join(', ')}`)
  if (unexpected.length) issues.push(`fleet registry has unexpected family entries: ${unexpected.join(', ')}`)

  for (const project of value.projects) {
    if (!object(project)
      || !string(project.id)
      || !string(project.label)
      || !FLEET_GROUPS.has(project.group)
      || !string(project.kind)
      || !string(project.role)) {
      issues.push(`invalid fleet project: ${string(project?.id, '(unknown)')}`)
      continue
    }
    const analysis = project.analysis
    if (!object(analysis)
      || !FLEET_ANALYSIS_MODES.has(analysis.mode)
      || !string(analysis.reason)
      || !/[.!?]$/.test(analysis.reason.trim())) {
      issues.push(`invalid analysis route: ${project.id}`)
    }
    if (analysis?.mode === 'DIRECT_READING_SOURCE'
      && !ALLOWED_PRODUCTS.has(string(analysis.product))) {
      issues.push(`invalid direct reading product: ${project.id}`)
    }
    if (project.url && !validHttpsUrl(project.url, '')) issues.push(`invalid project URL: ${project.id}`)
  }

  if (!Array.isArray(value.networkProjects)
    || value.networkProjects.some((project) => !object(project)
      || !string(project.id)
      || !string(project.label)
      || !validHttpsUrl(project.url, '')
      || project.analysis?.mode !== 'ADJACENT_EVIDENCE'
      || !/[.!?]$/.test(string(project.analysis?.reason)))) {
    issues.push('invalid evidence-network project registry')
  }
  return issues
}

export const validFleetRegistry = (value) => fleetRegistryIssues(value).length === 0
export const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!object(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}
export const canonicalJsonSha256 = (value) => `sha256:${createHash('sha256')
  .update(JSON.stringify(canonicalValue(value)))
  .digest('hex')}`
export const validAppCopyDocument = (value) => object(value)
  && value.schema === APP_COPY_SCHEMA
  && object(value.stories)
const validTimestamp = (value) => typeof value === 'string'
  && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))
const validArtifact = (value, schema) => object(value)
  && value.schema === schema
  && SHA256.test(string(value.sha256))
const validModelRevision = (value) => object(value)
  && Boolean(string(value.id))
  && SHA256.test(string(value.revision))
const validSupportRefs = (value, hasKeyNumber) => {
  if (!object(value)) return false
  const expected = new Set(hasKeyNumber ? SUPPORT_FIELDS : SUPPORT_FIELDS.slice(0, 3))
  if (Object.keys(value).length !== expected.size || Object.keys(value).some((field) => !expected.has(field))) {
    return false
  }
  return Object.values(value).every((paths) => Array.isArray(paths)
    && paths.length > 0
    && new Set(paths).size === paths.length
    && paths.every((path) => typeof path === 'string'
      && SUPPORT_PREFIXES.some((prefix) => path.startsWith(prefix))))
    && value.uncertainty.some((path) => path.startsWith('/evidence/limitations/'))
}

/**
 * A reviewed copy is usable only for the exact normalized source revision that
 * was adjudicated. Model and validator outputs remain shadow artifacts; this
 * check recognizes the separate human publication decision recorded offline.
 */
export function reviewedConsumerCopy(story, value) {
  const review = value?.review
  const reviewers = array(review?.reviewers)
  const adjudicator = review?.adjudicator
  const keyNumberPresent = value?.keyNumber !== undefined && value?.keyNumber !== null
  const keyNumberValid = !keyNumberPresent || (object(value.keyNumber)
    && Boolean(string(value.keyNumber.value))
    && Boolean(string(value.keyNumber.label)))
  const approvedCopy = {
    inEnglish: value?.inEnglish,
    whyItMatters: value?.whyItMatters,
    uncertainty: value?.uncertainty,
    keyNumber: keyNumberPresent ? value.keyNumber : null,
    supportRefs: value?.supportRefs,
  }
  return object(story)
    && object(value)
    && SOURCE_FINGERPRINT.test(string(story.fingerprint))
    && value.sourceId === story.id
    && value.sourceFingerprint === story.fingerprint
    && object(value.evidencePacket)
    && SHA256.test(string(value.evidencePacket.id))
    && SHA256.test(string(value.evidencePacket.sha256))
    && SHA256.test(string(value.evidencePacket.semanticRevisionHash))
    && validArtifact(value.candidate, 'mqdnse.analysis-draft.v1')
    && validArtifact(value.validatorReceipt, 'mqdnse.draft-validation.v1')
    && validModelRevision(value.teacher)
    && validModelRevision(value.model)
    && SHA256.test(string(value.copySha256))
    && value.copySha256 === canonicalJsonSha256(approvedCopy)
    && review?.decision === 'APPROVED'
    && validTimestamp(review.reviewedAt)
    && SHA256.test(string(review.receiptSha256))
    && reviewers.length >= 2
    && new Set(reviewers.map((row) => string(row?.id))).size === reviewers.length
    && reviewers.every((row) => object(row)
      && Boolean(string(row.id))
      && validTimestamp(row.reviewedAt))
    && object(adjudicator)
    && Boolean(string(adjudicator.id))
    && !reviewers.some((row) => string(row?.id) === string(adjudicator.id))
    && validTimestamp(adjudicator.reviewedAt)
    && review.reviewedAt === adjudicator.reviewedAt
    && reviewers.every((row) => Date.parse(row.reviewedAt) <= Date.parse(review.reviewedAt))
    && Boolean(string(value.inEnglish))
    && Boolean(string(value.whyItMatters))
    && Boolean(string(value.uncertainty))
    && keyNumberValid
    && validSupportRefs(value.supportRefs, keyNumberPresent)
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
  const corrections = array(raw.corrections)
    .filter((correction) => correction && typeof correction === 'object' && !Array.isArray(correction))
    .map((correction) => ({
      correctedAt: string(correction.corrected_at, correction.correctedAt),
      fields: array(correction.fields).map((field) => string(field)).filter(Boolean),
      note: string(correction.note),
    }))
    .filter((correction) => correction.correctedAt && correction.fields.length && correction.note)
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
    articleType: string(raw.article_type, raw.editorial_class, raw.type, 'analysis'),
    pointInTimeStatus: string(raw.point_in_time_status),
    verdicts: raw.verdicts && typeof raw.verdicts === 'object' && !Array.isArray(raw.verdicts)
      ? { ...raw.verdicts }
      : null,
    outcomeWindow: raw.outcome_window && typeof raw.outcome_window === 'object' && !Array.isArray(raw.outcome_window)
      ? { ...raw.outcome_window }
      : null,
    fraudMasked: raw.fraud_masked === true,
    ...(corrections.length ? { corrections } : {}),
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
    articleType: record.articleType,
    pointInTimeStatus: record.pointInTimeStatus,
    verdicts: record.verdicts,
    outcomeWindow: record.outcomeWindow,
    fraudMasked: record.fraudMasked,
    ...(record.corrections?.length ? { corrections: record.corrections } : {}),
  })).digest('hex')
  return record
}

export function normalizePayload(payload, source) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid JSON root')
  if (source.expectedSchema && payload.schema !== source.expectedSchema) {
    const received = typeof payload.schema === 'string'
      ? payload.schema.slice(0, 120)
      : payload.schema === undefined
        ? 'missing'
        : typeof payload.schema
    throw new Error(`source schema mismatch: expected ${source.expectedSchema}; received ${received}`)
  }
  let rows = []
  if (source.channel === 'article-index') rows = array(payload.articles)
  else if (source.product === 'liquilens') rows = array(payload.bits)
  else if (source.product === 'seiche') rows = array(payload.entries)
  else if (source.product === 'liquilens-undertow') {
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

/**
 * Combine independently cached editorial channels into product feeds. An ID
 * may repeat only when its full normalized fingerprint is identical; divergent
 * copies are an upstream contract conflict and fail the build.
 */
export function mergeChannelFeeds(channels) {
  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) {
    throw new Error('invalid channel cache')
  }
  const feeds = {}
  const recordsById = new Map()
  for (const channelId of Object.keys(channels).sort()) {
    const records = channels[channelId]
    if (!Array.isArray(records)) throw new Error(`invalid channel records: ${channelId}`)
    for (const story of records) {
      if (!story?.id || !ALLOWED_PRODUCTS.has(story.product)) {
        throw new Error(`invalid normalized record in channel: ${channelId}`)
      }
      const existing = recordsById.get(story.id)
      if (existing) {
        if (existing.fingerprint !== story.fingerprint) {
          throw new Error(`conflicting source record id: ${story.id}`)
        }
        continue
      }
      recordsById.set(story.id, story)
      feeds[story.product] ||= []
      feeds[story.product].push(story)
    }
  }
  for (const records of Object.values(feeds)) {
    records.sort((a, b) => Date.parse(b.published) - Date.parse(a.published)
      || String(a.id).localeCompare(String(b.id)))
  }
  return feeds
}

export function buildProductFeedStatuses(channelStatuses, feeds, sources = SOURCES) {
  return Object.fromEntries([...new Set(sources.map(({ product }) => product))].map((product) => {
    const sourceIds = sources.filter((source) => source.product === product).map(({ id }) => id)
    const cachedSourceIds = sourceIds.filter((id) => channelStatuses[id]?.state === 'cached')
    return [product, {
      state: cachedSourceIds.length ? 'cached' : 'live',
      detail: cachedSourceIds.length
        ? `${feeds[product]?.length || 0} records · degraded channels: ${cachedSourceIds.join(', ')}`
        : `${feeds[product]?.length || 0} records · all ${sourceIds.length} channels connected`,
    }]
  }))
}

export function normalizeHouseArticle(raw) {
  if (!raw || raw.publication_status !== 'PUBLISHED' || !array(raw.sources).length) return null
  const slug = string(raw.slug)
  const published = string(raw.published_at)
  const articleType = string(raw.article_type, raw.editorial_class, 'analysis')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !Number.isFinite(Date.parse(published))) return null
  if (!string(raw.title) || !string(raw.dek) || !string(raw.author) || !string(raw.original_contribution)) return null
  if (!array(raw.limitations).length || !raw.limitations.every((limitation) => string(limitation))) return null
  if (!array(raw.sections).length || !raw.sections.every((section) => (
    string(section.heading)
    && array(section.paragraphs).length
    && section.paragraphs.every((paragraph) => string(paragraph))
  ))) return null
  if (!raw.sources.every((source) => source && string(source.label) && validHttpsUrl(source.url, '') === source.url)) return null

  let newsGate = null
  if (articleType === 'news_analysis') {
    const gate = raw.news_gate && typeof raw.news_gate === 'object' && !Array.isArray(raw.news_gate)
      ? raw.news_gate
      : {}
    const eventTime = string(raw.event_time)
    const knowledgeTime = string(raw.knowledge_time)
    const eventClock = Date.parse(eventTime)
    const knowledgeClock = Date.parse(knowledgeTime)
    const publicationClock = Date.parse(published)
    const primarySources = raw.sources.filter((source) => source.type === 'primary_event')
    const primaryEventClocks = primarySources.map((source) => Date.parse(string(source.event_time)))
    const primaryReleaseIds = primarySources.map((source) => string(source.release_id))
    const validPrimarySources = primarySources.length > 0
      && primaryReleaseIds.every(Boolean)
      && new Set(primaryReleaseIds).size === primaryReleaseIds.length
      && primaryEventClocks.every((sourceClock) => Number.isFinite(sourceClock) && sourceClock <= knowledgeClock)
      && Math.max(...primaryEventClocks) === eventClock
    const gateStrings = ['network_relevance', 'countercase', 'falsifier', 'revision_risk', 'forecast_boundary']
    const newsworthiness = raw.newsworthiness && typeof raw.newsworthiness === 'object'
      ? raw.newsworthiness
      : {}
    if (!Number.isFinite(eventClock)
      || !Number.isFinite(knowledgeClock)
      || eventClock > knowledgeClock
      || knowledgeClock > publicationClock
      || !validPrimarySources
      || !gateStrings.every((field) => string(gate[field]))
      || !Number.isInteger(newsworthiness.score)
      || newsworthiness.score < 3
      || newsworthiness.score > 5
      || !string(newsworthiness.why)
      || gate.recommendation_status !== 'NONE') return null
    newsGate = {
      networkRelevance: gate.network_relevance.trim(),
      countercase: gate.countercase.trim(),
      falsifier: gate.falsifier.trim(),
      revisionRisk: gate.revision_risk.trim(),
      forecastBoundary: gate.forecast_boundary.trim(),
      recommendationStatus: 'NONE',
    }
  }

  const record = {
    id: `myquant:${slug}`,
    product: 'myquant',
    title: string(raw.title),
    dek: string(raw.dek),
    url: `${SITE_ORIGIN}/articles/${slug}`,
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
    articleType,
    pointInTimeStatus: string(raw.point_in_time_status),
    verdicts: raw.verdicts && typeof raw.verdicts === 'object' && !Array.isArray(raw.verdicts)
      ? { ...raw.verdicts }
      : null,
    outcomeWindow: raw.outcome_window && typeof raw.outcome_window === 'object' && !Array.isArray(raw.outcome_window)
      ? { ...raw.outcome_window }
      : null,
    fraudMasked: raw.fraud_masked === true,
    newsGate,
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
    articleType: record.articleType,
    newsGate: record.newsGate,
    pointInTimeStatus: record.pointInTimeStatus,
    verdicts: record.verdicts,
    outcomeWindow: record.outcomeWindow,
    fraudMasked: record.fraudMasked,
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
  return slug ? `${SITE_ORIGIN}/interpreted/${slug}` : ''
}

function contributionExplanation(value) {
  const contribution = String(value || '').trim()
  if (!contribution) return 'Read the source record for what this adds.'

  const parts = contribution.split(/\s*·\s*/).filter(Boolean)
  if (parts.every((part) => /^[a-z0-9_-]+$/.test(part))) {
    return parts.map((part) => CONTRIBUTION_TRANSLATIONS[part]
      || `It adds ${part.replaceAll(/[_-]+/g, ' ')}.`).join(' ')
  }
  return sentence(contribution)
}

const contributionKinds = (story) => String(story?.contribution || '')
  .split(/\s*·\s*/)
  .filter((part) => /^[a-z0-9_-]+$/.test(part))

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

function comparisonWithPrevious(value) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number) || number === 0) return 'unchanged from the previous letter'
  return `${signedWord(number)} than in the previous letter`
}

const SEICHE_CURRENT_RE = /^The board reads ([\d.]+) out of 100, ([A-Z_]+); the dated reserve path contributes ([+-]?[\d.]+) points; the pooled five-business-day event read is ([\d.]+)%; plumbing leads market pricing by ([+-]?[\d.]+) percentile points\. The index is ([+-]?[\d.]+) against the last published letter\.$/
const SEICHE_LEGACY_RE = /^The composite reads ([\d.]+), regime ([A-Z_]+)\.(?: That is ([+-]?[\d.]+) on the day\.)? The Tell reads ([+-]?[\d.]+)\./
const SEICHE_WEEK_AHEAD_RE = /^Issue (\d+) of the Monday letter\. The composite reads ([\d.]+), regime ([A-Z_]+)\. (\d+) pre-registered calls for the week and (\d+) dated items on the calendar\.(?: Last week's calls graded (\d+) of (\d+), misses first\.| The first issue, so there is nothing to grade yet\.)$/
const UNDERTOW_COVERAGE_RE = /^(\d+) of (\d+) segments score today; (.+?) still accrue history\. The funding overlay reads ([A-Z_]+)\./
const UNDERTOW_EXTREMES_RE = /The hottest qualifying measure is (.+?), at (.+?); the coolest is (.+?), at (.+?)\./

const seicheCurrent = (story) => String(story?.dek || '').trim().match(SEICHE_CURRENT_RE)
const seicheLegacy = (story) => String(story?.dek || '').trim().match(SEICHE_LEGACY_RE)
const seicheWeekAhead = (story) => String(story?.dek || '').trim().match(SEICHE_WEEK_AHEAD_RE)
const undertowCoverage = (story) => String(story?.dek || '').trim().match(UNDERTOW_COVERAGE_RE)
const undertowExtremes = (story) => String(story?.dek || '').trim().match(UNDERTOW_EXTREMES_RE)

function verdictSummary(story) {
  if (!object(story?.verdicts)) return ''
  return Object.entries(story.verdicts)
    .map(([lens, verdict]) => `${presentationLabel(lens)} ${string(verdict)}`)
    .join('; ')
}

function sourceGroundedPlainEnglish(story) {
  const dek = String(story.dek || '').trim()
  if (story.articleType === 'case_file') return dek
  if (story.product === 'seiche') {
    const current = seicheCurrent(story)
    if (current) {
      return `Seiche's funding score is ${current[1]} out of 100, in its ${current[2]} regime, and is ${comparisonWithPrevious(current[6])}. Its plumbing measures lead its market-price screens by ${current[5]} percentile points. The dated reserve path adds ${current[3]} points, and the five-business-day event reading is ${current[4]}%.`
    }
    const legacy = seicheLegacy(story)
    if (legacy) {
      const move = legacy[3] ? ` It is ${signedWord(legacy[3])} on the day.` : ''
      return `Seiche's funding composite is ${legacy[1]}, classified ${legacy[2]}.${move} Its internal plumbing-versus-price gap, called the Tell, is ${legacy[4]}.`
    }
    const weekAhead = seicheWeekAhead(story)
    if (weekAhead) {
      const grade = weekAhead[6]
        ? ` The previous week's calls graded ${weekAhead[6]} out of ${weekAhead[7]}, with misses disclosed first.`
        : ' This was the first edition, so no earlier calls could be graded.'
      return `Before the week began, Seiche registered ${weekAhead[4]} calls and ${weekAhead[5]} dated events. Its funding composite was ${weekAhead[2]}, classified ${weekAhead[3]}.${grade}`
    }
  }

  if (story.product === 'liquilens-undertow') {
    const coverage = undertowCoverage(story)
    if (coverage) {
      const disagreement = /disagree inside at least one scored cell/i.test(dek)
        ? ' At least one scored segment contains measures pointing in different directions.'
        : ''
      const extremes = undertowExtremes(story)
      const crossSection = extremes
        ? ` The source identifies ${extremes[1]} as hottest (${extremes[2]}) and ${extremes[3]} as coolest (${extremes[4]}) among qualifying measures.`
        : ''
      return `Undertow can score ${coverage[1]} of ${coverage[2]} market segments today. ${coverage[3]} still lack enough history, so those gaps are not an all-clear. Its separate funding overlay reads ${coverage[4]}.${crossSection}${disagreement}`
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

function sourceGroundedWhyItMatters(story) {
  const kinds = contributionKinds(story)
  if (story.articleType === 'case_file') {
    const verdicts = verdictSummary(story)
    return verdicts
      ? `The source grades ${verdicts}. Publishing the lenses separately tests what each method showed before the recorded event and keeps misses or voids visible instead of rewriting a flattering combined result.`
      : 'Retrospective cases test whether each lens showed anything before the recorded event. Keeping misses and voids visible measures the method without rewriting the result after the fact.'
  }
  if (story.product === 'seiche') {
    if (seicheWeekAhead(story)) {
      return 'Pre-registering calls and dated events makes the next evaluation possible and keeps misses visible. The calendar is a test plan, not a promise that funding conditions will deteriorate.'
    }
    const current = seicheCurrent(story)
    if (current) {
      const movement = Number.parseFloat(current[6]) === 0
        ? 'The headline composite did not move'
        : `The headline composite moved ${signedWord(current[6])}`
      return `${movement}, while the source reports a ${current[5]}-point plumbing-versus-price gap, a dated reserve contribution of ${current[3]} points, and a ${current[4]}% event reading. That combination shows whether the published regime is broad-price confirmation or a more bounded plumbing-and-calendar signal; it is not a market forecast.`
    }
    const legacy = seicheLegacy(story)
    if (legacy) {
      return `The source’s ${legacy[4]} Tell records its plumbing-versus-price gap alongside a ${legacy[1]} ${legacy[2]} composite. Reading both prevents the regime label from hiding internal disagreement; neither field is an observed market price or a transaction recommendation.`
    }
    const contribution = contributionExplanation(story.contribution)
    return `${contribution} In a funding record, separating plumbing, market prices, and dated events prevents one headline from standing in for the whole system; the result remains context for investigation, not a market forecast.`
  }
  if (story.product === 'liquilens-undertow') {
    const coverage = undertowCoverage(story)
    if (coverage) {
      const extremes = undertowExtremes(story)
      const crossSection = extremes
        ? ` The source’s hottest qualifying measure is ${extremes[1]}, while its coolest is ${extremes[3]}; those endpoints show why the measures matter alongside the tier.`
        : ''
      return `Only ${coverage[1]} of ${coverage[2]} market segments support a public tier in this record. That coverage boundary limits any cross-market conclusion, while the separate ${coverage[4]} funding overlay supplies context rather than a blended score.${crossSection}`
    }
    return 'Market-liquidity evidence matters when several holders may need the same exit, but a source tier is only as broad as its published coverage. Read the qualifying measures and missing segments before drawing a cross-market conclusion.'
  }
  if (story.product === 'liquilens') {
    if (kinds.includes('cross_sectional_review_breadth')) {
      return 'The count shows how broadly a review flag appears inside the covered set. It helps prioritise evidence review, but the denominator is not the full regulated system and the count is not a system-wide risk score.'
    }
    if (kinds.includes('cross_bank_private_credit_concentration')) {
      return 'A concentration ratio can identify where one exposure is large relative to a bank capital measure. It is a prompt to inspect balance-sheet, liability, and vintage context—not a finding of loss, distress, or default.'
    }
    if (kinds.includes('within_quarter_cross_bank_ranking') || kinds.includes('peer_relative_change')) {
      return 'A within-vintage ranking helps decide which public records to inspect first. Its meaning depends on the covered peers, data vintage, and evidence gate; it is not a credit rating or default forecast.'
    }
    return 'This record is useful for prioritising which public evidence to inspect. A review tier, rank, or research diagnostic remains a bounded screen and does not become a lending decision or failure prediction.'
  }

  const expanded = contributionExplanation(story.contribution)
  return expanded.toLowerCase() === 'evidence-backed desk finding.'
    ? 'This source-published finding adds a bounded record to the evidence trail. Its usefulness depends on the attached clock, source, and limitation rather than the label alone.'
    : expanded
}

function sourceGroundedWhatChanged(story) {
  const kinds = contributionKinds(story)
  if (story.articleType === 'case_file') {
    const verdicts = verdictSummary(story)
    return verdicts
      ? `This retrospective record grades ${verdicts}; it is not a new live movement. The relevant comparison is between those source-defined lenses and the recorded outcome window.`
      : 'This is a retrospective evaluation record, not a new live movement. The relevant comparison is between the source-defined lenses and the recorded outcome window.'
  }
  if (story.product === 'seiche') {
    const current = seicheCurrent(story)
    if (current) {
      const movement = Number.parseFloat(current[6]) === 0
        ? `held at ${current[1]}`
        : `moved to ${current[1]}, ${comparisonWithPrevious(current[6])}`
      return `The published funding index ${movement}. The source still separates a ${current[5]}-point plumbing-versus-price gap, a dated reserve contribution of ${current[3]} points, and a ${current[4]}% five-day event reading.`
    }
    const legacy = seicheLegacy(story)
    if (legacy) {
      const movement = legacy[3]
        ? `The composite is ${legacy[1]} and ${signedWord(legacy[3])} on the day.`
        : `The composite is ${legacy[1]}; this record does not state a comparable daily move.`
      return `${movement} The source reports a ${legacy[4]} plumbing-versus-price gap.`
    }
    const weekAhead = seicheWeekAhead(story)
    if (weekAhead) {
      return `This forward calendar registers ${weekAhead[4]} calls and ${weekAhead[5]} dated events before the week unfolds. It is a pre-committed evaluation record rather than an observed daily change.`
    }
  }
  if (story.product === 'liquilens-undertow') {
    const coverage = undertowCoverage(story)
    const extremes = undertowExtremes(story)
    const crossSection = extremes
      ? ` Within the snapshot, ${extremes[1]} is the source’s hottest qualifying measure and ${extremes[3]} is its coolest.`
      : ''
    if (coverage && kinds.includes('bounded_no_change_record')) {
      return `The source reports no qualifying tier change inside the covered board. ${coverage[1]} of ${coverage[2]} segments score, and the separate funding overlay remains ${coverage[4]}.${crossSection}`
    }
    if (coverage && kinds.includes('measurement_coverage_change')) {
      return `The source marks a coverage change; ${coverage[1]} of ${coverage[2]} segments now score. The funding overlay is separately reported as ${coverage[4]}.${crossSection}`
    }
    if (coverage) {
      return `This snapshot can score ${coverage[1]} of ${coverage[2]} segments and reports a separate ${coverage[4]} funding overlay.${crossSection} It does not provide a like-for-like prior value, so MyQuant does not infer a trend.`
    }
  }
  if (kinds.includes('fresh_longitudinal_delta')) {
    return 'The source classifies this as a fresh change-over-time record. The exact comparison remains in the canonical source; MyQuant does not manufacture a second delta from the headline.'
  }
  if (kinds.includes('measurement_coverage_change')) {
    return 'The source records a change in measurement coverage. Coverage changes what can be concluded; they do not by themselves establish improving or deteriorating conditions.'
  }
  if (kinds.includes('bounded_no_change_record')) {
    return 'The source reports no qualifying change inside its stated boundary. That is a bounded no-change observation, not evidence that the wider system is calm.'
  }
  return 'This source record does not publish a like-for-like prior observation, so MyQuant treats it as a cross-sectional snapshot and does not infer a trend.'
}

function sourceGroundedNextCheck(story) {
  if (story.articleType === 'case_file') {
    return 'Check the canonical outcome rule, point-in-time status, and lens verdicts. A corrected source record or changed grading rule should supersede this explanation.'
  }
  if (story.product === 'seiche') {
    return 'Compare the next published letter’s composite, regime, plumbing-versus-price gap, dated reserve contribution, and event reading. A changed combination—not one isolated number—would alter this interpretation.'
  }
  if (story.product === 'liquilens-undertow') {
    return 'Check the next source board for coverage, tier changes, internal measure disagreement, and a change in the separate funding overlay. Missing segments must remain unknown rather than turning green.'
  }
  if (story.product === 'liquilens') {
    return 'Inspect the next source revision for changes to the denominator, peer set, reporting vintage, evidence status, or underlying public record before treating this screen as persistent.'
  }
  return 'Reopen the canonical source after its next publication or correction and compare its clock, evidence status, claim, and limitation before updating this reading.'
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

  const reviewed = reviewedConsumerCopy(story, consumerCopy)
  const inEnglish = reviewed ? consumerCopy.inEnglish.trim() : sourceGroundedPlainEnglish(story)
  const whyItMatters = reviewed
    ? sentence(consumerCopy.whyItMatters.trim())
    : sourceGroundedWhyItMatters(story)
  const whatChanged = sourceGroundedWhatChanged(story)
  const nextCheck = sourceGroundedNextCheck(story)
  const number = (reviewed ? reviewedKeyNumber(consumerCopy) : null)
    || keyNumber(inEnglish)
    || keyNumber(story.dek)
    || keyNumber(story.title)
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
    whyItMatters,
    mentalModel: story.articleType === 'case_file'
      ? CASE_FILE_MENTAL_MODEL
      : MENTAL_MODELS[story.product],
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
      articleType: story.articleType,
    },
    analysis: {
      qualityGate: 'PENDING',
      copyMethod: reviewed ? 'REVIEWED_REVISION_BOUND' : 'DETERMINISTIC_SOURCE_GROUNDED',
      contextMethod: 'DETERMINISTIC_SOURCE_GROUNDED',
      whatChanged,
      nextCheck,
    },
    ...(story.pointInTimeStatus ? { pointInTimeStatus: story.pointInTimeStatus } : {}),
    ...(story.verdicts ? { verdicts: { ...story.verdicts } } : {}),
    ...(story.outcomeWindow ? { outcomeWindow: { ...story.outcomeWindow } } : {}),
    ...(story.fraudMasked ? { fraudMasked: true } : {}),
    ...(story.corrections?.length ? { corrections: story.corrections.map((correction) => ({ ...correction })) } : {}),
    ...(story.contentNotice ? { contentNotice: story.contentNotice } : {}),
  }
  interpretation.analysis.qualityGate = interpretationQualityIssues(interpretation).length
    ? 'FAILED'
    : 'PASSED'
  interpretation.fingerprint = createHash('sha256').update(JSON.stringify(interpretation)).digest('hex')
  return interpretation
}

/**
 * The production build applies this to every public specialist reading. It is
 * intentionally structural: good editorial judgment still belongs in the
 * revision-bound review lane, while the fallback must at least be grammatical,
 * useful, source-linked, clocked, and explicit about comparison and limits.
 */
export function interpretationQualityIssues(value) {
  const issues = []
  if (!object(value) || value.schema !== INTERPRETATION_SCHEMA) return ['invalid interpretation schema']
  const prose = [
    ['plain English', value.inEnglish, 24],
    ['why it matters', value.whyItMatters, 55],
    ['what changed', value.analysis?.whatChanged, 55],
    ['next check', value.analysis?.nextCheck, 55],
    ['uncertainty', value.uncertainty, 20],
  ]
  for (const [label, copy, minimum] of prose) {
    const readable = string(copy)
    if (readable.length < minimum) issues.push(`${label} is too thin`)
    if (readable && !/[.!?]$/.test(readable)) issues.push(`${label} is not a complete sentence`)
  }
  const combined = prose.map(([, copy]) => string(copy)).join(' ')
  if (/\bunchanged than\b/i.test(combined)) issues.push('invalid unchanged comparison grammar')
  if (/^evidence[- ]backed desk finding\.?$/i.test(string(value.whyItMatters))) {
    issues.push('why it matters repeats an evidence label')
  }
  if (string(value.whyItMatters).toLowerCase() === string(value.evidence?.contribution).toLowerCase()) {
    issues.push('why it matters repeats the source contribution')
  }
  if (!['REVIEWED', 'SOURCE_GROUNDED'].includes(value.copyState)) issues.push('copy state is not explicit')
  if (!['REVIEWED_REVISION_BOUND', 'DETERMINISTIC_SOURCE_GROUNDED'].includes(value.analysis?.copyMethod)
    || value.analysis?.contextMethod !== 'DETERMINISTIC_SOURCE_GROUNDED') {
    issues.push('analysis method is not explicit')
  }
  if (!object(value.source)
    || !ALLOWED_PRODUCTS.has(value.source.product)
    || !SOURCE_FINGERPRINT.test(string(value.source.fingerprint))
    || !validHttpsUrl(value.source.url, '')) {
    issues.push('source identity is incomplete')
  }
  if (!object(value.evidence)
    || !string(value.evidence.status)
    || !validTimestamp(value.evidence.knowledgeTime)
    || !Number.isFinite(Date.parse(value.evidence.eventTime))) {
    issues.push('evidence status or clocks are incomplete')
  }
  return issues
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
    .filter((story) => story?.publicationStatus === 'PUBLISHED' && reviewedConsumerCopy(story, consumerCopy[story.id]))
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
