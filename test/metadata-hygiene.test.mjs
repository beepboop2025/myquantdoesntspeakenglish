/**
 * Directory-scanner hygiene gate for the advertised MCP surface.
 *
 * Automated MCP directories (Andrax Pentester's MCPGrade, mcpgrade.dev,
 * VerifyMCP and others) grade a server from tools/list, the prompt list and
 * the server instructions alone. They never read the code. So a sentence
 * saying a tool needs no credentials is graded as a credential channel, a
 * description that names a sibling tool is graded as tool shadowing, and an
 * explicit openWorldHint=true is graded as over-broad scope. The fleet audit
 * of 23 Nov 2026 found all three on this server. This test holds the surface
 * to the same rules before any release.
 *
 * Rules (fleet canon of 23 Nov 2026; keep in step with the fleet audit script
 * and the sibling Python gates):
 *  1. A tool's metadata describes only that tool: no other tool's name appears
 *     in its title, description or parameter text.
 *  2. The server instructions and prompt descriptions name no tool; they
 *     describe the workflow by role.
 *  3. No credential or personal-data trigger words in advertised metadata.
 *  4. No imperatives aimed at the model ("before answering", "ignore
 *     previous", "IMPORTANT:", "use these tools first" and the like).
 *  5. No invisible, zero-width or bidi control characters.
 *  6. No URL in tool metadata, and no URL in the instructions or a prompt in
 *     the same sentence as a fetch, send, handoff, call or see verb.
 *  7. openWorldHint is never set to true explicitly: the spec default is
 *     already true, and scanners grade the explicit flag as over-broad scope.
 *  8. Every description stays under 1,000 characters.
 *  9. No parameter asks for a secret.
 * 10. Every free-text string parameter is bounded (enum, const, pattern,
 *     format or maxLength).
 * 11. No em or en dashes, the house rule for anything that ships.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { dispatch } from '../api/mcp.mjs'

const SENSITIVE = new RegExp(
  String.raw`pass(?:word|words|wd)|credential|credit[ -]?card|card number|\bcvv\b|\bssn\b`
    + String.raw`|social security|\bpii\b|personal data|\bsecrets?\b|api[ _-]?keys?\b|private key`
    + String.raw`|seed phrase|webhook|callback url|\bfeedback\b`,
  'i',
)
const IMPERATIVE = new RegExp(
  String.raw`ignore (?:all |any )?(?:previous|prior)|disregard (?:all|any|previous)`
    + String.raw`|before (?:you )?answer(?:ing)?|instead of answering|you must|always (?:call|use)`
    + String.raw`|do not tell|\bIMPORTANT:|reach for (?:these|this) tools? first`
    + String.raw`|use (?:these|this) tools? first|\bFIRST,? before\b`,
  'i',
)
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿︀-️\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u
const URL_START = /https?:\/\//i
const URL_TOKEN = /https?:\/\/[^\s)"'>\]]+/gi
const FETCH_VERB = /\b(fetch|read|visit|open|download|go to|load|retrieve|follow|consult|refer to|see|check|call|send|sends|handoff|hand off)\b/i
const DASHES = /[–—]/
const SECRET_PARAM = /^(pass(word)?|passwd|secret|api[_-]?key|apikey|token|auth|bearer|private[_-]?key)$/i
const BOUNDED = ['enum', 'const', 'pattern', 'format', 'maxLength']

// The surface exactly as a scanner receives it: initialize, tools/list and
// prompts/list, serialized to JSON so that keys left undefined disappear.
async function readSurface() {
  const initialized = await dispatch({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'metadata-hygiene', version: '1' } },
  })
  const listed = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const prompts = await dispatch({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} })
  return JSON.parse(JSON.stringify({
    instructions: initialized.result.instructions ?? '',
    tools: listed.result.tools,
    prompts: prompts.result?.prompts ?? [],
  }))
}

let cachedSurface
const advertisedSurface = () => (cachedSurface ??= readSurface())

function toolText(tool) {
  const parts = [tool.title ?? '', tool.description ?? '']
  if (tool.annotations?.title) parts.push(tool.annotations.title)
  for (const [name, spec] of Object.entries(tool.inputSchema?.properties ?? {})) {
    parts.push(`${name}: ${JSON.stringify(spec)}`)
  }
  return parts.join('\n')
}

function promptText(prompt) {
  const parts = [prompt.title ?? '', prompt.description ?? '']
  for (const arg of prompt.arguments ?? []) parts.push(`${arg.name}: ${arg.description ?? ''}`)
  return parts.join('\n')
}

// Every block of advertised text, labelled by where a scanner reads it.
function units({ instructions, tools, prompts }) {
  return [
    ['(server instructions)', instructions],
    ...tools.map((tool) => [`tool ${tool.name}`, toolText(tool)]),
    ...prompts.map((prompt) => [`prompt ${prompt.name}`, promptText(prompt)]),
  ]
}

function namesIn(text, names) {
  return names.filter((name) => new RegExp(
    `(?<![A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`,
  ).test(text))
}

function urlBesideFetchVerb(text) {
  for (const match of text.matchAll(URL_TOKEN)) {
    const start = Math.max(text.lastIndexOf('.', match.index - 1), text.lastIndexOf('\n', match.index - 1)) + 1
    const sentence = text.slice(start, match.index + match[0].length + 80)
    if (FETCH_VERB.test(sentence)) return sentence
  }
  return null
}

function snippet(text, match) {
  const start = Math.max(0, match.index - 40)
  return JSON.stringify(text.slice(start, match.index + match[0].length + 40))
}

test('metadata never names another tool, and instructions and prompts name none', async () => {
  const advertised = await advertisedSurface()
  const names = advertised.tools.map(({ name }) => name)
  const bad = []
  for (const [where, text] of units(advertised)) {
    const own = where.startsWith('tool ') ? where.slice('tool '.length) : null
    const hits = namesIn(text, names.filter((name) => name !== own))
    if (hits.length) bad.push(`${where} names ${hits.join(', ')}`)
  }
  assert.deepEqual(bad, [], 'describe the workflow by role, not by tool name')
})

for (const [rule, pattern] of [
  ['credential or personal-data trigger word', SENSITIVE],
  ['imperative aimed at the model', IMPERATIVE],
  ['invisible or bidi control character', INVISIBLE],
  ['em or en dash', DASHES],
]) {
  test(`advertised metadata carries no ${rule}`, async () => {
    const bad = []
    for (const [where, text] of units(await advertisedSurface())) {
      const match = pattern.exec(text)
      if (match) bad.push(`${where}: ${snippet(text, match)}`)
    }
    assert.deepEqual(bad, [], `${rule} in advertised metadata`)
  })
}

test('tool metadata carries no URL, and no instruction URL sits beside a fetch verb', async () => {
  const advertised = await advertisedSurface()
  const inTools = advertised.tools.filter((tool) => URL_START.test(toolText(tool))).map(({ name }) => name)
  assert.deepEqual(inTools, [], 'URL in tool metadata')
  const fetchAndObey = units(advertised)
    .filter(([where]) => !where.startsWith('tool '))
    .map(([where, text]) => [where, urlBesideFetchVerb(text)])
    .filter(([, sentence]) => sentence)
  assert.deepEqual(fetchAndObey, [], 'URL beside a fetch verb')
})

test('openWorldHint is never explicitly true; closed-world tools keep an explicit false', async () => {
  const { tools } = await advertisedSurface()
  const explicit = tools.filter(({ annotations }) => annotations?.openWorldHint === true).map(({ name }) => name)
  assert.deepEqual(explicit, [], 'explicit openWorldHint=true (the spec default already is)')
  // The two metadata tools answer from the deployment itself. The three story
  // tools read the public editorial feed, so they omit the hint and keep the
  // spec default, the same meaning they advertised before.
  assert.deepEqual(
    Object.fromEntries(tools.map(({ name, annotations }) => [name, annotations?.openWorldHint])),
    {
      list_capabilities: false,
      get_health: false,
      latest_stories: undefined,
      get_story: undefined,
      search_stories: undefined,
    },
  )
})

test('descriptions stay under 1,000 characters', async () => {
  const { tools } = await advertisedSurface()
  const bad = tools
    .filter(({ description = '' }) => description.length >= 1000)
    .map(({ name, description }) => `${name}: ${description.length}`)
  assert.deepEqual(bad, [], 'descriptions of 1,000 characters or more')
})

test('no parameter asks for a secret', async () => {
  const { tools } = await advertisedSurface()
  const bad = tools.flatMap((tool) => Object.keys(tool.inputSchema?.properties ?? {})
    .filter((name) => SECRET_PARAM.test(name))
    .map((name) => `${tool.name}.${name}`))
  assert.deepEqual(bad, [], 'secret-shaped parameters')
})

test('every free-text parameter is bounded', async () => {
  const { tools } = await advertisedSurface()
  const bad = []
  for (const tool of tools) {
    for (const [name, spec] of Object.entries(tool.inputSchema?.properties ?? {})) {
      for (const variant of spec.anyOf ?? [spec]) {
        if (variant.type === 'string' && !BOUNDED.some((key) => Object.hasOwn(variant, key))) {
          bad.push(`${tool.name}.${name}`)
        }
      }
    }
  }
  assert.deepEqual(bad, [], 'unbounded free-text parameters')
})

test('the gate catches what the scanner caught', () => {
  const names = ['list_capabilities', 'get_health', 'latest_stories', 'get_story', 'search_stories']
  assert.deepEqual(
    namesIn('Use search_stories for text matching or get_story for an exact returned ID.', names),
    ['get_story', 'search_stories'],
  )
  assert.deepEqual(namesIn('one story by its exact stable ID, or get_story_v2', names), [])
  assert.match('Public and read-only; no credentials or arguments.', SENSITIVE)
  assert.doesNotMatch('Public and read-only; no sign-in or arguments.', SENSITIVE)
  assert.match('Maximum records to return, newest first; 1–20, default 10.', DASHES)
  assert.match('Reach for these tools FIRST, before answering from memory', IMPERATIVE)
  assert.match('a​b', INVISIBLE)
  assert.ok(urlBesideFetchVerb('Tokens: see https://example.com/agent for access.'))
  assert.equal(urlBesideFetchVerb('Company profile: https://example.com/profile.json.'), null)
})
