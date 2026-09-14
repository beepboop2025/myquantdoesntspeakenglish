import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SOURCES, normalizePayload, preserveStableClocks } from '../scripts/lib.mjs'

test('Undertow public transport alias preserves the reviewed record and its clocks', () => {
  // Byte-exact public index from undertow-site 27b5884549054154a67dedafd108587a39fe4910.
  const payload = JSON.parse(readFileSync(new URL('./fixtures/undertow-investigation-index.json', import.meta.url)))
  const source = SOURCES.find(({ id }) => id === 'undertow-investigations')
  const before = normalizePayload(payload, { ...source, url: 'https://liquilens-undertow.com/investigations/index.json' })
  const after = normalizePayload(payload, source)
  assert.equal(source.url, 'https://undertow.liquilens.in/investigations/index.json')
  assert.equal(source.home, 'https://liquilens-undertow.com/investigations/')
  assert.deepEqual(after, before)
  assert.equal(after[0].url, payload.articles[0].canonical_url)
  assert.equal(after[0].eventTime, payload.articles[0].clocks.event_time)
  assert.equal(after[0].knowledgeTime, payload.articles[0].clocks.knowledge_time)
  assert.equal(after[0].published, payload.articles[0].published_at)
  assert.equal(after[0].fingerprint, before[0].fingerprint)
  assert.deepEqual(preserveStableClocks(after, before), before)
})
