DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TestKind') THEN
    CREATE TYPE "TestKind" AS ENUM ('QUIZ', 'CARDS');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CardSide') THEN
    CREATE TYPE "CardSide" AS ENUM ('LEFT', 'RIGHT');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "kind" "TestKind" NOT NULL DEFAULT 'QUIZ';
ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "cardLeftLabel" TEXT;
ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "cardRightLabel" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "explanation" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "cardCorrectSide" "CardSide";
