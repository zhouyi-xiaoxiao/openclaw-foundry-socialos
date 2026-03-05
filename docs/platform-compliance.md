# Platform Compliance (P1-1)

`POST /publish/queue` applies deterministic compliance checks before queueing.

## Normalization

Incoming platform aliases are normalized to one of these canonical IDs:

- `instagram`
- `x`
- `linkedin`
- `zhihu`
- `xiaohongshu`
- `wechat_moments`
- `wechat_official`

Example aliases:

- `twitter` → `x`
- `xhs` → `xiaohongshu`
- `wechat-moments` / `wechat moments` → `wechat_moments`
- `official-account` / `wechat-official` → `wechat_official`

## Deterministic validation rules

For each normalized platform, API checks:

1. character-count limit
2. hashtag-count limit (valid hashtags only)
3. simple format checks:
   - markdown links (`[text](url)`)
   - fenced code blocks (```) 
   - raw HTML tags (`<tag>...`)
   - malformed hashtag usage (`#` not matching `#<letters|numbers|underscore>`)

## Per-platform limits

| Platform | Max chars | Max hashtags |
| --- | ---: | ---: |
| instagram | 2200 | 30 |
| x | 280 | 10 |
| linkedin | 3000 | 5 |
| zhihu | 20000 | 10 |
| xiaohongshu | 1000 | 20 |
| wechat_moments | 2000 | 10 |
| wechat_official | 20000 | 10 |

## Error contract

On compliance violation, API returns `HTTP 422` with:

```json
{
  "error": "platform compliance failed",
  "platform": "<normalized>",
  "issues": [
    { "code": "...", "message": "..." }
  ]
}
```

Typical issue codes:

- `content_too_long`
- `hashtag_limit_exceeded`
- `hashtag_format_invalid`
- `format_markdown_link_not_allowed`
- `format_fenced_code_not_allowed`
- `format_html_tag_not_allowed`
