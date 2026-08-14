import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_COPY_SCHEMA, canonicalJsonSha256 } from './lib.mjs'

export const PUBLIC_COPY_REVIEW_SCHEMA = 'mqdnse.public-copy-review.v1'

const MAX_INPUT_BYTES = 1024 * 1024
const MAX_APP_COPY_BYTES = 4 * 1024 * 1024
const SHA256 = /^sha256:[a-f0-9]{64}$/
const SOURCE_FINGERPRINT = /^[a-f0-9]{64}$/
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/
const SUPPORT_PREFIXES = ['/evidence/', '/clocks/', '/lineage/', '/source/']
const DRAFT_FIELDS = [
  'schema', 'packetId', 'disposition', 'inEnglish', 'whyItMatters',
  'uncertainty', 'keyNumber', 'reason', 'supportMap',
]

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, keys, label) {
  invariant(isObject(value), `${label} must be an object`)
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} has an invalid shape`)
  return value
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

export function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function hashJson(value) {
  return canonicalJsonSha256(value)
}

function requiredString(value, label, maximum = 1_200) {
  invariant(typeof value === 'string' && value.trim(), `${label} must be a non-empty string`)
  invariant(value.length <= maximum, `${label} exceeds ${maximum} characters`)
  return value.trim()
}

function digest(value, label) {
  invariant(typeof value === 'string' && SHA256.test(value), `${label} must be a sha256 digest`)
  return value
}

function identifier(value, label) {
  invariant(typeof value === 'string' && IDENTIFIER.test(value), `${label} is invalid`)
  return value
}

function timestamp(value, label, now) {
  invariant(typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value), `${label} must include a timezone`)
  const parsed = Date.parse(value)
  invariant(Number.isFinite(parsed), `${label} is invalid`)
  invariant(parsed <= now + 5 * 60 * 1000, `${label} is future-dated`)
  return parsed
}

function jsonPointer(document, pointer) {
  invariant(typeof pointer === 'string' && pointer.startsWith('/'), `invalid support pointer: ${pointer}`)
  let value = document
  for (const encoded of pointer.slice(1).split('/')) {
    const part = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (Array.isArray(value) && /^\d+$/.test(part) && Number(part) < value.length) {
      value = value[Number(part)]
    } else if (isObject(value) && Object.hasOwn(value, part)) {
      value = value[part]
    } else {
      throw new Error(`support pointer does not resolve: ${pointer}`)
    }
  }
  return value
}

function validateSupportMap(candidate, packet) {
  const expectedFields = ['inEnglish', 'whyItMatters', 'uncertainty']
  if (candidate.keyNumber !== null) expectedFields.push('keyNumber')
  exactKeys(candidate.supportMap, expectedFields, 'candidate supportMap')
  for (const field of expectedFields) {
    const paths = candidate.supportMap[field]
    invariant(Array.isArray(paths) && paths.length > 0, `candidate supportMap.${field} must contain support pointers`)
    invariant(paths.length <= 32 && new Set(paths).size === paths.length, `candidate supportMap.${field} is duplicated or too large`)
    for (const pointer of paths) {
      invariant(typeof pointer === 'string' && SUPPORT_PREFIXES.some((prefix) => pointer.startsWith(prefix)), `candidate supportMap.${field} leaves the evidence packet`)
      jsonPointer(packet, pointer)
    }
  }
  invariant(candidate.supportMap.uncertainty.some((pointer) => pointer.startsWith('/evidence/limitations/')), 'candidate uncertainty lacks material-limitation support')
}

async function readRegularJson(path, label, maximum = MAX_INPUT_BYTES) {
  const held = resolve(path)
  const stats = await lstat(held)
  invariant(stats.isFile() && !stats.isSymbolicLink(), `${label} must be a regular, non-symlink file`)
  invariant(stats.size <= maximum, `${label} exceeds ${maximum} bytes`)
  const body = await readFile(held)
  let value
  try {
    value = JSON.parse(body.toString('utf8'))
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  invariant(isObject(value), `${label} must contain a JSON object`)
  return { body, value }
}

function validateCandidate(candidate, packet) {
  exactKeys(candidate, DRAFT_FIELDS, 'candidate')
  invariant(candidate.schema === 'mqdnse.analysis-draft.v1', 'candidate has an unexpected schema')
  invariant(candidate.packetId === packet.packetId, 'candidate is bound to another evidence packet')
  invariant(candidate.disposition === 'publish', 'candidate disposition must be publish')
  invariant(candidate.reason === null, 'publish candidate reason must be null')
  requiredString(candidate.inEnglish, 'candidate inEnglish')
  requiredString(candidate.whyItMatters, 'candidate whyItMatters')
  requiredString(candidate.uncertainty, 'candidate uncertainty')
  if (candidate.keyNumber !== null) {
    exactKeys(candidate.keyNumber, ['value', 'label'], 'candidate keyNumber')
    requiredString(candidate.keyNumber.value, 'candidate keyNumber.value', 160)
    requiredString(candidate.keyNumber.label, 'candidate keyNumber.label', 160)
  }
  validateSupportMap(candidate, packet)
}

function validateValidatorReceipt(receipt, packet, candidate) {
  exactKeys(receipt, [
    'schema', 'packetId', 'packetHash', 'draftHash', 'passed', 'findings',
    'verifier', 'authority',
  ], 'validator receipt')
  invariant(receipt.schema === 'mqdnse.draft-validation.v1', 'validator receipt has an unexpected schema')
  invariant(receipt.packetId === packet.packetId && receipt.packetHash === packet.packetId, 'validator receipt is bound to another evidence packet')
  invariant(receipt.draftHash === hashJson(candidate), 'validator receipt is bound to another candidate')
  invariant(receipt.passed === true && Array.isArray(receipt.findings) && receipt.findings.length === 0, 'validator receipt did not pass cleanly')
  invariant(receipt.verifier?.name === 'myquant-intelligence'
    && receipt.verifier?.corpusAuthenticated === true
    && receipt.verifier?.policySha256 === packet.policySha256, 'validator did not authenticate the current corpus and policy')
  invariant(receipt.authority?.shadowOnly === true
    && receipt.authority?.publicationAllowed === false
    && receipt.authority?.humanReviewRequired === true, 'validator receipt weakened the shadow authority boundary')
}

function validateReview(review, story, packet, candidate, validator, bodies, now) {
  exactKeys(review, [
    'schema', 'source', 'artifacts', 'teacher', 'model', 'reviews', 'adjudication',
  ], 'public-copy review')
  invariant(review.schema === PUBLIC_COPY_REVIEW_SCHEMA, 'public-copy review has an unexpected schema')

  exactKeys(review.source, ['id', 'fingerprint', 'semanticRevisionHash'], 'review source')
  invariant(review.source.id === story.id, 'review source ID does not match the current story')
  invariant(review.source.fingerprint === story.fingerprint, 'review source fingerprint is stale')
  invariant(review.source.semanticRevisionHash === packet.semanticRevisionHash, 'review source semantic revision is stale')

  exactKeys(review.artifacts, [
    'evidencePacketId', 'evidencePacketSha256', 'candidateSha256', 'validatorReceiptSha256',
  ], 'review artifacts')
  invariant(review.artifacts.evidencePacketId === packet.packetId, 'review names another evidence packet')
  const expectedArtifacts = {
    evidencePacketSha256: hashBytes(bodies.packet),
    candidateSha256: hashBytes(bodies.candidate),
    validatorReceiptSha256: hashBytes(bodies.validator),
  }
  for (const [field, expected] of Object.entries(expectedArtifacts)) {
    digest(review.artifacts[field], `review artifacts.${field}`)
    invariant(review.artifacts[field] === expected, `review artifacts.${field} does not match the supplied bytes`)
  }

  for (const field of ['teacher', 'model']) {
    exactKeys(review[field], ['id', 'revision'], `review ${field}`)
    identifier(review[field].id, `review ${field}.id`)
    digest(review[field].revision, `review ${field}.revision`)
  }

  invariant(Array.isArray(review.reviews) && review.reviews.length >= 2, 'public copy requires at least two independent reviews')
  const reviewerIds = []
  const reviewTimes = []
  for (const [index, held] of review.reviews.entries()) {
    exactKeys(held, ['reviewerId', 'reviewedAt', 'decision'], `review reviews[${index}]`)
    reviewerIds.push(identifier(held.reviewerId, `review reviews[${index}].reviewerId`))
    reviewTimes.push(timestamp(held.reviewedAt, `review reviews[${index}].reviewedAt`, now))
    invariant(held.decision === 'ACCEPT', `review reviews[${index}] did not accept the exact copy`)
  }
  invariant(new Set(reviewerIds).size === reviewerIds.length, 'reviewer identities must be distinct')

  exactKeys(review.adjudication, [
    'adjudicatorId', 'adjudicatedAt', 'decision', 'approvedCopy',
  ], 'review adjudication')
  identifier(review.adjudication.adjudicatorId, 'review adjudication.adjudicatorId')
  const adjudicatedAt = timestamp(review.adjudication.adjudicatedAt, 'review adjudication.adjudicatedAt', now)
  invariant(reviewTimes.every((held) => held <= adjudicatedAt), 'adjudication predates a reviewer decision')
  invariant(review.adjudication.decision === 'APPROVED', 'adjudication did not approve publication copy')

  const approved = review.adjudication.approvedCopy
  exactKeys(approved, [
    'inEnglish', 'whyItMatters', 'uncertainty', 'keyNumber', 'supportRefs',
  ], 'review approvedCopy')
  const expectedCopy = {
    inEnglish: candidate.inEnglish,
    whyItMatters: candidate.whyItMatters,
    uncertainty: candidate.uncertainty,
    keyNumber: candidate.keyNumber,
    supportRefs: candidate.supportMap,
  }
  invariant(canonicalJson(approved) === canonicalJson(expectedCopy), 'review approvedCopy differs from the validated candidate')
  invariant(validator.passed === true, 'review cannot approve a rejected validator receipt')
}

function findSourceStory(cache, review) {
  const matches = Object.values(cache.feeds || {}).flat()
    .filter((story) => story?.id === review.source?.id)
  invariant(matches.length === 1, 'review source ID must resolve to exactly one cached story')
  const story = matches[0]
  invariant(SOURCE_FINGERPRINT.test(story.fingerprint || ''), 'cached story has an invalid fingerprint')
  return story
}

export function buildReviewedCopyEntry({ packet, candidate, validator, review, story, bodies, now = Date.now() }) {
  invariant(packet.schema === 'mqdnse.evidence-packet.v1', 'evidence packet has an unexpected schema')
  digest(packet.packetId, 'evidence packet packetId')
  digest(packet.semanticRevisionHash, 'evidence packet semanticRevisionHash')
  digest(packet.policySha256, 'evidence packet policySha256')
  invariant(packet.authority?.mode === 'shadow_draft_only'
    && packet.authority?.mayPublish === false
    && packet.authority?.mustAbstain === false, 'evidence packet cannot support a publish candidate')
  invariant(packet.source?.sourceRecordId === story.id, 'evidence packet is bound to another source record')
  invariant(packet.source?.product === story.product, 'evidence packet product does not match the current story')
  invariant(packet.source?.canonicalUrl === story.url, 'evidence packet canonical URL does not match the current story')

  validateCandidate(candidate, packet)
  validateValidatorReceipt(validator, packet, candidate)
  validateReview(review, story, packet, candidate, validator, bodies, now)

  const approvedCopy = {
    inEnglish: candidate.inEnglish.trim(),
    whyItMatters: candidate.whyItMatters.trim(),
    uncertainty: candidate.uncertainty.trim(),
    keyNumber: candidate.keyNumber ? { ...candidate.keyNumber } : null,
    supportRefs: canonicalValue(candidate.supportMap),
  }

  return {
    sourceId: story.id,
    sourceFingerprint: story.fingerprint,
    evidencePacket: {
      id: packet.packetId,
      sha256: hashBytes(bodies.packet),
      semanticRevisionHash: packet.semanticRevisionHash,
    },
    candidate: {
      schema: candidate.schema,
      sha256: hashBytes(bodies.candidate),
    },
    validatorReceipt: {
      schema: validator.schema,
      sha256: hashBytes(bodies.validator),
    },
    teacher: { ...review.teacher },
    model: { ...review.model },
    copySha256: hashJson(approvedCopy),
    review: {
      decision: 'APPROVED',
      reviewedAt: review.adjudication.adjudicatedAt,
      reviewers: review.reviews.map(({ reviewerId, reviewedAt }) => ({ id: reviewerId, reviewedAt })),
      adjudicator: {
        id: review.adjudication.adjudicatorId,
        reviewedAt: review.adjudication.adjudicatedAt,
      },
      receiptSha256: hashBytes(bodies.review),
    },
    supportRefs: approvedCopy.supportRefs,
    inEnglish: approvedCopy.inEnglish,
    whyItMatters: approvedCopy.whyItMatters,
    uncertainty: approvedCopy.uncertainty,
    ...(approvedCopy.keyNumber ? { keyNumber: approvedCopy.keyNumber } : {}),
  }
}

function normalizeAppCopy(value) {
  invariant(isObject(value), 'app-copy file must be a JSON object')
  if (value.schema === 'mqdnse.app-copy.v1') {
    invariant(isObject(value.stories), 'legacy app-copy stories must be an object')
    return {
      schema: APP_COPY_SCHEMA,
      stories: {},
      legacyUnboundStories: canonicalValue(value.stories),
    }
  }
  invariant(value.schema === APP_COPY_SCHEMA && isObject(value.stories), 'app-copy file has an unexpected schema')
  invariant(value.legacyUnboundStories === undefined || isObject(value.legacyUnboundStories), 'legacyUnboundStories must be an object')
  return value
}

async function writeAtomicJson(path, value, previousBody) {
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  if (previousBody?.equals(body)) return false
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${path.split('/').at(-1)}.tmp-${process.pid}`)
  try {
    await writeFile(temporary, body, { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
  return true
}

export async function importReviewedShadow({
  packetPath,
  candidatePath,
  validatorPath,
  reviewPath,
  sourceCachePath,
  appCopyPath,
  now = Date.now(),
}) {
  const [packetFile, candidateFile, validatorFile, reviewFile, cacheFile, appCopyFile] = await Promise.all([
    readRegularJson(packetPath, 'evidence packet'),
    readRegularJson(candidatePath, 'candidate'),
    readRegularJson(validatorPath, 'validator receipt'),
    readRegularJson(reviewPath, 'public-copy review'),
    readRegularJson(sourceCachePath, 'source cache', MAX_APP_COPY_BYTES),
    readRegularJson(appCopyPath, 'app-copy file', MAX_APP_COPY_BYTES),
  ])
  const story = findSourceStory(cacheFile.value, reviewFile.value)
  const bodies = {
    packet: packetFile.body,
    candidate: candidateFile.body,
    validator: validatorFile.body,
    review: reviewFile.body,
  }
  const entry = buildReviewedCopyEntry({
    packet: packetFile.value,
    candidate: candidateFile.value,
    validator: validatorFile.value,
    review: reviewFile.value,
    story,
    bodies,
    now,
  })
  const appCopy = normalizeAppCopy(appCopyFile.value)
  const stories = Object.fromEntries(Object.entries({
    ...appCopy.stories,
    [story.id]: entry,
  }).sort(([left], [right]) => left.localeCompare(right)))
  const next = { ...appCopy, schema: APP_COPY_SCHEMA, stories }
  const changed = await writeAtomicJson(resolve(appCopyPath), next, appCopyFile.body)
  return { changed, storyId: story.id, sourceFingerprint: story.fingerprint, entry }
}

function usage() {
  return `Usage: npm run app-copy:import -- \\
  --packet /absolute/path/evidence-packet.json \\
  --candidate /absolute/path/draft.json \\
  --validator /absolute/path/validation.json \\
  --review /absolute/path/public-copy-review.json\n`
}

function parseArgs(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const options = {
    sourceCachePath: join(root, 'data', 'cache.json'),
    appCopyPath: join(root, 'data', 'app-copy.json'),
  }
  const names = {
    '--packet': 'packetPath',
    '--candidate': 'candidatePath',
    '--validator': 'validatorPath',
    '--review': 'reviewPath',
    '--source-cache': 'sourceCachePath',
    '--app-copy': 'appCopyPath',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help') return { help: true }
    invariant(Object.hasOwn(names, flag), `unknown argument: ${flag}`)
    const value = argv[index + 1]
    invariant(value && !value.startsWith('--'), `missing value for ${flag}`)
    options[names[flag]] = value
    index += 1
  }
  for (const field of ['packetPath', 'candidatePath', 'validatorPath', 'reviewPath']) {
    invariant(options[field], `${field} is required`)
  }
  return options
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write(usage())
    } else {
      const result = await importReviewedShadow(options)
      process.stdout.write(`${result.changed ? 'Imported' : 'Verified'} reviewed copy for ${result.storyId} @ ${result.sourceFingerprint}\n`)
    }
  } catch (error) {
    process.stderr.write(`app-copy import failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
