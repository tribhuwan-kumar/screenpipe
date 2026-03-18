import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { VertexAIProvider } from './vertex';
import { GeminiProvider } from './gemini';
import { AIProvider } from './base';
import { Env } from '../types';

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
	return new OpenAIProvider(env.OPENAI_API_KEY);
}

export type { AIProvider };
