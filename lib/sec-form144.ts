export interface Form144FeedEntry {
  accessionNumber: string
  filingDate: string
  filingHref: string
  formType: string
}

export interface Form144ParsedDocument {
  accessionNumber: string
  filingDate: string
  filingHref: string
  formType: string
  issuerCik: string
  filerCik: string | null
  reportingName: string
  ownerType: string
  transactionDate: string
  shares: number
  value: number
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function extractTagValue(source: string, tagName: string): string | null {
  const match = source.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i'))
  return match ? decodeXmlEntities(match[1]) : null
}

function extractTagValues(source: string, tagName: string): string[] {
  return Array.from(
    source.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi'))
  )
    .map((match) => decodeXmlEntities(match[1]))
    .filter(Boolean)
}

function extractBlocks(source: string, tagName: string): string[] {
  return Array.from(
    source.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi'))
  )
    .map((match) => match[1])
}

function normalizeIsoDate(value: string): string | null {
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`
  }

  return null
}

function filingHrefToPrimaryDocumentUrl(filingHref: string): string {
  return filingHref.replace(/[^/]+$/, 'primary_doc.xml')
}

export function getPrimaryForm144DocumentUrl(filingHref: string): string {
  return filingHrefToPrimaryDocumentUrl(filingHref)
}

export function parseSecForm144Feed(xml: string): Form144FeedEntry[] {
  const entries = extractBlocks(xml, 'entry')
  const parsedEntries: Form144FeedEntry[] = []

  for (const entry of entries) {
    const accessionNumberFromStructured = extractTagValue(entry, 'accession-number')
    const filingDateFromStructured = extractTagValue(entry, 'filing-date')
    const filingHrefFromStructured = extractTagValue(entry, 'filing-href')
    const formTypeFromStructured = extractTagValue(entry, 'filing-type')

    const summary = extractTagValue(entry, 'summary')
    const summaryDateMatch = summary?.match(/Filed:<\/b>\s*(\d{4}-\d{2}-\d{2})/i) || null
    const summaryAccessionMatch = summary?.match(/AccNo:<\/b>\s*([0-9-]+)/i) || null
    const alternateLinkMatch = entry.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i)
    const categoryTermMatch = entry.match(/<category[^>]+term="([^"]+)"/i)

    const accessionNumber = accessionNumberFromStructured || summaryAccessionMatch?.[1] || null
    const filingDate = filingDateFromStructured || summaryDateMatch?.[1] || null
    const filingHref = filingHrefFromStructured || alternateLinkMatch?.[1] || null
    const formType = formTypeFromStructured || categoryTermMatch?.[1] || null

    if (!accessionNumber || !filingDate || !filingHref || !formType) {
      continue
    }

    parsedEntries.push({
      accessionNumber,
      filingDate,
      filingHref,
      formType: formType.toUpperCase(),
    })
  }

  return parsedEntries
}

export function parseSecForm144Document(
  xml: string,
  entry: Form144FeedEntry
): Form144ParsedDocument | null {
  const issuerCik = extractTagValue(xml, 'issuerCik')
  const filerCik = extractTagValue(xml, 'cik')
  const reportingName = extractTagValue(xml, 'nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold')
  const ownerRelationships = extractTagValues(xml, 'relationshipToIssuer')
  const noticeDate = extractTagValue(xml, 'noticeDate')
  const securitiesBlocks = extractBlocks(xml, 'securitiesInformation')

  if (!issuerCik || !reportingName || securitiesBlocks.length === 0) {
    return null
  }

  let shares = 0
  let value = 0
  let firstApproxSaleDate: string | null = null

  for (const block of securitiesBlocks) {
    const unitsSold = Number(extractTagValue(block, 'noOfUnitsSold') || '0')
    const aggregateMarketValue = Number(extractTagValue(block, 'aggregateMarketValue') || '0')
    const approxSaleDate = extractTagValue(block, 'approxSaleDate')

    if (Number.isFinite(unitsSold) && unitsSold > 0) {
      shares += unitsSold
    }

    if (Number.isFinite(aggregateMarketValue) && aggregateMarketValue > 0) {
      value += aggregateMarketValue
    }

    if (!firstApproxSaleDate && approxSaleDate) {
      firstApproxSaleDate = approxSaleDate
    }
  }

  const transactionDate = normalizeIsoDate(noticeDate || firstApproxSaleDate || entry.filingDate)

  if (!transactionDate || shares <= 0 || value <= 0) {
    return null
  }

  return {
    accessionNumber: entry.accessionNumber,
    filingDate: entry.filingDate,
    filingHref: entry.filingHref,
    formType: entry.formType,
    issuerCik,
    filerCik: filerCik || null,
    reportingName,
    ownerType: ownerRelationships.join(', '),
    transactionDate,
    shares,
    value,
  }
}
