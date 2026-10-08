"""Prepare, launch, resume, and evaluate an isolated retrieval tuning experiment."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid
from data import ROOT, prepare

TUNING = ROOT / 'scripts/llm/tuning'
sys.path.insert(0, str(TUNING))


def command(args):
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)


def prepare_run(work):
    work.mkdir(parents=True, exist_ok=True)
    bridge = ROOT / 'scripts/llm/vector-search/embeddinggemma_prepare.ts'
    command(['node', '--import', 'tsx', bridge, 'prepare', work / 'snapshot-original.json'])
    prepare(work)
    original = json.loads((work / 'snapshot-original.json').read_text())
    extra = [json.loads(s) for s in (work / 'data/expanded.jsonl').read_text().splitlines()]
    source = work / 'eval-input.jsonl'
    source.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in original['rows'] + extra))
    command(['node', '--import', 'tsx', bridge, 'prepare-probe', source, work / 'snapshot.json'])
    snapshot = json.loads((work / 'snapshot.json').read_text())
    for i, row in enumerate(snapshot['rows']):
        row['bank'] = original['rows'][i]['bank'] if i < len(original['rows']) else 'expanded'
    for name in ['snapshot.json', 'eval-snapshot.json']:
        (work / name).write_text(json.dumps(snapshot, ensure_ascii=False))


def bootstrap(work):
    import torch, transformers, peft, numpy
    config = {'torch': torch.__version__, 'transformers': transformers.__version__,
        'peft': peft.__version__, 'numpy': numpy.__version__, 'baseRevision': '914f7f89142e33e77833254d9c9b90c3cef7303b',
        'computeCapability': torch.cuda.get_device_capability() if torch.cuda.is_available() else None,
        'dtype': 'bfloat16' if torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 8 else 'float32'}
    (work / 'training-config.json').write_text(json.dumps(config))
    provenance = json.loads((work / 'provenance.json').read_text())
    with (work / 'native/model.safetensors').open('rb') as stream:
        provenance['weightsSha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
    (work / 'provenance.json').write_text(json.dumps(provenance))


def launch_colab(work, resume, source_revision=None):
    from colab_client import Colab
    run_id = uuid.uuid4().hex
    metadata = {'work': str(work), 'config': str(work / 'colab-sessions.json'),
        'session': 'gemma-' + run_id[:12], 'run': run_id,
        'checkpointStages': ['gemma', 'gemma-results'], 'requiredResults': ['gemma-results'], 'resumeStages': ['gemma']}
    if source_revision:
        metadata['sourceRevision'] = subprocess.check_output(
            ['git', 'rev-parse', '--verify', '--end-of-options', source_revision + '^{commit}'], cwd=ROOT, text=True).strip()
    config_file = work / 'metadata.json'
    if config_file.exists() and not (work / 'gpu-cleanup.json').exists():
        raise ValueError('Existing runtime ownership must be resolved before creating another runtime')
    config_file.write_text(json.dumps(metadata))
    config_file.chmod(0o600)
    client = Colab(metadata)
    result = subprocess.run([str(Path.home() / '.local/share/uv/tools/google-colab-cli/bin/python'),
        str(TUNING / 'colab_safe_cli.py'), '--auth=oauth2', '--config', metadata['config'],
        'new', '-s', metadata['session'], '--gpu', 'T4'], capture_output=True, text=True, timeout=150)
    if result.returncode: raise RuntimeError('Colab GPU allocation failed; private CLI output was suppressed')
    for name in ['gpu-cleanup.json', 'STOP_BACKUP']:
        (work / name).unlink(missing_ok=True)
    Path(metadata['config']).chmod(0o600)
    try:
        configure_colab(work, metadata, resume)
    except Exception:
        client.call('stop', timeout=90)
        raise
    collector = subprocess.Popen([sys.executable, str(TUNING / 'collect_checkpoints.py'), str(config_file), '--interval', '60'],
        stdout=(work / 'collector.log').open('w'), stderr=subprocess.STDOUT, start_new_session=True)
    (work / 'collector.pid').write_text(str(collector.pid))
    print('Colab training launched; checkpoints verified on Mac every 60 seconds, final results verified before GPU release.')


def configure_colab(work, metadata, resume):
    from colab_client import Colab
    client = Colab(metadata)
    setup = work / 'create-root.py'
    setup.write_text("from pathlib import Path\nfor p in ['scripts/llm/gemma-retrieval','scripts/llm/tuning','data']:"
        "Path('/content/cooldown-tuning',p).mkdir(parents=True,exist_ok=True)\nprint('GEMMA_DIRS_OK')\n")
    if 'GEMMA_DIRS_OK' not in client.execute(setup): raise RuntimeError('Colab directory setup failed')
    (work / 'provenance.json').write_text(json.dumps({'run': metadata['run']}))
    client.upload(work / 'provenance.json', '/content/cooldown-tuning/provenance.json')
    if 'GEMMA_SETUP_OK' not in client.execute(Path(__file__).with_name('colab_setup.py'), timeout=900):
        raise RuntimeError('Colab model setup failed')
    client.call('restart-kernel', timeout=90)
    helpers = ['checkpoints.py', 'model_utils.py', 'artifact_io.py', 'backup_artifacts.py']
    files = [TUNING / name for name in helpers] + [Path(__file__).with_name(name) for name in ['data.py', 'model.py', 'train.py', 'run.py']]
    for file in files:
        relative = str(file.relative_to(ROOT))
        source = file
        if metadata.get('sourceRevision') and '/gemma-retrieval/' in relative:
            source = work / 'resume-source' / relative
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(subprocess.check_output(['git', 'show', metadata['sourceRevision'] + ':' + relative], cwd=ROOT))
        client.upload(source, '/content/cooldown-tuning/' + relative)
    for file in (work / 'data').glob('*'): client.upload(file, '/content/cooldown-tuning/data/' + file.name)
    client.upload(work / 'eval-snapshot.json', '/content/cooldown-tuning/eval-snapshot.json')
    if resume:
        from resume_checkpoints import restore
        restore(metadata, ['gemma'])
    launch = work / 'launch.py'
    launch.write_text("import subprocess,sys,os\nfrom pathlib import Path\n"
        "r=Path('/content/cooldown-tuning')\n"
        "env=dict(os.environ,TOKENIZERS_PARALLELISM='false',HF_HUB_DISABLE_PROGRESS_BARS='1')\n"
        "p=subprocess.Popen([sys.executable,str(r/'scripts/llm/gemma-retrieval/run.py'),'remote',str(r)],"
        "stdout=(r/'training.log').open('w'),stderr=subprocess.STDOUT,start_new_session=True,env=env)\n"
        "(r/'training.pid').write_text(str(p.pid))\nprint('GEMMA_LAUNCHED')\n")
    if 'GEMMA_LAUNCHED' not in client.execute(launch): raise RuntimeError('Colab trainer launch failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'colab', 'local', 'remote', 'evaluate'])
    parser.add_argument('work', type=Path)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--source-revision')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    work = args.work.resolve()
    if args.action == 'prepare': prepare_run(work)
    elif args.action == 'colab': launch_colab(work, args.resume, args.source_revision)
    elif args.action in ['local', 'remote']:
        if args.action == 'local':
            from huggingface_hub import snapshot_download
            snapshot_download('google/embeddinggemma-2', revision='914f7f89142e33e77833254d9c9b90c3cef7303b',
                local_dir=work / 'native', allow_patterns=['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json'])
            if not (work / 'provenance.json').exists(): (work / 'provenance.json').write_text(json.dumps({'run': uuid.uuid4().hex}))
        try:
            bootstrap(work)
            from train import train
            train(work)
        except Exception as error:
            (work / 'TRAINING_FAILED.json').write_text(json.dumps({'error': type(error).__name__}))
            raise
    else:
        from evaluate import evaluate
        if not args.out: parser.error('evaluate requires --out')
        if not (work / 'candidates/gemma/summary.json').exists():
            import shutil
            from backup_artifacts import latest_receipts
            from artifact_io import sha256
            receipt = latest_receipts(work).get('gemma-results')
            if not receipt: parser.error('No verified final Gemma results are available yet')
            archive = Path(receipt['restored']).parent / 'artifact.tar.gz'
            if sha256(archive) != receipt['sha256']: raise ValueError('Final local archive checksum mismatch')
            shutil.copytree(Path(receipt['restored']) / 'candidates/gemma', work / 'candidates/gemma', dirs_exist_ok=True)
        evaluate(work, args.out)
