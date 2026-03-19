import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { VertexAIProvider } from './vertex';
import { GeminiProvider } from './gemini';
import { OpenRouterProvider } from './openrouter';
import { AIProvider } from './base';
import { Env } from '../types';

// Models routed through OpenRouter (provider/model format or known open-source models)
const OPENROUTER_PREFIXES = ['deepseek/', 'meta-llama/', 'qwen/', 'mistralai/', 'stepfun/'];
const OPENROUTER_MODELS = ['deepseek-chat', 'deepseek-v3.2', 'llama-4', 'qwen3', 'step-3.5', ':free'];

function isOpenRouterModel(model: string): boolean {
	const lower = model.toLowerCase();
	return OPENROUTER_PREFIXES.some(p => lower.startsWith(p)) ||
		OPENROUTER_MODELS.some(m => lower.includes(m));
}

export function createProvider(model: string, env: Env): AIProvider {
	if (model.toLowerCase().includes('claude')) {
		// Use direct Anthropic API for Claude models
		// This gives us: dynamic model availability (Opus 4.6 etc.), simpler auth,
		// no model ID mapping, and no silent fallback to wrong models
		if (!env.ANTHROPIC_API_KEY) {
			throw new Error('Anthropic API key not configured');
		}
		return new AnthropicProvider(env.ANTHROPIC_API_KEY);
	}
	if (model.toLowerCase().includes('gemini')) {
		if (!env.GEMINI_API_KEY) {
			throw new Error('Gemini API key not configured');
		}
		return new GeminiProvider(env.GEMINI_API_KEY);
	}
	if (isOpenRouterModel(model)) {
		if (!env.OPENROUTER_API_KEY) {
			throw new Error('OpenRouter API key not configured');
		}
		return new OpenRouterProvider(env.OPENROUTER_API_KEY);
	}
	return new OpenAIProvider(env.OPENAI_API_KEY);
}

export type { AIProvider };
