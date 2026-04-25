export async function copyTextToClipboard(value: string): Promise<void> {
  let clipboardError: unknown

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch (error) {
      clipboardError = error
    }
  }

  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.setAttribute('readonly', '')
  fallback.setAttribute('aria-hidden', 'true')
  fallback.style.position = 'fixed'
  fallback.style.top = '0'
  fallback.style.left = '-9999px'
  fallback.style.opacity = '0'
  fallback.style.pointerEvents = 'none'
  document.body.appendChild(fallback)

  let copied = false
  try {
    // Fallback for browsers/webviews that expose navigator.clipboard
    // but reject if focus changed during an async action before copy.
    fallback.focus({ preventScroll: true })
    fallback.select()
    fallback.setSelectionRange(0, fallback.value.length)
    copied = document.execCommand('copy')
  } finally {
    document.body.removeChild(fallback)
  }

  if (copied) {
    return
  }

  if (clipboardError instanceof Error) {
    throw clipboardError
  }

  throw new Error('Copy failed')
}
