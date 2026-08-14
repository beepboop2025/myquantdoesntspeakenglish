# Offline reviewed-copy import

`data/app-copy.json` uses `mqdnse.app-copy.v2`. Its active `stories` entries are
usable only when they bind approved prose to the exact normalized source
fingerprint and immutable MyQuant Intelligence artifacts. Pre-v2 prose remains
under `legacyUnboundStories`; it is preserved for reference but cannot produce a
`REVIEWED` label.

The importer is deliberately offline. It accepts only local regular files and
does not run from `npm run build`, `npm run sync`, Vercel, or the scheduled feed
workflow. Copy all four immutable artifacts into an operator-controlled review
workspace, then run the command documented in the main README.

The evidence packet must use `mqdnse.evidence-packet.v1`. The candidate must use
`mqdnse.analysis-draft.v1`, have disposition `publish`, and retain a resolvable
support map for `inEnglish`, `whyItMatters`, `uncertainty`, and any `keyNumber`.
The validator receipt must use `mqdnse.draft-validation.v1`, authenticate the
same packet and candidate, pass with no findings, and retain
`publicationAllowed: false` plus `humanReviewRequired: true`.

The separate review file has this exact shape:

```json
{
  "schema": "mqdnse.public-copy-review.v1",
  "source": {
    "id": "seiche:source-record-id",
    "fingerprint": "64-lowercase-hex-characters",
    "semanticRevisionHash": "sha256:64-lowercase-hex-characters"
  },
  "artifacts": {
    "evidencePacketId": "sha256:64-lowercase-hex-characters",
    "evidencePacketSha256": "sha256:64-lowercase-hex-characters",
    "candidateSha256": "sha256:64-lowercase-hex-characters",
    "validatorReceiptSha256": "sha256:64-lowercase-hex-characters"
  },
  "teacher": {
    "id": "immutable-teacher-id",
    "revision": "sha256:64-lowercase-hex-characters"
  },
  "model": {
    "id": "immutable-candidate-model-id",
    "revision": "sha256:64-lowercase-hex-characters"
  },
  "reviews": [
    {
      "reviewerId": "reviewer-a",
      "reviewedAt": "2026-08-13T11:00:00Z",
      "decision": "ACCEPT"
    },
    {
      "reviewerId": "reviewer-b",
      "reviewedAt": "2026-08-13T11:01:00Z",
      "decision": "ACCEPT"
    }
  ],
  "adjudication": {
    "adjudicatorId": "editor-a",
    "adjudicatedAt": "2026-08-13T11:05:00Z",
    "decision": "APPROVED",
    "approvedCopy": {
      "inEnglish": "Exact validated candidate text.",
      "whyItMatters": "Exact validated candidate text.",
      "uncertainty": "Exact validated candidate limitation.",
      "keyNumber": null,
      "supportRefs": {
        "inEnglish": ["/evidence/claims/0"],
        "whyItMatters": ["/evidence/claims/0"],
        "uncertainty": ["/evidence/limitations/0"]
      }
    }
  }
}
```

The artifact digests hash the exact bytes supplied to the importer, including
JSON whitespace and the final newline. The approved copy and support references
must exactly equal the validated candidate. The importer also stores a canonical
digest of the approved copy fields and support references; every build
recomputes it so a later prose edit cannot retain the old `REVIEWED` state. The
model artifact itself never
gains publication authority; the distinct human adjudication permits only that
copy on only that source fingerprint.

The current MyQuant Intelligence wire contract supplies content-addressed
digests but no verifiable cryptographic signature field. The importer therefore
does not invent or imply a signature. If that upstream contract later adds one,
signature verification must be added here before the signed status is relied on.
