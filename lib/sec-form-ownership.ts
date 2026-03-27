export interface SecOwnershipReportingOwner {
  name: string
  ownerType: string
}

export interface SecOwnershipTransaction {
  securityName: string
  transactionDate: string
  transactionCode: string
  acquisitionDisposition: string
  shares: number
  price: number | null
  sharesOwnedAfter: number | null
}

export interface SecOwnershipDocument {
  reportingOwners: SecOwnershipReportingOwner[]
  transactions: SecOwnershipTransaction[]
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

function extractBlocks(source: string, tagName: string): string[] {
  return Array.from(
    source.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi'))
  ).map((match) => match[1])
}

function extractValueWithinTag(source: string, tagName: string): string | null {
  const match = source.match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<value(?:\\s[^>]*)?>([\\s\\S]*?)</value>[\\s\\S]*?</${tagName}>`, 'i')
  )

  return match ? decodeXmlEntities(match[1]) : null
}

function normalizeIsoDate(value: string | null): string | null {
  if (!value) {
    return null
  }

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

function normalizeBooleanFlag(value: string | null): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeTransactionCode(value: string | null): string {
  return value?.trim().charAt(0).toUpperCase() || ''
}

function normalizeAcquisitionDisposition(
  transactionCode: string,
  acquisitionDisposition: string | null
): string {
  if (transactionCode === 'P') {
    return 'A'
  }

  if (transactionCode === 'S') {
    return 'D'
  }

  return acquisitionDisposition?.trim().charAt(0).toUpperCase() || ''
}

function buildOwnerType(ownerBlock: string): string {
  const parts: string[] = []

  if (normalizeBooleanFlag(extractTagValue(ownerBlock, 'isDirector'))) {
    parts.push('director')
  }

  if (normalizeBooleanFlag(extractTagValue(ownerBlock, 'isOfficer'))) {
    const officerTitle = extractTagValue(ownerBlock, 'officerTitle')
    parts.push(officerTitle ? `officer: ${officerTitle}` : 'officer')
  }

  if (normalizeBooleanFlag(extractTagValue(ownerBlock, 'isTenPercentOwner'))) {
    parts.push('10 percent owner')
  }

  if (normalizeBooleanFlag(extractTagValue(ownerBlock, 'isOther'))) {
    const otherText = extractTagValue(ownerBlock, 'otherText')
    parts.push(otherText ? `other: ${otherText}` : 'other')
  }

  return parts.join(', ')
}

export function getOwnershipDocumentUrl(filingHref: string): string {
  return filingHref.replace(/[^/]+$/, 'ownership.xml')
}

export function parseSecOwnershipDocument(xml: string): SecOwnershipDocument | null {
  const reportingOwners = extractBlocks(xml, 'reportingOwner')
    .map((ownerBlock) => ({
      name: extractTagValue(ownerBlock, 'rptOwnerName') || '',
      ownerType: buildOwnerType(ownerBlock),
    }))
    .filter((owner) => owner.name)

  const transactions = extractBlocks(xml, 'nonDerivativeTransaction')
    .map((transactionBlock): SecOwnershipTransaction | null => {
      const transactionCode = normalizeTransactionCode(extractTagValue(transactionBlock, 'transactionCode'))
      const transactionDate = normalizeIsoDate(extractValueWithinTag(transactionBlock, 'transactionDate'))
      const shares = Number(extractValueWithinTag(transactionBlock, 'transactionShares') || '0')
      const rawPrice = extractValueWithinTag(transactionBlock, 'transactionPricePerShare')
      const price = rawPrice ? Number(rawPrice) : null
      const acquisitionDisposition = normalizeAcquisitionDisposition(
        transactionCode,
        extractValueWithinTag(transactionBlock, 'transactionAcquiredDisposedCode')
      )
      const sharesOwnedAfterRaw = extractValueWithinTag(transactionBlock, 'sharesOwnedFollowingTransaction')
      const sharesOwnedAfter = sharesOwnedAfterRaw ? Number(sharesOwnedAfterRaw) : null

      if (!transactionCode || !transactionDate || !Number.isFinite(shares) || shares <= 0) {
        return null
      }

      return {
        securityName: extractValueWithinTag(transactionBlock, 'securityTitle') || '',
        transactionDate,
        transactionCode,
        acquisitionDisposition,
        shares,
        price: Number.isFinite(price) ? price : null,
        sharesOwnedAfter: Number.isFinite(sharesOwnedAfter) ? sharesOwnedAfter : null,
      }
    })
    .filter((transaction): transaction is SecOwnershipTransaction => transaction !== null)

  if (reportingOwners.length === 0 && transactions.length === 0) {
    return null
  }

  return {
    reportingOwners,
    transactions,
  }
}
