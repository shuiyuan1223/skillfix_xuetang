import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown React component using react-markdown.
 * Renders markdown text with custom-styled elements matching the PHA theme.
 */
export function Markdown({ children }: { children: string }): React.ReactElement {
  return React.createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      components: {
        table: ({ children }) => React.createElement("table", { className: "md-table" }, children),
        th: ({ children }) => React.createElement("th", null, children),
        td: ({ children }) => React.createElement("td", null, children),
        hr: () => React.createElement("hr", { className: "md-hr" }),
        pre: ({ children }) =>
          React.createElement(
            "pre",
            {
              className:
                "bg-surface-code rounded-xl p-4 my-3 overflow-x-auto font-mono text-[13px] leading-relaxed",
            },
            children
          ),
        code: ({ className, children, ...props }) => {
          // Detect fenced code block (has language class from react-markdown)
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return React.createElement("code", props, children);
          }
          return React.createElement(
            "code",
            {
              className: "px-1.5 py-0.5 rounded bg-surface-inline-code font-mono text-[0.85em]",
            },
            children
          );
        },
        a: ({ href, children }) =>
          React.createElement(
            "a",
            { href, target: "_blank", rel: "noopener noreferrer" },
            children
          ),
        h2: ({ children }) => React.createElement("h2", null, children),
        h3: ({ children }) => React.createElement("h3", null, children),
        h4: ({ children }) => React.createElement("h4", null, children),
        strong: ({ children }) => React.createElement("strong", null, children),
        em: ({ children }) => React.createElement("em", null, children),
      },
    },
    children
  );
}

/**
 * Legacy: render markdown to HTML string (kept for non-React contexts).
 */
export function renderMarkdown(text: string): string {
  const tableRegex = /(?:^|\n)(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g;
  const result = text.replace(tableRegex, (_, headerRow, _separatorRow, bodyRows) => {
    const headers = headerRow
      .split("|")
      .filter((c: string) => c.trim())
      .map((c: string) => c.trim());
    const rows = bodyRows
      .trim()
      .split("\n")
      .map((row: string) =>
        row
          .split("|")
          .filter((c: string) => c.trim())
          .map((c: string) => c.trim())
      );

    const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join("");
    const bodyHtml = rows
      .map((row: string[]) => `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("");

    return `<table class="md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });

  return result
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre class="bg-surface-code rounded-xl p-4 my-3 overflow-x-auto font-mono text-[13px] leading-relaxed"><code>$2</code></pre>'
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1.5 py-0.5 rounded bg-surface-inline-code font-mono text-[0.85em]">$1</code>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/^---+$/gm, '<hr class="md-hr">')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}
