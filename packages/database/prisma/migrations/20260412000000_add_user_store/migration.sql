-- CreateTable
CREATE TABLE "seedbook"."user_store" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_store_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "user_store_userId_idx" ON "seedbook"."user_store"("userId");

-- AddForeignKey
ALTER TABLE "seedbook"."user_store" ADD CONSTRAINT "user_store_userId_fkey" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
