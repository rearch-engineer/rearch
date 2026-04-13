import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './MarkdownRenderer.css';

const MarkdownRenderer = ({ content, sanitize = true }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={sanitize ? [remarkGfm] : [remarkGfm, remarkBreaks]}
        rehypePlugins={sanitize ? [rehypeRaw, rehypeSanitize] : []}
        urlTransform={sanitize ? undefined : (url) => url}
        components={{
        // Code blocks with syntax highlighting
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code {...props}>
              {children}
            </code>
          );
        },
        // Custom styling for other elements
        a({ node, children, ...props }) {
          return (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        table({ node, children, ...props }) {
          return (
            <div className="table-wrapper">
              <table {...props}>{children}</table>
            </div>
          );
        },
        // Blockquotes
        blockquote({ node, children, ...props }) {
          return (
            <blockquote {...props}>
              {children}
            </blockquote>
          );
        },
        // Lists
        ul({ node, children, ...props }) {
          return (
            <ul {...props}>
              {children}
            </ul>
          );
        },
        ol({ node, children, ...props }) {
          return (
            <ol {...props}>
              {children}
            </ol>
          );
        },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
