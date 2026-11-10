/**
 * Product types - ALIGNED with client project (WelkinrimTech/src/data/products.ts)
 * This ensures data saved by admin console is compatible with client website
 */

// Performance data row format
export type PerfRow = {
  throttle: string;
  voltage: string;
  power: string;
  thrust: string;
  current: string;
  speed?: string;
  efficiency?: string;
};

// Spec item format (used in keySpecs and allSpecs)
export type SpecItem = {
  label: string;
  value: string;
};

// Product category types
// Series ids come from the live `series` table (any id may exist), so this is a plain string.
export type ProductSeries = string;
export type ProductCategory = 'motor' | 'esc' | 'fc' | 'ips' | 'other';

// Public-site mega-menu segments. Stored as `data.segments: string[]` (lowercase ids).
export const SEGMENT_OPTIONS = [
  { id: 'uav', label: 'UAV' },
  { id: 'marine', label: 'Marine' },
  { id: 'land', label: 'Land' },
  { id: 'robotics', label: 'Robotics' },
  { id: 'other', label: 'Other' },
] as const;
export type ProductSegment = (typeof SEGMENT_OPTIONS)[number]['id'];

// Contract with the public site: missing segments -> ['other'] for series 'other', else ['uav'].
export function getDefaultSegments(series: string): string[] {
  return series === 'other' ? ['other'] : ['uav'];
}

export function getSegments(product: { series: string; segments?: unknown }): string[] {
  const valid = SEGMENT_OPTIONS.map(o => o.id as string);
  if (Array.isArray(product.segments)) {
    const segs = product.segments.filter((x): x is string => typeof x === 'string' && valid.includes(x));
    if (segs.length > 0) return segs;
  }
  return getDefaultSegments(product.series);
}

// Derive the products.category column (motor|esc|fc|ips|other) from a series id.
export function getCategoryFromSeries(series: string): ProductCategory {
  const id = (series || '').toLowerCase();
  if (['haemng', 'maelard', 'stroke', 'vagans', 'sciatic'].includes(id)) return 'motor';
  if (id === 'esc' || id.startsWith('esc-') || id.startsWith('esc_')) return 'esc';
  if (id === 'fc' || id.startsWith('fc-') || id.startsWith('fc_')) return 'fc';
  if (id === 'ips' || id.startsWith('ips-') || id.startsWith('ips_')) return 'ips';
  if (id === 'other') return 'other';
  return 'motor';
}

// Unified Product type - matches client format exactly
export interface Product {
  id: string;
  series: ProductSeries;
  seriesLabel: string;
  model: string;
  name: string;
  tag: string;
  application: string;
  keySpecs: SpecItem[];      // 3 key specs displayed on product cards
  allSpecs: SpecItem[];      // Full specs displayed on detail page
  perf?: PerfRow[];          // Performance data (throttle curves)
  thumbnailUrl?: string | null;
  iconUrl?: string | null;
  wireframeUrl?: string | null;
  thumbnailBgColor?: string | null;
  segments?: string[];       // public-site segments (uav|marine|land|robotics|other)
  category?: ProductCategory;
}

// Supabase row type (database storage format)
export interface SupabaseProductRow {
  id: string;
  category: ProductCategory;
  series: string;
  model: string;
  data: Product;             // Full product data stored as JSONB
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  is_published: boolean;
}

// Extended product type for admin use (includes metadata)
export interface SupabaseProduct extends Product {
  category?: ProductCategory;
  created_at?: string;
  updated_at?: string;
  is_published?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

// Series configuration type
export interface SeriesConfig {
  id: string;
  label: string;
  useSvgLogo: boolean;
  logoSrc?: string;
  accent: string;
  textOnAccent: string;
  iconUrl?: string;
}

// Helper functions
export function isMotor(product: Product): boolean {
  return product.series === 'haemng' || product.series === 'maelard';
}

export function isESC(product: Product): boolean {
  return product.series === 'esc';
}

export function isFC(product: Product): boolean {
  return product.series === 'fc';
}

export function isIPS(product: Product): boolean {
  return product.series === 'ips';
}

// Get series label from series id
export function getSeriesLabel(series: ProductSeries): string {
  const labels: Record<string, string> = {
    haemng: 'Haemng Series',
    maelard: 'Maelard Series',
    esc: 'ESCs',
    fc: 'Flight Controller',
    ips: 'Integrated Power Systems',
    stroke: 'Stroke Series',
    vagans: 'Vagans Series',
    sciatic: 'Sciatic Series',
    other: 'Other Systems & Custom Solutions',
  };
  return labels[series] || series || 'Unknown Series';
}

// Get default tag from series
export function getDefaultTag(series: ProductSeries): string {
  const tags: Record<string, string> = {
    haemng: 'HAEMNG',
    maelard: 'MAELARD',
    esc: 'ESC',
    fc: 'FC',
    ips: 'IPS',
    stroke: 'STROKE',
    vagans: 'VAGANS',
    sciatic: 'SCIATIC',
    other: 'CUSTOM',
  };
  return tags[series] || (series ? series.toUpperCase() : 'PRODUCT');
}

// Create empty product with defaults
export function createEmptyProduct(series: ProductSeries): Product {
  return {
    id: '',
    series,
    seriesLabel: getSeriesLabel(series),
    model: '',
    name: '',
    tag: getDefaultTag(series),
    application: 'UAV / eVTOL',
    keySpecs: [
      { label: 'KV Rating', value: '' },
      { label: 'Peak Thrust', value: '' },
      { label: 'Voltage', value: '' },
    ],
    allSpecs: [],
    perf: [],
    thumbnailUrl: null,
    iconUrl: null,
    wireframeUrl: null,
    thumbnailBgColor: '#111111',
    segments: getDefaultSegments(series),
  };
}

// Validate product has required fields
export function validateProduct(product: Partial<Product>): string[] {
  const errors: string[] = [];

  if (!product.model?.trim()) {
    errors.push('Model name is required');
  }

  if (!product.id?.trim()) {
    errors.push('Product ID is required');
  }

  if (!product.series) {
    errors.push('Series is required');
  }

  // Motor products need key specs
  if (isMotor(product as Product)) {
    const kvSpec = product.keySpecs?.find(s => s.label.toLowerCase().includes('kv'));
    if (!kvSpec?.value) {
      errors.push('KV Rating is required for motor products');
    }
  }

  return errors;
}

// Extract KV value from specs
export function getKV(product: Product): string {
  const kvSpec = product.keySpecs?.find(s =>
    s.label.toLowerCase().includes('kv')
  );
  return kvSpec?.value || '—';
}

// Extract voltage from specs
export function getVoltage(product: Product): string {
  const voltageSpec = product.keySpecs?.find(s =>
    s.label.toLowerCase().includes('voltage') || s.label.toLowerCase().includes('battery')
  );
  return voltageSpec?.value || '—';
}

// Extract peak thrust from specs
export function getPeakThrust(product: Product): string {
  const thrustSpec = product.keySpecs?.find(s =>
    s.label.toLowerCase().includes('thrust')
  );
  return thrustSpec?.value || '—';
}

// Extract weight from specs
export function getWeight(product: Product): string {
  const weightSpec = product.allSpecs?.find(s =>
    s.label.toLowerCase().includes('weight')
  );
  if (weightSpec?.value) {
    // Extract number from "86 g" format
    const match = weightSpec.value.match(/(\d+)/);
    return match ? match[1] : weightSpec.value;
  }
  return '—';
}

// Get domain/category badge for product
export function getProductDomain(product: Product): string {
  if (isMotor(product) || isIPS(product)) {
    return 'air';
  }
  if (isESC(product)) {
    return 'air';
  }
  if (isFC(product)) {
    return 'air';
  }
  return 'robotics';
}