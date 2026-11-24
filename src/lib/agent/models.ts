import type { ProviderInfo } from '@/lib/tauri-commands';
import { resolveModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';

export type ModelRole = 'assistant' | 'fast' | 'reasoning' | 'vision';

export async function ensureProviders(): Promise<ProviderInfo[]> {
  const store = useProviders.getState();
  if (store.loaded && store.providers.length > 0) return store.providers;
  return store.refresh();
}

export function providerById(id: string | undefined | null): ProviderInfo | undefined {
  if (!id) return undefined;
  const { providers } = useProviders.getState();
  return providers.find((p) => p.id === id) ?? providers.find((p) => p.model === id);
}

export function modelFor(role: ModelRole): ProviderInfo | undefined {
  const { providers } = useProviders.getState();
  const settings = useSettings.getState();
  const assistant = resolveModel(settings.selectedModel, providers);
  if (role === 'assistant') return assistant;
  if (role === 'fast') return (settings.fastModel && providerById(settings.fastModel)) || assistant;
  if (role === 'reasoning') return (settings.reasoningModel && providerById(settings.reasoningModel)) || assistant;
  const explicit = settings.visionModel ? providerById(settings.visionModel) : undefined;
  if (explicit) return explicit;
  const reasoning = (settings.reasoningModel && providerById(settings.reasoningModel)) || undefined;
  const candidates = [assistant, reasoning, ...providers].filter((p): p is ProviderInfo => Boolean(p));
  return candidates.find((p) => p.capabilities?.vision === true);
}

export function canSeeImages(provider: ProviderInfo | undefined): boolean {
  return provider?.capabilities?.vision === true;
}

export function contextWindowOf(provider: ProviderInfo | undefined): number {
  const known = provider?.capabilities?.contextWindow;
  if (known && known > 0) return known;
  if (!provider) return 32_000;
  if (provider.type === 'ollama') return 32_768;
  if (provider.type === 'groq') return 32_000;
  return 128_000;
}

export function inputBudget(provider: ProviderInfo | undefined): number {
  const window = contextWindowOf(provider);
  return Math.max(6_000, Math.floor(Math.min(window, 400_000) * 0.62));
}

export function describeModel(provider: ProviderInfo | undefined): string {
  return provider ? provider.model : 'no model';
}
