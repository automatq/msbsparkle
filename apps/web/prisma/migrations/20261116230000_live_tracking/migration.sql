-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "arrivingNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "etaAt" TIMESTAMP(3),
ADD COLUMN     "etaUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLng" DOUBLE PRECISION,
ADD COLUMN     "lastLocationAt" TIMESTAMP(3),
ADD COLUMN     "lateNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "trackingToken" TEXT;

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPing_assignmentId_recordedAt_idx" ON "LocationPing"("assignmentId", "recordedAt");

-- CreateIndex
CREATE INDEX "LocationPing_recordedAt_idx" ON "LocationPing"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_trackingToken_key" ON "Assignment"("trackingToken");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

