import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { CoachRelationshipStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.appUser;
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    if (!roles.includes(user.role)) return reply.code(403).send({ error: "Insufficient role" });
  };
}

export function isSuperAdmin(actor: { role: Role }) {
  return actor.role === "SUPER_ADMIN";
}

export function isAdmin(actor: { role: Role }) {
  return actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
}

export function isCoach(actor: { role: Role }) {
  return actor.role === "COACH";
}

export async function isAssignedCoach(actor: { id: string; role: Role }, ownerId: string) {
  if (!isCoach(actor)) return false;
  const now = new Date();
  const assignment = await prisma.coachAssignment.findFirst({
    where: {
      userId: ownerId,
      coachId: actor.id,
      status: CoachRelationshipStatus.ACTIVE,
      OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: now } }]
    },
    select: { coachId: true }
  });
  return assignment?.coachId === actor.id;
}

export async function canAccessUser(actor: { id: string; role: Role }, ownerId: string) {
  if (isAdmin(actor) || actor.id === ownerId) return true;
  return isAssignedCoach(actor, ownerId);
}

export async function canEditOwnOrAssigned(actor: { id: string; role: Role }, ownerId: string) {
  return canAccessUser(actor, ownerId);
}

export async function canAccessProgramClient(
  actor: { id: string; role: Role },
  clientUserId: string,
  programCoachId?: string | null
) {
  if (await canAccessUser(actor, clientUserId)) return true;
  return programCoachId === actor.id;
}
