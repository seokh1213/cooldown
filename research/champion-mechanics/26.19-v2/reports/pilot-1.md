# Pilot 1: Pyke.P and Akshan.P

## Draft summary

- `Pyke.P`: 4 rules. Models champion damage storage, its cap, the higher replacement rate when multiple enemies are nearby, unseen regeneration, and bonus health conversion to bonus attack damage. Two gaps preserve the nearby entity count limitation and the Korean summary/English tooltip scope conflict.
- `Akshan.P`: 5 rules. Models the additional attack and its physical damage, cancellation movement speed, every-third-hit bonus damage, and the champion-only shield gated by readiness. Two gaps preserve cooldown/proc and same-target uncertainty and the Korean summary/tooltip damage-type conflict.

## Validation

Ran the assigned checker for `Pyke.P` and `Akshan.P` after adding the required `statSubject` fields and updating the typed entity count and activation/readiness fields.

- Checked: 2; valid: 2.
- `Pyke.P`: `text_condition` and `source_gaps` warnings.
- `Akshan.P`: `source_gaps` warning.

These are offline candidates and have not received semantic approval.
