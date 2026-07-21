export function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  if (typeof val === 'number') {
    if (val < 1000) return null
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }

  const str = String(val).trim()
  if (!str) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4,5}$/.test(str)) {
    const n = parseInt(str)
    const d = new Date(Math.round((n - 25569) * 86400 * 1000))
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m1) {
    const [, mo, d, y] = m1
    const year = y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y
    const dt = new Date(`${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0]
  }

  const m2 = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
  if (m2) {
    const [, d, mo, y] = m2
    const dt = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0]
  }

  const m3 = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})$/)
  if (m3) {
    const [, d, mon, y] = m3
    const year = y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y
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
