import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

const quizQuestionSchema = z.object({
  text: z.string().min(1),
  explanation: z.string().optional(),
  imageUrl: z.string().url().optional(),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        isCorrect: z.boolean()
      })
    )
    .min(2)
    .max(5)
});

const cardQuestionSchema = z.object({
  text: z.string().min(1),
  explanation: z.string().optional(),
  imageUrl: z.string().url().optional(),
  correctSide: z.enum(["LEFT", "RIGHT"])
});

const baseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["QUIZ", "CARDS"]).default("QUIZ"),
  cardLeftLabel: z.string().optional(),
  cardRightLabel: z.string().optional(),
  isPublic: z.boolean().default(true),
  allowMultipleAttempts: z.boolean().default(true),
  gradeRules: z
    .array(
      z.object({
        minPercent: z.number().min(0).max(100),
        grade: z.number().int().min(1).max(10)
      })
    )
    .min(1)
});

function validatePayload(input) {
  const parsedBase = baseSchema.safeParse(input);
  if (!parsedBase.success) return parsedBase;

  const data = parsedBase.data;
  if (data.kind === "QUIZ") {
    const schema = baseSchema.extend({
      kind: z.literal("QUIZ"),
      questions: z.array(quizQuestionSchema).min(1)
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return parsed;
    if (!parsed.data.questions.every((q) => q.options.some((o) => o.isCorrect))) {
      return { success: false, error: { issues: [{ message: "Each question must contain a correct option" }] } };
    }
    return parsed;
  }

  const schema = baseSchema.extend({
    kind: z.literal("CARDS"),
    cardLeftLabel: z.string().min(1),
    cardRightLabel: z.string().min(1),
    questions: z.array(cardQuestionSchema).min(1)
  });
  return schema.safeParse(input);
}

function buildQuestionCreate(data) {
  if (data.kind === "CARDS") {
    return data.questions.map((q, index) => ({
      text: q.text,
      explanation: q.explanation ?? null,
      imageUrl: q.imageUrl ?? null,
      cardCorrectSide: q.correctSide,
      sortOrder: index,
      options: {
        create: [
          { text: data.cardLeftLabel, isCorrect: q.correctSide === "LEFT" },
          { text: data.cardRightLabel, isCorrect: q.correctSide === "RIGHT" }
        ]
      }
    }));
  }

  return data.questions.map((q, index) => ({
    text: q.text,
    explanation: q.explanation ?? null,
    imageUrl: q.imageUrl ?? null,
    cardCorrectSide: null,
    sortOrder: index,
    options: {
      create: q.options
    }
  }));
}

router.post("/tests", async (req, res) => {
  const parsed = validatePayload(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });

  const data = parsed.data;
  const created = await prisma.test.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      kind: data.kind,
      cardLeftLabel: data.kind === "CARDS" ? data.cardLeftLabel : null,
      cardRightLabel: data.kind === "CARDS" ? data.cardRightLabel : null,
      isPublic: data.isPublic,
      allowMultipleAttempts: data.allowMultipleAttempts,
      createdById: req.user.sub,
      questions: {
        create: buildQuestionCreate(data)
      },
      gradeRules: {
        create: data.gradeRules
      }
    },
    include: {
      questions: { include: { options: true } },
      gradeRules: true
    }
  });

  return res.status(201).json(created);
});

router.get("/tests", async (req, res) => {
  const tests = await prisma.test.findMany({
    where: { createdById: req.user.sub },
    include: {
      questions: { select: { id: true } },
      attempts: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(
    tests.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      kind: t.kind,
      isPublic: t.isPublic,
      allowMultipleAttempts: t.allowMultipleAttempts,
      questionCount: t.questions.length,
      attemptsCount: t.attempts.length,
      directLink: t.isPublic ? `/test/${t.id}` : null
    }))
  );
});

router.get("/tests/:id", async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { options: true }
      },
      gradeRules: { orderBy: { minPercent: "asc" } }
    }
  });

  if (!test) return res.status(404).json({ error: "Test not found" });
  if (test.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });
  return res.json(test);
});

router.put("/tests/:id", async (req, res) => {
  const parsed = validatePayload(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });

  const current = await prisma.test.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true }
  });
  if (!current) return res.status(404).json({ error: "Test not found" });
  if (current.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });

  const data = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.option.deleteMany({ where: { question: { testId: current.id } } });
    await tx.question.deleteMany({ where: { testId: current.id } });
    await tx.gradeRule.deleteMany({ where: { testId: current.id } });

    return tx.test.update({
      where: { id: current.id },
      data: {
        title: data.title,
        description: data.description ?? null,
        kind: data.kind,
        cardLeftLabel: data.kind === "CARDS" ? data.cardLeftLabel : null,
        cardRightLabel: data.kind === "CARDS" ? data.cardRightLabel : null,
        isPublic: data.isPublic,
        allowMultipleAttempts: data.allowMultipleAttempts,
        questions: { create: buildQuestionCreate(data) },
        gradeRules: { create: data.gradeRules }
      },
      include: {
        questions: { include: { options: true } },
        gradeRules: true
      }
    });
  });

  return res.json(updated);
});

router.get("/tests/:id/stats", async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      attempts: {
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });
  if (!test) return res.status(404).json({ error: "Test not found" });
  if (test.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });

  const grouped = new Map();
  for (const at of test.attempts) {
    const prev = grouped.get(at.userId);
    if (!prev || at.grade > prev.grade || (at.grade === prev.grade && at.percent > prev.percent)) {
      grouped.set(at.userId, at);
    }
  }

  const bestAttempts = [...grouped.values()];
  const avgGrade =
    bestAttempts.length === 0 ? 0 : bestAttempts.reduce((acc, item) => acc + item.grade, 0) / bestAttempts.length;

  return res.json({
    test: { id: test.id, title: test.title, isPublic: test.isPublic },
    attemptsCount: test.attempts.length,
    uniqueUsers: bestAttempts.length,
    avgGrade,
    bestAttemptsByUser: bestAttempts.map((at) => ({
      user: {
        id: at.user.id,
        telegramId: at.user.telegramId.toString(),
        username: at.user.username,
        firstName: at.user.firstName,
        lastName: at.user.lastName
      },
      grade: at.grade,
      percent: at.percent,
      createdAt: at.createdAt
    }))
  });
});

export default router;
