#!/usr/bin/env bash
# Link @ursamu/cli → GitHub UrsaMU/ursamu on JSR, then publish.
#
# OIDC publish from GitHub Actions only works when the package has a
# linked GitHub repository (see jsr-io/jsr iam.rs check_publish_access).
#
# Usage:
#   export JSR_TOKEN=jsrp_...   # https://jsr.io/account/tokens (scope admin)
#   ./scripts/jsr-link-cli.sh
#
# Token needs permission to update package settings + publish.
set -euo pipefail

SCOPE="${JSR_SCOPE:-ursamu}"
PKG="${JSR_PACKAGE:-cli}"
OWNER="${JSR_GH_OWNER:-UrsaMU}"
REPO="${JSR_GH_REPO:-ursamu}"
API="https://jsr.io/api"

if [[ -z "${JSR_TOKEN:-}" ]]; then
  echo "error: set JSR_TOKEN (https://jsr.io/account/tokens)" >&2
  echo "  Create a token with package settings + publish access." >&2
  echo "  Then link UI: https://jsr.io/@${SCOPE}/${PKG}/settings" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${JSR_TOKEN}" -H "Content-Type: application/json")

echo "Linking @${SCOPE}/${PKG} → ${OWNER}/${REPO} ..."
code=$(curl -sS -o /tmp/jsr-link-out.json -w "%{http_code}" -X PATCH \
  "${API}/scopes/${SCOPE}/packages/${PKG}" \
  "${auth[@]}" \
  -d "{\"githubRepository\":{\"owner\":\"${OWNER}\",\"name\":\"${REPO}\"}}")
echo "HTTP ${code}"
cat /tmp/jsr-link-out.json
echo

if [[ "$code" != "200" && "$code" != "204" ]]; then
  echo "error: link failed (HTTP ${code})" >&2
  exit 1
fi

# Confirm
curl -sS "${API}/scopes/${SCOPE}/packages/${PKG}" | \
  python3 -c "import json,sys; p=json.load(sys.stdin); g=p.get('githubRepository'); print('githubRepository', g); assert g and g.get('owner')=='${OWNER}' and g.get('name')=='${REPO}', g"

echo "Publishing packages/cli ..."
cd "$(dirname "$0")/../packages/cli"
deno publish --allow-slow-types --no-check --allow-dirty --token "$JSR_TOKEN"
echo "done."
