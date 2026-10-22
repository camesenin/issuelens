import React from 'react'

function renderInline(text) {
  if (!text) return null
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="bg-zinc-800/90 border border-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-200"
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
          className="text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 transition hover:text-indigo-200"
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
    <div className="space-y-3 text-[13px] leading-relaxed text-zinc-300">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-xs font-semibold uppercase tracking-wider text-zinc-100 border-b border-white/[0.07] pb-1.5'
              : block.level === 2
                ? 'text-xs font-semibold uppercase tracking-wider text-zinc-200 pt-1.5'
                : 'text-xs font-medium text-zinc-200 pt-1'
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
              className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#07080C]"
            >
              {block.lang && (
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-900/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  <span>{block.lang}</span>
                  {isDiff && (
                    <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300">
                      unified diff
                    </span>
                  )}
                </div>
              )}
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-zinc-300">
                <code>
                  {isDiff
                    ? block.code.split('\n').map((line, lIdx) => {
                        let lineClass = 'text-zinc-400'
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          lineClass = 'bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-400 pl-2'
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          lineClass = 'bg-rose-500/10 text-rose-300 border-l-2 border-rose-400 pl-2'
                        } else if (line.startsWith('@@') || line.startsWith('diff --git')) {
                          lineClass = 'text-indigo-300 font-semibold bg-indigo-500/5 py-0.5'
                        }
                        return (
                          <div key={lIdx} className={`px-1.5 ${lineClass}`}>
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
              className={`space-y-1.5 pl-4 leading-relaxed ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } text-zinc-300 marker:text-zinc-500`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          )
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="rounded-r-lg border-l-2 border-indigo-400/60 bg-zinc-900/50 py-1.5 pl-3 pr-2 text-zinc-400"
            >
              {renderInline(block.text)}
            </blockquote>
          )
        }

        return (
          <p key={index} className="leading-relaxed text-zinc-300">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}
