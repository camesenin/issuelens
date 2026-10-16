import React from 'react'

function renderInline(text) {
  if (!text) return null
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded bg-neutral-800/90 px-1.5 py-0.5 font-mono text-xs text-amber-300 border border-neutral-700/60"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-neutral-100">
          {part.slice(2, -2)}
        </strong>
      )
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-300"
        >
          {linkMatch[1]}
        </a>
      )
    }
    return part
  })
}

export default function MarkdownRenderer({ content }) {
  if (!content || !content.trim()) {
    return (
      <p className="italic text-neutral-500">
        No markdown description provided for this item.
      </p>
    )
  }

  const blocks = []
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim().toLowerCase()
      const codeLines = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1 // skip closing ```
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      i += 1
      continue
    }

    // Unordered or ordered lists
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = []
      const ordered = /^\s*\d+\.\s+/.test(line)
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.\s+)/, '').trim())
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // Blockquotes
    if (line.trim().startsWith('>')) {
      const quoteLines = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join(' ') })
      continue
    }

    // Blank lines
    if (!line.trim()) {
      i += 1
      continue
    }

    // Paragraph
    const paraLines = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>')
    ) {
      paraLines.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-300">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-lg font-bold text-white border-b border-neutral-800 pb-1.5'
              : block.level === 2
                ? 'text-base font-semibold text-neutral-100 pt-1'
                : 'text-sm font-semibold text-neutral-200 pt-1'
          return (
            <h3 key={index} className={sizeClass}>
              {renderInline(block.text)}
            </h3>
          )
        }

        if (block.type === 'code') {
          const isDiff = block.lang === 'diff'
          return (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
            >
              {block.lang && (
                <div className="border-b border-neutral-800 bg-neutral-900/80 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                  {block.lang}
                </div>
              )}
              <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-neutral-200">
                <code>
                  {isDiff
                    ? block.code.split('\n').map((line, lIdx) => {
                        let lineClass = 'text-neutral-300'
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          lineClass = 'bg-emerald-500/10 text-emerald-300'
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          lineClass = 'bg-rose-500/10 text-rose-300'
                        } else if (line.startsWith('@@') || line.startsWith('diff --git')) {
                          lineClass = 'text-sky-400 font-semibold'
                        }
                        return (
                          <div key={lIdx} className={`px-1 ${lineClass}`}>
                            {line}
                          </div>
                        )
                      })
                    : block.code}
                </code>
              </pre>
            </div>
          )
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag
              key={index}
              className={`space-y-1.5 pl-5 ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } text-neutral-300`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInline(item)}</li>
              ))}
            </ListTag>
          )
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-neutral-700 bg-neutral-900/40 py-1.5 pl-3.5 italic text-neutral-400"
            >
              {renderInline(block.text)}
            </blockquote>
          )
        }

        return (
          <p key={index} className="text-neutral-300">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
