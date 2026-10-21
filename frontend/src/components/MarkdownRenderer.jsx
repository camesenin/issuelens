import React from 'react'

function renderInline(text) {
  if (!text) return null
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded-md border border-zinc-800/80 bg-[#09090b] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-zinc-100">
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
          className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-white"
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
      <p className="font-mono text-xs text-zinc-500">
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
    <div className="space-y-2.5 text-xs leading-relaxed text-zinc-300">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-xs font-semibold uppercase tracking-wider text-zinc-200 border-b border-zinc-800/80 pb-1'
              : block.level === 2
                ? 'text-xs font-semibold text-zinc-200 pt-1'
                : 'text-xs font-medium text-zinc-300 pt-0.5'
          return (
            <h4 key={index} className={sizeClass}>
              {renderInline(block.text)}
            </h4>
          )
        }

        if (block.type === 'code') {
          const isDiff = block.lang === 'diff'
          return (
            <div
              key={index}
              className="overflow-hidden rounded-md border border-zinc-800/80 bg-[#09090b]"
            >
              {block.lang && (
                <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#121215] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>{block.lang}</span>
                  {isDiff && <span className="text-zinc-600">patch</span>}
                </div>
              )}
              <pre className="overflow-x-auto p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300">
                <code>
                  {isDiff
                    ? block.code.split('\n').map((line, lIdx) => {
                        let lineClass = 'text-zinc-400'
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          lineClass = 'bg-emerald-500/10 text-emerald-400'
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          lineClass = 'bg-rose-500/10 text-rose-400'
                        } else if (line.startsWith('@@') || line.startsWith('diff --git')) {
                          lineClass = 'text-zinc-300 font-semibold'
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
              className={`space-y-1 pl-4 ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } text-zinc-300`}
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
              className="border-l-2 border-zinc-700 bg-[#121215] py-1 pl-3 text-zinc-400"
            >
              {renderInline(block.text)}
            </blockquote>
          )
        }

        return (
          <p key={index} className="text-zinc-300">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
