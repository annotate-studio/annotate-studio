import { create } from 'zustand';
import { getAIProviders, type ProviderInfo } from '@/lib/tauri-commands';

interface ProvidersStore {
  providers: ProviderInfo[];
  loaded: boolean;
  refresh: () => Promise<ProviderInfo[]>;
  set: (providers: ProviderInfo[]) => void;
}

export const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  'google-gemini': 'Gemini',
  mistral: 'Mistral',
  together: 'Together',
  xai: 'xAI',
  perplexity: 'Perplexity',
  cohere: 'Cohere',
};

export const useProviders = create<ProvidersStore>((set) => ({
  providers: [],
  loaded: false,
  refresh: async () => {
    try {
      const providers = await getAIProviders();
      set({ providers, loaded: true });
      return providers;
    } catch {
      set({ loaded: true });
      return [];
    }
  },
  set: (providers) => set({ providers, loaded: true }),
}));

export function resolveModel(selected: string, providers: ProviderInfo[]): ProviderInfo | undefined {
  if (selected) {
    const match = providers.find((p) => p.id === selected) ?? providers.find((p) => p.model === selected);
    if (match) return match;
  }
  return providers.find((p) => p.active) ?? providers[0];
}
