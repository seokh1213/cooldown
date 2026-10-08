import json
from pathlib import Path
import tempfile
import unittest
from data import BANK, ALTERNATIVES, family, partition, read_jsonl


class DataTests(unittest.TestCase):
    def setUp(self):
        self.rows = read_jsonl(BANK / 'questions.jsonl')
        self.manifest = json.loads((BANK / 'manifest.json').read_text())

    def test_translations_stay_in_one_partition_with_korean(self):
        facts = {}
        for row in self.rows: facts.setdefault(row['factId'], []).append(row)
        self.assertEqual(len(facts), self.manifest['facts'])
        self.assertEqual(len({r['id'] for r in self.rows}), len(self.rows))
        for rows in facts.values():
            self.assertEqual({r['lang'] for r in rows}, {'ko_KR', 'en_US', 'zh_CN'})
            self.assertEqual(len({r['split'] for r in rows}), 1)
            self.assertTrue(all(r['qKo'] == rows[0]['qKo'] and r['q'].strip() for r in rows))

    def test_alternative_evidence_cannot_cross_training_boundary(self):
        groups = self.manifest['documentFamilies']
        for key, alternatives in ALTERNATIVES.items():
            self.assertTrue(all(groups[key] == groups[other] for other in alternatives))
        for row in self.rows:
            self.assertTrue(all(partition(groups[key]) == row['split'] for key in row['gold']))

    def test_unknown_answer_can_have_retrievable_evidence(self):
        limits = [r for r in self.rows if r['type'] == 'evidence-limit']
        self.assertEqual(len(limits), 3)
        self.assertTrue(all(r['gold'] and r['expectedAnswerability'] == 'unknown' for r in limits))
        absent = [r for r in self.rows if r['type'] == 'unanswerable']
        self.assertTrue(absent)
        self.assertTrue(all(not r['gold'] and r['expectedAnswerability'] == 'no' for r in absent))
        for split in ['dev', 'test']:
            self.assertGreaterEqual(len({r['factId'] for r in absent if r['split'] == split}), 3)

    def test_near_duplicate_families_are_grouped(self):
        for keys in [
            ['mech:negative-resistances', 'mech:저항과-피해-감소', 'mech:resistance-effective-health'],
            ['rule:정화', 'mech:cleanse-airborne', 'mech:qss-airborne', 'mech:nami-q-cleanse'],
            ['mech:lifesteal-true-components', 'mech:lifesteal-converted-true'],
        ]:
            self.assertEqual(len({family({'id': key}) for key in keys}), 1)


if __name__ == '__main__': unittest.main()
