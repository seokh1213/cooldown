# Bulk 1: Aphelios

## Draft summary

- Completed assigned IDs: `Aphelios.P`, `Aphelios.Q`, `Aphelios.W`, `Aphelios.R`.
- Rules: 14 total across 4 candidates. Weapon-specific Q and R rules use their supplied variant IDs.
- One documented gap: the tooltip does not fully specify how every weapon-specific ultimate bonus interacts with its generic hit and attack sequence.

## Validation

Ran `node --import tsx dev/scripts/advisor/champion-mechanics/check.ts dev/research/champion-mechanics/26.19-v2 Aphelios.P Aphelios.Q Aphelios.W Aphelios.R`.

- Checked: 4; valid: 4.
- Text-condition warnings retain the untyped “slowed by Gravitum” and depleted-ammo predicates. `Aphelios.R` also reports the documented source gap.

These are offline candidates and have not received semantic approval. Remaining worker IDs were returned to the coordinator for reassignment.
