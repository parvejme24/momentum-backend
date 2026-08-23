import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export async function revokeSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function assertNotSelf(actorId: string, targetId: string, action: string): void {
  if (actorId === targetId) {
    throw AppError.conflict(`You cannot ${action} your own account`);
  }
}

export async function assertNotLastLiveAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || user.role !== 'ADMIN') return;

  const otherLiveAdmins = await prisma.user.count({
    where: {
      id: { not: userId },
      role: 'ADMIN',
      deletedAt: null,
      bannedAt: null,
    },
  });

  if (otherLiveAdmins === 0) {
    throw AppError.conflict('Cannot modify the last active admin');
  }
}
