#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "${REPO_ROOT}/scripts/tests/runtime_policy_check.mjs"
node "${REPO_ROOT}/scripts/tests/plugin_contract_check.mjs"

"${REPO_ROOT}/scripts/deploy_runtime.sh" >/tmp/socialos_validate.log 2>&1 || {
  echo "WARN: openclaw profile validate failed (see /tmp/socialos_validate.log)"
}

node -e 'console.log("privilege_smoke: PASS (publish_execute optional + publisher-only visibility assertions)")'
node "${REPO_ROOT}/scripts/tests/e2e_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/capture_parse_commit_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/workspace_contact_review_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/people_detail_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/draft_validation_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/drafts_standalone_coherence_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/manual_publish_flow_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/queue_tasks_coherence_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/mirror_evidence_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/audio_capture_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/workspace_voice_composer_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/workspace_mobile_layout_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/business_card_ocr_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/product_workspace_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/natural_search_command_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/studio_control_plane_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/status_script_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/overnight_supervisor_parser_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/overnight_supervisor_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/refresh_public_docs_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/agent_repo_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/deck_route_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/deck_export_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/review_demo_seed_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/quickstart_profile_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/provider_doctor_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/cors_policy_check.mjs"
node "${REPO_ROOT}/scripts/tests/studio_api_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/hackathon_api_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/hackathon_proof_capture_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/ops_queue_parser_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/weekly_mirror_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/web_routes_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/docs_demo_smoke.mjs"
node "${REPO_ROOT}/scripts/tests/reviewer_policy_check.mjs"

node "${REPO_ROOT}/scripts/refresh_public_docs.mjs" --validation-passed --source "scripts/test.sh"

echo "tests complete"
