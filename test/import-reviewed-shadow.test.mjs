import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildReviewedCopyEntry,
  hashBytes,
  hashJson,
  importReviewedShadow,
} from '../scripts/import-reviewed-shadow.mjs'
import {
  APP_COPY_SCHEMA,
  buildAppFeed,
  buildInterpretation,
  reviewedConsumerCopy,
} from '../scripts/lib.mjs'

const sha256 = (character) => `sha256:${character.repeat(64)}`
const jsonBody = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')

function fixture() {
  const story = {
    id: 'seiche:daily',
    product: 'seiche',
    title: 'Funding board changed',
    dek: 'The board reads 45 out of 100.',
    url: 'https://seiche.info/dispatches/daily.html',
    beat: 'funding',
    editorialClass: 'desk_brief',
    publicationStatus: 'PUBLISHED',
    published: '2026-08-13T10:00:00Z',
    eventTime: '2026-08-13T09:00:00Z',
    knowledgeTime: '2026-08-13T10:00:00Z',
    evidenceStatus: 'DERIVED',
    contribution: 'fresh_longitudinal_delta',
    limitation: 'The board is a bounded composite.',
    fingerprint: 'a'.repeat(64),
  }
  const packet = {
    schema: 'mqdnse.evidence-packet.v1',
    recordId: sha256('1'),
    semanticRevisionHash: sha256('2'),
    lineage: { changeKind: 'new', correctionStatus: null, previousRevisionHash: null },
    policySha256: sha256('3'),
    task: 'plain_english_explanation',
    source: {
      sourceId: 'seiche-dispatches',
      product: story.product,
      endpointUrl: 'https://seiche.info/dispatches/news.json',
      sourceRecordId: story.id,
      canonicalUrl: story.url,
      sourceSchema: 'seiche.dispatch.v1',
      evidenceContract: 'lab-evidence-envelope/v1',
      rawRecordSha256: sha256('4'),
      rawPayloadSha256: sha256('5'),
      rawSnapshotUri: 'raw/sha256/example',
      rights: { status: 'approved' },
    },
    clocks: { event: { value: story.eventTime }, knowledge: { value: story.knowledgeTime } },
    evidence: {
      claims: ['The board reads 45 out of 100.'],
      limitations: [story.limitation],
      publicationStatus: 'PUBLISHED',
    },
    missingness: [],
    authority: {
      mode: 'shadow_draft_only', mayPublish: false, mayRecommend: false,
      mustAbstainIfUnsupported: true, mustAbstain: false, abstentionReasons: [],
    },
    packetId: sha256('6'),
  }
  const candidate = {
    schema: 'mqdnse.analysis-draft.v1',
    packetId: packet.packetId,
    disposition: 'publish',
    inEnglish: 'The bounded board reads 45 out of 100.',
    whyItMatters: 'The change belongs to this published board, not every funding market.',
    uncertainty: story.limitation,
    keyNumber: { value: '45 out of 100', label: 'bounded board reading' },
    reason: null,
    supportMap: {
      inEnglish: ['/evidence/claims/0'],
      whyItMatters: ['/evidence/claims/0'],
      uncertainty: ['/evidence/limitations/0'],
      keyNumber: ['/evidence/claims/0'],
    },
  }
  const validator = {
    schema: 'mqdnse.draft-validation.v1',
    packetId: packet.packetId,
    packetHash: packet.packetId,
    draftHash: hashJson(candidate),
    passed: true,
    findings: [],
    verifier: {
      name: 'myquant-intelligence', version: '0.2.0', corpusAuthenticated: true,
      policySha256: packet.policySha256,
    },
    authority: { shadowOnly: true, publicationAllowed: false, humanReviewRequired: true },
  }
  const bodies = {
    packet: jsonBody(packet),
    candidate: jsonBody(candidate),
    validator: jsonBody(validator),
  }
  const review = {
    schema: 'mqdnse.public-copy-review.v1',
    source: {
      id: story.id,
      fingerprint: story.fingerprint,
      semanticRevisionHash: packet.semanticRevisionHash,
    },
    artifacts: {
      evidencePacketId: packet.packetId,
      evidencePacketSha256: hashBytes(bodies.packet),
      candidateSha256: hashBytes(bodies.candidate),
      validatorReceiptSha256: hashBytes(bodies.validator),
    },
    teacher: { id: 'teacher-qwen', revision: sha256('7') },
    model: { id: 'student-qwen', revision: sha256('8') },
    reviews: [
      { reviewerId: 'reviewer-a', reviewedAt: '2026-08-13T11:00:00Z', decision: 'ACCEPT' },
      { reviewerId: 'reviewer-b', reviewedAt: '2026-08-13T11:01:00Z', decision: 'ACCEPT' },
    ],
    adjudication: {
      adjudicatorId: 'editor-a',
      adjudicatedAt: '2026-08-13T11:05:00Z',
      decision: 'APPROVED',
      approvedCopy: {
        inEnglish: candidate.inEnglish,
        whyItMatters: candidate.whyItMatters,
        uncertainty: candidate.uncertainty,
        keyNumber: candidate.keyNumber,
        supportRefs: candidate.supportMap,
      },
    },
  }
  bodies.review = jsonBody(review)
  return { story, packet, candidate, validator, review, bodies }
}

test('offline importer migrates legacy prose and writes a revision-bound reviewed entry', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mqdnse-reviewed-copy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const held = fixture()
  const paths = Object.fromEntries(['packet', 'candidate', 'validator', 'review'].map((name) => [
    name, join(root, `${name}.json`),
  ]))
  await Promise.all(Object.entries(paths).map(([name, path]) => writeFile(path, held.bodies[name])))
  const sourceCachePath = join(root, 'cache.json')
  const appCopyPath = join(root, 'app-copy.json')
  await writeFile(sourceCachePath, jsonBody({ feeds: { seiche: [held.story] } }))
  await writeFile(appCopyPath, jsonBody({
    schema: 'mqdnse.app-copy.v1',
    stories: { legacy: { inEnglish: 'Preserved.', whyItMatters: 'Unbound.' } },
  }))

  const result = await importReviewedShadow({
    packetPath: paths.packet,
    candidatePath: paths.candidate,
    validatorPath: paths.validator,
    reviewPath: paths.review,
    sourceCachePath,
    appCopyPath,
    now: Date.parse('2026-08-13T12:00:00Z'),
  })
  const appCopy = JSON.parse(await readFile(appCopyPath, 'utf8'))
  const copy = appCopy.stories[held.story.id]

  assert.equal(result.changed, true)
  assert.equal(appCopy.schema, APP_COPY_SCHEMA)
  assert.equal(appCopy.legacyUnboundStories.legacy.inEnglish, 'Preserved.')
  assert.equal(reviewedConsumerCopy(held.story, copy), true)
  assert.equal(reviewedConsumerCopy(held.story, {
    ...copy,
    inEnglish: 'Text changed after review.',
  }), false)
  assert.equal(buildInterpretation(held.story, copy).copyState, 'REVIEWED')
  assert.deepEqual(buildAppFeed([held.story], '2026-08-13T12:00:00Z', {
    [held.story.id]: copy,
  }).stories.map(({ id }) => id), [held.story.id])
})

test('offline importer rejects stale source bindings, missing support, and incomplete review', () => {
  const held = fixture()
  const build = (overrides = {}) => buildReviewedCopyEntry({
    packet: overrides.packet || held.packet,
    candidate: overrides.candidate || held.candidate,
    validator: overrides.validator || held.validator,
    review: overrides.review || held.review,
    story: overrides.story || held.story,
    bodies: overrides.bodies || held.bodies,
    now: Date.parse('2026-08-13T12:00:00Z'),
  })

  assert.throws(
    () => build({ story: { ...held.story, fingerprint: 'b'.repeat(64) } }),
    /fingerprint is stale/,
  )
  assert.throws(
    () => build({ candidate: {
      ...held.candidate,
      supportMap: { ...held.candidate.supportMap, inEnglish: ['/outside/claims/0'] },
    } }),
    /leaves the evidence packet/,
  )
  assert.throws(
    () => build({ review: { ...held.review, reviews: held.review.reviews.slice(0, 1) } }),
    /at least two independent reviews/,
  )
})
