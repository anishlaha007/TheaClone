import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import clsx from 'clsx'

/** Renders AI output. Raw HTML is not rendered (react-markdown escapes it by default). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={clsx('prose-aeht', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
