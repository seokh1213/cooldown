import unittest

from diagnostic_data import restore_coverage, ordered_batches


class DiagnosticDataTests(unittest.TestCase):
    def test_coverage_replaces_redundancy_without_losing_existing_documents_or_new_facts(self):
        current = [{'q': 'a1', 'gold': ['a']}, {'q': 'a2', 'gold': ['a']},
                   {'q': 'a3', 'gold': ['a']}, {'q': 'b', 'gold': ['b'], 'factId': 'new-b'}]
        historical = [{'q': 'old-c', 'gold': ['c']}, {'q': 'old-a', 'gold': ['a']}]
        changed = restore_coverage(current, historical)
        self.assertEqual(len(changed), len(current))
        self.assertEqual({key for row in changed for key in row['gold']}, {'a', 'b', 'c'})
        self.assertIn(current[-1], changed)
        self.assertNotIn(historical[-1], changed)
        self.assertEqual(current[1], {'q': 'a2', 'gold': ['a']})

    def test_coverage_refuses_to_drop_unique_existing_sources(self):
        with self.assertRaisesRegex(ValueError, 'redundant'):
            restore_coverage([{'gold': ['a']}], [{'gold': ['b']}])

    def test_batched_order_preserves_each_question_and_last_partial_batch(self):
        rows = list(range(19))
        batches = ordered_batches(rows)
        self.assertEqual([len(block) for block in batches], [8, 8, 3])
        self.assertEqual(sorted(item for block in batches for item in block), rows)
        self.assertEqual(ordered_batches(rows), batches)
        self.assertEqual(rows, list(range(19)))


if __name__ == '__main__': unittest.main()
