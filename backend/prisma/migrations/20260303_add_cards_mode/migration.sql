-- CreateEnum
CREATE TYPE "TestKind" AS ENUM ('QUIZ', 'CARDS');

-- CreateEnum
CREATE TYPE "CardSide" AS ENUM ('LEFT', 'RIGHT');

-- AlterTable
ALTER TABLE "Test" ADD COLUMN "kind" "TestKind" NOT NULL DEFAULT 'QUIZ';
ALTER TABLE "Test" ADD COLUMN "cardLeftLabel" TEXT;
ALTER TABLE "Test" ADD COLUMN "cardRightLabel" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "explanation" TEXT;
ALTER TABLE "Question" ADD COLUMN "cardCorrectSide" "CardSide";
