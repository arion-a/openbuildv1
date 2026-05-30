#!/bin/bash
set -euo pipefail

GITEA_URL="http://localhost:3000"
ADMIN_USER="openbuild_admin"
ADMIN_PASS="change-me-admin-password"
ADMIN_EMAIL="admin@openbuild.local"

echo "=== Initializing Gitea ==="

# Wait for Gitea to be ready
for i in {1..30}; do
  if curl -s "$GITEA_URL" > /dev/null 2>&1; then
    echo "Gitea is up"
    break
  fi
  echo "Waiting for Gitea... ($i)"
  sleep 2
done

# Install Gitea (first-time setup)
curl -s -X POST "$GITEA_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "db_type=SQLite3&db_host=localhost&db_user=&db_passwd=&db_name=&ssl_mode=disable&db_schema=&db_path=%2Fdata%2Fgitea%2Fgitea.db&app_name=OpenBuild+Git&repo_root_path=%2Fdata%2Fgit%2Frepositories&lfs_root_path=%2Fdata%2Fgit%2Flfs&run_user=git&domain=localhost&ssh_port=22&http_port=3000&app_url=${GITEA_URL}%2F&log_root_path=%2Fdata%2Fgitea%2Flog&smtp_addr=&smtp_port=&smtp_from=&smtp_user=&smtp_passwd=&enable_federated_avatar=on&enable_open_id_sign_in=on&enable_open_id_sign_up=on&default_allow_create_organization=on&default_enable_timetracking=on&no_reply_address=noreply.localhost&password_algorithm=pbkdf2&admin_name=${ADMIN_USER}&admin_passwd=${ADMIN_PASS}&admin_confirm_passwd=${ADMIN_PASS}&admin_email=${ADMIN_EMAIL}" \
  -o /dev/null -w "%{http_code}"

echo ""
echo "Creating admin API token..."

TOKEN_RESPONSE=$(curl -s -X POST "$GITEA_URL/api/v1/users/$ADMIN_USER/tokens" \
  -u "$ADMIN_USER:$ADMIN_PASS" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"openbuild_admin_$(date +%s)\", \"scopes\": [\"all\"]}")

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"sha1":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "=== Done ==="
echo "Admin token: $TOKEN"
echo ""
echo "Add this to /opt/openbuild/.env:"
echo "GITEA_ADMIN_TOKEN=$TOKEN"
