import type {
  AdminAiPrompt,
  AiFeatureCard,
  AiPromptFeature,
  AiPromptStatus,
  CreateAiPromptInput,
  ListAdminAiPromptsQuery,
  UpdateAiPromptInput,
} from '@momentum/types';
import type {
  AiPrompt,
  AiPromptFeature as DbFeature,
  AiPromptStatus as DbStatus,
} from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_AI_PROMPTS, defaultPromptFor } from './ai-prompt.defaults.js';

const FEATURE_TO_DB: Record<AiPromptFeature, DbFeature> = {
  chat: 'CHAT',
  generate_habit: 'GENERATE_HABIT',
  create_habit: 'CREATE_HABIT',
  suggestions: 'SUGGESTIONS',
  habit_message: 'HABIT_MESSAGE',
};

const FEATURE_FROM_DB: Record<DbFeature, AiPromptFeature> = {
  CHAT: 'chat',
  GENERATE_HABIT: 'generate_habit',
  CREATE_HABIT: 'create_habit',
  SUGGESTIONS: 'suggestions',
  HABIT_MESSAGE: 'habit_message',
};

const STATUS_TO_DB: Record<AiPromptStatus, DbStatus> = {
  draft: 'DRAFT',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
};

const STATUS_FROM_DB: Record<DbStatus, AiPromptStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export type ResolvedAiPrompt = {
  slug: string;
  body: string;
  source: 'admin' | 'default';
};

function toAdminPrompt(row: AiPrompt): AdminAiPrompt {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    feature: FEATURE_FROM_DB[row.feature],
    body: row.body,
    status: STATUS_FROM_DB[row.status],
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

export async function resolvePrompt(feature: AiPromptFeature): Promise<ResolvedAiPrompt> {
  const published = await prisma.aiPrompt.findFirst({
    where: { feature: FEATURE_TO_DB[feature], status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
  });

  if (published) {
    return { slug: published.slug, body: published.body, source: 'admin' };
  }

  const fallback = defaultPromptFor(feature);
  return { slug: fallback.slug, body: fallback.body, source: 'default' };
}

export async function listPublishedFeatures(): Promise<AiFeatureCard[]> {
  const published = await prisma.aiPrompt.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const byFeature = new Map<AiPromptFeature, AiFeatureCard>();
  for (const row of published) {
    const feature = FEATURE_FROM_DB[row.feature];
    if (!byFeature.has(feature)) {
      byFeature.set(feature, {
        feature,
        slug: row.slug,
        name: row.name,
        description: row.description ?? '',
      });
    }
  }

  return DEFAULT_AI_PROMPTS.map((prompt) => {
    return (
      byFeature.get(prompt.feature) ?? {
        feature: prompt.feature,
        slug: prompt.slug,
        name: prompt.name,
        description: prompt.description,
      }
    );
  });
}

async function assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
  const existing = await prisma.aiPrompt.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (existing) {
    throw AppError.conflict('A prompt with this slug already exists');
  }
}

async function getPromptOrThrow(id: string): Promise<AiPrompt> {
  const prompt = await prisma.aiPrompt.findUnique({ where: { id } });
  if (!prompt) throw AppError.notFound('Prompt not found');
  return prompt;
}

export async function listAdminPrompts(query: ListAdminAiPromptsQuery): Promise<AdminAiPrompt[]> {
  const rows = await prisma.aiPrompt.findMany({
    where: {
      ...(query.feature ? { feature: FEATURE_TO_DB[query.feature] } : {}),
      ...(query.status !== 'all' ? { status: STATUS_TO_DB[query.status] } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toAdminPrompt);
}

export async function getAdminPrompt(id: string): Promise<AdminAiPrompt> {
  return toAdminPrompt(await getPromptOrThrow(id));
}

export async function createPrompt(
  userId: string,
  input: CreateAiPromptInput,
): Promise<AdminAiPrompt> {
  await assertSlugAvailable(input.slug);
  const created = await prisma.aiPrompt.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      feature: FEATURE_TO_DB[input.feature],
      body: input.body,
      sortOrder: input.sortOrder ?? 0,
      createdById: userId,
      updatedById: userId,
    },
  });
  return toAdminPrompt(created);
}

export async function updatePrompt(
  userId: string,
  id: string,
  input: UpdateAiPromptInput,
): Promise<AdminAiPrompt> {
  const existing = await getPromptOrThrow(id);
  if (input.slug && input.slug !== existing.slug) {
    await assertSlugAvailable(input.slug, existing.id);
  }

  const updated = await prisma.aiPrompt.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.feature !== undefined ? { feature: FEATURE_TO_DB[input.feature] } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedById: userId,
    },
  });
  return toAdminPrompt(updated);
}

export async function publishPrompt(userId: string, id: string): Promise<AdminAiPrompt> {
  const existing = await getPromptOrThrow(id);

  const published = await prisma.$transaction(async (tx) => {
    await tx.aiPrompt.updateMany({
      where: {
        feature: existing.feature,
        status: 'PUBLISHED',
        id: { not: id },
      },
      data: { status: 'DRAFT', publishedAt: null },
    });

    return tx.aiPrompt.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        updatedById: userId,
      },
    });
  });

  return toAdminPrompt(published);
}

export async function archivePrompt(userId: string, id: string): Promise<AdminAiPrompt> {
  await getPromptOrThrow(id);
  const archived = await prisma.aiPrompt.update({
    where: { id },
    data: { status: 'ARCHIVED', publishedAt: null, updatedById: userId },
  });
  return toAdminPrompt(archived);
}

export async function deletePrompt(id: string): Promise<void> {
  const existing = await getPromptOrThrow(id);
  if (existing.status === 'PUBLISHED') {
    throw AppError.conflict('Archive the prompt before deleting it');
  }
  await prisma.aiPrompt.delete({ where: { id } });
}
