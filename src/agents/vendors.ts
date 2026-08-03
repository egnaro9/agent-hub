// Vendors, not transports.
//
// providers.ts speaks in TRANSPORTS — anthropic, google, and "anything that
// speaks OpenAI's REST shape". That is the right abstraction for the wire and
// the wrong one for a human: picking "OpenAI-compatible" tells you nothing
// about whether you are talking to xAI or Groq, and every such vendor would
// have shared one key slot. This file is the human-facing layer: a vendor is a
// company, it owns its own key, and it knows which transport and base URL to
// use underneath.

import type { Provider } from "./providers";

export interface Vendor {
  id: string;
  label: string;
  provider: Provider;
  /** Only for openai-compatible vendors. */
  baseUrl?: string;
  /** Where to get a key. */
  docs: string;
  /** Known model ids. Free text is always allowed — ids drift constantly. */
  models: string[];
  /** A tight label for narrow controls; the full one carries a parenthetical. */
  short?: string;
  /** Set when the browser cannot reach it at all, whatever the key says. */
  browserBlocked?: boolean;
  note?: string;
}

export const VENDORS: Vendor[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    docs: "https://console.anthropic.com/settings/keys",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7", "claude-opus-4-6"],
  },
  {
    id: "google",
    short: "Gemini",
    label: "Google Gemini",
    provider: "google",
    docs: "https://aistudio.google.com/apikey",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  {
    id: "openrouter",
    short: "OpenRouter",
    label: "OpenRouter (GPT, Llama, DeepSeek…)",
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    docs: "https://openrouter.ai/keys",
    models: [
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "anthropic/claude-opus-4-8",
      "google/gemini-2.5-pro",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen-2.5-72b-instruct",
    ],
    note: "One key, most models — including the GPTs a browser can't reach directly.",
  },
  {
    id: "xai",
    short: "xAI",
    label: "xAI (Grok)",
    provider: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    docs: "https://console.x.ai",
    models: ["grok-4", "grok-4-fast", "grok-3"],
  },
  {
    id: "groq",
    short: "Groq",
    label: "Groq (fast open models)",
    provider: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    docs: "https://console.groq.com/keys",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen-2.5-32b", "deepseek-r1-distill-llama-70b"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    docs: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "mistral",
    label: "Mistral",
    provider: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    docs: "https://console.mistral.ai/api-keys",
    models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  },
  {
    id: "together",
    label: "Together",
    provider: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    docs: "https://api.together.ai/settings/api-keys",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
  },
  {
    id: "openai",
    short: "OpenAI",
    label: "OpenAI (direct)",
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    docs: "https://platform.openai.com/api-keys",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
    browserBlocked: true,
    note: "api.openai.com sends no CORS headers, so no web page can call it — no key fixes this. Use OpenRouter here, or wait for the desktop build.",
  },
  {
    id: "local",
    short: "Local",
    label: "Local / custom endpoint",
    provider: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    docs: "https://ollama.com",
    models: ["llama3.3", "qwen2.5-coder"],
    note: "Ollama, LM Studio, vLLM — anything speaking the OpenAI shape.",
  },
];

export const vendorById = (id: string): Vendor | undefined => VENDORS.find((v) => v.id === id);

// Each vendor owns its key, so xAI and Groq can be configured at the same time
// even though they share a transport.
const keyOf = (vendorId: string) => `agent-hub:vkey:${vendorId}`;
const urlOf = (vendorId: string) => `agent-hub:vurl:${vendorId}`;

export const getVendorKey = (vendorId: string): string | null => {
  try {
    // Anthropic falls back to the original key slot so nobody re-pastes it.
    return localStorage.getItem(keyOf(vendorId)) ?? (vendorId === "anthropic" ? localStorage.getItem("agent-hub:anthropic-key") : null);
  } catch {
    return null;
  }
};
export const setVendorKey = (vendorId: string, key: string) => {
  try {
    localStorage.setItem(keyOf(vendorId), key.trim());
    if (vendorId === "anthropic") localStorage.setItem("agent-hub:anthropic-key", key.trim());
  } catch {
    /* private mode */
  }
};
export const clearVendorKey = (vendorId: string) => {
  try {
    localStorage.removeItem(keyOf(vendorId));
    if (vendorId === "anthropic") localStorage.removeItem("agent-hub:anthropic-key");
  } catch {
    /* ignore */
  }
};

/** A custom base URL, for the local/custom vendor or to override a preset. */
export const getVendorUrl = (vendorId: string): string | null => {
  try {
    return localStorage.getItem(urlOf(vendorId)) ?? vendorById(vendorId)?.baseUrl ?? null;
  } catch {
    return vendorById(vendorId)?.baseUrl ?? null;
  }
};
export const setVendorUrl = (vendorId: string, url: string) => {
  try {
    localStorage.setItem(urlOf(vendorId), url.trim());
  } catch {
    /* ignore */
  }
};

/** Everything the transport needs, resolved from a vendor id. */
export const resolveVendor = (vendorId: string) => {
  const v = vendorById(vendorId);
  if (!v) return null;
  return { provider: v.provider, baseUrl: getVendorUrl(vendorId) ?? undefined, apiKey: getVendorKey(vendorId), vendor: v };
};
