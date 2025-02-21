"use server";
import { OpenAI } from 'openai';
import { Message } from 'ai';
import { type Settings } from "@screenpipe/js"

export async function generateAIResponse({
  settings,
  chatMessages,
  floatingInput,
  selectedAgent,
  selectedData,
  signal
}: {
  settings: Settings;
  chatMessages: Message[];
  floatingInput: string;
  selectedAgent: any;
  selectedData: any[];
  signal?: AbortSignal; // abortsignal isn't working
}) {
  try {
    const openai = new OpenAI({
      apiKey: settings.aiProviderType === 'screenpipe-cloud' ? settings.user.token : settings.openaiApiKey,
      baseURL: settings.aiUrl,
    });

    const model = settings.aiModel;
    const customPrompt = settings.customPrompt || '';

    const messages = [
      {
        role: 'user' as const,
        content: `You are a helpful assistant specialized as a "${selectedAgent.name}". ${selectedAgent.systemPrompt}
          Rules:
          - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
          - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
          - User timezone offset: ${new Date().getTimezoneOffset()}
          - ${customPrompt ? `Custom prompt: ${customPrompt}` : ''}`,
      },
      ...chatMessages.map((msg: Message) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: `Context data: ${JSON.stringify(selectedData)}
        User query: ${floatingInput}`,
      },
    ];

    const stream = await openai.chat.completions.create(
      {
        model: model,
        messages: messages,
        stream: true,
      },
      {
        // signal: signal,
      }
    );

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
    }

    return { response: fullResponse };
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    throw new Error('Failed to generate AI response');
  }
}
