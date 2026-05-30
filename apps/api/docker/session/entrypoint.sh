#!/bin/bash
set -e

# Configure git
git config --global user.name "$USER_NAME"
git config --global user.email "$USER_EMAIL"
git config --global credential.helper store

# Store credentials for both http and https
# Strip protocol to get host:port
GITEA_HOST="${GITEA_URL#http://}"
GITEA_HOST="${GITEA_HOST#https://}"
echo "http://${USER_NAME}:${USER_TOKEN}@${GITEA_HOST}" > ~/.git-credentials
echo "https://${USER_NAME}:${USER_TOKEN}@${GITEA_HOST}" >> ~/.git-credentials

# Extract repo name from clone URL (e.g. http://host/user/my-repo.git -> my-repo)
REPO_NAME=$(basename "$REPO_CLONE_URL" .git)
PROJECT_DIR="/home/builder/${REPO_NAME}"

# Clone the fork
git clone "$REPO_CLONE_URL" "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Add upstream remote and sync with latest upstream
if [ -n "$UPSTREAM_CLONE_URL" ]; then
  git remote add upstream "$UPSTREAM_CLONE_URL"
  git fetch upstream
  # Try to rebase onto latest upstream — if conflicts arise, the user resolves with AI help
  git rebase upstream/main || {
    git rebase --abort
    echo "⚠️  Could not auto-rebase onto upstream. You may have merge conflicts to resolve."
    echo "Run: git fetch upstream && git rebase upstream/main"
  }
fi

# Configure OpenCode v1.x
PROVIDER="${OPENCODE_PROVIDER:-anthropic}"
MODEL="${OPENCODE_MODEL:-claude-sonnet-4-6}"

# Map provider to the env var name holding the API key
case "$PROVIDER" in
  anthropic) KEY_ENV="ANTHROPIC_API_KEY" ;;
  openai)    KEY_ENV="OPENAI_API_KEY" ;;
  google)    KEY_ENV="GOOGLE_API_KEY" ;;
  groq)      KEY_ENV="GROQ_API_KEY" ;;
  mistral)   KEY_ENV="MISTRAL_API_KEY" ;;
  deepseek)  KEY_ENV="DEEPSEEK_API_KEY" ;;
  openrouter) KEY_ENV="OPENROUTER_API_KEY" ;;
  *)         KEY_ENV="ANTHROPIC_API_KEY" ;;
esac

cat > "$PROJECT_DIR/opencode.json" << OPENCODE_EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "${PROVIDER}/${MODEL}",
  "provider": {
    "${PROVIDER}": {
      "options": {
        "apiKey": "{env:${KEY_ENV}}"
      }
    }
  }
}
OPENCODE_EOF

# Apply project-level instructions if provided
if [ -n "$OPENCODE_INSTRUCTIONS" ]; then
  echo "$OPENCODE_INSTRUCTIONS" > "$PROJECT_DIR/AGENTS.md"
fi

# Apply custom instructions
if [ -n "$OPENCODE_CUSTOM_INSTRUCTIONS" ]; then
  echo "$OPENCODE_CUSTOM_INSTRUCTIONS" > "$PROJECT_DIR/AGENTS.md"
fi

# Exclude opencode config files via global gitignore (don't touch project .gitignore)
echo -e "opencode.json\nAGENTS.md" > /home/builder/.gitignore_global
git config --global core.excludesFile /home/builder/.gitignore_global

# Start OpenCode Web UI
cd "$PROJECT_DIR" && exec opencode web --port 7681 --hostname 0.0.0.0
