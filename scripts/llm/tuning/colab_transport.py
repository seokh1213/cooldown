"""Official Colab SDK bridge; capture errors without runtime identifiers."""
import json
import logging
from pathlib import Path
import sys
import tempfile
from functools import partial


def owned_session(meta):
    from colab_cli.common import state
    state.config_path = meta["config"]
    current = state.store.get(meta["session"])
    return current or refreshed_session(meta)


def refreshed_session(meta):
    from colab_cli.common import state
    from colab_cli.contents import ContentsClient
    from colab_cli.state import SessionState
    state.config_path = meta["config"]
    current = state.store.get(meta["session"])
    for assignment in state.client.list_assignments():
        if current and assignment.endpoint != current.endpoint: continue
        proxy = assignment.runtime_proxy_info
        candidate = SessionState(name=meta["session"], token=proxy.token, url=proxy.url,
            endpoint=assignment.endpoint, accelerator=assignment.accelerator.value,
            variant="GPU", machine_shape=assignment.machine_shape.name)
        if current:
            candidate.kernel_id = current.kernel_id
            candidate.session_id = current.session_id
            candidate.keep_alive_pid = current.keep_alive_pid
        with tempfile.TemporaryDirectory() as temporary:
            file = Path(temporary) / "provenance.json"
            try:
                ContentsClient(candidate).download("/content/cooldown-tuning/provenance.json", str(file))
                if json.loads(file.read_text())["run"] != meta["run"]: continue
            except Exception: continue
        state.store.add(candidate)
        Path(meta["config"]).chmod(0o600)
        return candidate
    raise ConnectionError("Owned runtime unavailable")


def operate(request, session):
    from colab_cli.contents import ContentsClient
    import requests
    requests.request = partial(requests.request, timeout=(15, 90))
    contents = ContentsClient(session)
    if request["operation"] == "download":
        contents.download(request["remote"], request["local"])
    elif request["operation"] == "upload":
        contents.upload(request["local"], request["remote"])
    elif request["operation"] == "ping":
        from colab_cli.common import state
        state.client.keep_alive_assignment(session.endpoint)
    elif request["operation"] == "stop":
        from colab_cli.common import state, kill_process
        with tempfile.TemporaryDirectory() as temporary:
            file = Path(temporary) / "provenance.json"
            contents.download("/content/cooldown-tuning/provenance.json", str(file))
            if json.loads(file.read_text())["run"] != request["metadata"]["run"]:
                raise ValueError("Runtime ownership mismatch; refusing stop")
        state.client.unassign(session.endpoint)
        if session.keep_alive_pid: kill_process(session.keep_alive_pid)
        state.store.remove(session.name)
    else: raise ValueError("Unsupported transport operation")


def perform(request):
    session = owned_session(request["metadata"])
    try: operate(request, session)
    except Exception as error:
        code = getattr(getattr(error, "response", None), "status_code", None)
        # Expired Colab proxy credentials can appear as a 404, even for root.
        if not isinstance(error, FileNotFoundError) and code not in [401, 403, 404]: raise
        fresh = refreshed_session(request["metadata"])
        if (fresh.token, fresh.url) == (session.token, session.url): raise
        operate(request, fresh)


if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    try:
        perform(json.load(sys.stdin))
        print(json.dumps({"ok": True}))
    except Exception as error:
        code = getattr(getattr(error, "response", None), "status_code", None)
        category = type(error).__name__ + (f" HTTP {code}" if code else "")
        print(json.dumps({"ok": False, "error": category}))
        sys.exit(1)
