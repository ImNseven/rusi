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

async function generateUniqueShortCode() {
  for (let i = 0; i < 30; i += 1) {
    const code = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const exists = await prisma.testAccessLink.findFirst({
      where: { token: { startsWith: `${code}-` } },
      select: { id: true }
    });
    if (!exists) return code;
  }

  throw new Error("Unable to generate unique short code");
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
      kind: t.kind,
      isPublic: t.isPublic,
      allowMultipleAttempts: t.allowMultipleAttempts,
      questionCount: t.questions.length,
      bestAttempt,
      directLink: `/test/${t.id}`
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
  if (test.kind === "CARDS") {
    test.questions = test.questions.map((q) => ({
      ...q,
      options: [
        { id: "LEFT", text: test.cardLeftLabel || "Левый вариант" },
        { id: "RIGHT", text: test.cardRightLabel || "Правый вариант" }
      ]
    }));
  }
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
  const testPayload =
    link.test.kind === "CARDS"
      ? {
          ...link.test,
          questions: link.test.questions.map((q) => ({
            ...q,
            options: [
              { id: "LEFT", text: link.test.cardLeftLabel || "Левый вариант" },
              { id: "RIGHT", text: link.test.cardRightLabel || "Правый вариант" }
            ]
          }))
        }
      : link.test;

  return res.json({ linkId: link.id, test: testPayload });
});

router.post("/access-code", requireAuth, async (req, res) => {
  const schema = z.object({
    code: z.string().regex(/^\d{5}$/)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Code must contain exactly 5 digits" });

  const link = await prisma.testAccessLink.findFirst({
    where: { token: { startsWith: `${parsed.data.code}-` } },
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
    },
    orderBy: { createdAt: "desc" }
  });

  if (!link) return res.status(404).json({ error: "Код не найден" });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return res.status(410).json({ error: "Срок действия кода истек" });
  }
  if (link.maxUses && link.uses.length >= link.maxUses) {
    return res.status(403).json({ error: "Этот код уже использован" });
  }

  const testPayload =
    link.test.kind === "CARDS"
      ? {
          ...link.test,
          questions: link.test.questions.map((q) => ({
            ...q,
            options: [
              { id: "LEFT", text: link.test.cardLeftLabel || "Левый вариант" },
              { id: "RIGHT", text: link.test.cardRightLabel || "Правый вариант" }
            ]
          }))
        }
      : link.test;

  return res.json({
    token: link.token,
    test: testPayload
  });
});

router.post("/:id/check-answer", requireAuth, async (req, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    answer: z.string().min(1),
    accessToken: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { questionId, answer, accessToken } = parsed.data;
  const test = await prisma.test.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        include: {
          options: true
        }
      }
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

  const question = test.questions.find((q) => q.id === questionId);
  if (!question) return res.status(400).json({ error: "Question does not belong to this test" });
  if (test.kind === "CARDS") {
    const selectedSide = answer === "LEFT" || answer === "RIGHT" ? answer : null;
    if (!selectedSide) return res.status(400).json({ error: "Invalid answer side" });
    const isCorrect = selectedSide === question.cardCorrectSide;
    return res.json({
      isCorrect,
      correctAnswer: question.cardCorrectSide,
      explanation: question.explanation || null
    });
  }

  const selectedOption = question.options.find((o) => o.id === answer);
  if (!selectedOption) return res.status(400).json({ error: "Option does not belong to this question" });
  const correctOption = question.options.find((o) => o.isCorrect);
  return res.json({
    isCorrect: Boolean(selectedOption.isCorrect),
    correctAnswer: correctOption?.id || null,
    explanation: question.explanation || null
  });
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
    const isCorrect =
      test.kind === "CARDS"
        ? selectedOptionId === q.cardCorrectSide
        : Boolean(q.options.find((o) => o.id === selectedOptionId)?.isCorrect);
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
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: {
      id: true,
      telegramId: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true
    }
  });

  const attempts = await prisma.attempt.findMany({
    where: { userId: req.user.sub },
    include: { test: { select: { id: true, title: true, isPublic: true, kind: true } } },
    orderBy: { createdAt: "desc" }
  });

  const publicBestMap = new Map();
  const privateAttemptMap = new Map();
  for (const at of attempts) {
    if (at.test.isPublic) {
      const prevPublic = publicBestMap.get(at.testId);
      if (
        !prevPublic ||
        at.grade > prevPublic.grade ||
        (at.grade === prevPublic.grade && at.percent > prevPublic.percent)
      ) {
        publicBestMap.set(at.testId, at);
      }
      continue;
    }

    // Private tests are solved once by design, so we keep the latest recorded attempt.
    if (!privateAttemptMap.has(at.testId)) {
      privateAttemptMap.set(at.testId, at);
    }
  }

  const profileTests = [...publicBestMap.values(), ...privateAttemptMap.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((at) => ({
      testId: at.testId,
      testTitle: at.test.title,
      kind: at.test.kind,
      isPublic: at.test.isPublic,
      grade: at.grade,
      percent: at.percent,
      passedAt: at.createdAt
    }));

  return res.json({
    user: user
      ? {
          id: user.id,
          telegramId: user.telegramId.toString(),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      : null,
    attempts,
    profileTests,
    bestByTest: [...publicBestMap.values()].map((at) => ({
      testId: at.testId,
      testTitle: at.test.title,
      grade: at.grade,
      percent: at.percent
    }))
  }
  );
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
  if (test.createdById !== req.user.sub) return res.status(403).json({ error: "Forbidden" });

  const shortCode = await generateUniqueShortCode();
  const token = `${shortCode}-${crypto.randomBytes(24).toString("hex")}`;
  const link = await prisma.testAccessLink.create({
    data: {
      testId,
      token,
      maxUses: 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    }
  });

  return res.json({ token: link.token, shortCode, directLink: `/access/${link.token}` });
});

export default router;

