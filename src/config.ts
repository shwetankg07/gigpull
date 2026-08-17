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
  // Identifies this client to Overpass, a free volunteer service that bans by
  // client identity. Anyone running their own copy should set this to their own
  // contact, so their traffic is attributable to them and not to this repo.
  // Comma-separated RSS feeds of funding news for startup mode.
  GIGPULL_FUNDING_FEEDS: z
    .string()
    .default("https://entrackr.com/feed,https://inc42.com/feed"),
  GIGPULL_USER_AGENT: z
    .string()
    .min(1)
    .default("gigpull/0.1 (+https://github.com/shwetankg07/gigpull)"),
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
  userAgent: string;
  fundingFeeds: string[];
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
    userAgent: parsed.GIGPULL_USER_AGENT,
    fundingFeeds: parsed.GIGPULL_FUNDING_FEEDS.split(",")
      .map((f) => f.trim())
      .filter(Boolean),
  };
}
