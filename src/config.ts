import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  META_AD_LIBRARY_TOKEN: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  GIGPULL_CITY: z.string().min(1).default("Bangalore"),
  GIGPULL_RERANK_TOP_N: z.coerce.number().int().positive().default(30),
});

export interface GigpullConfig {
  googlePlacesApiKey?: string;
  metaAdLibraryToken?: string;
  anthropicApiKey?: string;
  githubToken?: string;
  city: string;
  rerankTopN: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): GigpullConfig {
  const parsed = EnvSchema.parse(env);
  return {
    googlePlacesApiKey: parsed.GOOGLE_PLACES_API_KEY,
    metaAdLibraryToken: parsed.META_AD_LIBRARY_TOKEN,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    githubToken: parsed.GITHUB_TOKEN,
    city: parsed.GIGPULL_CITY,
    rerankTopN: parsed.GIGPULL_RERANK_TOP_N,
  };
}
