from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import run


class RunnerTests(unittest.TestCase):
    def test_resume_uploads_training_files_from_requested_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data').mkdir()
            (root / 'eval-snapshot.json').write_text('{}')
            metadata = {'run': 'test', 'sourceRevision': 'frozen-commit'}
            with patch('colab_client.Colab') as client, \
                 patch('run.subprocess.check_output', return_value=b'frozen source') as git:
                client.return_value.execute.side_effect = ['GEMMA_DIRS_OK', 'GEMMA_SETUP_OK', 'GEMMA_LAUNCHED']
                run.configure_colab(root, metadata, False)
                self.assertEqual(git.call_count, 4)
                for name in ['data.py', 'model.py', 'train.py', 'run.py']:
                    relative = 'dev/scripts/advisor/gemma-retrieval/' + name
                    source = root / 'resume-source' / relative
                    self.assertEqual(source.read_bytes(), b'frozen source')
                    client.return_value.upload.assert_any_call(source, '/content/cooldown-tuning/' + relative)

    def test_unknown_source_revision_prevents_gpu_allocation(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch('run.subprocess.check_output', side_effect=ValueError('unknown revision')), \
                 patch('run.subprocess.run') as create:
                with self.assertRaisesRegex(ValueError, 'unknown revision'):
                    run.launch_colab(Path(temporary), True, 'missing-commit')
                create.assert_not_called()

    def test_existing_owned_runtime_prevents_duplicate_allocation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'metadata.json').write_text('{}')
            with patch('run.subprocess.run') as create:
                with self.assertRaisesRegex(ValueError, 'ownership'):
                    run.launch_colab(root, False)
                create.assert_not_called()

    def test_setup_failure_stops_only_the_just_created_session(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'colab-sessions.json').write_text('{}')
            with patch('colab_client.Colab') as client, \
                 patch('run.subprocess.run', return_value=types.SimpleNamespace(returncode=0)), \
                 patch('run.configure_colab', side_effect=ValueError('setup failed')):
                with self.assertRaisesRegex(ValueError, 'setup failed'):
                    run.launch_colab(root, False)
                client.return_value.call.assert_called_once_with('stop', timeout=90)
            self.assertEqual((root / 'metadata.json').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__': unittest.main()
