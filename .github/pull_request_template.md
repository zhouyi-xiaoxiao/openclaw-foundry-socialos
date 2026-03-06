## Summary

- what changed
- why it changed

## Demo / Evidence

- [ ] I updated or verified the relevant public docs
- [ ] I captured evidence when the change affects user-visible behavior

## Validation

- [ ] `bash scripts/test.sh`
- [ ] targeted smoke tests for the touched subsystem
- [ ] `bash scripts/demo_status.sh` if demo lifecycle changed

## Safety

- [ ] loopback-only posture preserved
- [ ] default publish mode still `dry-run`
- [ ] no secrets, auth profiles, or volatile local state added to Git
