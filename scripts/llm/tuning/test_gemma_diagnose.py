import unittest
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gemma-retrieval'))

from diagnose import gold_seen, paired_gap, retrieval_counts, decision_flow, corpus_ablation
from diagnostic_score import language_groups, matched_change


class DiagnosisTests(unittest.TestCase):
    def test_corpus_intervention_uses_frozen_ids_and_keeps_query_offset(self):
        row = {'lang': 'ko_KR', 'searchLang': 'ko_KR', 'gold': ['a'], 'bm25': {}}
        snapshot = {'docs': {'ko_KR': [{'id': 'a'}, {'id': 'competitor'}]}, 'rows': [row],
                    'hybrid': {'bm25': 0, 'lexical': {}, 'answer': .43, 'suggest': .35}}
        vectors = np.array([[1., 0.], [0., 1.], [.6, .8]])
        meta = {'languages': {'ko_KR': {'ids': ['a', 'missing-old']}}}
        result = corpus_ablation(snapshot, vectors, {'legacyTestEligible': [0]}, meta)
        self.assertEqual(result['rawR1'], 1)
        self.assertEqual(result['documents']['ko_KR']['missingFromCurrent'], ['missing-old'])

    def test_matched_changes_exclude_unanswerable_and_separate_language_cohorts(self):
        rows = [{'lang': 'ko_KR', 'gold': ['a']}, {'lang': 'en_US', 'gold': ['b']},
                {'lang': 'ko_KR', 'gold': []}]
        before = [{'rawTop3': ['x']}, {'rawTop3': ['b']}, {'rawTop3': ['x']}]
        after = [{'rawTop3': ['a']}, {'rawTop3': ['x']}, {'rawTop3': ['x']}]
        self.assertEqual(matched_change(rows, before, after, [0, 1, 2]), {'gained': [0], 'lost': [1]})
        groups = dict.fromkeys(['legacyTestEligible', 'expandedTestEligible', 'legacySeen', 'legacyUnseen'], [0, 1, 2])
        self.assertEqual(language_groups(rows, groups)['legacyTestEligible:ko_KR'], [0, 2])

    def test_training_exposure_is_language_specific_and_accepts_alternative_gold(self):
        seen = {'ko_KR': {'a'}, 'en_US': set()}
        self.assertTrue(gold_seen({'lang': 'ko_KR', 'gold': ['b', 'a']}, seen))
        self.assertFalse(gold_seen({'lang': 'en_US', 'gold': ['a']}, seen))
        self.assertFalse(gold_seen({'lang': 'ko_KR', 'gold': []}, seen))

    def test_pair_counts_do_not_confuse_net_gap_with_gross_failures(self):
        rows = [{'gold': ['a']}, {'gold': ['b']}, {'gold': []}]
        current = [{'rawTop3': ['a']}, {'rawTop3': ['x']}, {'rawTop3': ['x']}]
        candidate = [{'rawTop3': ['x']}, {'rawTop3': ['b']}, {'rawTop3': ['x']}]
        self.assertEqual(paired_gap(rows, current, candidate, [0, 1, 2]), {
            'qwenOnly': [0], 'gemmaOnly': [1], 'netQwenAdvantage': 0})

    def test_ranking_and_abstention_are_separate_stages(self):
        rows = [{'gold': ['a']}, {'gold': ['b']}, {'gold': []}]
        cases = [
            {'rawTop3': ['a'], 'top3': ['a'], 'score': .6},
            {'rawTop3': ['b'], 'top3': ['wrong'], 'score': .9},
            {'rawTop3': ['wrong'], 'top3': ['wrong'], 'score': .2},
        ]
        counts = retrieval_counts(rows, cases, [0, 1, 2])
        self.assertEqual(counts, {'questions': 3, 'answerable': 2, 'rawR1': 2, 'rawR3': 2, 'hybridR1': 1})
        flow = decision_flow(rows, cases, [0, 1, 2], .8)
        self.assertEqual((flow['rankedCorrect'], flow['acceptedCorrect'], flow['rejectedCorrect']), (1, 0, 1))
        self.assertEqual(flow['measured']['correctAbstention'], 1)
        self.assertEqual(flow['measured']['wrongAnswer'], 1)


if __name__ == '__main__': unittest.main()
