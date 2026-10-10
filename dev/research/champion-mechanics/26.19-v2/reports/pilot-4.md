# Pilot 4: Hwei.E and Aphelios.E

## Draft coverage

- **Hwei.E:** 5 rules: EQ, EW eye vision on cast, EW first-champion acquisition, EW first missile hit, and EE. EW's cast-time vision is separate from its later targeting and hit effects. EQ/EW first-hit ordering uses `hit_order=first`; AP coefficients identify `caster` as the stat owner.
- **Aphelios.E:** 1 `base` rule with queue/interface information only. No weapon combat or active effects are assigned to E.

## Gaps and uncertainty

- **Hwei.E:** EW's vision range and duration are unspecified. The sources also do not specify additional crowd-control interactions or immunities. EE's caught-target condition is retained as text.
- **Aphelios.E:** The combined body text associates effects and actives with all five weapons, but E is `interface_only`; the weapon-specific combat effects cannot be reliably assigned to E.

## Validation

The frozen schema checker passed both candidates (2 checked, 2 valid, 0 errors). It reports retained text-condition warnings and the source gaps above. These are offline candidates, not production approvals.
