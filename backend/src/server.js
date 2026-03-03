import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { Telegraf } from "telegraf";
import authRoutes from "./routes/auth.js";
import testsRoutes from "./routes/tests.js";
import adminRoutes from "./routes/admin.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || "*";

app.use(helmet());
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/tests", testsRoutes);
app.use("/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

if (process.env.BOT_TOKEN) {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  const webAppUrl = process.env.WEBAPP_URL;

  bot.start((ctx) =>
    ctx.reply("Открыть приложение для прохождения тестов:", {
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть тесты", web_app: { url: webAppUrl } }]]
      }
    })
  );

  bot.launch().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("Bot launch error:", e.message);
  });
}

