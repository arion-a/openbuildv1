FROM node:22-slim

RUN apt-get update && apt-get install -y \
  git curl wget unzip \
  python3 python3-pip python3-venv \
  build-essential \
  ripgrep fd-find jq \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

# Install OpenCode via npm (latest version with web command)
RUN npm install -g opencode-ai typescript tsx

RUN useradd -m -s /bin/bash builder && mkdir /workspace && chown builder:builder /workspace
USER builder
WORKDIR /home/builder

COPY --chown=builder:builder entrypoint.sh /home/builder/entrypoint.sh
RUN chmod +x /home/builder/entrypoint.sh

# OpenCode Web UI
EXPOSE 7681

ENTRYPOINT ["/home/builder/entrypoint.sh"]
