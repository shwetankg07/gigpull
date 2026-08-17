import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  META_AD_LIBRARY_TOKEN: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  GIGPULL_CITY: z.string().min(1).default("Bangalore"),
  GIGPULL_RERANK_TOP_N: z.coerce.number().int().positive().default(30),
  GIGPULL_LLM_PROVIDER: z.enum(["gemini", "anthropic"]).default("gemini"),
  GIGPULL_GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),
  // Bangalore. south,west,north,east — the area OSM is queried over.
  GIGPULL_BBOX: z.string().min(1).default("12.83,77.45,13.14,77.78"),
});

export interface GigpullConfig {
  googlePlacesApiKey?: string;
  metaAdLibraryToken?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  githubToken?: string;
  city: string;
  rerankTopN: number;
  llmProvider: "gemini" | "anthropic";
  geminiModel: string;
  bbox: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): GigpullConfig {
  const parsed = EnvSchema.parse(env);
  return {
    googlePlacesApiKey: parsed.GOOGLE_PLACES_API_KEY,
    metaAdLibraryToken: parsed.META_AD_LIBRARY_TOKEN,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    geminiApiKey: parsed.GEMINI_API_KEY,
    githubToken: parsed.GITHUB_TOKEN,
    city: parsed.GIGPULL_CITY,
    rerankTopN: parsed.GIGPULL_RERANK_TOP_N,
    llmProvider: parsed.GIGPULL_LLM_PROVIDER,
    geminiModel: parsed.GIGPULL_GEMINI_MODEL,
    bbox: parsed.GIGPULL_BBOX,
  };
}
