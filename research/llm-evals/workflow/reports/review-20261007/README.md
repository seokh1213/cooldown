# Human review packet, 2026-10-07

Open `review.html` directly in a browser. It is self-contained and works without a server or network connection.

There are 41 questions: 31 failed fast request-scope measurements and 10 historical matchup questions measured in both none/offline modes (20 measurements). Thus 51 measurements require 41 question cards, not 51 independent questions. A classifier failure does not necessarily mean the final app answer is wrong.

For each question, read the current answer and original expected contract, choose correct/wrong/uncertain, optionally select the intended request scope and leave a note. Decisions and the last edited question persist in this browser. Use “판정 결과 복사” to paste the JSON into the chat, or download/import the JSON to move between browsers. If browser clipboard access is denied, the complete selected JSON remains visible for manual copying.

Answers were replayed through the full current 26.20 dialogue path in none/offline modes. They are not a fresh GPU-generated answer measurement. Request-scope benchmark inputs are standalone questions; an implicit “the two champions above” has no preceding conversation supplied by that benchmark. Missing context or ambiguous labels can be marked uncertain rather than invented. Skill source text is attached for matchup questions, but does not independently certify every item or matchup recommendation.

`packet.json` includes the source commit, source/data hashes, old baseline hash, per-question input hashes, current answers and original source locations. Imports reject another packet, altered question hashes, invalid verdicts/scopes and duplicate IDs. Rendering uses text nodes, including imported notes; embedded JSON escapes script terminators. Editing the packet requires regenerating it and therefore creates a different storage/import identity.

These decisions do not automatically change training data, expected answers, master or deployment. Once the owner returns the JSON, preserve it with its packet, validate the hashes, then turn confirmed corrections into separate regression contracts. Ambiguous decisions remain pending.

```sh
npm run llm:review
npm run llm:test:review
```

The second command tests the actual standalone file in Chrome at 1440px and 320px, with both OS color schemes. Twelve tests cover verdicts, scope/kind/status filters, search and empty state, evidence expansion, previous/next, keyboard focus, persistence, copy fallback, download, valid import, invalid packet/question hashes, blocked browser storage, target size, contrast and horizontal reflow. See `../patch-26.20/delivery-gate.md` for the design gate.
