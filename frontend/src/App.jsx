import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, getTelegramInitData } from "./api";

import { AdminStatsPage, AdminUserStatsPage } from "./AdminPages";
import { getShareLink } from "./utils";
import { SwipeableCard } from "./SwipeableCard";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "";

function displayName(user) {
  return user.firstName || user.username || `id${user.telegramId}`;
}

function typeLabel(kind) {
  return kind === "CARDS" ? "Карточки" : "Тест";
}

async function copyText(value) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("input");
  input.value = value;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function extractStartTarget(initData) {
  if (!initData) return "";
  const params = new URLSearchParams(initData);
  const raw = params.get("start_param");
  if (!raw) return "";
  try {
    const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.startsWith("/") ? decoded : `/${decoded}`;
  } catch(e) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function useSession() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startTarget, setStartTarget] = useState("");

  useEffect(() => {
    const initData = getTelegramInitData();
    setStartTarget(extractStartTarget(initData));
    const token = localStorage.getItem("token");

    if (token) {
      const cached = localStorage.getItem("user");
      if (cached) {
        setUser(JSON.parse(cached));
        setLoading(false);
        return;
      }
    }

    if (!initData) {
      setError("Открой WebApp из Telegram бота, чтобы авторизоваться.");
      setLoading(false);
      return;
    }

    api("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData })
    })
      .then((data) => {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, error, startTarget };
}

function Shell({ user, startTarget }) {
  const [activeTab, setActiveTab] = useState("tests");
  const navigate = useNavigate();

  const tabs = [
    { key: "tests", label: "Тесты" },
    { key: "find", label: "Найти тест" },
    { key: "profile", label: "Мой профиль" }
  ];
  if (user.role === "ADMIN") tabs.push({ key: "add", label: "Добавить" });

  useEffect(() => {
    if (startTarget) {
      navigate(startTarget);
    }
  }, [startTarget, navigate]);

  return (
    <div className="appShell">
      <main className="contentArea">
        {activeTab === "tests" && <TestsTab />}
        {activeTab === "find" && <FindTestTab />}
        {activeTab === "profile" && <ProfileTab user={user} />}
        {activeTab === "add" && user.role === "ADMIN" && <AddTestTab />}
      </main>

      <nav className="bottomTabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "tabBtn active" : "tabBtn"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TestsTab() {
  const [tests, setTests] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api("/tests")
      .then(setTests)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section>
      <h2>Доступные наборы</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="cardList">
        {tests.map((test) => (
          <article className="card" key={test.id}>
            <div className="rowBetween">
              <h3>{test.title}</h3>
              <span className="kindBadge">{typeLabel(test.kind)}</span>
            </div>
            <p className="mutedText">{test.description || "Без описания"}</p>
            <div className="metaList">
              <p>Элементов: {test.questionCount}</p>
              <p>Лучшая оценка: {test.bestAttempt ? `${test.bestAttempt.grade}/10` : "пока нет"}</p>
            </div>
            <button className="primaryBtn" onClick={() => navigate(`/test/${test.id}`)}>
              Начать
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function FindTestTab() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{5}$/.test(code)) {
      setError("Введите 5-значный код");
      return;
    }

    setLoading(true);
    try {
      const data = await api("/tests/access-code", {
        method: "POST",
        body: JSON.stringify({ code })
      });
      navigate(`/access/${data.token}`);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Найти по коду</h2>
      <form className="card" onSubmit={onSubmit}>
        <label className="labelText">
          Код
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="12345"
            inputMode="numeric"
          />
        </label>
        {error && <p className="errorText">{error}</p>}
        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "Проверяем..." : "Открыть"}
        </button>
      </form>
    </section>
  );
}

function ProfileTab({ user }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [adminTests, setAdminTests] = useState([]);
  const [error, setError] = useState("");
  const [links, setLinks] = useState({});
  const [selectedStats, setSelectedStats] = useState(null);
  const [selectedUserStats, setSelectedUserStats] = useState(null);

  useEffect(() => {
    api("/tests/me/results")
      .then(setData)
      .catch((e) => setError(e.message));

    if (user.role === "ADMIN") {
      api("/admin/tests")
        .then(setAdminTests)
        .catch((e) => setError(e.message));
    }
  }, [user.role]);

  async function makeLink(test) {
    if (test.isPublic) {
      setLinks((prev) => ({ ...prev, [test.id]: { url: getShareLink(`/test/${test.id}`) } }));
      return;
    }

    const data = await api("/tests/admin/create-link", {
      method: "POST",
      body: JSON.stringify({ testId: test.id })
    });
    const url = getShareLink(`/access/${data.token}`);
    setLinks((prev) => ({ ...prev, [test.id]: { url, code: data.shortCode } }));
  }

  async function loadStats(test) {
    navigate(`/admin/tests/${test.id}/stats`);
  }

  return (
    <section>
      <h2>Мой профиль</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="card">
        <h3>{displayName(user)}</h3>
      </div>

      <h3 className="blockTitle">Пройдено</h3>
      {!data ? (
        <p className="mutedText">Загрузка...</p>
      ) : data.profileTests.length === 0 ? (
        <p className="mutedText">Пока нет прохождений</p>
      ) : (
        <div className="cardList">
          {data.profileTests.map((item) => (
            <article className="card" key={item.testId}>
              <div className="rowBetween">
                <h3>{item.testTitle}</h3>
                <span className="kindBadge">{typeLabel(item.kind)}</span>
              </div>
              <p>{item.isPublic ? "Лучшая оценка" : "Оценка"}: {item.grade}/10</p>
            </article>
          ))}
        </div>
      )}

      {user.role === "ADMIN" && (
        <>
          <h3 className="blockTitle">Мои наборы</h3>
          <div className="cardList">
            {adminTests.map((test) => (
              <article className="card" key={test.id}>
                <div className="rowBetween">
                  <h3>{test.title}</h3>
                  <span className="kindBadge">{typeLabel(test.kind)}</span>
                </div>
                <div className="buttonRow">
                  <button className="secondaryBtn" onClick={() => makeLink(test)}>
                    Ссылка
                  </button>
                  <button className="secondaryBtn" onClick={() => navigate(`/admin/tests/${test.id}/edit`)}>
                    Редактировать
                  </button>
                  <button className="secondaryBtn" onClick={() => loadStats(test)}>
                    Статистика
                  </button>
                </div>
                {links[test.id] && (
                  <button
                    className="linkCopyBtn"
                    type="button"
                    onClick={() =>
                      copyText(links[test.id].url).catch(() => setError("Не удалось скопировать ссылку"))
                    }
                  >
                    {links[test.id].url}
                    {links[test.id].code ? ` (код ${links[test.id].code})` : ""}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function defaultGradeRules() {
  return [
    { minPercent: 0, grade: 2 },
    { minPercent: 50, grade: 5 },
    { minPercent: 70, grade: 7 },
    { minPercent: 90, grade: 9 },
    { minPercent: 100, grade: 10 }
  ];
}

function makeDraft() {
  return {
    kind: "QUIZ",
    title: "",
    description: "",
    isPublic: true,
    allowMultipleAttempts: true,
    cardLeftLabel: "",
    cardRightLabel: "",
    questions: [{ text: "", explanation: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }],
    gradeRules: defaultGradeRules()
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeDraft(draft) {
  const base = {
    kind: draft.kind,
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    isPublic: draft.isPublic,
    allowMultipleAttempts: draft.isPublic ? true : draft.allowMultipleAttempts,
    gradeRules: draft.gradeRules
  };

  if (draft.kind === "CARDS") {
    return {
      ...base,
      cardLeftLabel: draft.cardLeftLabel.trim(),
      cardRightLabel: draft.cardRightLabel.trim(),
      questions: draft.questions.map((q) => ({
        text: q.text.trim(),
        explanation: q.explanation?.trim() || undefined,
        correctSide: q.correctSide || "LEFT"
      }))
    };
  }

  return {
    ...base,
    questions: draft.questions.map((q) => ({
      text: q.text.trim(),
      explanation: q.explanation?.trim() || undefined,
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })).filter((o) => o.text)
    }))
  };
}

function TestForm({ onSubmit, submitText, initialDraft = null, resetOnSuccess = true }) {
  const [draft, setDraft] = useState(initialDraft || makeDraft());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialDraft) {
      setDraft(clone(initialDraft));
    }
  }, [initialDraft]);

  function setQuestion(idx, updater) {
    setDraft((prev) => {
      const next = clone(prev);
      updater(next.questions[idx]);
      return next;
    });
  }

  function addQuestion() {
    setDraft((prev) => {
      const next = clone(prev);
      if (next.kind === "CARDS") {
        next.questions.push({ text: "", explanation: "", correctSide: "LEFT" });
      } else {
        next.questions.push({
          text: "",
          explanation: "",
          options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }]
        });
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const payload = normalizeDraft(draft);

    if (!payload.title) {
      setError("Введите название");
      return;
    }

    if (payload.kind === "CARDS") {
      const invalid = !payload.cardLeftLabel || !payload.cardRightLabel || payload.questions.some((q) => !q.text);
      if (invalid) {
        setError("Для карточек заполните подписи лево/право и слова");
        return;
      }
    } else {
      const invalid = payload.questions.some(
        (q) => !q.text || q.options.length < 2 || !q.options.some((o) => o.isCorrect)
      );
      if (invalid) {
        setError("Для теста заполните вопросы и варианты");
        return;
      }
    }

    setSaving(true);
    try {
      await onSubmit(payload);
      if (resetOnSuccess) {
        setDraft(makeDraft());
      }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cardList" onSubmit={submit}>
      <article className="card">
        <div className="buttonRow">
          <button
            className={draft.kind === "QUIZ" ? "primaryBtn" : "secondaryBtn"}
            type="button"
            onClick={() => setDraft((p) => ({ ...p, kind: "QUIZ", questions: [{ text: "", explanation: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }] }))}
          >
            Добавить тест
          </button>
          <button
            className={draft.kind === "CARDS" ? "primaryBtn" : "secondaryBtn"}
            type="button"
            onClick={() => setDraft((p) => ({ ...p, kind: "CARDS", questions: [{ text: "", explanation: "", correctSide: "LEFT" }] }))}
          >
            Добавить карточки
          </button>
        </div>

        <label className="labelText">
          Название
          <input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
        </label>
        <label className="labelText">
          Описание
          <textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} rows={2} />
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(e) => setDraft((p) => ({ ...p, isPublic: e.target.checked, allowMultipleAttempts: e.target.checked ? true : p.allowMultipleAttempts }))}
          />
          Публичный
        </label>
      </article>

      {draft.kind === "CARDS" && (
        <article className="card">
          <label className="labelText">
            Левый вариант
            <input value={draft.cardLeftLabel} onChange={(e) => setDraft((p) => ({ ...p, cardLeftLabel: e.target.value }))} />
          </label>
          <label className="labelText">
            Правый вариант
            <input value={draft.cardRightLabel} onChange={(e) => setDraft((p) => ({ ...p, cardRightLabel: e.target.value }))} />
          </label>
        </article>
      )}

      {draft.questions.map((q, qIdx) => (
        <article className="card" key={`q-${qIdx}`}>
          <label className="labelText">
            {draft.kind === "CARDS" ? `Карточка ${qIdx + 1}` : `Вопрос ${qIdx + 1}`}
            <input value={q.text} onChange={(e) => setQuestion(qIdx, (item) => { item.text = e.target.value; })} />
          </label>

          <label className="labelText">
            Объяснение
            <textarea value={q.explanation || ""} onChange={(e) => setQuestion(qIdx, (item) => { item.explanation = e.target.value; })} rows={2} />
          </label>

          {draft.kind === "CARDS" ? (
            <div className="buttonRow">
              <button
                type="button"
                className={q.correctSide === "LEFT" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setQuestion(qIdx, (item) => { item.correctSide = "LEFT"; })}
              >
                Верно слева
              </button>
              <button
                type="button"
                className={q.correctSide === "RIGHT" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setQuestion(qIdx, (item) => { item.correctSide = "RIGHT"; })}
              >
                Верно справа
              </button>
            </div>
          ) : (
            <>
              {q.options.map((opt, oIdx) => (
                <div className="optionRow" key={`o-${oIdx}`}>
                  <input
                    value={opt.text}
                    onChange={(e) => setQuestion(qIdx, (item) => { item.options[oIdx].text = e.target.value; })}
                    placeholder={`Вариант ${oIdx + 1}`}
                  />
                  <label className="checkRow">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={opt.isCorrect}
                      onChange={() =>
                        setQuestion(qIdx, (item) => {
                          item.options = item.options.map((x, idx) => ({ ...x, isCorrect: idx === oIdx }));
                        })
                      }
                    />
                    Верный
                  </label>
                </div>
              ))}
              <button
                className="secondaryBtn"
                type="button"
                onClick={() => setQuestion(qIdx, (item) => { if (item.options.length < 5) item.options.push({ text: "", isCorrect: false }); })}
              >
                + Вариант
              </button>
            </>
          )}
        </article>
      ))}

      <button className="secondaryBtn" type="button" onClick={addQuestion}>
        + {draft.kind === "CARDS" ? "Карточка" : "Вопрос"}
      </button>

      {error && <p className="errorText">{error}</p>}
      <button className="primaryBtn" type="submit" disabled={saving}>
        {saving ? "Сохраняем..." : submitText}
      </button>
    </form>
  );
}

function AddTestTab() {
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  async function create(payload) {
    const created = await api("/admin/tests", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    let text = "Набор создан";
    let generatedLink = getShareLink(`/test/${created.id}`);

    if (!payload.isPublic) {
      const access = await api("/tests/admin/create-link", {
        method: "POST",
        body: JSON.stringify({ testId: created.id })
      });
      generatedLink = getShareLink(`/access/${access.token}`);
      text = `Приватный набор создан, код ${access.shortCode}`;
    }

    setMessage(text);
    setLink(generatedLink);
  }

  return (
    <section>
      <h2>Добавить</h2>
      {message && <p className="okText">{message}</p>}
      {link && (
        <button className="linkCopyBtn" type="button" onClick={() => copyText(link).catch(() => setMessage("Не удалось скопировать"))}>
          Ссылка: {link} (нажми, чтобы скопировать)
        </button>
      )}
      <TestForm onSubmit={create} submitText="Сохранить" />
    </section>
  );
}

function mapTestToDraft(test) {
  if (test.kind === "CARDS") {
    return {
      kind: "CARDS",
      title: test.title || "",
      description: test.description || "",
      isPublic: test.isPublic,
      allowMultipleAttempts: test.allowMultipleAttempts,
      cardLeftLabel: test.cardLeftLabel || "",
      cardRightLabel: test.cardRightLabel || "",
      questions: test.questions.map((q) => ({
        text: q.text,
        explanation: q.explanation || "",
        correctSide: q.cardCorrectSide || "LEFT"
      })),
      gradeRules: test.gradeRules || defaultGradeRules()
    };
  }

  return {
    kind: "QUIZ",
    title: test.title || "",
    description: test.description || "",
    isPublic: test.isPublic,
    allowMultipleAttempts: test.allowMultipleAttempts,
    cardLeftLabel: "",
    cardRightLabel: "",
    questions: test.questions.map((q) => ({
      text: q.text,
      explanation: q.explanation || "",
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
    })),
    gradeRules: test.gradeRules || defaultGradeRules()
  };
}

function QuestionCard({ q, selected, onSelect, checked, feedback }) {
  return (
    <article className="card">
      <h3>{q.text}</h3>
      <div className="answersWrap">
        {q.options.map((option) => {
          let className = "answerOption";
          if (checked && selected === option.id && feedback?.isCorrect) className += " answerBlue";
          if (checked && selected === option.id && !feedback?.isCorrect) className += " answerRed";
          return (
            <label key={option.id} className={className}>
              <input
                type="radio"
                checked={selected === option.id}
                disabled={checked}
                onChange={() => onSelect(option.id)}
              />
              {option.text}
            </label>
          );
        })}
      </div>
    </article>
  );
}

function CardsCard({ q, test, selected, onSelect, checked, feedback }) {
  const leftClass = ["cardChoice", selected === "LEFT" ? "selected" : "", checked && selected === "LEFT" && feedback?.isCorrect ? "answerBlue" : "", checked && selected === "LEFT" && !feedback?.isCorrect ? "answerRed" : ""].join(" ");
  const rightClass = ["cardChoice", selected === "RIGHT" ? "selected" : "", checked && selected === "RIGHT" && feedback?.isCorrect ? "answerBlue" : "", checked && selected === "RIGHT" && !feedback?.isCorrect ? "answerRed" : ""].join(" ");

  return (
    <article className="card">
      <h3>{q.text}</h3>
      <div className="buttonRow">
        <button className={leftClass} onClick={() => onSelect("LEFT")} disabled={checked}>{test.cardLeftLabel}</button>
        <button className={rightClass} onClick={() => onSelect("RIGHT")} disabled={checked}>{test.cardRightLabel}</button>
      </div>
    </article>
  );
}

function SolveFlow({ test, accessToken }) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState({});
  const [checkedByQuestion, setCheckedByQuestion] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const questions = test.questions || [];
  const currentQuestion = questions[currentIndex];
  const selected = currentQuestion ? answers[currentQuestion.id] : "";
  const checked = currentQuestion ? Boolean(checkedByQuestion[currentQuestion.id]) : false;
  const solved = Object.keys(checkedByQuestion).length;
  const isLast = currentIndex === questions.length - 1;

  async function checkAnswer(forcedAnswer) {
    const ans = forcedAnswer || selected;
    if (!ans) {
      setError("Выберите ответ");
      return;
    }
    setError("");

    if (forcedAnswer) {
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: forcedAnswer }));
    }

    const response = await api(`/tests/${test.id}/check-answer`, {
      method: "POST",
      body: JSON.stringify({
        questionId: currentQuestion.id,
        answer: ans,
        accessToken
      })
    });

    setFeedback(response);
    setCheckedByQuestion((prev) => ({ ...prev, [currentQuestion.id]: true }));
  }

  async function finish() {
    const payload = questions
      .map((q) => ({ questionId: q.id, optionId: answers[q.id] }))
      .filter((a) => a.optionId);

    const res = await api(`/tests/${test.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload, accessToken })
    });
    setResult(res);
  }

  if (result) {
    return (
      <article className="card">
        <h2>Результат: {result.grade}/10</h2>
        <p>Решено: {result.correctCount} из {result.totalQuestions}</p>
        <button className="primaryBtn" onClick={() => navigate("/")}>К списку</button>
      </article>
    );
  }

  return (
    <>
      <article className="card"><p>Решено: {solved} из {questions.length}</p></article>

      {test.kind === "CARDS" ? (
        <>
          <SwipeableCard
            key={currentQuestion.id}
            q={currentQuestion}
            test={test}
            disabled={checked}
            onAnswer={(ans) => checkAnswer(ans)}
          />
          {checked && (
            <div className="card" style={{ marginTop: 20 }}>
              <p className={feedback?.isCorrect ? "okText" : "errorText"} style={{ fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}>
                {feedback?.isCorrect ? "Верно!" : "Неверно"}
              </p>
            </div>
          )}
        </>
      ) : (
        <QuestionCard
          q={currentQuestion}
          selected={selected}
          checked={checked}
          feedback={feedback}
          onSelect={(answer) => {
            setFeedback(null);
            setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));
          }}
        />
      )}

      {feedback?.explanation && <p className="explainText">{feedback.explanation}</p>}
      {error && <p className="errorText">{error}</p>}

      {!checked && test.kind !== "CARDS" && <button className="primaryBtn" onClick={() => checkAnswer()}>Проверить</button>}
      {checked && !isLast && (
        <button
          className="primaryBtn"
          style={test.kind === "CARDS" ? { marginTop: 20 } : {}}
          onClick={() => {
            setCurrentIndex((prev) => prev + 1);
            setFeedback(null);
            setError("");
          }}
        >
          Следующая {test.kind === "CARDS" ? "карточка" : "вопрос"}
        </button>
      )}
      {checked && isLast && <button className="primaryBtn" style={test.kind === "CARDS" ? { marginTop: 20 } : {}} onClick={finish}>Посмотреть результаты</button>}
    </>
  );
}

function SolveTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/tests/${id}`)
      .then(setTest)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Загрузка...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">{typeLabel(test.kind)}</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>Назад</button>
      </header>
      <main className="contentArea">
        <SolveFlow test={test} />
      </main>
    </div>
  );
}

function PrivateTestPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/tests/access/${token}`, { method: "POST" })
      .then((data) => setTest(data.test))
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Загрузка...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">{typeLabel(test.kind)} по ссылке</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>Назад</button>
      </header>
      <main className="contentArea">
        <SolveFlow test={test} accessToken={token} />
      </main>
    </div>
  );
}

function AdminEditTestPage({ user }) {
  if (user.role !== "ADMIN") return <Navigate to="/" />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api(`/admin/tests/${id}`)
      .then((data) => setDraft(mapTestToDraft(data)))
      .catch((e) => setError(e.message));
  }, [id]);

  async function save(payload) {
    setError("");
    await api(`/admin/tests/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    setOk("Изменения сохранены");
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Редактирование</p>
          <h1>Набор</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>Назад</button>
      </header>
      <main className="contentArea">
        {error && <p className="errorText">{error}</p>}
        {ok && <p className="okText">{ok}</p>}
        {!draft ? (
          <p className="mutedText">Загрузка...</p>
        ) : (
          <TestForm onSubmit={save} submitText="Сохранить изменения" initialDraft={draft} resetOnSuccess={false} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, error } = useSession();

  if (loading) return <div className="appShell"><p className="mutedText">Проверка авторизации...</p></div>;
  if (!user) return <div className="appShell"><p className="errorText">{error || "Не удалось авторизоваться"}</p></div>;

  return (
    <Routes>
      <Route path="/" element={<Shell user={user} />} />
      <Route path="/test/:id" element={<SolveTestPage />} />
      <Route path="/access/:token" element={<PrivateTestPage />} />
      <Route path="/admin/tests/:id/edit" element={<AdminEditTestPage user={user} />} />
      <Route path="/admin/tests/:id/stats" element={<AdminStatsPage user={user} />} />
      <Route path="/admin/tests/:id/stats/users/:userId" element={<AdminUserStatsPage user={user} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
