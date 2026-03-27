import { describe, expect, it } from 'vitest'
import { parseSecForm144Document, parseSecForm144Feed } from '@/lib/sec-form144'

describe('parseSecForm144Feed', () => {
  it('extracts unique filing metadata from the SEC atom feed', () => {
    const feed = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <content type="text/xml">
      <accession-number>0001628280-26-020268</accession-number>
      <filing-date>2026-03-20</filing-date>
      <filing-href>https://www.sec.gov/Archives/edgar/data/1045810/000162828026020268/0001628280-26-020268-index.htm</filing-href>
      <filing-type>144</filing-type>
    </content>
  </entry>
</feed>`

    expect(parseSecForm144Feed(feed)).toEqual([
      {
        accessionNumber: '0001628280-26-020268',
        filingDate: '2026-03-20',
        filingHref: 'https://www.sec.gov/Archives/edgar/data/1045810/000162828026020268/0001628280-26-020268-index.htm',
        formType: '144',
      },
    ])
  })

  it('extracts filing metadata from the SEC current filings atom feed shape', () => {
    const feed = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>144 - Mancini Anthony (0002124509) (Reporting)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2124509/000212450926000002/0002124509-26-000002-index.htm"/>
    <summary type="html">
      &lt;b&gt;Filed:&lt;/b&gt; 2026-03-26 &lt;b&gt;AccNo:&lt;/b&gt; 0002124509-26-000002 &lt;b&gt;Size:&lt;/b&gt; 4 KB
    </summary>
    <category scheme="https://www.sec.gov/" label="form type" term="144"/>
  </entry>
</feed>`

    expect(parseSecForm144Feed(feed)).toEqual([
      {
        accessionNumber: '0002124509-26-000002',
        filingDate: '2026-03-26',
        filingHref: 'https://www.sec.gov/Archives/edgar/data/2124509/000212450926000002/0002124509-26-000002-index.htm',
        formType: '144',
      },
    ])
  })
})

describe('parseSecForm144Document', () => {
  it('extracts the reporting name, notice date, shares, and aggregate market value', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/ownership" xmlns:com="http://www.sec.gov/edgar/common">
  <headerData>
    <submissionType>144</submissionType>
    <filerInfo>
      <filer>
        <filerCredentials>
          <cik>0001199039</cik>
        </filerCredentials>
      </filer>
    </filerInfo>
  </headerData>
  <formData>
    <issuerInfo>
      <issuerCik>0001045810</issuerCik>
      <issuerName>NVIDIA CORP</issuerName>
      <nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold>MARK A STEVENS</nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold>
      <relationshipsToIssuer>
        <relationshipToIssuer>Director</relationshipToIssuer>
      </relationshipsToIssuer>
    </issuerInfo>
    <securitiesInformation>
      <noOfUnitsSold>1700000</noOfUnitsSold>
      <aggregateMarketValue>303552000</aggregateMarketValue>
      <approxSaleDate>03/20/2026</approxSaleDate>
    </securitiesInformation>
    <noticeSignature>
      <noticeDate>03/20/2026</noticeDate>
      <signature>Mark Stevens</signature>
    </noticeSignature>
  </formData>
</edgarSubmission>`

    const parsed = parseSecForm144Document(xml, {
      accessionNumber: '0001628280-26-020268',
      filingDate: '2026-03-20',
      filingHref: 'https://www.sec.gov/Archives/edgar/data/1045810/000162828026020268/0001628280-26-020268-index.htm',
      formType: '144',
    })

    expect(parsed).toEqual({
      accessionNumber: '0001628280-26-020268',
      filingDate: '2026-03-20',
      filingHref: 'https://www.sec.gov/Archives/edgar/data/1045810/000162828026020268/0001628280-26-020268-index.htm',
      formType: '144',
      issuerCik: '0001045810',
      filerCik: '0001199039',
      reportingName: 'MARK A STEVENS',
      ownerType: 'Director',
      transactionDate: '2026-03-20',
      shares: 1700000,
      value: 303552000,
    })
  })
})
