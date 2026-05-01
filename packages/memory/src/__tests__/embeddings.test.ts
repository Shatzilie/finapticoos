import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = { create: createMock };
      constructor(public config: { apiKey: string }) {}
    },
  };
});

import { createEmbeddingsClient, EMBEDDING_DIMENSIONS } from "../embeddings.js";

describe("embeddings client", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "sk-test-XXX";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns the embedding vector when the API replies with the right dimensions", async () => {
    const fakeVector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / 1000);
    createMock.mockResolvedValueOnce({ data: [{ embedding: fakeVector }] });
    const client = createEmbeddingsClient();
    await expect(client.embed("hello world")).resolves.toEqual(fakeVector);
    expect(createMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "hello world",
    });
  });

  it("rejects empty content without calling OpenAI", async () => {
    const client = createEmbeddingsClient();
    await expect(client.embed("")).rejects.toThrow(/empty content/);
    await expect(client.embed("   ")).rejects.toThrow(/empty content/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createEmbeddingsClient()).toThrow(/OPENAI_API_KEY missing/);
  });

  it("throws when the response has the wrong dimensions", async () => {
    createMock.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const client = createEmbeddingsClient();
    await expect(client.embed("hello")).rejects.toThrow(/unexpected embedding shape/);
  });

  it("honours an explicit api key over the env var", async () => {
    delete process.env.OPENAI_API_KEY;
    const fakeVector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
    createMock.mockResolvedValueOnce({ data: [{ embedding: fakeVector }] });
    const client = createEmbeddingsClient({ apiKey: "sk-explicit" });
    await expect(client.embed("ok")).resolves.toEqual(fakeVector);
  });
});
