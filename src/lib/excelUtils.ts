export function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  if (typeof val === 'number') {
    if (val < 1000) return null
    // Reject km readings and prices (e.g. 29500, 356008) — only plausible
    // Excel date serials (2000-01-01 = 36526 through 2099-12-31 = 73050).
    if (val < 36526 || val > 73050) return null
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }

  const str = String(val).trim()
  if (!str) return null
  // Reject strings that are purely numeric (km, prices with commas, etc.)
  if (/^[\d,]+$/.test(str)) return null
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  // Numeric serial as string
  if (/^\d{5}$/.test(str)) {
    const n = parseInt(str)
    if (n >= 36526 && n <= 73050) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000))
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
    return null
  }

  // DD/MM/YYYY or DD-MM-YYYY (Indian / European format — day first)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (dmyMatch) {
    const [, day, month, yr] = dmyMatch
    const year = yr.length === 2 ? (parseInt(yr) > 50 ? '19' + yr : '20' + yr) : yr
    const d = parseInt(day); const m = parseInt(month)
    // If day > 12 it must be DD/MM, otherwise assume DD/MM (Indian default)
    const isoDay = String(d).padStart(2, '0')
    const isoMon = String(m).padStart(2, '0')
    const dt = new Date(`${year}-${isoMon}-${isoDay}`)
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0]
  }

  // DD Mon YYYY  e.g. "28 Apr 2026"
  const dmonMatch = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})$/)
  if (dmonMatch) {
    const [, d, mon, yr] = dmonMatch
    const year = yr.length === 2 ? (parseInt(yr) > 50 ? '19' + yr : '20' + yr) : yr
    const dt = new Date(`${mon} ${d}, ${year}`)
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0]
  }

  const dt = new Date(str)
  if (!isNaN(dt.getTime()) && str.length > 5) return dt.toISOString().split('T')[0]

  return null
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_\-\.]+/g, ' ')
}

export interface ColumnMapping {
  customer_name: string
  phone: string
  vehicle_number: string
  vehicle_model: string
  service_type: string
  service_pending_date: string
  insurance_expiry_date: string
  address: string
  email: string
  next_service_date: string
  next_service_type: string
}

export const EMPTY_MAPPING: ColumnMapping = {
  customer_name: '', phone: '', vehicle_number: '', vehicle_model: '',
  service_type: '', service_pending_date: '', insurance_expiry_date: '',
  address: '', email: '', next_service_date: '', next_service_type: '',
}

export const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  customer_name: 'Customer Name',
  phone: 'Phone',
  vehicle_number: 'Vehicle Number',
  vehicle_model: 'Vehicle Model',
  service_type: 'Last Service Type',
  service_pending_date: 'Last Service Date',
  insurance_expiry_date: 'Insurance Expiry Date',
  address: 'Address',
  email: 'Email',
  next_service_date: 'Next Service Date',
  next_service_type: 'Next Service Type',
}

const RULES: Array<{ field: keyof ColumnMapping; patterns: RegExp[] }> = [
  { field: 'customer_name', patterns: [/customer\s*name/, /client\s*name/, /owner\s*name/, /^name$/] },
  { field: 'phone', patterns: [/^phone/, /^mobile/, /contact\s*no/, /^contact$/, /phone\s*no/, /mobile\s*no/] },
  { field: 'vehicle_number', patterns: [/vehicle\s*no/, /reg(istration)?\s*(no|num|number)?/, /^reg\s*no/, /car\s*no/] },
  { field: 'vehicle_model', patterns: [/vehicle\s*model/, /car\s*model/, /model\s*name/, /^model$/] },
  { field: 'next_service_type', patterns: [/next\s*service\s*type/, /next\s*svc\s*type/] },
  { field: 'next_service_date', patterns: [/next\s*service\s*date/, /next\s*svc\s*date/, /service\s*due\s*date/, /service\s*pending\s*date/] },
  { field: 'service_pending_date', patterns: [/last\s*service\s*date/, /prev(ious)?\s*service\s*date/, /^service\s*date$/] },
  { field: 'service_type', patterns: [/last\s*service\s*type/, /prev(ious)?\s*service\s*type/, /^service\s*type$/] },
  { field: 'insurance_expiry_date', patterns: [/insurance\s*(expiry|exp|date)/, /ins\s*exp/, /policy\s*expiry/] },
  { field: 'address', patterns: [/address/, /location/, /city/] },
  { field: 'email', patterns: [/email/, /e-mail/, /mail\s*id/] },
]

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping = { ...EMPTY_MAPPING }
  const used = new Set<string>()
  for (const rule of RULES) {
    for (const header of headers) {
      if (used.has(header)) continue
      if (rule.patterns.some((p) => p.test(normalizeHeader(header)))) {
        mapping[rule.field] = header
        used.add(header)
        break
      }
    }
  }
  return mapping
}

export function computeNextServiceDate(lastServiceDate: string | null): string | null {
  if (!lastServiceDate) return null
  const d = new Date(lastServiceDate)
  if (isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + 3)
  return d.toISOString().split('T')[0]
}

export interface MappedLeadFields {
  customer_name: string | null;
  phone: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  service_type: string | null;
  service_pending_date: string | null;
  insurance_expiry_date: string | null;
  address: string | null;
  email: string | null;
  extra_data: Record<string, string> | null;
}

/**
 * Auto-maps a raw Excel/CSV row to lead fields using the auto-detected mapping.
 * ALL non-standard columns are stored in extra_data (the JSONB metadata column),
 * including blank ones as empty strings so callers see every original column.
 */
export function buildLeadFromRow(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
): MappedLeadFields {
  const mappedCols = new Set(Object.values(mapping).filter(Boolean));
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!mappedCols.has(k)) {
      // Trim stray NUL bytes that appear when UTF-16 files are parsed.
      const cleanKey = k.replace(/\u0000/g, '').trim();
      const s = v === null || v === undefined ? '' : String(v).replace(/\u0000/g, '').trim();
      if (cleanKey) extra[cleanKey] = s;
    }
  }
  const get = (col: string): string | null => {
    if (!col) return null;
    const val = row[col];
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    return s !== '' ? s : null;
  };

  // Phone numbers can arrive as large integers from Excel — preserve as string.
  const getPhone = (col: string): string | null => {
    if (!col) return null;
    const val = row[col];
    if (val === null || val === undefined) return null;
    // Remove any decimal part added by Excel (e.g. 9999999999.0)
    const s = String(typeof val === 'number' ? Math.round(val) : val).trim();
    return s !== '' ? s : null;
  };

  const lastServiceDate = parseExcelDate(
    mapping.service_pending_date ? row[mapping.service_pending_date] : null,
  );
  const nextServiceDate =
    parseExcelDate(mapping.next_service_date ? row[mapping.next_service_date] : null) ??
    computeNextServiceDate(lastServiceDate);
  const nextServiceType = get(mapping.next_service_type);

  // next_service_date / next_service_type live inside extra_data (jsonb) to
  // avoid PostgREST schema-cache issues with dedicated columns. The frontend
  // reads them back via getNextServiceDate / getNextServiceType helpers.
  if (nextServiceDate) extra['next_service_date'] = nextServiceDate;
  if (nextServiceType) extra['next_service_type'] = nextServiceType;

  return {
    customer_name: get(mapping.customer_name),
    phone: getPhone(mapping.phone),
    vehicle_number: get(mapping.vehicle_number),
    vehicle_model: get(mapping.vehicle_model),
    service_type: get(mapping.service_type),
    service_pending_date: lastServiceDate,
    insurance_expiry_date: parseExcelDate(
      mapping.insurance_expiry_date ? row[mapping.insurance_expiry_date] : null,
    ),
    address: get(mapping.address),
    email: get(mapping.email),
    extra_data: Object.keys(extra).length > 0 ? extra : null,
  };
}
