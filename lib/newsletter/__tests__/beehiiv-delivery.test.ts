import { describe, expect, it } from 'vitest'
import {
  buildBeehiivPreviewText,
  createBeehiivDeliveryContentHash,
  wrapNewsletterHtmlForBeehiivMcp,
} from '@/lib/newsletter/beehiiv-delivery'

describe('Beehiiv MCP newsletter delivery', () => {
  it('wraps custom newsletter markup in Beehiiv HTML Snippet syntax', () => {
    const html = '<table><tr><td>Markets & rates</td></tr></table>'

    expect(wrapNewsletterHtmlForBeehiivMcp(html)).toBe(
      '<pre data-type="htmlSnippet"><code class="language-html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;Markets &amp; rates&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</code></pre>',
    )
  })

  it('builds a short plain-text inbox preview from rich intro copy', () => {
    expect(
      buildBeehiivPreviewText(
        '<p><strong>Premarket:</strong> Stocks rise&nbsp;before the open.</p>',
      ),
    ).toBe('Premarket: Stocks rise before the open.')
  })

  it('changes the idempotency hash when editable content changes', () => {
    const base = {
      title: 'Morning setup',
      subjectLine: 'Morning setup',
      previewText: 'What matters today',
      htmlContent: '<p>First version</p>',
    }
    const first = createBeehiivDeliveryContentHash(base)
    const same = createBeehiivDeliveryContentHash({ ...base })
    const changed = createBeehiivDeliveryContentHash({
      ...base,
      htmlContent: '<p>Updated version</p>',
    })

    expect(first).toBe(same)
    expect(changed).not.toBe(first)
  })
})
