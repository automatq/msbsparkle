-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "allowedOrigin" TEXT,
ADD COLUMN     "apiKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKeyHash_key" ON "Organization"("apiKeyHash");
