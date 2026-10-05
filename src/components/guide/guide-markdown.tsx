import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { guideHref, guideImageSrc, headingId } from "@/lib/guide/links";

/** Plain text of rendered heading children, for its anchor id. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function Heading({ level, children }: { level: 2 | 3; children: ReactNode }) {
  const id = headingId(textOf(Children.toArray(children)));
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag id={id} className="group scroll-mt-20">
      {children}
      <a href={`#${id}`} className="ml-2 text-neutral-400 no-underline opacity-0 group-hover:opacity-100 focus:opacity-100 print:hidden" aria-label="Link to this section">
        #
      </a>
    </Tag>
  );
}

/**
 * Renders a guide Markdown file (our own docs, not user input). Links between guide files
 * become in-app links; image paths point at /guide/images. Raw HTML is still skipped.
 */
export function GuideMarkdown({ children }: { children: string }) {
  return (
    <div className="markdown guide-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          a: ({ href = "", children }) => {
            const to = guideHref(href);
            if (/^(?:[a-z]+:|\/\/)/i.test(to)) {
              return (
                <a href={to} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            }
            return <Link href={to}>{children}</Link>;
          },
          img: ({ src, alt }) => (
            // Static screenshots from docs/user-guide/images, served by /guide/images/[file].
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guideImageSrc(String(src ?? ""))} alt={alt ?? ""} loading="lazy" className="w-full rounded-lg border border-neutral-200 shadow-xs" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
