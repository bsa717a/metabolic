import { Role } from '@prisma/client';

export class UserDeletionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'UserDeletionError';
  }
}

type Actor = { id: string; role: Role };
type Target = { id: string; role: Role };

export function assertCanDeleteUser({
  actor,
  target,
  superAdminCount
}: {
  actor: Actor;
  target: Target;
  superAdminCount: number;
}) {
  const isSelf = actor.id === target.id;
  const actorIsAdmin = actor.role === Role.SUPER_ADMIN || actor.role === Role.ADMIN;

  if (!isSelf && !actorIsAdmin) {
    throw new UserDeletionError('Insufficient role', 403);
  }

  if (target.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN && !isSelf) {
    throw new UserDeletionError('Only a super admin can delete a super admin', 403);
  }

  if (target.role === Role.SUPER_ADMIN && superAdminCount <= 1) {
    throw new UserDeletionError('Cannot delete the last super admin', 409);
  }
}
