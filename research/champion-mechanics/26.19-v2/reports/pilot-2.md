# Pilot 2: LeeSin.R and Mordekaiser.R

## Draft summary

- `LeeSin.R`: 3 rules split the cast-time root, primary target hit and kick, and collision targets. The collision health-scaling parameter now identifies the kicked primary target as its stat owner (`statSubject: target`); no gap remains for that schema issue.
- `Mordekaiser.R`: 2 rules capture banishment and temporary stat theft as a gain for Mordekaiser and a loss for the target, then the kill-in-realm retention until respawn. One unresolved condition gap records that exact per-stat calculations/application are unspecified.

## Validation

Ran `node --import tsx scripts/llm/champion-mechanics/check.ts research/champion-mechanics/26.19-v2 LeeSin.R Mordekaiser.R`.

- Checked: 2; valid: 2.
- `LeeSin.R`: two `text_condition` warnings, for cast time and collision predicate.
- `Mordekaiser.R`: one `text_condition` warning, for the kill-in-realm predicate; one `source_gaps` warning for the documented calculation gap.

These are offline candidates and have not received semantic approval.
