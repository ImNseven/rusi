import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.post("/tests", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    isPublic: z.boolean().default(true),
    allowMultipleAttempts: z.boolean().default(true),
    questions: z.array(
      z.object({
        text: z.string().min(1),
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
      })
    ),
    gradeRules: z.array(
      z.object({
        minPercent: z.number().min(0).max(100),
        grade: z.number().int().min(1).max(10)
      })
    )
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });

  const data = parsed.data;
  if (!data.questions.every((q) => q.options.some((o) => o.isCorrect))) {
    return res.status(400).json({ error: "Each question must contain a correct option" });
  }

  const created = await prisma.test.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      isPublic: data.isPublic,
      allowMultipleAttempts: data.allowMultipleAttempts,
      createdById: req.user.sub,
      questions: {
        create: data.questions.map((q, index) => ({
          text: q.text,
          imageUrl: q.imageUrl ?? null,
          sortOrder: index,
          options: {
            create: q.options
          }
        }))
      },
      gradeRules: {
        create: data.gradeRules
      }
    },
    include: {
      questions: {
        include: {
          options: true
        }
      },
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
      attempts: { select: { id: true, grade: true, percent: true, userId: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(
    tests.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      isPublic: t.isPublic,
      allowMultipleAttempts: t.allowMultipleAttempts,
      questionCount: t.questions.length,
      attemptsCount: t.attempts.length
    }))
  );
});

router.get("/tests/:id", async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: true
        }
      },
      gradeRules: {
        orderBy: { minPercent: "asc" }
      }
    }
  });

  if (!test) return res.status(404).json({ error: "Test not found" });
  if (test.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });
  return res.json(test);
});

router.put("/tests/:id", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    isPublic: z.boolean(),
    allowMultipleAttempts: z.boolean(),
    questions: z
      .array(
        z.object({
          text: z.string().min(1),
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
        })
      )
      .min(1),
    gradeRules: z
      .array(
        z.object({
          minPercent: z.number().min(0).max(100),
          grade: z.number().int().min(1).max(10)
        })
      )
      .min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });

  const current = await prisma.test.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true }
  });
  if (!current) return res.status(404).json({ error: "Test not found" });
  if (current.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });

  const data = parsed.data;
  if (!data.questions.every((q) => q.options.some((o) => o.isCorrect))) {
    return res.status(400).json({ error: "Each question must contain a correct option" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.option.deleteMany({
      where: {
        question: { testId: current.id }
      }
    });
    await tx.question.deleteMany({ where: { testId: current.id } });
    await tx.gradeRule.deleteMany({ where: { testId: current.id } });

    return tx.test.update({
      where: { id: current.id },
      data: {
        title: data.title,
        description: data.description ?? null,
        isPublic: data.isPublic,
        allowMultipleAttempts: data.allowMultipleAttempts,
        questions: {
          create: data.questions.map((q, index) => ({
            text: q.text,
            imageUrl: q.imageUrl ?? null,
            sortOrder: index,
            options: {
              create: q.options
            }
          }))
        },
        gradeRules: {
          create: data.gradeRules
        }
      },
      include: {
        questions: {
          include: { options: true }
        },
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
    const key = at.userId;
    const prev = grouped.get(key);
    if (!prev || at.grade > prev.grade || (at.grade === prev.grade && at.percent > prev.percent)) {
      grouped.set(key, at);
    }
  }

  const bestAttempts = [...grouped.values()];
  const avgGrade =
    bestAttempts.length === 0
      ? 0
      : bestAttempts.reduce((acc, item) => acc + item.grade, 0) / bestAttempts.length;

  return res.json({
    test: {
      id: test.id,
      title: test.title,
      isPublic: test.isPublic
    },
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

