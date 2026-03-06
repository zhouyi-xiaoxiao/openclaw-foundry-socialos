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

function unique(items) {
  return [...new Set(items.filter(Boolean))];
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
  const chineseMatch = source.match(/(?:认识了|遇到了|和|跟)\s*([\u4e00-\u9fa5]{2,4})/u);
  if (chineseMatch?.[1]) return chineseMatch[1];

  const englishMatch = source.match(/(?:met|with|talked to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/u);
  if (englishMatch?.[1]) return englishMatch[1];

  const titleCase = source.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/u);
  if (titleCase?.[1]) return titleCase[1];

  return '';
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
  if (cleanText(text).toLowerCase().includes('invest')) {
    return `Send ${subject} a concise follow-up with the investment angle you discussed and one specific next step.`;
  }
  if (cleanText(text).toLowerCase().includes('growth')) {
    return `Message ${subject} with one growth experiment you mentioned and invite a quick compare-notes follow-up.`;
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
  const personName = inferPersonName(combinedText);
  const tags = inferTagsFromText(combinedText);
  const identities = extractIdentitiesFromText(combinedText);
  const energy = inferEnergyFromText(combinedText);
  const emotions = inferEmotionTags(combinedText);
  const summary = combinedText.slice(0, 220) || 'Quick capture summary';

  return {
    rawText,
    combinedText,
    source,
    personDraft: {
      name: personName || 'New contact',
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
      evidence: combinedText,
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
