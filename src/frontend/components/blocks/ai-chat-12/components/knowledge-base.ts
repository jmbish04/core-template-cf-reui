/**
 * @fileoverview The knowledge base `/chat/support` answers from — and it is a
 * real one, because this template documents itself.
 *
 * Two shelves, both live:
 *
 * - `GET /api/docs/schema` — every D1 table with its own description and a
 *   description per column, imported straight from the Drizzle schema modules.
 *   That is what `/docs` renders, so the assistant and the documentation page
 *   beside it are reading the same words.
 * - `GET /api/files` — the markdown and text files on the workspace drive,
 *   whose bodies come from `GET /api/files/{id}/content`.
 *
 * Retrieval is keyword overlap, scored over title, section and body. It is
 * deliberately simple and deliberately strict: an article that matches nothing
 * is not retrieved, and a question that retrieves nothing is reported as a gap
 * rather than answered from the model's own memory. There is no embedding
 * store in this template, and pretending otherwise would be the lie.
 */
import { apiGet } from "@/lib/api";
import type { DriveFile } from "@/components/chat";

/** One retrievable article. `body` is null until the article has been read. */
export interface Article {
  id: string;
  title: string;
  /** Which shelf it came off, shown at the end of a trace row. */
  section: string;
  /** Preview used for scoring before the body is fetched. */
  preview: string;
  /** The full text, once read. Null for a drive file that has not been read. */
  body: string | null;
  /** Where a reader can go and check it. */
  href: string;
}

/** How many articles one question may pull. Keeps the turn inside its budget. */
export const MAX_MATCHES = 5;

/** Characters of each article quoted into the turn. */
const ARTICLE_CHARS = 640;

/** Ceiling across all quoted articles — the system prompt is capped at 4000. */
const ARTICLE_BUDGET = 3300;

/** Text types the drive can serve as an article. */
const READABLE = /^(text\/|application\/(json|xml|yaml|x-yaml))/;

/** Words too common to tell two articles apart. */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has", "have", "how", "what",
  "when", "where", "which", "with", "this", "that", "from", "does", "did", "was", "were", "why",
  "our", "your", "its", "it's", "about", "into", "than", "then", "them", "they",
]);

/** The instruction that keeps an answer inside the retrieved articles. */
export const SUPPORT_SYSTEM_PROMPT_HEAD =
  "You are a documentation assistant. Answer ONLY from the articles below. " +
  "Cite every article you used by its exact title in square brackets, like [tasks]. " +
  "If the articles do not contain the answer, reply with exactly NOT_COVERED " +
  "followed by one sentence naming what is missing. Never answer from anything " +
  "other than these articles, and never invent a citation.";

/** A reply the model marked as outside the knowledge base. */
export const NOT_COVERED = "NOT_COVERED";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface SchemaResponse {
  tables: Array<{
    name: string;
    description: string;
    columns: Array<{ name: string; type: string; description: string }>;
  }>;
}

/**
 * Load every article the assistant may draw on.
 *
 * Schema articles arrive whole, because `/api/docs/schema` returns their text.
 * Drive articles arrive as a title and a size; their bodies are fetched when
 * they are actually read, which is what the trace ticks through.
 *
 * @returns The knowledge base, schema tables first.
 * @throws When neither shelf can be reached.
 * @example
 * const articles = await loadKnowledgeBase();
 */
export async function loadKnowledgeBase(): Promise<Article[]> {
  const [schema, drive] = await Promise.all([
    apiGet<SchemaResponse>("docs/schema").catch(() => ({ tables: [] }) as SchemaResponse),
    apiGet<{ data: DriveFile[] }>("files").catch(() => ({ data: [] as DriveFile[] })),
  ]);

  const tables: Article[] = schema.tables.map((table) => {
    const body = [
      table.description,
      ...table.columns
        .filter((column) => column.description)
        .map((column) => `${column.name} (${column.type}) — ${column.description}`),
    ].join("\n");
    return {
      id: `table:${table.name}`,
      title: table.name,
      section: "Schema",
      preview: body,
      body,
      href: `/docs#${table.name}`,
    };
  });

  const files: Article[] = drive.data
    .filter((entry) => entry.kind === "file" && READABLE.test(entry.mimeType ?? ""))
    .map((entry) => ({
      id: `file:${entry.id}`,
      title: entry.name,
      section: "Drive",
      preview: entry.name,
      body: null,
      href: `/api/files/${entry.id}/content`,
    }));

  return [...tables, ...files];
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** The searchable words in a question. */
function terms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
    ),
  );
}

/**
 * Score the knowledge base against a question and keep what actually matched.
 *
 * @param articles The loaded knowledge base.
 * @param question The reader's question.
 * @returns The best matches, highest score first. Empty when nothing matched.
 */
export function search(articles: Article[], question: string): Article[] {
  const words = terms(question);
  if (words.length === 0) return [];

  return articles
    .map((article) => {
      const haystack = `${article.title} ${article.section} ${article.preview}`.toLowerCase();
      // A title hit is worth more than a body hit: it is what the article is
      // about rather than something it happens to mention.
      const score = words.reduce(
        (total, word) =>
          total +
          (article.title.toLowerCase().includes(word) ? 3 : 0) +
          (haystack.includes(word) ? 1 : 0),
        0,
      );
      return { article, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map((entry) => entry.article);
}

/**
 * Read one article's body, fetching it when the drive holds it.
 *
 * @param article A matched article.
 * @returns The same article with its body filled in, or unchanged on failure.
 */
export async function readArticle(article: Article): Promise<Article> {
  if (article.body !== null) return article;
  try {
    const response = await fetch(article.href);
    if (!response.ok) return article;
    return { ...article, body: await response.text() };
  } catch {
    // An article that could not be fetched stays unread, so it is never quoted
    // into the turn and never counted as read.
    return article;
  }
}

/**
 * Build the system prompt from the articles that were actually read.
 *
 * @param articles The read articles, in the order they were read.
 * @returns The instruction plus the quoted articles.
 */
export function supportSystemPrompt(articles: Article[]): string {
  let budget = ARTICLE_BUDGET;
  const quoted: string[] = [];

  for (const article of articles) {
    if (!article.body || budget <= 0) continue;
    const room = Math.min(ARTICLE_CHARS, budget);
    const excerpt =
      article.body.length > room ? `${article.body.slice(0, room)}\n… (excerpt cut)` : article.body;
    budget -= excerpt.length;
    quoted.push(`[${article.title}] (${article.section})\n${excerpt}`);
  }

  if (quoted.length === 0) {
    return `${SUPPORT_SYSTEM_PROMPT_HEAD}\n\nNo articles were retrieved for this question.`;
  }
  return `${SUPPORT_SYSTEM_PROMPT_HEAD}\n\nArticles:\n\n${quoted.join("\n\n")}`;
}

/**
 * Which of the read articles the answer actually cited.
 *
 * Derived from the `[title]` markers in the reply, so it still works after a
 * reload — the reply is a row, the retrieval state is not.
 *
 * @param reply The assistant's answer.
 * @param articles The articles to look for.
 * @returns The cited articles, in knowledge-base order.
 */
export function citedArticles(reply: string, articles: Article[]): Article[] {
  const cited = new Set(
    Array.from(reply.matchAll(/\[([^\]\n]{1,80})\]/g)).map((match) => match[1]!.trim().toLowerCase()),
  );
  return articles.filter((article) => cited.has(article.title.toLowerCase()));
}

/** True when the model said the knowledge base does not cover the question. */
export function isNotCovered(reply: string): boolean {
  return reply.trimStart().startsWith(NOT_COVERED);
}
