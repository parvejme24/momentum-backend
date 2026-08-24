import type {
  AiChatInput,
  AiCreateHabitInput,
  AiHabitIdeasInput,
  AiHabitMessageInput,
  AiSuggestionsInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as aiService from './ai.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) throw AppError.unauthorized('Authentication required');
  return req.userId;
}

export async function status(req: Request, res: Response): Promise<void> {
  const result = await aiService.getAiStatus(requireUserId(req));
  res.status(200).json(result);
}

export async function features(_req: Request, res: Response): Promise<void> {
  const result = await aiService.getAiFeatures();
  res.status(200).json(result);
}

export async function suggestions(req: Request, res: Response): Promise<void> {
  const result = await aiService.getSuggestions(requireUserId(req), req.body as AiSuggestionsInput);
  res.status(200).json(result);
}

export async function habitIdeas(req: Request, res: Response): Promise<void> {
  const result = await aiService.getHabitIdeas(requireUserId(req), req.body as AiHabitIdeasInput);
  res.status(200).json(result);
}

export async function habitMessage(req: Request, res: Response): Promise<void> {
  const result = await aiService.getHabitMessage(
    requireUserId(req),
    req.body as AiHabitMessageInput,
  );
  res.status(200).json(result);
}

export async function chat(req: Request, res: Response): Promise<void> {
  const result = await aiService.chat(requireUserId(req), req.body as AiChatInput);
  res.status(200).json(result);
}

export async function createHabit(req: Request, res: Response): Promise<void> {
  const result = await aiService.createHabitDraft(
    requireUserId(req),
    req.body as AiCreateHabitInput,
  );
  res.status(200).json(result);
}
