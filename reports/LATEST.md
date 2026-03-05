Run: 20260305_070156_P0-5
What: P0-5 implementation/tests passed but policy review failed; merge blocked
Why: Reviewer flagged API `CORS: *` as broadening localhost external exposure via browser cross-origin access
Risk: high (security posture regression)
Verify: reports/runs/20260305_070156_P0-5.md
Next: tighten API CORS to loopback allowlist, avoid absolute path leakage, then re-queue P0-5
