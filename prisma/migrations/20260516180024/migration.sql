/*
  Warnings:

  - You are about to drop the column `checkedAt` on the `health_checks` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `health_checks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "health_checks" DROP COLUMN "checkedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
