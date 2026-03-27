import { describe, expect, it } from 'vitest'
import { getOwnershipDocumentUrl, parseSecOwnershipDocument } from '@/lib/sec-form-ownership'

describe('getOwnershipDocumentUrl', () => {
  it('converts filing index links into raw ownership.xml links', () => {
    expect(
      getOwnershipDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/2035149/000119312526124409/0001193125-26-124409-index.htm'
      )
    ).toBe('https://www.sec.gov/Archives/edgar/data/2035149/000119312526124409/ownership.xml')
  })
})

describe('parseSecOwnershipDocument', () => {
  it('extracts reporting owners and non-derivative transaction rows', () => {
    const xml = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerName>Fairbanks Jonathan B.</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>1</isTenPercentOwner>
      <isOther>1</isOther>
      <otherText>See Remarks</otherText>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Class A Common Stock</value></securityTitle>
      <transactionDate><value>03/23/2026</value></transactionDate>
      <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1682406</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>1682406</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Class A Common Stock</value></securityTitle>
      <transactionDate><value>03/23/2026</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1682406</value></transactionShares>
        <transactionPricePerShare><value>21.175</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>0</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Class A Common Stock</value></securityTitle>
      <transactionDate><value>2026-03-23</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1907855</value></transactionShares>
        <transactionPricePerShare><value>21.175</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>0</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`

    expect(parseSecOwnershipDocument(xml)).toEqual({
      reportingOwners: [
        {
          name: 'Fairbanks Jonathan B.',
          ownerType: 'director, 10 percent owner, other: See Remarks',
        },
      ],
      transactions: [
        {
          securityName: 'Class A Common Stock',
          transactionDate: '2026-03-23',
          transactionCode: 'M',
          acquisitionDisposition: 'A',
          shares: 1682406,
          price: 0,
          sharesOwnedAfter: 1682406,
        },
        {
          securityName: 'Class A Common Stock',
          transactionDate: '2026-03-23',
          transactionCode: 'S',
          acquisitionDisposition: 'D',
          shares: 1682406,
          price: 21.175,
          sharesOwnedAfter: 0,
        },
        {
          securityName: 'Class A Common Stock',
          transactionDate: '2026-03-23',
          transactionCode: 'S',
          acquisitionDisposition: 'D',
          shares: 1907855,
          price: 21.175,
          sharesOwnedAfter: 0,
        },
      ],
    })
  })
})
