import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useMemo } from 'react';
import { statementSchema, statementUrl } from '../lib/statementHtml';
import './statementLatex.css';
import StatementImage from './StatementImage';
import 'katex/dist/katex.min.css';
import { latexToMarkdown } from '../lib/latex';
export default function Markdown({
  children,
  assets = {},
}: {
  children: string;
  assets?: Record<string, string>;
}) {
  const source = useMemo(() => latexToMarkdown(children), [children]);
  const resolve = (url: string) => {
    let name = url;
    try {
      name = decodeURIComponent(url);
    } catch {
      /* Preserve malformed URLs for the safe URL filter. */
    }
    return assets[name] || assets[name.replace(/^\.\//, '')] || url;
  };
  return (
    <div className="markdown zoj-statement">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => statementUrl(resolve(url), key)}
        components={{
          img: ({ src = '', alt = '', ...properties }) => (
            <StatementImage src={src} alt={alt} properties={properties} />
          ),
        }}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, statementSchema],
          [
            rehypeKatex,
            { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20 },
          ],
        ]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
