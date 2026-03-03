import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, getTelegramInitData } from "./api";

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

  return { user, loading, error, setUser, setError };
}

function Layout({ user, onLogout }) {
  return (
    <div className="container">
      <header className="header">
        <h1>Spelling Tests</h1>
        <div>
          <Link to="/">Тесты</Link>
          <Link to="/results">Мои результаты</Link>
          {user.role === "ADMIN" && <Link to="/admin">Админ</Link>}
          <button onClick={onLogout}>Выйти</button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<TestsPage user={user} />} />
        <Route path="/test/:id" element={<SolveTestPage user={user} />} />
        <Route path="/access/:token" element={<PrivateTestPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/admin" element={user.role === "ADMIN" ? <AdminPage /> : <Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function TestsPage() {
  const [tests, setTests] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/tests")
      .then(setTests)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section>
      <h2>Доступные тесты</h2>
      {error && <p className="error">{error}</p>}
      <div className="list">
        {tests.map((test) => (
          <div className="card" key={test.id}>
            <h3>{test.title}</h3>
            <p>{test.description || "Без описания"}</p>
            <p>Вопросов: {test.questionCount}</p>
            <p>
              Лучшая оценка: {test.bestAttempt ? `${test.bestAttempt.grade}/10` : "еще нет попыток"}
            </p>
            <Link to={`/test/${test.id}`}>Решать</Link>
          </div>
        ))}
      </div>
    </section>
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

  const questions = test?.questions || [];

  return { test, questions, answers, setAnswers, result, setResult, error };
}

function QuestionView({ q, selected, onSelect }) {
  return (
    <div className="card">
      <p>
        <b>{q.text}</b>
      </p>
      {q.imageUrl ? <img src={q.imageUrl} alt="hint" className="hintImage" /> : null}
      {q.options.map((o) => (
        <label key={o.id} className="option">
          <input
            type="radio"
            checked={selected === o.id}
            onChange={() => onSelect(q.id, o.id)}
            name={q.id}
          />
          <span>{o.text}</span>
        </label>
      ))}
    </div>
  );
}

function SolveTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const loadFn = useMemo(() => () => api(`/tests/${id}`), [id]);
  const { test, questions, answers, setAnswers, result, setResult, error } = useTestState(loadFn);

  async function submit() {
    const payload = questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] })).filter((a) => a.optionId);
    const res = await api(`/tests/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload })
    });
    setResult(res);
  }

  if (error) return <p className="error">{error}</p>;
  if (!test) return <p>Загрузка...</p>;
  if (result) {
    return (
      <div className="card">
        <h2>Результат: {result.grade}/10</h2>
        <p>
          Правильно: {result.correctCount} из {result.totalQuestions}
        </p>
        <p>Процент: {result.percent.toFixed(1)}%</p>
        <button onClick={() => navigate("/")}>К списку тестов</button>
      </div>
    );
  }

  return (
    <section>
      <h2>{test.title}</h2>
      <p>{test.description}</p>
      {questions.map((q) => (
        <QuestionView
          key={q.id}
          q={q}
          selected={answers[q.id]}
          onSelect={(questionId, optionId) =>
            setAnswers((prev) => ({
              ...prev,
              [questionId]: optionId
            }))
          }
        />
      ))}
      <button onClick={submit}>Отправить</button>
    </section>
  );
}

function PrivateTestPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const loadFn = useMemo(() => () => api(`/tests/access/${token}`, { method: "POST" }), [token]);
  const { test, questions, answers, setAnswers, result, setResult, error } = useTestState(loadFn);

  async function submit() {
    const payload = questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] })).filter((a) => a.optionId);
    const res = await api(`/tests/${test.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload, accessToken: token })
    });
    setResult(res);
  }

  if (error) return <p className="error">{error}</p>;
  if (!test) return <p>Загрузка...</p>;
  if (result) {
    return (
      <div className="card">
        <h2>Результат: {result.grade}/10</h2>
        <p>Процент: {result.percent.toFixed(1)}%</p>
        <button onClick={() => navigate("/")}>К тестам</button>
      </div>
    );
  }

  return (
    <section>
      <h2>{test.title} (приватный)</h2>
      {questions.map((q) => (
        <QuestionView
          key={q.id}
          q={q}
          selected={answers[q.id]}
          onSelect={(questionId, optionId) =>
            setAnswers((prev) => ({
              ...prev,
              [questionId]: optionId
            }))
          }
        />
      ))}
      <button onClick={submit}>Отправить</button>
    </section>
  );
}

function ResultsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/tests/me/results")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Загрузка...</p>;

  return (
    <section>
      <h2>Мои лучшие оценки</h2>
      <div className="list">
        {data.bestByTest.map((item) => (
          <div className="card" key={item.testId}>
            <h3>{item.testTitle}</h3>
            <p>Оценка: {item.grade}/10</p>
            <p>Процент: {item.percent.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminPage() {
  const [tests, setTests] = useState([]);
  const [stats, setStats] = useState(null);
  const [linkToken, setLinkToken] = useState("");
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    api("/admin/tests")
      .then(setTests)
      .catch((e) => setError(e.message));
  }, []);

  async function createSimpleTest(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title,
        isPublic,
        allowMultipleAttempts: isPublic,
        questions: [
          {
            text: questionText,
            options: options.filter(Boolean).map((text, idx) => ({
              text,
              isCorrect: idx === correctIndex
            }))
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
      await api("/admin/tests", { method: "POST", body: JSON.stringify(payload) });
      const updated = await api("/admin/tests");
      setTests(updated);
      setTitle("");
      setQuestionText("");
      setOptions(["", "", ""]);
      setCorrectIndex(0);
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function loadStats(testId) {
    try {
      const res = await api(`/admin/tests/${testId}/stats`);
      setStats(res);
    } catch (e) {
      setError(e.message);
    }
  }

  async function createPrivateLink(testId) {
    try {
      const res = await api("/tests/admin/create-link", {
        method: "POST",
        body: JSON.stringify({ testId })
      });
      setLinkToken(res.token);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section>
      <h2>Админ-панель</h2>
      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={createSimpleTest}>
        <h3>Создать тест (быстрая форма)</h3>
        <label>
          Название:
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Вопрос:
          <input value={questionText} onChange={(e) => setQuestionText(e.target.value)} required />
        </label>
        {options.map((v, idx) => (
          <label key={idx}>
            Вариант {idx + 1}:
            <input
              value={v}
              onChange={(e) => {
                const copy = [...options];
                copy[idx] = e.target.value;
                setOptions(copy);
              }}
              required={idx < 2}
            />
          </label>
        ))}
        <label>
          Индекс правильного (0..{options.length - 1}):
          <input
            type="number"
            min="0"
            max={options.length - 1}
            value={correctIndex}
            onChange={(e) => setCorrectIndex(Number(e.target.value))}
          />
        </label>
        <label>
          Публичный:
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        </label>
        <button type="submit">Создать</button>
      </form>

      {linkToken && (
        <div className="card">
          <p>Приватная ссылка:</p>
          <code>{`${window.location.origin}/access/${linkToken}`}</code>
        </div>
      )}

      <div className="list">
        {tests.map((t) => (
          <div key={t.id} className="card">
            <h3>{t.title}</h3>
            <p>Попыток: {t.attemptsCount}</p>
            <button onClick={() => loadStats(t.id)}>Статистика</button>
            {!t.isPublic && <button onClick={() => createPrivateLink(t.id)}>Сгенерировать ссылку</button>}
          </div>
        ))}
      </div>

      {stats && (
        <div className="card">
          <h3>Статистика: {stats.test.title}</h3>
          <p>Уникальных пользователей: {stats.uniqueUsers}</p>
          <p>Средняя оценка: {stats.avgGrade.toFixed(2)}</p>
          {stats.bestAttemptsByUser.map((r) => (
            <p key={r.user.id}>
              {r.user.firstName || r.user.username || r.user.telegramId}: {r.grade}/10 ({r.percent.toFixed(1)}%)
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const { user, loading, error, setUser } = useSession();

  if (loading) return <div className="container">Проверка авторизации...</div>;
  if (!user) {
    return (
      <div className="container">
        <h1>Spelling Tests</h1>
        <p className="error">{error || "Не удалось авторизоваться"}</p>
      </div>
    );
  }

  return (
    <Layout
      user={user}
      onLogout={() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
      }}
    />
  );
}

