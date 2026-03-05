# socialos-tools (plugin skeleton)

This plugin is the SocialOS business-tool registry.

## Registered tools

- `crm_upsert_person`
- `crm_search_person`
- `crm_link_identity`
- `self_log_checkin`
- `self_generate_weekly_mirror`
- `event_create`
- `event_update`
- `draft_create`
- `draft_list`
- `publish_queue_task`
- `publish_execute` (optional)
- `audit_log_append`
- `dev_digest_append`

## Policy notes

- `publish_execute` is optional in the plugin contract (`tool-manifest.json` + `tools.schema.json`).
- Runtime policy must keep `publish_execute` visible to `publisher` only.
