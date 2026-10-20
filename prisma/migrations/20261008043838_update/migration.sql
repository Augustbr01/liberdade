/*
  Warnings:

  - Added the required column `criadoEm` to the `banimento_servidor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "banimento_servidor" ADD COLUMN     "criadoEm" TIMESTAMP(3) NOT NULL;
