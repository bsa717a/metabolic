import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaClientMtime?: number;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

function getPrismaClientMtime(): number {
  try {
    const clientEntry = require.resolve("@prisma/client");
    const generatedClient = path.join(path.dirname(clientEntry), "..", ".prisma", "client", "index.js");
    const entryMtime = fs.statSync(clientEntry).mtimeMs;
    const generatedMtime = fs.existsSync(generatedClient) ? fs.statSync(generatedClient).mtimeMs : 0;
    return Math.max(entryMtime, generatedMtime);
  } catch {
    return 0;
  }
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

function getPrisma(): PrismaClient {
  const clientMtime = getPrismaClientMtime();

  if (
    process.env.NODE_ENV !== "production" &&
    globalForPrisma.prisma &&
    globalForPrisma.prismaClientMtime !== clientMtime
  ) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaClientMtime = undefined;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaClientMtime = clientMtime;
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  }
});
