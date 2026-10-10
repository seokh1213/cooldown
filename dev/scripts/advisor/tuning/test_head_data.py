import unittest
from prepare_heads import build_rows


class HeadDataTest(unittest.TestCase):
    def test_templates_and_champion_names_do_not_cross_dev_partition(self):
        schema = {"champions": {"en_US": [{"id": str(i), "name": f"Champ_{i}_"} for i in range(30)]},
                  "kind": {"instructions": "pick", "criteria": {}}, "mineInstructions": "mine",
                  "actInstructions": "act", "act": {"followup": "{M} versus {E}"}}
        train = build_rows(schema, "train"); dev = build_rows(schema, "dev")
        self.assertFalse({r["state"] for r in train} & {r["state"] for r in dev})
        for row in train:
            self.assertNotIn("Champ_0_", row["state"])
        for row in dev:
            self.assertNotIn("Champ_1_", row["state"])


if __name__ == "__main__": unittest.main()
