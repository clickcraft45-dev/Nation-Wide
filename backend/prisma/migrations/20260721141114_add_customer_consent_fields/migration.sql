/*
  Warnings:

  - Added the required column `consent_given_at` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consent_source` to the `customers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "consent_given_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "consent_source" TEXT NOT NULL;
