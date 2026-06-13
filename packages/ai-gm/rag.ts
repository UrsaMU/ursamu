import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

let _embeddings: GoogleGenerativeAIEmbeddings | null = null;

export function getEmbeddings(): GoogleGenerativeAIEmbeddings | null {
  if (_embeddings) return _embeddings;
  const apiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
  if (!apiKey) return null;
  _embeddings = new GoogleGenerativeAIEmbeddings({
    modelName: "text-embedding-004",
    apiKey,
  });
  return _embeddings;
}

export async function embedText(text: string): Promise<number[] | undefined> {
  const embeddings = getEmbeddings();
  if (!embeddings) return undefined;
  try {
    // Clean text to avoid issues
    const cleanText = text.trim();
    if (!cleanText) return undefined;
    return await embeddings.embedQuery(cleanText);
  } catch (err) {
    console.warn("[GM RAG] Failed to generate embedding:", err);
    return undefined;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}
