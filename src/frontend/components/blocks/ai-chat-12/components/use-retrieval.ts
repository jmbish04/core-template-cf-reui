/**
 * @fileoverview The retrieval run behind one support answer.
 *
 * The ticking the block shows — searching, then each matched article going from
 * queued to read, then the write — is real work, not a timer. "Searching" is
 * the knowledge-base load; each tick is one article's body actually resolving
 * (a drive file is fetched, a schema table already arrived with the index).
 * That is why the reads are sequential: the reader watches the same order the
 * requests went out in.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadKnowledgeBase, readArticle, search, type Article } from "./knowledge-base";

/** Where a reply is between the question and the words. */
export type RetrievalPhase = "idle" | "searching" | "reading" | "writing";

export interface RetrievalRun {
  phase: RetrievalPhase;
  /** The articles this question matched, best first. */
  matched: Article[];
  /** How many of them have been read so far. */
  readCount: number;
}

export interface UseRetrieval extends RetrievalRun {
  /** Every article the assistant may draw on. Also feeds the docs page. */
  articles: Article[];
  loading: boolean;
  error: string | null;
  /**
   * Run one retrieval.
   *
   * @param question The reader's question.
   * @returns The articles that were read, which is exactly what may be quoted.
   */
  retrieve: (question: string) => Promise<Article[]>;
  /** Drop the trace once its answer has landed. */
  reset: () => void;
}

/**
 * Load the knowledge base and run retrievals against it.
 *
 * @returns The article index, the live run state, and `retrieve`.
 */
export function useRetrieval(): UseRetrieval {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RetrievalRun>({ phase: "idle", matched: [], readCount: 0 });

  // The retrieval reads this rather than the state, so a run started in the
  // same tick as the load finishing still sees the articles.
  const index = useRef<Article[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadKnowledgeBase()
      .then((loaded) => {
        if (cancelled) return;
        index.current = loaded;
        setArticles(loaded);
        setError(loaded.length === 0 ? "The knowledge base is empty." : null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the knowledge base.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const retrieve = useCallback(async (question: string) => {
    setRun({ phase: "searching", matched: [], readCount: 0 });

    const matched = search(index.current, question);
    if (matched.length === 0) {
      // No match is a real answer about the knowledge base, not a failure: the
      // caller reports the gap instead of asking the model to fill it.
      setRun({ phase: "idle", matched: [], readCount: 0 });
      return [];
    }

    setRun({ phase: "reading", matched, readCount: 0 });

    const read: Article[] = [];
    for (const article of matched) {
      const full = await readArticle(article);
      read.push(full);
      setRun((current) => ({ ...current, readCount: read.length }));
    }

    setRun((current) => ({ ...current, phase: "writing" }));
    // Only the articles that actually resolved may be quoted; one that failed
    // to fetch has a null body and is dropped by `supportSystemPrompt`.
    return read;
  }, []);

  const reset = useCallback(() => setRun({ phase: "idle", matched: [], readCount: 0 }), []);

  return { ...run, articles, loading, error, retrieve, reset };
}
