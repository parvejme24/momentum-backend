import { GoogleGenerativeAI } from '@google/generative-ai';
import type { z } from 'zod';
import { env } from './env.js';

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

function getModel() {
  if (!isGeminiConfigured()) return null;
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
}

export async function generateGeminiJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const model = getModel();
  if (!model) return null;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const text = result.response.text();
    const parsed: unknown = JSON.parse(text);
    const validated = schema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export async function generateGeminiText(prompt: string): Promise<string | null> {
  const model = getModel();
  if (!model) return null;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 256,
      },
    });
    const text = result.response.text().trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
