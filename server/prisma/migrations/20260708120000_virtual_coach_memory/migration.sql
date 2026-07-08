-- CreateTable
CREATE TABLE "VirtualCoachMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '[]',
    "sessionSummaries" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VirtualCoachMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VirtualCoachMemory_userId_key" ON "VirtualCoachMemory"("userId");

-- AddForeignKey
ALTER TABLE "VirtualCoachMemory" ADD CONSTRAINT "VirtualCoachMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
