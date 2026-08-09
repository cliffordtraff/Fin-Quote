'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, type MouseEvent } from 'react'

interface RichTextEditorProps {
  id: string
  value: string
  onChange: (html: string) => void
  ariaLabel: string
  readOnly?: boolean
  className?: string
  minHeightClassName?: string
}

const MARKDOWN_BOLD_RE = /\*\*(.+?)\*\*/g

function looksLikeHtml(value: string): boolean {
  return /<\w+[^>]*>/.test(value)
}

function toEditorHtml(value: string): string {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  const withBold = value.replace(MARKDOWN_BOLD_RE, '<strong>$1</strong>')
  const paragraphs = withBold
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
    .join('')
  return paragraphs
}

export function RichTextEditor({
  id,
  value,
  onChange,
  ariaLabel,
  readOnly = false,
  className,
  minHeightClassName = 'min-h-[320px]',
}: RichTextEditorProps) {
  const lastEmittedRef = useRef<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        id,
        'aria-label': ariaLabel,
        class: [
          'tiptap-newsletter-body px-4 py-2.5 text-sm leading-6 text-gray-900',
          'focus:outline-none',
          minHeightClassName,
        ]
          .filter(Boolean)
          .join(' '),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastEmittedRef.current = html
      onChange(html)
    },
    immediatelyRender: false,
    editable: !readOnly,
  })

  useEffect(() => {
    if (!editor) return
    if (value === lastEmittedRef.current) return
    const next = toEditorHtml(value)
    if (next === editor.getHTML()) return
    editor.commands.setContent(next, { emitUpdate: false })
    lastEmittedRef.current = editor.getHTML()
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) return
    const editorProps = editor.options.editorProps
    editor.setOptions({
      editorProps: {
        ...editorProps,
        attributes: {
          ...editorProps.attributes,
          id,
          'aria-label': ariaLabel,
        },
      },
    })
  }, [ariaLabel, editor, id])

  function focusEditorFromContainer(event: MouseEvent<HTMLDivElement>) {
    if (!editor || readOnly) return

    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('[contenteditable="true"]')) return

    editor.commands.focus('end')
  }

  return (
    <div
      onClick={focusEditorFromContainer}
      aria-readonly={readOnly}
      className={[
        `w-full rounded-2xl border border-gray-300 transition ${
          readOnly ? 'bg-gray-50' : 'bg-white'
        }`,
        'focus-within:border-sage-500 focus-within:ring-2 focus-within:ring-sage-500/20',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
