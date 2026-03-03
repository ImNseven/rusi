import crypto from "crypto";
import express from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function toBestGrade(rules, percent) {
  const sorted = [...rules].sort((a, b) => a.minPercent - b.minPercent);
  let grade = 0;
  for (const rule of sorted) {
    if (percent >= rule.minPercent) {
      grade = rule.grade;
    }
  }
  return grade;
}

router.get("/", requireAuth, async (req, res) => {
  const tests = await prisma.test.findMany({
    where: { isPublic: true },
    include: {
      questions: { select: { id: true } },
      attempts: {
        where: { userId: req.user.sub },
        select: { grade: true, percent: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const payload = tests.map((t) => {
    const bestAttempt = t.attempts.sort((a, b) => b.grade - a.grade)[0] ?? null;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      isPublic: t.isPublic,
      allowMultipleAttempts: t.allowMultipleAttempts,
      questionCount: t.questions.length,
      bestAttempt
    };
  });

  return res.json(payload);
});

router.get("/:id", requireAuth, async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            select: { id: true, text: true }
          }
        }
      }
    }
  });

  if (!test) return res.status(404).json({ error: "Test not found" });
  if (!test.isPublic) return res.status(403).json({ error: "Use access link for private test" });
  return res.json(test);
});

router.post("/access/:token", requireAuth, async (req, res) => {
  const { token } = req.params;
  const link = await prisma.testAccessLink.findUnique({
    where: { token },
    include: {
      test: {
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
            include: { options: { select: { id: true, text: true } } }
          }
        }
      },
      uses: {
        where: { userId: req.user.sub }
      }
    }
  });

  if (!link) return res.status(404).json({ error: "Access link not found" });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return res.status(410).json({ error: "Access link expired" });
  }
  if (link.maxUses && link.uses.length >= link.maxUses) {
    return res.status(403).json({ error: "Attempt already used for this test link" });
  }
  return res.json({ linkId: link.id, test: link.test });
});

router.post("/:id/submit", requireAuth, async (req, res) => {
  const schema = z.object({
    answers: z.array(
      z.object({
        questionId: z.string().min(1),
        optionId: z.string().min(1)
      })
    ),
    accessToken: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { answers, accessToken } = parsed.data;
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        include: {
          options: true
        }
      },
      gradeRules: true
    }
  });

  if (!test) return res.status(404).json({ error: "Test not found" });

  if (!test.isPublic) {
    if (!accessToken) return res.status(403).json({ error: "Private test requires access link token" });
    const link = await prisma.testAccessLink.findUnique({
      where: { token: accessToken },
      include: { uses: { where: { userId: req.user.sub } } }
    });
    if (!link || link.testId !== test.id) {
      return res.status(403).json({ error: "Invalid access link token" });
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return res.status(410).json({ error: "Access link expired" });
    }
    if (link.maxUses && link.uses.length >= link.maxUses) {
      return res.status(403).json({ error: "Attempt already used for this test link" });
    }
  }

  if (!test.allowMultipleAttempts) {
    const existing = await prisma.attempt.count({
      where: { testId: test.id, userId: req.user.sub }
    });
    if (existing > 0) {
      return res.status(403).json({ error: "Only one attempt allowed for this test" });
    }
  }

  const answerMap = new Map(answers.map((a) => [a.questionId, a.optionId]));
  let correctCount = 0;
  const attemptAnswers = [];

  for (const q of test.questions) {
    const selectedOptionId = answerMap.get(q.id);
    const selectedOption = q.options.find((o) => o.id === selectedOptionId);
    const isCorrect = Boolean(selectedOption?.isCorrect);
    if (isCorrect) correctCount += 1;
    if (selectedOptionId) {
      attemptAnswers.push({
        questionId: q.id,
        optionId: selectedOptionId,
        isCorrect
      });
    }
  }

  const totalQuestions = test.questions.length;
  const percent = totalQuestions === 0 ? 0 : (correctCount / totalQuestions) * 100;
  const grade = toBestGrade(test.gradeRules, percent);

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.attempt.create({
      data: {
        testId: test.id,
        userId: req.user.sub,
        correctCount,
        totalQuestions,
        percent,
        grade,
        answers: {
          create: attemptAnswers
        }
      }
    });

    if (!test.isPublic && accessToken) {
      const link = await tx.testAccessLink.findUnique({ where: { token: accessToken } });
      if (link) {
        await tx.accessUse.upsert({
          where: {
            accessLinkId_userId: {
              accessLinkId: link.id,
              userId: req.user.sub
            }
          },
          update: {},
          create: {
            accessLinkId: link.id,
            userId: req.user.sub
          }
        });
      }
    }

    return created;
  });

  return res.json({
    attemptId: attempt.id,
    correctCount,
    totalQuestions,
    percent,
    grade
  });
});

router.get("/me/results", requireAuth, async (req, res) => {
  const attempts = await prisma.attempt.findMany({
    where: { userId: req.user.sub },
    include: { test: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" }
  });

  const bestMap = new Map();
  for (const at of attempts) {
    const key = at.testId;
    const prev = bestMap.get(key);
    if (!prev || at.grade > prev.grade || (at.grade === prev.grade && at.percent > prev.percent)) {
      bestMap.set(key, at);
    }
  }

  return res.json({
    attempts,
    bestByTest: [...bestMap.values()].map((at) => ({
      testId: at.testId,
      testTitle: attempts.find((x) => x.testId === at.testId)?.test.title,
      grade: at.grade,
      percent: at.percent
    }))
  });
});

router.post("/admin/create-link", requireAuth, async (req, res) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

  const schema = z.object({
    testId: z.string().min(1),
    maxUsesPerUser: z.number().int().min(1).max(1).default(1),
    expiresAt: z.string().datetime().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { testId, expiresAt } = parsed.data;

  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) return res.status(404).json({ error: "Test not found" });

  const token = crypto.randomBytes(24).toString("hex");
  const link = await prisma.testAccessLink.create({
    data: {
      testId,
      token,
      maxUses: 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    }
  });

  return res.json({ token: link.token });
});

export default router;

