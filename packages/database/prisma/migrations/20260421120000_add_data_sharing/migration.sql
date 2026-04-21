-- CreateTable
CREATE TABLE "seedbook"."data_share" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seedbook"."data_share_acceptance" (
    "id" UUID NOT NULL,
    "shareId" UUID NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_share_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_share_code_key" ON "seedbook"."data_share"("code");

-- CreateIndex
CREATE INDEX "data_share_ownerUserId_idx" ON "seedbook"."data_share"("ownerUserId");

-- CreateIndex
CREATE INDEX "data_share_acceptance_recipientUserId_idx" ON "seedbook"."data_share_acceptance"("recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "data_share_acceptance_shareId_recipientUserId_key" ON "seedbook"."data_share_acceptance"("shareId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "seedbook"."data_share" ADD CONSTRAINT "data_share_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seedbook"."data_share_acceptance" ADD CONSTRAINT "data_share_acceptance_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "seedbook"."data_share"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seedbook"."data_share_acceptance" ADD CONSTRAINT "data_share_acceptance_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
