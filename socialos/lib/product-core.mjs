const POSITIVE_ENERGY_MARKERS = ['excited', 'energized', 'focused', 'grateful', 'happy', 'shipped', '进展', '开心', '高兴', '顺利', '推进'];
const NEGATIVE_ENERGY_MARKERS = ['tired', 'drained', 'stretched', 'anxious', 'frustrated', 'sad', '累', '疲惫', '焦虑', '压力', '耗电'];
const TAG_KEYWORDS = new Map([
  ['growth', 'growth'],
  ['增长', 'growth'],
  ['founder', 'founder'],
  ['创业', 'founder'],
  ['designer', 'design'],
  ['设计', 'design'],
  ['developer', 'engineering'],
  ['工程', 'engineering'],
  ['investor', 'investor'],
  ['融资', 'investor'],
  ['community', 'community'],
  ['运营', 'community'],
  ['product', 'product'],
  ['产品', 'product'],
]);
const SENSITIVE_MARKERS = [
  'secret',
  'confidential',
  'nda',
  '内幕',
  '保密',
  '敏感',
];
const PII_PATTERNS = [
  { code: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu },
  { code: 'phone', pattern: /(?:\+?\d[\d\s-]{6,}\d)/gu },
  { code: 'wechat', pattern: /(?:wechat|微信)[^,\n]{0,24}/giu },
];
const CONTACT_PLACEHOLDER_NAMES = new Set([
  'new contact',
  'new contact draft',
  'unconfirmed contact',
  'unknown contact',
  '新联系人',
  '未确认联系人',
]);
const CHINESE_CONTACT_NAME_STOPWORDS = new Set([
  '很多人',
  '几个人',
  '一些人',
  '一个人',
  '朋友们',
  '同学们',
  '大家',
  '别人',
  '他们',
  '她们',
  '我们',
]);
const ENGLISH_NAME_STOPWORDS = new Set([
  'SocialOS',
  'Workspace',
  'Cockpit',
  'Ask',
  'London',
  'Singapore',
  'Instagram',
  'LinkedIn',
  'Twitter',
  'Wechat',
  'WeChat',
]);
const DRAFT_NOISE_PREFIX_PATTERNS = [
  /^(?:请|麻烦(?:你)?|帮我|可以帮我|请帮我)?(?:先|顺便|再|再帮我)?(?:新建|创建|记录|保存|加上?|添加|整理|生成|做一个)\s*(?:一个|一下|一条)?\s*(?:新的)?\s*(?:联系人(?:卡)?|联系人的资料|contact|person card|event|事件|活动|草稿|内容包)?(?:吧|一下)?[，,。:：\s]*/u,
  /^(?:我想知道|想知道|帮我看看|帮我找一下|帮我确认一下|记一下|请记一下|帮我记一下|帮我记住)[，,。:：\s]*/u,
  /^(?:顺便|另外|然后|并且|同时)\s*(?:帮我)?(?:把这条)?(?:后面)?(?:变成|做成|生成)\s*(?:一个)?\s*(?:event|事件|活动|草稿|内容包)?[，,。:：\s]*/u,
];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeEnglishContactName(value) {
  const source = cleanText(value);
  if (!source) return '';
  return source
    .split(/\s+/u)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function isChineseContactStopword(value) {
  return CHINESE_CONTACT_NAME_STOPWORDS.has(cleanText(value));
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return unique(value.map((item) => cleanText(item)));
  }

  if (typeof value !== 'string') return [];

  return unique(
    value
      .split(/\r?\n|,/u)
      .map((item) => cleanText(item))
      .filter(Boolean)
  );
}

export function inferEnergyFromText(text) {
  const source = cleanText(text).toLowerCase();
  let energy = 0;

  for (const marker of POSITIVE_ENERGY_MARKERS) {
    if (source.includes(marker)) energy += 1;
  }

  for (const marker of NEGATIVE_ENERGY_MARKERS) {
    if (source.includes(marker)) energy -= 1;
  }

  return Math.max(-2, Math.min(2, energy));
}

export function inferEmotionTags(text) {
  const source = cleanText(text).toLowerCase();
  const tags = [];

  if (POSITIVE_ENERGY_MARKERS.some((marker) => source.includes(marker))) tags.push('energized');
  if (NEGATIVE_ENERGY_MARKERS.some((marker) => source.includes(marker))) tags.push('stretched');
  if (source.includes('network') || source.includes('认识') || source.includes('met ')) tags.push('social');
  if (source.includes('ship') || source.includes('发布') || source.includes('上线')) tags.push('shipping');
  if (source.includes('learn') || source.includes('reflection') || source.includes('复盘')) tags.push('reflective');

  return unique(tags.length ? tags : ['neutral']);
}

export function inferPersonName(text) {
  const source = cleanText(text);
  const chinesePatterns = [
    /(?:有一个|有位|有个)?(?:叫|名叫)\s*([\u4e00-\u9fa5]{2,4})(?=的(?:联系人|朋友|同学|人)|[，,。.!?\s]|$)/u,
    /(?:我(?:今天)?(?:在[^，。,.!?]{0,20})?(?:认识了|遇到了|碰到了|见到了)|(?:认识了|遇到了|碰到了|见到了))\s*([\u4e00-\u9fa5]{2,4})/u,
    /(?:他|她)叫\s*([\u4e00-\u9fa5]{2,4})/u,
    /(?:联系人|朋友|同学|嘉宾|同事)\s*[:：]?\s*([\u4e00-\u9fa5]{2,4})/u,
    /(?:^|[，,。\s])([\u4e00-\u9fa5]{2,4})[，,、]\s*(?:做|在|是|来自|负责|搞)/u,
  ];

  for (const pattern of chinesePatterns) {
    const match = source.match(pattern);
    if (match?.[1] && !isChineseContactStopword(match[1])) return match[1];
  }

  const explicitExampleEnglishPatterns = [
    /(?:比如|例如|像)\s*([A-Za-z][A-Za-z'-]{1,30}(?:\s+[A-Za-z][A-Za-z'-]{1,30}){0,2})(?=\s*(?:他|她|is|做|在|来自|负责|，|,|。|\.|$))/iu,
    /(?:he|she)\s+is\s+called\s+([A-Za-z][A-Za-z'-]{1,30}(?:\s+[A-Za-z][A-Za-z'-]{1,30}){0,2})/iu,
  ];

  for (const pattern of explicitExampleEnglishPatterns) {
    const match = source.match(pattern);
    const candidate = normalizeEnglishContactName(match?.[1] || '');
    if (candidate && !ENGLISH_NAME_STOPWORDS.has(candidate)) return candidate;
  }

  const englishPatterns = [
    /(?:named|called)\s+([A-Za-z][A-Za-z'-]{1,30}(?:\s+[A-Za-z][A-Za-z'-]{1,30}){0,2})/iu,
    /(?:met|with|talked to)\s+([A-Za-z][A-Za-z'-]{1,30}(?:\s+[A-Za-z][A-Za-z'-]{1,30}){0,2})/iu,
    /(?:he|she)\s+is\s+([A-Za-z][A-Za-z'-]{1,30}(?:\s+[A-Za-z][A-Za-z'-]{1,30}){0,2})/iu,
  ];

  for (const pattern of englishPatterns) {
    const match = source.match(pattern);
    const candidate = normalizeEnglishContactName(match?.[1] || '');
    if (candidate && !ENGLISH_NAME_STOPWORDS.has(candidate)) return candidate;
  }

  const titleCase = source.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/u);
  if (titleCase?.[1] && !ENGLISH_NAME_STOPWORDS.has(titleCase[1])) return titleCase[1];

  return '';
}

export function isPlaceholderContactName(value) {
  const normalized = cleanText(value).toLowerCase();
  return !normalized || CONTACT_PLACEHOLDER_NAMES.has(normalized);
}

export function sanitizeContactDraftText(value) {
  const source = cleanText(value);
  if (!source) return '';

  const fragments = source
    .split(/(?<=[。！？!?])\s*|\s{2,}|\s*(?=[。！？!?])/u)
    .map((fragment) => cleanText(fragment))
    .filter(Boolean);
  const seen = new Set();
  const cleaned = [];

  for (const fragment of fragments) {
    let next = fragment;
    for (const pattern of DRAFT_NOISE_PREFIX_PATTERNS) {
      next = next.replace(pattern, '');
    }
    next = cleanText(next.replace(/^[-*•]\s*/u, ''));
    if (!next) continue;
    const signature = next.toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    cleaned.push(next);
  }

  return cleanText(cleaned.join(' '));
}

export function inferTagsFromText(text) {
  const source = cleanText(text).toLowerCase();
  const tags = [];
  for (const [keyword, tag] of TAG_KEYWORDS.entries()) {
    if (source.includes(keyword)) tags.push(tag);
  }
  return unique(tags);
}

export function inferFollowUpSuggestion(personName, text) {
  const subject = personName || 'them';
  const source = cleanText(text);
  const normalized = source.toLowerCase();
  const prefersChinese = /[\u4e00-\u9fa5]/u.test(source) || /[\u4e00-\u9fa5]/u.test(subject);

  if (normalized.includes('invest') || source.includes('投资') || source.includes('融资')) {
    if (prefersChinese) {
      return `趁投资话题还新鲜，给${subject}发一条简短跟进，并明确一个具体的下一步。`;
    }
    return `Send ${subject} a concise follow-up with the investment angle you discussed and one specific next step.`;
  }
  if (normalized.includes('growth') || source.includes('增长')) {
    if (prefersChinese) {
      return `可以把刚聊到的一个增长动作发给${subject}，顺手约一个简短的 follow-up。`;
    }
    return `Message ${subject} with one growth experiment you mentioned and invite a quick compare-notes follow-up.`;
  }
  if (prefersChinese) {
    return `趁上下文还新鲜，给${subject}发一条跟进，把刚聊过的话题和下一步动作接起来。`;
  }
  return `Follow up with ${subject} while the context is fresh, and anchor the message on the topic you just discussed.`;
}

export function extractIdentitiesFromText(text) {
  const source = cleanText(text);
  const identities = [];
  const handleMatches = [...source.matchAll(/@([A-Za-z0-9_.-]{2,32})/gu)];

  for (const match of handleMatches) {
    identities.push({
      platform: 'x',
      handle: `@${match[1]}`,
      url: '',
      note: 'captured from raw text',
    });
  }

  const wechatMatch = source.match(/(?:wechat|微信)\s*[:：]?\s*([A-Za-z0-9_.-]{3,40})/iu);
  if (wechatMatch?.[1]) {
    identities.push({
      platform: 'wechat_moments',
      handle: wechatMatch[1],
      url: '',
      note: 'captured from quick capture',
    });
  }

  const linkedinMatch = source.match(/linkedin\s*[:：]?\s*([A-Za-z0-9_.-]{3,40})/iu);
  if (linkedinMatch?.[1]) {
    identities.push({
      platform: 'linkedin',
      handle: linkedinMatch[1],
      url: linkedinMatch[1].startsWith('http') ? linkedinMatch[1] : '',
      note: 'captured from quick capture',
    });
  }

  return identities;
}

export function buildCaptureDraft({ text, source = 'manual', assets = [] }) {
  const rawText = cleanText(text);
  const assetNotes = assets
    .map((asset) => cleanText(asset.extractedText || asset.previewText || ''))
    .filter(Boolean)
    .join(' ');
  const combinedText = cleanText([rawText, assetNotes].filter(Boolean).join(' '));
  const sanitizedText = sanitizeContactDraftText(combinedText) || combinedText;
  const personName = inferPersonName(combinedText);
  const tags = inferTagsFromText(combinedText);
  const identities = extractIdentitiesFromText(combinedText);
  const energy = inferEnergyFromText(combinedText);
  const emotions = inferEmotionTags(combinedText);
  const summary = sanitizedText.slice(0, 220) || 'Quick capture summary';
  const isConfirmedName = !isPlaceholderContactName(personName);

  return {
    rawText,
    combinedText,
    source,
    personDraft: {
      name: isConfirmedName ? personName : '',
      displayName: isConfirmedName ? personName : 'Unconfirmed contact',
      isConfirmedName,
      requiresNameConfirmation: !isConfirmedName,
      tags,
      notes: summary,
      nextFollowUpAt: '',
      followUpSuggestion: inferFollowUpSuggestion(personName, combinedText),
      identities,
    },
    selfCheckinDraft: {
      energy,
      emotions,
      triggerText: source,
      reflection: combinedText,
    },
    interactionDraft: {
      summary,
      happenedAt: '',
      evidence: sanitizedText || combinedText,
    },
    assets: assets.map((asset) => ({
      assetId: asset.assetId || '',
      kind: asset.kind || 'unknown',
      fileName: asset.fileName || '',
      extractedText: asset.extractedText || '',
      status: asset.status || 'parsed',
    })),
  };
}

export function buildDraftValidation(platformRule, content, baseIssues = []) {
  const text = cleanText(content);
  const piiIssues = [];
  const sensitiveIssues = [];

  for (const descriptor of PII_PATTERNS) {
    const match = text.match(descriptor.pattern);
    if (match?.length) {
      piiIssues.push({
        code: `pii_${descriptor.code}`,
        message: `possible ${descriptor.code} detected: ${match.slice(0, 2).join(', ')}`,
      });
    }
  }

  for (const marker of SENSITIVE_MARKERS) {
    if (text.toLowerCase().includes(marker)) {
      sensitiveIssues.push({
        code: `sensitive_${marker}`,
        message: `sensitive expression detected: ${marker}`,
      });
    }
  }

  return {
    ok: !baseIssues.length && !piiIssues.length && !sensitiveIssues.length,
    categories: {
      format: [...baseIssues],
      pii: piiIssues,
      sensitive: sensitiveIssues,
    },
    issues: [...baseIssues, ...piiIssues, ...sensitiveIssues],
    supportLevel: platformRule?.id || 'manual',
  };
}

function summarizeClaimEvidence(claim, evidenceRows) {
  return {
    claim,
    evidence: evidenceRows.map((row) => ({
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      snippet: row.snippet,
    })),
  };
}

export function buildStructuredMirror({ checkins = [], captures = [], interactions = [] }) {
  const allEvidence = [];
  const themeCounts = new Map();
  const energyRows = [];

  for (const checkin of checkins) {
    const reflection = cleanText(checkin.reflection || '');
    const emotions = Array.isArray(checkin.emotions) ? checkin.emotions : [];
    for (const emotion of emotions) {
      themeCounts.set(emotion, (themeCounts.get(emotion) || 0) + 1);
    }
    energyRows.push({
      sourceType: 'self_checkin',
      sourceId: checkin.checkinId || checkin.id || '',
      energy: Number(checkin.energy || 0),
      snippet: reflection.slice(0, 180) || 'No reflection text.',
      createdAt: checkin.createdAt || checkin.created_at || '',
    });
  }

  for (const capture of captures) {
    const snippet = cleanText(capture.text || capture.payload?.text || '').slice(0, 180);
    if (!snippet) continue;
    allEvidence.push({
      sourceType: 'capture',
      sourceId: capture.captureId || capture.id || '',
      snippet,
    });
  }

  for (const interaction of interactions) {
    const snippet = cleanText(interaction.summary || interaction.evidence || '').slice(0, 180);
    if (!snippet) continue;
    allEvidence.push({
      sourceType: 'interaction',
      sourceId: interaction.interactionId || interaction.id || '',
      snippet,
    });
  }

  const themes = [...themeCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([theme, count]) => ({ theme, count }));

  const energizers = energyRows
    .filter((row) => row.energy > 0)
    .sort((left, right) => right.energy - left.energy)
    .slice(0, 3);

  const drainers = energyRows
    .filter((row) => row.energy < 0)
    .sort((left, right) => left.energy - right.energy)
    .slice(0, 3);

  const conclusions = [
    {
      title: 'Momentum Pattern',
      summary:
        energizers.length > drainers.length
          ? 'Positive momentum outweighed drag in this window.'
          : 'Energy was mixed, and recovery needs to be scheduled intentionally.',
      evidence: summarizeClaimEvidence(
        'Momentum Pattern',
        energizers.length ? energizers : energyRows.slice(0, 2)
      ),
    },
    {
      title: 'Relationship Signal',
      summary: allEvidence.length
        ? 'Your relationship loop is producing reusable social evidence.'
        : 'You need more relationship evidence before the mirror becomes meaningful.',
      evidence: summarizeClaimEvidence('Relationship Signal', allEvidence.slice(0, 2)),
    },
    {
      title: 'Next Experiment',
      summary: 'Protect one follow-up block and one recovery block next week.',
      evidence: summarizeClaimEvidence(
        'Next Experiment',
        [...drainers.slice(0, 1), ...energizers.slice(0, 1)].filter(Boolean)
      ),
    },
  ];

  return {
    summaryText:
      themes.length || energyRows.length
        ? [
            'Weekly Self Mirror',
            `Themes: ${themes.map((item) => `${item.theme} (${item.count})`).join(', ') || 'none yet'}`,
            `Energizers: ${energizers.map((row) => row.snippet).join(' | ') || 'none yet'}`,
            `Drainers: ${drainers.map((row) => row.snippet).join(' | ') || 'none yet'}`,
            'Next experiment: protect one follow-up block and one recovery block.',
          ].join('\n')
        : '本周暂无足够 check-in 数据。建议至少完成 3 次 Quick Capture 后再生成 Self Mirror。',
    themes,
    energizers,
    drainers,
    conclusions,
  };
}

export { cleanList, cleanText };
