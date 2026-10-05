# Automatic screen audit repairs

Applied source-confirmed repairs from `automatic-screen-audit.json` to five owned candidate slots. Seven confirmed findings were resolved. Three false-positive findings (Kayn.P, Kayn.R and Morgana.P) were left unchanged.

| Candidate | Confirmed repairs | Resolution |
|---|---:|---|
| Graves.P | 1 | Retained the source's 25% reduction without treating it as remaining damage. |
| Graves.Q | 1 | Replaced the incorrect time AND collision predicate with an explicit OR condition. |
| Morgana.W | 1 | Changed the cooldown trigger to the named Soul Siphon healing event. |
| Malzahar.W | 2 | Kept stack cap separate from variable summon count; restricted 50% damage to epic monsters. |
| Nami.E | 2 | Checked empowered marks on the ally and encoded 100 AP as a ratio input. |

Validation: all five candidates pass `check.ts`. The JSON records each audit finding, source evidence, resolution, and canonical parsed-candidate hash; no hash or input sourceHash mismatches were found.
