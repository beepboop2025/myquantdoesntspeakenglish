import { readFile } from 'node:fs/promises'

const path = process.argv[2] || 'data/operator-profile.json'
const missing = []
let profile

try {
  profile = JSON.parse(await readFile(path, 'utf8'))
} catch (error) {
  process.stderr.write(`${path}: operator profile is missing or unreadable (${error.message})\n`)
  process.exitCode = 1
  process.exit()
}

const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) missing.push(label)
}
const requiredDate = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) missing.push(label)
}

if (profile.schema !== 'mqdnse.operator-profile.v1') missing.push('schema')
if (profile.status !== 'APPROVED_FOR_PUBLICATION') missing.push('status=APPROVED_FOR_PUBLICATION')
requiredText(profile.legalName, 'legalName')
requiredText(profile.entityType, 'entityType')
requiredText(profile.registeredAddress?.line1, 'registeredAddress.line1')
requiredText(profile.registeredAddress?.city, 'registeredAddress.city')
requiredText(profile.registeredAddress?.region, 'registeredAddress.region')
requiredText(profile.registeredAddress?.postalCode, 'registeredAddress.postalCode')
requiredText(profile.registeredAddress?.country, 'registeredAddress.country')
requiredText(profile.privacyEmail, 'privacyEmail')
requiredText(profile.supportEmail, 'supportEmail')
requiredText(profile.grievanceContact?.name, 'grievanceContact.name')
requiredText(profile.grievanceContact?.title, 'grievanceContact.title')
requiredText(profile.grievanceContact?.email, 'grievanceContact.email')

if (!Array.isArray(profile.approvedTerritories) || !profile.approvedTerritories.length) {
  missing.push('approvedTerritories[1+]')
}

for (const lane of ['securities', 'mediaPublisher', 'privacy', 'ipAndContentRights']) {
  const approval = profile.counselApprovals?.[lane]
  if (approval?.status !== 'APPROVED') missing.push(`counselApprovals.${lane}.status=APPROVED`)
  requiredText(approval?.reference, `counselApprovals.${lane}.reference`)
  requiredDate(approval?.signedAt, `counselApprovals.${lane}.signedAt`)
}

if (missing.length) {
  process.stderr.write(`${path}: store release blocked; complete ${missing.join(', ')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`${path}: operator identity, territory, and counsel approval envelope is complete\n`)
}
