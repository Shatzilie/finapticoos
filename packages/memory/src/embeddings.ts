import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingsClientOptions {
  apiKey?: string;
  model?: string;
}

export interface EmbeddingsClient {
  embed(text: string): Promise<number[]>;
}

function resolveApiKey(explicit?: string): string {
  const value = explicit ?? process.env.OPENAI_API_KEY;
  if (!value || value.trim().length === 0) {
    throw new Error(
      "@finapticoos/memory: OPENAI_API_KEY missing. Reuse the same key the CRM uses for M8 RAG embeddings.",
    );
  }
  return value.trim();
}

export function createEmbeddingsClient(options: EmbeddingsClientOptions = {}): EmbeddingsClient {
  const client = new OpenAI({ apiKey: resolveApiKey(options.apiKey) });
  const model = options.model ?? EMBEDDING_MODEL;

  return {
    async embed(input) {
      if (!input || input.trim().length === 0) {
        throw new Error("@finapticoos/memory: cannot embed empty content");
      }
      const response = await client.embeddings.create({ model, input });
      const vector = response.data[0]?.embedding;
      if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `@finapticoos/memory: unexpected embedding shape from ${model} (length=${vector?.length ?? 0})`,
        );
      }
      return vector;
    },
  };
}
