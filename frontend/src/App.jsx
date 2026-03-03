import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, getTelegramInitData } from "./api";

function displayName(user) {
  return user.firstName || user.username || `id${user.telegramId}`;
}

function useSession() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const initData = getTelegramInitData();
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

  return { user, loading, error, setUser };
}

function Shell({ user }) {
  const [activeTab, setActiveTab] = useState("tests");

  const tabs = [
    { key: "tests", label: "Тесты" },
    { key: "find", label: "Найти тест" },
    { key: "profile", label: "Мой профиль" }
  ];

  if (user.role === "ADMIN") {
    tabs.push({ key: "add", label: "Добавить тест" });
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Spelling Tests</p>
          <h1>{displayName(user)}</h1>
        </div>
      </header>

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
      <h2>Публичные тесты</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="cardList">
        {tests.map((test) => (
          <article className="card" key={test.id}>
            <h3>{test.title}</h3>
            <p className="mutedText">{test.description || "Без описания"}</p>
            <div className="metaList">
              <p>Вопросов: {test.questionCount}</p>
              <p>Лучшая оценка: {test.bestAttempt ? `${test.bestAttempt.grade}/10` : "пока нет"}</p>
            </div>
            <button className="primaryBtn" onClick={() => navigate(`/test/${test.id}`)}>
              Решать
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
      <h2>Найти тест</h2>
      <p className="mutedText">Введите 5-значный код, который сгенерировала система.</p>
      <form className="card" onSubmit={onSubmit}>
        <label className="labelText">
          Код теста
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="12345"
            inputMode="numeric"
          />
        </label>
        {error && <p className="errorText">{error}</p>}
        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "Проверяем..." : "Открыть тест"}
        </button>
      </form>
    </section>
  );
}

function ProfileTab({ user }) {
  const [data, setData] = useState(null);
  const [adminTests, setAdminTests] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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

  return (
    <section>
      <h2>Мой профиль</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="card">
        <h3>{displayName(user)}</h3>
        <p className="mutedText">Роль: {user.role === "ADMIN" ? "Админ" : "Ученик"}</p>
      </div>

      <h3 className="blockTitle">Пройденные тесты</h3>
      {!data ? (
        <p className="mutedText">Загрузка...</p>
      ) : data.profileTests.length === 0 ? (
        <p className="mutedText">Вы еще не проходили тесты</p>
      ) : (
        <div className="cardList">
          {data.profileTests.map((item) => (
            <article className="card" key={item.testId}>
              <h3>{item.testTitle}</h3>
              <p>{item.isPublic ? "Публичный тест" : "Непубличный тест"}</p>
              <p>{item.isPublic ? "Лучшая оценка" : "Оценка"}: {item.grade}/10</p>
            </article>
          ))}
        </div>
      )}

      {user.role === "ADMIN" && (
        <>
          <h3 className="blockTitle">Мои созданные тесты</h3>
          <div className="cardList">
            {adminTests.map((test) => (
              <article className="card" key={test.id}>
                <h3>{test.title}</h3>
                <p>{test.isPublic ? "Публичный" : "Непубличный"}</p>
                <button className="secondaryBtn" onClick={() => navigate(`/admin/tests/${test.id}/edit`)}>
                  Редактировать
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function makeDraft() {
  return {
    title: "",
    description: "",
    isPublic: true,
    allowMultipleAttempts: true,
    questions: [
      {
        text: "",
        options: [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false }
        ]
      }
    ],
    gradeRules: [
      { minPercent: 0, grade: 2 },
      { minPercent: 50, grade: 5 },
      { minPercent: 70, grade: 7 },
      { minPercent: 90, grade: 9 },
      { minPercent: 100, grade: 10 }
    ]
  };
}

function normalizeDraft(draft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    isPublic: draft.isPublic,
    allowMultipleAttempts: draft.isPublic ? true : draft.allowMultipleAttempts,
    questions: draft.questions.map((q) => ({
      text: q.text.trim(),
      options: q.options
        .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }))
        .filter((o) => o.text.length > 0)
    })),
    gradeRules: draft.gradeRules
  };
}

function cloneDraft(prev) {
  return JSON.parse(JSON.stringify(prev));
}

function TestForm({ initialValue, submitText, onSubmit }) {
  const [draft, setDraft] = useState(initialValue || makeDraft());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialValue) {
      setDraft(initialValue);
    }
  }, [initialValue]);

  async function submit(e) {
    e.preventDefault();
    setError("");

    const payload = normalizeDraft(draft);
    const invalid = payload.questions.some(
      (q) => q.text.length === 0 || q.options.length < 2 || !q.options.some((o) => o.isCorrect)
    );

    if (!payload.title || invalid) {
      setError("Проверьте название теста, вопросы и варианты ответов");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  function setQuestionText(qIdx, value) {
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.questions[qIdx].text = value;
      return next;
    });
  }

  function setOptionText(qIdx, oIdx, value) {
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.questions[qIdx].options[oIdx].text = value;
      return next;
    });
  }

  function setCorrect(qIdx, oIdx) {
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.questions[qIdx].options = next.questions[qIdx].options.map((opt, idx) => ({
        ...opt,
        isCorrect: idx === oIdx
      }));
      return next;
    });
  }

  function addQuestion() {
    setDraft((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          text: "",
          options: [
            { text: "", isCorrect: true },
            { text: "", isCorrect: false }
          ]
        }
      ]
    }));
  }

  function addOption(qIdx) {
    setDraft((prev) => {
      const next = cloneDraft(prev);
      if (next.questions[qIdx].options.length >= 5) return prev;
      next.questions[qIdx].options.push({ text: "", isCorrect: false });
      return next;
    });
  }

  return (
    <form className="cardList" onSubmit={submit}>
      <article className="card">
        <label className="labelText">
          Название теста
          <input
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
        </label>
        <label className="labelText">
          Описание
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
          />
        </label>
        <label className="checkRow">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                isPublic: e.target.checked,
                allowMultipleAttempts: e.target.checked ? true : prev.allowMultipleAttempts
              }))
            }
          />
          Публичный тест
        </label>
        {!draft.isPublic && (
          <label className="checkRow">
            <input
              type="checkbox"
              checked={draft.allowMultipleAttempts}
              onChange={(e) => setDraft((prev) => ({ ...prev, allowMultipleAttempts: e.target.checked }))}
            />
            Разрешить несколько попыток
          </label>
        )}
      </article>

      {draft.questions.map((q, qIdx) => (
        <article className="card" key={`q-${qIdx}`}>
          <label className="labelText">
            Вопрос {qIdx + 1}
            <input value={q.text} onChange={(e) => setQuestionText(qIdx, e.target.value)} required />
          </label>
          {q.options.map((option, oIdx) => (
            <div className="optionRow" key={`q-${qIdx}-o-${oIdx}`}>
              <input
                value={option.text}
                onChange={(e) => setOptionText(qIdx, oIdx, e.target.value)}
                placeholder={`Вариант ${oIdx + 1}`}
              />
              <label className="checkRow">
                <input
                  type="radio"
                  name={`correct-${qIdx}`}
                  checked={option.isCorrect}
                  onChange={() => setCorrect(qIdx, oIdx)}
                />
                Верный
              </label>
            </div>
          ))}
          <button className="secondaryBtn" type="button" onClick={() => addOption(qIdx)}>
            + Вариант
          </button>
        </article>
      ))}

      <button className="secondaryBtn" type="button" onClick={addQuestion}>
        + Вопрос
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
  const [newCode, setNewCode] = useState("");

  async function createTest(payload) {
    const created = await api("/admin/tests", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!payload.isPublic) {
      const access = await api("/tests/admin/create-link", {
        method: "POST",
        body: JSON.stringify({ testId: created.id })
      });
      setNewCode(access.shortCode || "");
      setMessage("Непубличный тест создан. Доступ только по 5-значному коду.");
      return;
    }

    setNewCode("");
    setMessage("Публичный тест создан");
  }

  return (
    <section>
      <h2>Добавить тест</h2>
      {message && <p className="okText">{message}</p>}
      {newCode && <p className="codeBadge">Код: {newCode}</p>}
      <TestForm submitText="Создать тест" onSubmit={createTest} />
    </section>
  );
}

function mapAdminTestToDraft(data) {
  return {
    title: data.title,
    description: data.description || "",
    isPublic: data.isPublic,
    allowMultipleAttempts: data.allowMultipleAttempts,
    questions: data.questions.map((q) => ({
      text: q.text,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
    })),
    gradeRules: data.gradeRules
      .map((rule) => ({ minPercent: rule.minPercent, grade: rule.grade }))
      .sort((a, b) => a.minPercent - b.minPercent)
  };
}

function AdminEditTestPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    api(`/admin/tests/${id}`)
      .then((data) => setInitial(mapAdminTestToDraft(data)))
      .catch((e) => setError(e.message));
  }, [id]);

  async function saveTest(payload) {
    await api(`/admin/tests/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }

  async function createCode() {
    setError("");
    try {
      const data = await api("/tests/admin/create-link", {
        method: "POST",
        body: JSON.stringify({ testId: id })
      });
      setCode(data.shortCode || "");
    } catch (e) {
      setError(e.message);
    }
  }

  if (user.role !== "ADMIN") return <Navigate to="/" />;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Редактирование теста</p>
          <h1>Админ</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          Назад
        </button>
      </header>

      <main className="contentArea">
        {error && <p className="errorText">{error}</p>}
        {!initial ? (
          <p className="mutedText">Загрузка...</p>
        ) : (
          <>
            <div className="card">
              <button className="secondaryBtn" onClick={createCode}>
                Сгенерировать 5-значный код
              </button>
              {code && <p className="codeBadge">Код: {code}</p>}
            </div>
            <TestForm initialValue={initial} submitText="Сохранить изменения" onSubmit={saveTest} />
          </>
        )}
      </main>
    </div>
  );
}

function useTestState(loadFn) {
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFn()
      .then((data) => setTest(data.test ?? data))
      .catch((e) => setError(e.message));
  }, [loadFn]);

  return { test, answers, setAnswers, result, setResult, error };
}

function QuestionCard({ q, selected, onSelect, disabled }) {
  return (
    <article className="card">
      <h3>{q.text}</h3>
      {q.imageUrl ? <img src={q.imageUrl} alt="hint" className="hintImage" /> : null}
      <div className="answersWrap">
        {q.options.map((option) => (
          <label className={selected === option.id ? "answerOption selected" : "answerOption"} key={option.id}>
            <input
              type="radio"
              checked={selected === option.id}
              onChange={() => onSelect(q.id, option.id)}
              name={q.id}
              disabled={disabled}
            />
            {option.text}
          </label>
        ))}
      </div>
    </article>
  );
}

function SolveTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loadFn = useMemo(() => () => api(`/tests/${id}`), [id]);
  const { test, answers, setAnswers, result, setResult, error } = useTestState(loadFn);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checkedByQuestion, setCheckedByQuestion] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [actionError, setActionError] = useState("");
  const [checking, setChecking] = useState(false);

  const questions = test?.questions || [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(checkedByQuestion).length;
  const remainingCount = questions.length - answeredCount;
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : null;
  const isCurrentChecked = Boolean(currentQuestion && checkedByQuestion[currentQuestion.id]);
  const isLastQuestion = currentIndex === questions.length - 1;

  async function checkCurrentAnswer() {
    if (!currentQuestion) return;
    if (!selectedOptionId) {
      setActionError("Выберите вариант ответа");
      return;
    }

    setActionError("");
    setChecking(true);
    try {
      const response = await api(`/tests/${id}/check-answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: currentQuestion.id,
          optionId: selectedOptionId
        })
      });
      setFeedback(response.isCorrect ? "Правильно" : "Неправильно");
      setCheckedByQuestion((prev) => ({ ...prev, [currentQuestion.id]: true }));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function submitFinal() {
    const payload = questions
      .map((q) => ({ questionId: q.id, optionId: answers[q.id] }))
      .filter((a) => Boolean(a.optionId));

    const res = await api(`/tests/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload })
    });
    setResult(res);
  }

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Загрузка...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Публичный тест</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          Назад
        </button>
      </header>

      <main className="contentArea">
        {result ? (
          <article className="card">
            <h2>Результат: {result.grade}/10</h2>
            <p>Правильно: {result.correctCount} из {result.totalQuestions}</p>
            <p>Процент: {result.percent.toFixed(1)}%</p>
            <button className="primaryBtn" onClick={() => navigate("/")}>
              К тестам
            </button>
          </article>
        ) : (
          <>
            <article className="card">
              <p>
                Отмечено: {answeredCount} из {questions.length} | Осталось: {remainingCount}
              </p>
            </article>

            {currentQuestion && (
              <QuestionCard
                key={currentQuestion.id}
                q={currentQuestion}
                selected={answers[currentQuestion.id]}
                disabled={isCurrentChecked}
                onSelect={(questionId, optionId) => {
                  setActionError("");
                  setFeedback(null);
                  setAnswers((prev) => ({
                    ...prev,
                    [questionId]: optionId
                  }));
                }}
              />
            )}

            {feedback && <p className={feedback === "Правильно" ? "okText" : "errorText"}>{feedback}</p>}
            {actionError && <p className="errorText">{actionError}</p>}

            {!isCurrentChecked && (
              <button className="primaryBtn" onClick={checkCurrentAnswer} disabled={checking}>
                {checking ? "Проверяем..." : "Проверить ответ"}
              </button>
            )}

            {isCurrentChecked && !isLastQuestion && (
              <button
                className="primaryBtn"
                onClick={() => {
                  setCurrentIndex((prev) => prev + 1);
                  setFeedback(null);
                  setActionError("");
                }}
              >
                Следующий вопрос
              </button>
            )}

            {isCurrentChecked && isLastQuestion && (
              <button className="primaryBtn" onClick={submitFinal}>
                Посмотреть результаты
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PrivateTestPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const loadFn = useMemo(() => () => api(`/tests/access/${token}`, { method: "POST" }), [token]);
  const { test, answers, setAnswers, result, setResult, error } = useTestState(loadFn);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checkedByQuestion, setCheckedByQuestion] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [actionError, setActionError] = useState("");
  const [checking, setChecking] = useState(false);

  const questions = test?.questions || [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(checkedByQuestion).length;
  const remainingCount = questions.length - answeredCount;
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : null;
  const isCurrentChecked = Boolean(currentQuestion && checkedByQuestion[currentQuestion.id]);
  const isLastQuestion = currentIndex === questions.length - 1;

  async function checkCurrentAnswer() {
    if (!currentQuestion) return;
    if (!selectedOptionId) {
      setActionError("Выберите вариант ответа");
      return;
    }

    setActionError("");
    setChecking(true);
    try {
      const response = await api(`/tests/${test.id}/check-answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: currentQuestion.id,
          optionId: selectedOptionId,
          accessToken: token
        })
      });
      setFeedback(response.isCorrect ? "Правильно" : "Неправильно");
      setCheckedByQuestion((prev) => ({ ...prev, [currentQuestion.id]: true }));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function submitFinal() {
    const payload = questions
      .map((q) => ({ questionId: q.id, optionId: answers[q.id] }))
      .filter((a) => Boolean(a.optionId));

    const res = await api(`/tests/${test.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload, accessToken: token })
    });
    setResult(res);
  }

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Загрузка...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Тест по коду</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          Назад
        </button>
      </header>

      <main className="contentArea">
        {result ? (
          <article className="card">
            <h2>Результат: {result.grade}/10</h2>
            <p>Процент: {result.percent.toFixed(1)}%</p>
            <button className="primaryBtn" onClick={() => navigate("/")}>
              К тестам
            </button>
          </article>
        ) : (
          <>
            <article className="card">
              <p>
                Отмечено: {answeredCount} из {questions.length} | Осталось: {remainingCount}
              </p>
            </article>

            {currentQuestion && (
              <QuestionCard
                key={currentQuestion.id}
                q={currentQuestion}
                selected={answers[currentQuestion.id]}
                disabled={isCurrentChecked}
                onSelect={(questionId, optionId) => {
                  setActionError("");
                  setFeedback(null);
                  setAnswers((prev) => ({
                    ...prev,
                    [questionId]: optionId
                  }));
                }}
              />
            )}

            {feedback && <p className={feedback === "Правильно" ? "okText" : "errorText"}>{feedback}</p>}
            {actionError && <p className="errorText">{actionError}</p>}

            {!isCurrentChecked && (
              <button className="primaryBtn" onClick={checkCurrentAnswer} disabled={checking}>
                {checking ? "Проверяем..." : "Проверить ответ"}
              </button>
            )}

            {isCurrentChecked && !isLastQuestion && (
              <button
                className="primaryBtn"
                onClick={() => {
                  setCurrentIndex((prev) => prev + 1);
                  setFeedback(null);
                  setActionError("");
                }}
              >
                Следующий вопрос
              </button>
            )}

            {isCurrentChecked && isLastQuestion && (
              <button className="primaryBtn" onClick={submitFinal}>
                Посмотреть результаты
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, error } = useSession();

  if (loading) return <div className="appShell"><p className="mutedText">Проверка авторизации...</p></div>;
  if (!user) {
    return (
      <div className="appShell">
        <header className="topBar">
          <div>
            <p className="topLabel">Spelling Tests</p>
            <h1>Ошибка входа</h1>
          </div>
        </header>
        <main className="contentArea">
          <p className="errorText">{error || "Не удалось авторизоваться"}</p>
        </main>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell user={user} />
        }
      />
      <Route path="/test/:id" element={<SolveTestPage />} />
      <Route path="/access/:token" element={<PrivateTestPage />} />
      <Route path="/admin/tests/:id/edit" element={<AdminEditTestPage user={user} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
