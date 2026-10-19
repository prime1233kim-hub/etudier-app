// The shape every analysis must have. The same schema is sent to Claude
// (output_config.format) so the model is constrained to it, and is checked
// again here before anything reaches the browser.

const str = { type: 'string' };
const strList = { type: 'array', items: str };
const enumOf = (...values) => ({ type: 'string', enum: values });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
});

const GARMENT_CATEGORIES = [
  'outerwear', 'jacket', 'top', 'knitwear', 'shirt', 'dress', 'skirt', 'trousers',
  'shorts', 'suit', 'jumpsuit', 'footwear', 'bag', 'headwear', 'jewellery',
  'eyewear', 'belt', 'hosiery', 'gloves', 'scarf', 'other'
];

const analysisSchema = obj({
  is_fashion_image: { type: 'boolean' },
  image_note: str,
  title: str,
  overall: obj({
    summary: str,
    silhouette: str,
    silhouette_tags: strList,
    proportions: str,
    styling: str,
    aesthetic: str
  }),
  colors: obj({
    palette: {
      type: 'array',
      items: obj({
        name: str,
        hex: str,
        role: enumOf('dominant', 'secondary', 'accent'),
        where: str
      })
    },
    combinations: strList,
    interaction: str
  }),
  garments: {
    type: 'array',
    items: obj({
      id: str,
      category: enumOf(...GARMENT_CATEGORIES),
      name: str,
      silhouette_fit: str,
      details: strList,
      fabric: obj({
        description: str,
        basis: enumOf('observed', 'inferred', 'uncertain')
      }),
      terms: strList,
      confidence: enumOf('high', 'medium', 'low'),
      uncertainty: str
    })
  },
  design_details: {
    type: 'array',
    items: obj({
      area: str,
      garment_id: str,
      detail: str,
      kind: enumOf('observation', 'inference')
    })
  },
  vocabulary: {
    type: 'array',
    items: obj({
      term: str,
      definition: str,
      application: str,
      contrast: str
    })
  },
  identification: obj({
    visible_branding: strList,
    possible_brands: {
      type: 'array',
      items: obj({
        name: str,
        reasoning: str,
        confidence: enumOf('high', 'medium', 'low')
      })
    },
    search_queries: strList
  })
});

// A small validator for the subset of JSON Schema used above.
function check(schema, value, path, errors) {
  if (schema.enum) {
    if (!schema.enum.includes(value)) errors.push(`${path}: not one of ${schema.enum.join('/')}`);
    return;
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected text`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected true/false`);
      return;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected a list`); return; }
      value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
      return;
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected an object`);
        return;
      }
      for (const key of schema.required || []) {
        if (!(key in value)) errors.push(`${path}.${key}: missing`);
      }
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in value) check(sub, value[key], `${path}.${key}`, errors);
      }
      return;
    }
  }
}

function validate(schema, value) {
  const errors = [];
  check(schema, value, '$', errors);
  return { ok: errors.length === 0, errors };
}

const HEX = /^#[0-9a-f]{6}$/i;

// After validation: tidy values the schema can't express (hex format, ids).
function normalizeAnalysis(a) {
  a.colors.palette = a.colors.palette
    .map((c) => ({ ...c, hex: /^#?[0-9a-f]{6}$/i.test(c.hex) ? ('#' + c.hex.replace('#', '')).toLowerCase() : '' }))
    .filter((c) => HEX.test(c.hex));
  const seen = new Set();
  a.garments.forEach((g, i) => {
    let id = (g.id || '').trim() || `g${i + 1}`;
    while (seen.has(id)) id += '_';
    seen.add(id);
    g.id = id;
  });
  return a;
}

module.exports = { analysisSchema, validate, normalizeAnalysis, GARMENT_CATEGORIES };
