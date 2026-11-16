-- CreateTable
CREATE TABLE "ServiceAreaRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "fsa" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAreaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceAreaRequest_fsa_idx" ON "ServiceAreaRequest"("fsa");
