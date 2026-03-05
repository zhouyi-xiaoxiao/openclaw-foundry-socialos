#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${REPO_ROOT}/infra/db/socialos.db"
RUN_ID="${1:?run_id required}"
WHAT="${2:?what required}"
WHY="${3:?why required}"
RISK="${4:?risk required}"
VERIFY="${5:?verify required}"
NEXT="${6:?next required}"

mkdir -p "${REPO_ROOT}/reports"
"${REPO_ROOT}/scripts/install.sh" >/dev/null

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DIGEST_ID="digest_${RUN_ID}"

sqlite3 "${DB_PATH}" <<SQL
INSERT OR REPLACE INTO DevDigest(id,run_id,what,why,risk,verify,next,created_at)
VALUES('${DIGEST_ID}','${RUN_ID//\'//}','${WHAT//\'//}','${WHY//\'//}','${RISK//\'//}','${VERIFY//\'//}','${NEXT//\'//}','${NOW}');
SQL

cat > "${REPO_ROOT}/reports/LATEST.md" <<MD
Run: ${RUN_ID}
What: ${WHAT}
Why: ${WHY}
Risk: ${RISK}
Verify: ${VERIFY}
Next: ${NEXT}
MD

echo "digest appended: ${DIGEST_ID}"
