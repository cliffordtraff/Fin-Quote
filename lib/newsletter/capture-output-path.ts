import { isAbsolute, relative, resolve } from 'node:path'

const NEWSLETTER_CAPTURE_SYMBOL_PATTERN =
  /^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/

export class NewsletterCapturePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterCapturePathError'
  }
}

export function normalizeNewsletterCaptureSymbol(value: unknown): string {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!symbol) {
    throw new NewsletterCapturePathError('Chart symbol is required')
  }
  if (
    symbol.length > 24 ||
    !NEWSLETTER_CAPTURE_SYMBOL_PATTERN.test(symbol)
  ) {
    throw new NewsletterCapturePathError(
      'Chart symbol may contain only letters, numbers, dots, and hyphens',
    )
  }
  return symbol
}

export function resolveNewsletterCaptureOutputPath(
  outputDirectory: string,
  filename: string,
): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(filename) ||
    filename.includes('..')
  ) {
    throw new NewsletterCapturePathError('Chart output filename is invalid')
  }

  const resolvedDirectory = resolve(outputDirectory)
  const outputPath = resolve(resolvedDirectory, filename)
  const relativePath = relative(resolvedDirectory, outputPath)
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new NewsletterCapturePathError(
      'Chart output path must stay inside its capture directory',
    )
  }

  return outputPath
}
