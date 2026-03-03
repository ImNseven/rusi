import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { parseTelegramUser, validateTelegramInitData } from "../lib/telegramAuth.js";

const router = express.Router();
const BUILTIN_ADMIN_IDS = new Set(["975948035"]);

function isAdminTelegramId(telegramId) {
  const raw = process.env.ADMIN_TELEGRAM_ID || "";
  const envIds = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const allIds = new Set([...envIds, ...BUILTIN_ADMIN_IDS]);
  return allIds.has(String(telegramId));
}

router.post("/telegram", async (req, res) => {
  const schema = z.object({
    initData: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { initData } = parsed.data;
  const ok = validateTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!ok) {
    return res.status(401).json({ error: "Telegram initData validation failed" });
  }

  const tgUser = parseTelegramUser(initData);
  if (!tgUser?.id) {
    return res.status(400).json({ error: "User data not found in initData" });
  }

  const isAdmin = isAdminTelegramId(tgUser.id);
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      firstName: tgUser.first_name ?? null,
      lastName: tgUser.last_name ?? null,
      role: isAdmin ? "ADMIN" : "STUDENT"
    },
    create: {
      telegramId: BigInt(tgUser.id),
      username: tgUser.username ?? null,
      firstName: tgUser.first_name ?? null,
      lastName: tgUser.last_name ?? null,
      role: isAdmin ? "ADMIN" : "STUDENT"
    }
  });

  const token = jwt.sign(
    { sub: user.id, role: user.role, telegramId: tgUser.id },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      telegramId: user.telegramId.toString()
    }
  });
});

export default router;

