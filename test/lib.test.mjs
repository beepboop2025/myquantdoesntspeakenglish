import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSignalPulse, chooseLead, normalizePayload, normalizeHouseArticle, preserveStableClocks } from '../scripts/lib.mjs'

test('normalizes all three product feed shapes', () => {
  const sources = {
    liquilens: { product: 'liquilens', home: 'https://liquilens.in/desk/' },
    seiche: { product: 'seiche', home: 'https://seiche.info/dispatches/' },
    undertow: { product: 'liquilens-undertow', home: 'https://liquilens-undertow.com/dispatch/' },
  }
  const base = { headline: 'Evidence moved', dek: 'A bounded finding.', published_at: '2026-08-12T10:00:00Z', publication_status: 'PUBLISHED' }
  assert.equal(normalizePayload({ bits: [base] }, sources.liquilens)[0].product, 'liquilens')
  assert.equal(normalizePayload({ entries: [base] }, sources.seiche)[0].product, 'seiche')
  assert.equal(normalizePayload({ entries: ['2026-08-12'], letters: { '2026-08-12': { story: base } } }, sources.undertow)[0].product, 'liquilens-undertow')
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
