import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type { z } from 'zod';
import { env } from './env.js';

const GEMINI_TIMEOUT_MS = 12_000;

let cachedModel: GenerativeModel | null | undefined;

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

function getModel(): GenerativeModel | null {
  if (!isGeminiConfigured()) return null;
  if (cachedModel) return cachedModel;
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  cachedModel = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
  return cachedModel;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export async function generateGeminiJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const model = getModel();
  if (!model) return null;

  try {
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      }),
      GEMINI_TIMEOUT_MS,
    );

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
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 256,
        },
      }),
      GEMINI_TIMEOUT_MS,
    );
    const text = result.response.text().trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
