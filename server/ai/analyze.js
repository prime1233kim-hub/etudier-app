// Step 1 of 2: visual analysis of the uploaded look. This only describes
// what can be seen. Brand/source identification happens separately in
// server/research, because looking like a garment is not the same as being it.

const { analysisSchema, validate, normalizeAnalysis } = require('./schema');
const { model, PublicError, createWithFallback } = require('./client');

const SYSTEM = `You are a fashion design tutor helping students analyse runway and fashion reference photographs.

Describe only what is visible in the image, or what can reasonably be inferred from it. Be precise and use correct fashion and construction terminology, but explain it simply for students.

Rules:
- Separate observation from inference. Mark design details as "observation" when clearly visible, "inference" when reasoned from partial evidence.
- Fabric: say "observed" only for things like visible knit structure, sheen or transparency; otherwise "inferred" or "uncertain". Never state fibre content as fact.
- Garment confidence: "high" only when the garment is clearly visible; use "uncertainty" to say what is hidden or ambiguous (empty string if nothing).
- Colours: estimate 3–7 swatches as 6-digit hex values sampled from the garments (not the background). Role is dominant, secondary or accent.
- Vocabulary: 4–8 terms that matter for this look. For each give a plain definition, how it applies here, and a short contrast with a related term (for example straight-leg vs wide-leg). Contrast may be an empty string.
- Identification: list brand names or logos only if actually readable in the image under visible_branding. possible_brands are hypotheses for later research, each with honest reasoning and confidence; leave the list empty rather than guessing wildly. search_queries are 2–4 web searches a researcher could run to find the original collection or product.
- silhouette_tags: 1–4 short lowercase tags such as "oversized", "column", "a-line", "hourglass", "boxy", "wide-leg".
- title: a short descriptive title for the look, e.g. "Ivory column dress with sheer overlay". No brand names unless visibly branded.
- If the image does not show clothing being worn or displayed, set is_fashion_image to false, explain in image_note, and keep the other fields minimal (empty lists, short strings).
- image_note: one sentence on image quality or limits (lighting, crop, motion blur), or an empty string.`;

async function analyzeImage({ buffer, mediaType }) {
  const response = await createWithFallback({
    model: model(),
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: process.env.ETUDIER_EFFORT || 'medium',
      format: { type: 'json_schema', schema: analysisSchema }
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: 'Analyse this look for a fashion student.' }
      ]
    }]
  });
  return parseAnalysisResponse(response);
}

function parseAnalysisResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new PublicError('ai_refused', 'The AI declined to analyse this image. Try a different photograph.', 422);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new PublicError('ai_incomplete', 'The analysis was cut short. Please try again.', 502);
  }
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PublicError('ai_invalid', 'The AI returned an unreadable analysis. Please try again.', 502);
  }
  const result = validate(analysisSchema, data);
  if (!result.ok) {
    console.warn('Analysis failed validation:', result.errors.slice(0, 5));
    throw new PublicError('ai_invalid', 'The AI returned an incomplete analysis. Please try again.', 502);
  }
  return normalizeAnalysis(data);
}

module.exports = { analyzeImage, parseAnalysisResponse, SYSTEM };
