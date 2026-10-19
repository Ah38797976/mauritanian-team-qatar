#!/usr/bin/env bash
# REVIEW ONLY — NOT EXECUTED in Phase 2A.  Runs the pgTAP groups against a STAGING database with FAKE data.
# Default is a DRY RUN: it only prints what it would do.  To really run, ALL of these are required:
#   1. written approval from the owner (gate G3),
#   2. STAGING_DB_URL pointing at the STAGING project (never production),
#   3. CONFIRM_STAGING=<the project ref you expect>,
#   4. --execute
# The DB URL (which contains a password) must come from your shell/secret manager — never from a file in the repo.
set -euo pipefail
cd "$(dirname "$0")"
EXECUTE=0; [[ "${1:-}" == "--execute" ]] && EXECUTE=1
: "${STAGING_DB_URL:?set STAGING_DB_URL (staging only)}"
: "${CONFIRM_STAGING:?set CONFIRM_STAGING=<expected staging project ref>}"
for v in SEED_U_FOUNDER SEED_U_ADMIN SEED_U_SECRETARY SEED_U_COACH SEED_U_OFFICER1 SEED_U_OFFICER2 SEED_U_TREASURER; do : "${!v:?set $v (fake test user uuid)}"; done
if [[ "$STAGING_DB_URL" != *"$CONFIRM_STAGING"* ]]; then echo "REFUSED: URL does not contain CONFIRM_STAGING"; exit 2; fi
if [[ "$STAGING_DB_URL" =~ (prod|production) ]]; then echo "REFUSED: URL looks like production"; exit 2; fi

VARS=(-v ON_ERROR_STOP=1 -v u_founder="$SEED_U_FOUNDER" -v u_admin="$SEED_U_ADMIN" -v u_secretary="$SEED_U_SECRETARY"
      -v u_coach="$SEED_U_COACH" -v u_officer1="$SEED_U_OFFICER1" -v u_officer2="$SEED_U_OFFICER2" -v u_treasurer="$SEED_U_TREASURER")
TEST_GROUPS=(00_catalog_security.sql rls_matrix.sql 20_contact_leak.sql 30_session_and_escalation.sql 40_cross_team.sql 50_storage.sql)
failed=0
for g in "${TEST_GROUPS[@]}"; do
  echo "== $g"
  if [[ $EXECUTE -eq 0 ]]; then echo "   DRY RUN: psql <STAGING_DB_URL> ${VARS[*]:0:2} ... -f $g"; continue; fi
  out=$(psql "$STAGING_DB_URL" "${VARS[@]}" -X -q -t -A -f "$g" 2>&1) || { echo "$out"; failed=1; continue; }
  echo "$out" | grep -E '^(not ok|# )' || true
  if echo "$out" | grep -q '^not ok'; then failed=1; fi
done
[[ $EXECUTE -eq 0 ]] && { echo "Dry run finished. Nothing was executed."; exit 0; }
[[ $failed -eq 0 ]] && echo "ALL GROUPS PASSED" || { echo "FAILURES — see above"; exit 1; }
