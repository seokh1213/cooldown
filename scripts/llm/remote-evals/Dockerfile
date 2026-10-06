FROM docker.io/library/node:24-bookworm-slim@sha256:5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7 AS node-runtime
FROM docker.io/library/python:3.12-slim-bookworm@sha256:9901e0a8d75037d8242ed43155cbcb2d1f61be1356383d8054afb59fd50e39c4

COPY --from=node-runtime /usr/local/bin/ /usr/local/bin/
COPY --from=node-runtime /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home --shell /bin/sh node \
    && python3 -m venv /opt/eval-python \
    && npm install -g pnpm@12.4.1
COPY scripts/llm/remote-evals/requirements.txt /tmp/eval-requirements.txt
RUN /opt/eval-python/bin/pip install --no-cache-dir -r /tmp/eval-requirements.txt \
    && /opt/eval-python/bin/python -c "import jupyter_kernel_client as client; assert client.JupyterSubprotocol.DEFAULT"
WORKDIR /opt/eval-node
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY scripts/llm/remote-evals /opt/eval-runner
ENV PATH="/opt/eval-python/bin:${PATH}" HF_HOME=/workspace/cache/huggingface \
    THREADS=4 OMP_NUM_THREADS=4 PYTHONUNBUFFERED=1
USER 1000:1000
WORKDIR /home/node
