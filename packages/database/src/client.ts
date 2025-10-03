import { PrismaClient } from "@prisma/client";

// Avoid creating multiple instances in dev (hot reload)
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}
