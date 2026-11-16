-- AlterTable
ALTER TABLE "JobPhoto" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobPhoto_jobId_clientId_key" ON "JobPhoto"("jobId", "clientId");

