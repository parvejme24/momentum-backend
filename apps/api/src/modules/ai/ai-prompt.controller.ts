import type {
  CreateAiPromptInput,
  ListAdminAiPromptsQuery,
  UpdateAiPromptInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as aiPromptService from './ai-prompt.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) throw AppError.unauthorized('Authentication required');
  return req.userId;
}

function requireParam(req: Request, key: string): string {
  const raw = req.params[key];
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (!value) throw AppError.notFound('Not found');
  return value;
}

export async function list(req: Request, res: Response): Promise<void> {
  const prompts = await aiPromptService.listAdminPrompts(
    req.query as unknown as ListAdminAiPromptsQuery,
  );
  res.status(200).json({ prompts });
}

export async function get(req: Request, res: Response): Promise<void> {
  const prompt = await aiPromptService.getAdminPrompt(requireParam(req, 'id'));
  res.status(200).json({ prompt });
}

export async function create(req: Request, res: Response): Promise<void> {
  const prompt = await aiPromptService.createPrompt(
    requireUserId(req),
    req.body as CreateAiPromptInput,
  );
  res.status(201).json({ prompt });
}

export async function update(req: Request, res: Response): Promise<void> {
  const prompt = await aiPromptService.updatePrompt(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as UpdateAiPromptInput,
  );
  res.status(200).json({ prompt });
}

export async function publish(req: Request, res: Response): Promise<void> {
  const prompt = await aiPromptService.publishPrompt(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json({ prompt });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const prompt = await aiPromptService.archivePrompt(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json({ prompt });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await aiPromptService.deletePrompt(requireParam(req, 'id'));
  res.status(200).json({ ok: true });
}
