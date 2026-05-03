import Image from "next/image";
import { promises as fs } from "fs";
import path from "path";
import type { ReactNode } from "react";
import "./guide.css";

type GuideBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "image"; alt: string; src: string };

export const metadata = {
  title: "Panduan Ultimate Screener",
  description: "Panduan kasual dan step-by-step untuk memakai Ultimate Screener.",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function normalizeImageSrc(src: string) {
  return src.replace(/^\.\.\/public/, "");
}

function parseGuide(markdown: string): GuideBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: GuideBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const codeMatch = trimmed.match(/^```(\w+)?/);
    if (codeMatch) {
      const language = codeMatch[1] || "text";
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      i += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      blocks.push({ type: "image", alt: imageMatch[1], src: normalizeImageSrc(imageMatch[2]) });
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2].trim();
      blocks.push({ type: "heading", level, text, id: slugify(text) });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
      i += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paragraphLines = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^(!\[|>|-|\d+\.|```)/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    const codeMatch = token.match(/^`([^`]+)`$/);
    if (codeMatch) return <code key={index}>{codeMatch[1]}</code>;

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) return <a key={index} href={linkMatch[2]}>{linkMatch[1]}</a>;

    return token;
  });
}

export default async function GuidePage() {
  const markdown = await fs.readFile(path.join(process.cwd(), "docs", "PANDUAN_WEB.md"), "utf8");
  const blocks = parseGuide(markdown);
  const toc = blocks.filter((block): block is Extract<GuideBlock, { type: "heading" }> => block.type === "heading" && block.level === 2);

  return (
    <div className="guide-shell">
      <section className="guide-hero panel scanline-container">
        <div>
          <div className="guide-kicker">USER GUIDE</div>
          <h1>Panduan Ultimate Screener</h1>
          <p>Versi santai dan step-by-step buat baca dashboard, screener, chart, conviction report, research, dan Telegram bot.</p>
        </div>
        <a className="markdown-link" href="/docs/PANDUAN_WEB.md">Open Markdown</a>
      </section>

      <div className="guide-layout">
        <aside className="guide-toc panel">
          <div className="toc-title">Isi Panduan</div>
          {toc.map(item => (
            <a key={item.id} href={`#${item.id}`}>{item.text}</a>
          ))}
        </aside>

        <article className="guide-article panel">
          {blocks.map((block, index) => {
            if (block.type === "heading") {
              const Tag = `h${block.level}` as "h1" | "h2" | "h3";
              return <Tag key={index} id={block.id}>{block.text}</Tag>;
            }

            if (block.type === "paragraph") return <p key={index}>{renderInline(block.text)}</p>;
            if (block.type === "quote") return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
            if (block.type === "code") return <pre key={index}><code>{block.code}</code></pre>;
            if (block.type === "image") {
              return (
                <figure key={index}>
                  <Image src={block.src} alt={block.alt} width={1440} height={1200} sizes="(max-width: 900px) 100vw, 980px" />
                  <figcaption>{block.alt}</figcaption>
                </figure>
              );
            }

            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={index}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
              </ListTag>
            );
          })}
        </article>
      </div>
    </div>
  );
}
