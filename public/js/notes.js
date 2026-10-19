// Turns an analysis into concise study notes (Markdown) for copying or download.

const STATUS = { verified: 'Verified match', related: 'Related reference', unverified: 'Unverified candidate' };

export function toMarkdown({ analysis: a, title, brand, season, research, label, image }) {
  const lines = [];
  lines.push(`# ${title || a.title || 'Untitled look'}`);
  const meta = [brand, season].filter(Boolean).join(' · ');
  if (meta) lines.push(`*${meta}*`);
  if (label) lines.push(`> ${label}`);
  lines.push('');

  lines.push('## Overall look');
  lines.push(a.overall.summary);
  lines.push('');
  lines.push(`- **Silhouette:** ${a.overall.silhouette}`);
  lines.push(`- **Proportions:** ${a.overall.proportions}`);
  lines.push(`- **Styling:** ${a.overall.styling}`);
  if (a.overall.aesthetic) lines.push(`- **Direction:** ${a.overall.aesthetic}`);
  lines.push('');

  if (a.colors.palette.length) {
    lines.push('## Colour');
    for (const c of a.colors.palette) lines.push(`- ${c.name} \`${c.hex}\` — ${c.role}${c.where ? `, ${c.where}` : ''}`);
    if (a.colors.interaction) lines.push('', a.colors.interaction);
    lines.push('', '_Colours are estimated from the photograph and may vary with lighting._', '');
  }

  if (a.garments.length) {
    lines.push('## Garments');
    for (const g of a.garments) {
      lines.push(`### ${g.name} (${g.category})`);
      lines.push(`- Fit: ${g.silhouette_fit}`);
      if (g.details.length) lines.push(`- Details: ${g.details.join('; ')}`);
      if (g.fabric.description) lines.push(`- Fabric (${g.fabric.basis}): ${g.fabric.description}`);
      lines.push(`- Confidence: ${g.confidence}${g.uncertainty ? ` — ${g.uncertainty}` : ''}`);
    }
    lines.push('');
  }

  if (a.design_details.length) {
    lines.push('## Design details');
    for (const d of a.design_details) lines.push(`- **${d.area}** (${d.kind}): ${d.detail}`);
    lines.push('');
  }

  if (a.vocabulary.length) {
    lines.push('## Vocabulary');
    for (const v of a.vocabulary) {
      lines.push(`- **${v.term}** — ${v.definition} *Here:* ${v.application}${v.contrast ? ` *Compare:* ${v.contrast}` : ''}`);
    }
    lines.push('');
  }

  if (research && research.status === 'ok') {
    lines.push('## Sources');
    if (!research.sources.length) lines.push('Original source not identified.');
    for (const s of research.sources) {
      lines.push(`- [${STATUS[s.status]}] ${s.brand}${s.product_name ? ` — ${s.product_name}` : ''}: ${s.url}`);
    }
    lines.push('');
  }

  if (image && image.credit) {
    lines.push(`_Image: ${image.credit}${image.license ? `, ${image.license}` : ''}${image.source_url ? ` — ${image.source_url}` : ''}_`);
  }
  lines.push(`_Notes from ÉTUDIER, ${new Date().toLocaleDateString()}. AI analysis can be wrong; check before citing._`);
  return lines.join('\n');
}
