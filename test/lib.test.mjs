import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_FEED_SCHEMA,
  CONTENT_STATUS_SCHEMA,
  INTERPRETATION_SCHEMA,
  PUBLICATION_APPROVALS_SCHEMA,
  PUBLICATION_HOLDS_SCHEMA,
  RELEASE_POLICY_SCHEMA,
  applyContentStatus,
  applyPublicationApprovals,
  applyPublicationHolds,
  applyReleasePolicy,
  buildAppFeed,
  buildInterpretation,
  buildSignalPulse,
  chooseLead,
  normalizePayload,
  normalizeHouseArticle,
  preserveStableClocks,
  publicStoryUrl,
  selectPublicationCandidates,
  storySlug,
} from '../scripts/lib.mjs'

test('positive approvals lock distribution to an exact fingerprint and expiry', () => {
  const stories = [
    { id: 'approved', fingerprint: 'hash-a' },
    { id: 'changed', fingerprint: 'hash-new' },
    { id: 'unlisted', fingerprint: 'hash-c' },
  ]
  const approvals = {
    schema: PUBLICATION_APPROVALS_SCHEMA,
    defaultAction: 'DENY',
    approvals: {
      approved: {
        status: 'APPROVED_FOR_RELEASE', legalClearanceClaimed: false, sourceFingerprint: 'hash-a',
        channels: ['site'], reviewedAt: '2026-08-13T00:00:00Z', expiresAt: '2026-09-01T00:00:00Z',
      },
      changed: {
        status: 'APPROVED_FOR_RELEASE', legalClearanceClaimed: false, sourceFingerprint: 'hash-old',
        channels: ['site'], reviewedAt: '2026-08-13T00:00:00Z', expiresAt: '2026-09-01T00:00:00Z',
      },
    },
  }

  assert.deepEqual(
    applyPublicationApprovals(stories, approvals, 'site', Date.parse('2026-08-14T00:00:00Z')),
    [{ id: 'approved', fingerprint: 'hash-a' }],
  )
  assert.deepEqual(
    applyPublicationApprovals(stories, approvals, 'site', Date.parse('2026-09-02T00:00:00Z')),
    [],
  )
})

test('corrections remain visible while retractions produce client notices only', () => {
  const stories = [{ id: 'corrected' }, { id: 'retracted' }, { id: 'unchanged' }]
  const contract = {
    schema: CONTENT_STATUS_SCHEMA,
    entries: {
      corrected: {
        status: 'CORRECTED', channels: ['site'], effectiveAt: '2026-08-13T10:00:00Z',
        summary: 'The denominator label was corrected.',
      },
      retracted: {
        status: 'RETRACTED', channels: ['site', 'app-feed'], effectiveAt: '2026-08-13T11:00:00Z',
        summary: 'The central claim could not be supported.',
      },
    },
  }
  const result = applyContentStatus(stories, contract, 'site')

  assert.deepEqual(result.stories.map(({ id }) => id), ['corrected', 'unchanged'])
  assert.equal(result.stories[0].contentNotice.status, 'CORRECTED')
  assert.deepEqual(result.notices.map(({ id }) => id), ['corrected', 'retracted'])
})

test('release policy caps an approved edition and supports an emergency stop', () => {
  const policy = {
    schema: RELEASE_POLICY_SCHEMA,
    emergencyStop: false,
    channels: { site: { mode: 'APPROVALS_ONLY', maxItems: 1 } },
  }
  assert.deepEqual(applyReleasePolicy([{ id: 'a' }, { id: 'b' }], policy, 'site'), {
    stories: [{ id: 'a' }],
    releaseStatus: 'ACTIVE',
  })
  assert.deepEqual(applyReleasePolicy([{ id: 'a' }], policy, 'site', true), {
    stories: [],
    releaseStatus: 'SUSPENDED',
  })
  assert.deepEqual(applyReleasePolicy([], policy, 'site'), {
    stories: [],
    releaseStatus: 'SUSPENDED',
  })

  const suspended = {
    ...policy,
    channels: { 'app-feed': { mode: 'SUSPENDED', maxItems: 0 } },
  }
  assert.deepEqual(applyReleasePolicy([{ id: 'a' }], suspended, 'app-feed'), {
    stories: [],
    releaseStatus: 'SUSPENDED',
  })
})

test('source-published web archive and suspended app remain independent', () => {
  const stories = [
    { id: 'held', product: 'liquilens', fingerprint: 'hash-a' },
    { id: 'ordinary', product: 'seiche', fingerprint: 'hash-b' },
  ]
  const holds = {
    schema: PUBLICATION_HOLDS_SCHEMA,
    products: { liquilens: { channels: ['site', 'app-feed'] } },
    stories: {},
  }
  const approvals = {
    schema: PUBLICATION_APPROVALS_SCHEMA,
    defaultAction: 'DENY',
    approvals: {},
  }
  const policy = {
    schema: RELEASE_POLICY_SCHEMA,
    emergencyStop: false,
    channels: {
      site: { mode: 'SOURCE_PUBLISHED', maxItems: 1000 },
      'app-feed': { mode: 'SUSPENDED', maxItems: 0 },
    },
  }

  assert.deepEqual(
    selectPublicationCandidates(stories, holds, approvals, policy, 'site'),
    stories,
  )
  assert.deepEqual(
    selectPublicationCandidates(stories, holds, approvals, policy, 'app-feed'),
    [],
  )
})

test('publication holds fail closed per public channel while preserving source input', () => {
  const stories = [
    { id: 'issuer-tier', product: 'liquilens' },
    { id: 'other-issuer', product: 'liquilens' },
    { id: 'broad-market', product: 'seiche' },
  ]
  const holds = {
    schema: PUBLICATION_HOLDS_SCHEMA,
    products: {
      liquilens: { channels: ['app-feed'] },
    },
    stories: {
      'issuer-tier': { channels: ['site', 'app-feed'] },
    },
  }
  assert.deepEqual(applyPublicationHolds(stories, holds, 'app-feed'), [
    { id: 'broad-market', product: 'seiche' },
  ])
  assert.deepEqual(applyPublicationHolds(stories, holds, 'site'), [
    { id: 'other-issuer', product: 'liquilens' },
    { id: 'broad-market', product: 'seiche' },
  ])
  assert.equal(stories.length, 3)
  assert.throws(() => applyPublicationHolds(stories, { stories: {} }, 'site'), /invalid publication-holds contract/)
})

test('normalizes all three product feed shapes', () => {
  const sources = {
    liquilens: { product: 'liquilens', home: 'https://liquilens.in/desk/' },
    seiche: { product: 'seiche', home: 'https://seiche.info/dispatches/' },
    undertow: { product: 'liquilens-undertow', home: 'https://liquilens-undertow.com/' },
  }
  const base = { headline: 'Evidence moved', dek: 'A bounded finding.', published_at: '2026-08-12T10:00:00Z', publication_status: 'PUBLISHED' }
  assert.equal(normalizePayload({ bits: [base] }, sources.liquilens)[0].product, 'liquilens')
  assert.equal(normalizePayload({ entries: [base] }, sources.seiche)[0].product, 'seiche')
  const undertow = normalizePayload({ entries: ['2026-08-12'], letters: { '2026-08-12': { story: base } } }, sources.undertow)[0]
  assert.equal(undertow.product, 'liquilens-undertow')
  assert.equal(undertow.url, 'https://liquilens-undertow.com/dispatch/2026-08-12.json')
})

test('specialist records receive stable MyQuant reading URLs while house articles stay canonical', () => {
  const specialist = { id: 'seiche:daily/2026-08-13', product: 'seiche' }
  const house = { id: 'myquant:house-note', product: 'myquant', url: 'https://myquantdoesntspeakenglish.com/articles/house-note/' }

  assert.equal(storySlug(specialist), 'seiche-daily-2026-08-13')
  assert.equal(publicStoryUrl(specialist), 'https://myquantdoesntspeakenglish.com/interpreted/seiche-daily-2026-08-13/')
  assert.equal(publicStoryUrl(house), house.url)
})

test('interpretation preserves the specialist claim, canonical source, fingerprint, and caveat', () => {
  const story = {
    id: 'liquilens:bounded', product: 'liquilens', title: 'Technical source claim',
    dek: '4 of 19 covered institutions sit above green.', url: 'https://liquilens.in/desk/bounded/',
    beat: 'institution-risk', editorialClass: 'desk_brief', publicationStatus: 'PUBLISHED',
    published: '2026-08-12T10:00:00Z', eventTime: '2026-08-11T00:00:00Z',
    knowledgeTime: '2026-08-12T09:50:00Z', evidenceStatus: 'DERIVED',
    contribution: 'cross_sectional_review_breadth',
    limitation: 'The denominator is the covered board, not the whole system.', fingerprint: 'source-hash',
  }
  const copy = {
    inEnglish: 'Four names on this covered list need a closer look.',
    whyItMatters: 'The denominator keeps a review queue from becoming a system-wide claim.',
    keyNumber: { value: '4 / 19', label: 'covered names above green' },
  }
  const interpretation = buildInterpretation(story, copy)

  assert.equal(interpretation.schema, INTERPRETATION_SCHEMA)
  assert.equal(interpretation.lane, 'INTERPRETED')
  assert.equal(interpretation.copyState, 'REVIEWED')
  assert.equal(interpretation.quantSays, story.title)
  assert.equal(interpretation.inEnglish, copy.inEnglish)
  assert.equal(interpretation.uncertainty, story.limitation)
  assert.equal(interpretation.source.url, story.url)
  assert.equal(interpretation.source.fingerprint, story.fingerprint)
  assert.deepEqual(interpretation.keyNumber, copy.keyNumber)
  assert.match(interpretation.fingerprint, /^[a-f0-9]{64}$/)
})

test('unreviewed interpretation is explicitly source-grounded and never invents consumer copy', () => {
  const story = {
    id: 'liquilens-undertow:2026-08-13', product: 'liquilens-undertow', title: 'No tier changed',
    dek: '1 of 9 segments score today; UST, HY, EQUITY, ETF, FX, CN, CRYPTO, BSTOCK still accrue history. The funding overlay reads EROSION. Qualifying measures disagree inside at least one scored cell.', url: 'https://liquilens-undertow.com/dispatch/2026-08-13.json',
    beat: 'market-liquidity', editorialClass: 'watch_note', publicationStatus: 'PUBLISHED',
    published: '2026-08-13T03:45:22Z', eventTime: '2026-08-13', knowledgeTime: '2026-08-13T03:45:22Z',
    evidenceStatus: 'PARTIAL', contribution: 'bounded_no_change_record',
    limitation: 'Unscored means still accruing, not calm.', fingerprint: 'source-hash',
  }
  const interpretation = buildInterpretation(story)

  assert.equal(interpretation.copyState, 'SOURCE_GROUNDED')
  assert.match(interpretation.inEnglish, /score 1 of 9 market segments/i)
  assert.match(interpretation.inEnglish, /gaps are not an all-clear/i)
  assert.equal(interpretation.whyItMatters, 'It records that no qualifying change was observed within the stated boundary.')
  assert.match(interpretation.mentalModel, /unscored market stays unknown/i)
})

test('source-grounded translators retain Seiche values and LiquiLens denominators', () => {
  const shared = {
    beat: 'wire', editorialClass: 'full_story', publicationStatus: 'PUBLISHED',
    published: '2026-08-13T10:00:00Z', eventTime: '2026-08-13', knowledgeTime: '2026-08-13T10:00:00Z',
    evidenceStatus: 'DERIVED', contribution: 'fresh_longitudinal_delta', limitation: 'A bounded source caveat.',
    fingerprint: 'source-hash',
  }
  const seiche = buildInterpretation({
    ...shared, id: 'seiche:daily', product: 'seiche', title: 'Daily funding letter', url: 'https://seiche.info/dispatches/daily.html',
    dek: 'The board reads 45 out of 100, EROSION; the dated reserve path contributes 11.0 points; the pooled five-business-day event read is 6.1%; plumbing leads market pricing by +29 percentile points. The index is +0.0 against the last published letter.',
  })
  const liquilens = buildInterpretation({
    ...shared, id: 'liquilens:breadth', product: 'liquilens', title: '4 of 19 covered Indian institutions sit above green',
    url: 'https://liquilens.in/desk/', dek: 'The denominator is the fresh-vetted board.',
  })

  assert.match(seiche.inEnglish, /45 out of 100/)
  assert.match(seiche.inEnglish, /29 percentile points/)
  assert.match(seiche.inEnglish, /five-business-day event reading is 6\.1%/)
  assert.match(liquilens.inEnglish, /4 of the 19 covered Indian institutions/)
  assert.match(liquilens.inEnglish, /not a score for the whole financial system/)
})

test('lead ranking prefers a fresh full story over an ordinary watch note', () => {
  const now = Date.parse('2026-08-12T12:00:00Z')
  const shared = { publicationStatus: 'PUBLISHED', published: '2026-08-12T10:00:00Z', evidenceStatus: 'DERIVED' }
  const lead = chooseLead([
    { ...shared, id: 'watch', editorialClass: 'watch_note' },
    { ...shared, id: 'story', editorialClass: 'full_story' },
  ], now)
  assert.equal(lead.id, 'story')
})

test('house articles require sources and published status', () => {
  const raw = {
    slug: 'bounded-story', title: 'A title', dek: 'A dek', publication_status: 'PUBLISHED',
    published_at: '2026-08-12T10:00:00Z', sources: [{ label: 'Primary', url: 'https://example.com/' }],
    sections: [{ heading: 'Finding', paragraphs: ['The bounded paragraph.'] }],
  }
  assert.equal(normalizeHouseArticle(raw).product, 'myquant')
  assert.equal(normalizeHouseArticle({ ...raw, sources: [] }), null)
})

test('unchanged evidence keeps its first publication clocks', () => {
  const cached = { id: 'same', fingerprint: 'stable', published: '2026-08-12T10:00:00Z', knowledgeTime: '2026-08-12T09:59:00Z' }
  const reread = { ...cached, published: '2026-08-12T11:00:00Z', knowledgeTime: '2026-08-12T10:59:00Z' }
  assert.deepEqual(preserveStableClocks([reread], [cached])[0], cached)
  assert.equal(preserveStableClocks([{ ...reread, fingerprint: 'changed' }], [cached])[0].published, '2026-08-12T11:00:00Z')
})

test('signal pulse is anchored to published evidence and preserves missing days', () => {
  const pulse = buildSignalPulse([
    { product: 'seiche', published: '2026-08-10T08:00:00Z' },
    { product: 'seiche', published: '2026-08-12T08:00:00Z' },
    { product: 'liquilens', published: '2026-08-12T09:00:00Z' },
    { product: 'unknown', published: '2026-08-12T10:00:00Z' },
  ], 3)
  assert.deepEqual(pulse.days.map((day) => day.date), ['2026-08-10', '2026-08-11', '2026-08-12'])
  assert.equal(pulse.days[1].counts.seiche, 0)
  assert.equal(pulse.days[2].counts.liquilens, 1)
  assert.equal(pulse.totals.seiche, 2)
  assert.equal(pulse.recordCount, 3)
})

test('signal pulse clamps an explicit zero horizon instead of treating it as missing', () => {
  const pulse = buildSignalPulse([
    { product: 'myquant', published: '2026-08-12T09:00:00Z' },
  ], 0)
  assert.equal(pulse.days.length, 1)
  assert.equal(pulse.days[0].date, '2026-08-12')
})

test('app feed exposes plain-language fields without dropping evidence', () => {
  const story = {
    id: 'seiche:daily/2026-08-12',
    product: 'seiche',
    title: 'Funding stress moved',
    dek: 'The board reads 45 out of 100; the composite is unchanged.',
    url: 'https://seiche.info/dispatches/2026-08-12-daily.html',
    beat: 'dollar-funding-plumbing',
    publicationStatus: 'PUBLISHED',
    published: '2026-08-12T11:43:48+00:00',
    eventTime: '2026-08-11T00:00:00Z',
    knowledgeTime: '2026-08-12T11:43:48Z',
    evidenceStatus: 'DERIVED',
    contribution: 'fresh_longitudinal_delta · cross_signal_divergence',
    limitation: 'The composite is a derivation, not an observed market price.',
  }
  const feed = buildAppFeed([story], '2026-08-12T12:00:00+00:00', {
    [story.id]: {
      inEnglish: story.dek,
      whyItMatters: "It identifies what changed over time. It shows where the source's signals disagree.",
    },
  })
  const item = feed.stories[0]

  assert.equal(feed.schema, APP_FEED_SCHEMA)
  assert.match(feed.editionId, /^[a-f0-9]{64}$/)
  assert.equal(feed.generatedAt, '2026-08-12T12:00:00.000Z')
  assert.equal(item.slug, 'seiche-daily-2026-08-12')
  assert.deepEqual(item.source, { id: 'seiche', label: 'Seiche' })
  assert.equal(item.topic, 'funding')
  assert.equal(item.beat, 'Dollar funding plumbing')
  assert.equal(item.quantSays, story.title)
  assert.equal(item.inEnglish, story.dek)
  assert.equal(item.whyItMatters, "It identifies what changed over time. It shows where the source's signals disagree.")
  assert.deepEqual(item.keyNumber, { value: '45 out of 100', label: story.dek })
  assert.equal(item.uncertainty, story.limitation)
  assert.equal(item.publishedAt, '2026-08-12T11:43:48.000Z')
  assert.equal(item.readingMinutes, 1)
  assert.equal(item.sourceUrl, story.url)
  assert.deepEqual(item.sources, [{ label: 'Seiche', url: story.url }])
  assert.deepEqual(item.evidence, {
    status: story.evidenceStatus,
    contribution: story.contribution,
    limitation: story.limitation,
    eventTime: story.eventTime,
    knowledgeTime: story.knowledgeTime,
    publicationStatus: story.publicationStatus,
  })
  assert.match(item.fingerprint, /^[a-f0-9]{64}$/)
})

test('app feed keeps house citations, omits absent key numbers, and sorts newest first', () => {
  const shared = {
    product: 'myquant', beat: 'house-rules', publicationStatus: 'PUBLISHED',
    eventTime: '2026-08-12T00:00:00Z', knowledgeTime: '2026-08-12T10:30:00Z',
    evidenceStatus: 'EDITORIAL', contribution: 'An operating note.', limitation: 'Not investment advice.',
  }
  const older = {
    ...shared, id: 'myquant:older', title: 'Older', dek: 'No numeral here.', published: '2026-08-11T10:30:00Z',
    url: 'https://myquantdoesntspeakenglish.com/articles/older/', article: { slug: 'older', sections: [], sources: [] },
  }
  const newer = {
    ...shared, id: 'myquant:newer', title: 'Newer', dek: 'Still written without digits.', published: '2026-08-12T10:30:00Z',
    url: 'https://myquantdoesntspeakenglish.com/articles/newer/',
    article: { slug: 'newer', sections: [], sources: [{ label: 'Primary record', url: 'https://example.com/record' }] },
  }
  const feed = buildAppFeed(
    [older, { ...older, id: 'draft', publicationStatus: 'DRAFT' }, newer],
    '2026-08-12T12:00:00Z',
    {
      [older.id]: { inEnglish: older.dek, whyItMatters: older.contribution },
      [newer.id]: { inEnglish: newer.dek, whyItMatters: newer.contribution },
      draft: { inEnglish: 'Draft translation.', whyItMatters: 'Draft context.' },
    },
  )

  assert.deepEqual(feed.stories.map(({ id }) => id), ['myquant:newer', 'myquant:older'])
  assert.deepEqual(feed.stories.map(({ topic }) => topic), ['house', 'house'])
  assert.equal('keyNumber' in feed.stories[0], false)
  assert.deepEqual(feed.stories[0].sources, [{ label: 'Primary record', url: 'https://example.com/record' }])
})

test('app-feed edition identity changes with content, not generation time', () => {
  const record = {
    id: 'seiche:daily', product: 'seiche', title: 'Title', dek: 'Summary', url: 'https://seiche.info/dispatches/',
    beat: 'dollar-funding-plumbing', publicationStatus: 'PUBLISHED', published: '2026-08-12T10:00:00Z',
    eventTime: '2026-08-12T09:00:00Z', knowledgeTime: '2026-08-12T10:00:00Z', evidenceStatus: 'DECLARED',
    contribution: 'A contribution.', limitation: 'A limitation.',
  }
  const copy = { [record.id]: { inEnglish: 'Plain summary.', whyItMatters: 'Why this record matters.' } }
  const first = buildAppFeed([record], '2026-08-12T12:00:00Z', copy)
  const later = buildAppFeed([record], '2026-08-13T12:00:00Z', copy)
  const changed = buildAppFeed([record], '2026-08-13T12:00:00Z', {
    [record.id]: { ...copy[record.id], inEnglish: 'Changed plain summary.' },
  })

  assert.equal(first.editionId, later.editionId)
  assert.equal(first.stories[0].fingerprint, later.stories[0].fingerprint)
  assert.notEqual(first.editionId, changed.editionId)
})

test('app feed rejects slug collisions instead of publishing ambiguous routes', () => {
  const record = {
    product: 'seiche', title: 'Title', dek: 'Summary', url: 'https://seiche.info/dispatches/', beat: 'wire',
    publicationStatus: 'PUBLISHED', published: '2026-08-12T10:00:00Z', eventTime: '2026-08-12T09:00:00Z',
    knowledgeTime: '2026-08-12T10:00:00Z', evidenceStatus: 'DECLARED', contribution: 'A contribution.', limitation: 'A limitation.',
  }
  assert.throws(
    () => buildAppFeed(
      [{ ...record, id: 'same:id' }, { ...record, id: 'same/id' }],
      '2026-08-12T12:00:00Z',
      {
        'same:id': { inEnglish: 'First translation.', whyItMatters: 'First context.' },
        'same/id': { inEnglish: 'Second translation.', whyItMatters: 'Second context.' },
      },
    ),
    /duplicate app-feed slug/,
  )
})

test('app feed applies reviewed consumer copy without changing the source claim or evidence', () => {
  const story = {
    id: 'liquilens:reviewed', product: 'liquilens', title: 'Technical source claim',
    dek: 'Technical source summary.', url: 'https://liquilens.in/desk/', beat: 'institution-risk',
    publicationStatus: 'PUBLISHED', published: '2026-08-12T10:00:00Z', eventTime: '2026-08-12T09:00:00Z',
    knowledgeTime: '2026-08-12T10:00:00Z', evidenceStatus: 'DERIVED', contribution: 'peer_relative_change',
    limitation: 'The source limitation remains attached.',
  }
  const copy = {
    'liquilens:reviewed': {
      inEnglish: 'A reviewed explanation for a non-specialist.',
      whyItMatters: 'A reviewed explanation of the mechanism.',
      keyNumber: { value: '4 / 19', label: 'covered names' },
    },
  }
  const item = buildAppFeed([story], '2026-08-12T12:00:00Z', copy).stories[0]

  assert.equal(item.quantSays, story.title)
  assert.equal(item.inEnglish, copy[story.id].inEnglish)
  assert.equal(item.whyItMatters, copy[story.id].whyItMatters)
  assert.deepEqual(item.keyNumber, copy[story.id].keyNumber)
  assert.equal(item.uncertainty, story.limitation)
  assert.equal(item.evidence.limitation, story.limitation)
})

test('app feed keeps unreviewed and incomplete translations out of the consumer edition', () => {
  const shared = {
    product: 'seiche', title: 'Technical title', dek: 'Technical source summary.',
    url: 'https://seiche.info/dispatches/', beat: 'funding', publicationStatus: 'PUBLISHED',
    published: '2026-08-12T10:00:00Z', eventTime: '2026-08-12T09:00:00Z',
    knowledgeTime: '2026-08-12T10:00:00Z', evidenceStatus: 'DERIVED',
    contribution: 'fresh_longitudinal_delta', limitation: 'A source limitation.',
  }
  const reviewed = { ...shared, id: 'reviewed' }
  const missingWhy = { ...shared, id: 'missing-why' }
  const unreviewed = { ...shared, id: 'unreviewed' }
  const feed = buildAppFeed([reviewed, missingWhy, unreviewed], '2026-08-12T12:00:00Z', {
    reviewed: { inEnglish: 'A complete translation.', whyItMatters: 'A complete mechanism.' },
    'missing-why': { inEnglish: 'Only half of the required consumer copy.' },
  })

  assert.deepEqual(feed.stories.map(({ id }) => id), ['reviewed'])
})
