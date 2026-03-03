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
      setError("РћС‚РєСЂРѕР№ WebApp РёР· Telegram Р±РѕС‚Р°, С‡С‚РѕР±С‹ Р°РІС‚РѕСЂРёР·РѕРІР°С‚СЊСЃСЏ.");
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

function Shell({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("tests");

  const tabs = [
    { key: "tests", label: "РўРµСЃС‚С‹" },
    { key: "find", label: "РќР°Р№С‚Рё С‚РµСЃС‚" },
    { key: "profile", label: "РњРѕР№ РїСЂРѕС„РёР»СЊ" }
  ];

  if (user.role === "ADMIN") {
    tabs.push({ key: "add", label: "Р”РѕР±Р°РІРёС‚СЊ С‚РµСЃС‚" });
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">Spelling Tests</p>
          <h1>{displayName(user)}</h1>
        </div>
        <button className="ghostBtn" onClick={onLogout}>
          Р’С‹Р№С‚Рё
        </button>
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
      <h2>РџСѓР±Р»РёС‡РЅС‹Рµ С‚РµСЃС‚С‹</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="cardList">
        {tests.map((test) => (
          <article className="card" key={test.id}>
            <h3>{test.title}</h3>
            <p className="mutedText">{test.description || "Р‘РµР· РѕРїРёСЃР°РЅРёСЏ"}</p>
            <div className="metaList">
              <p>Р’РѕРїСЂРѕСЃРѕРІ: {test.questionCount}</p>
              <p>Р›СѓС‡С€Р°СЏ РѕС†РµРЅРєР°: {test.bestAttempt ? `${test.bestAttempt.grade}/10` : "РїРѕРєР° РЅРµС‚"}</p>
            </div>
            <button className="primaryBtn" onClick={() => navigate(`/test/${test.id}`)}>
              Р РµС€Р°С‚СЊ
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
      setError("Р’РІРµРґРёС‚Рµ 5-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ");
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
      <h2>РќР°Р№С‚Рё С‚РµСЃС‚</h2>
      <p className="mutedText">Р’РІРµРґРёС‚Рµ 5-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ, РєРѕС‚РѕСЂС‹Р№ СЃРіРµРЅРµСЂРёСЂРѕРІР°Р»Р° СЃРёСЃС‚РµРјР°.</p>
      <form className="card" onSubmit={onSubmit}>
        <label className="labelText">
          РљРѕРґ С‚РµСЃС‚Р°
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="12345"
            inputMode="numeric"
          />
        </label>
        {error && <p className="errorText">{error}</p>}
        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "РџСЂРѕРІРµСЂСЏРµРј..." : "РћС‚РєСЂС‹С‚СЊ С‚РµСЃС‚"}
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
      <h2>РњРѕР№ РїСЂРѕС„РёР»СЊ</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="card">
        <h3>{displayName(user)}</h3>
        <p className="mutedText">Р РѕР»СЊ: {user.role === "ADMIN" ? "РђРґРјРёРЅ" : "РЈС‡РµРЅРёРє"}</p>
      </div>

      <h3 className="blockTitle">РџСЂРѕР№РґРµРЅРЅС‹Рµ С‚РµСЃС‚С‹</h3>
      {!data ? (
        <p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p>
      ) : data.profileTests.length === 0 ? (
        <p className="mutedText">Р’С‹ РµС‰Рµ РЅРµ РїСЂРѕС…РѕРґРёР»Рё С‚РµСЃС‚С‹</p>
      ) : (
        <div className="cardList">
          {data.profileTests.map((item) => (
            <article className="card" key={item.testId}>
              <h3>{item.testTitle}</h3>
              <p>{item.isPublic ? "РџСѓР±Р»РёС‡РЅС‹Р№ С‚РµСЃС‚" : "РќРµРїСѓР±Р»РёС‡РЅС‹Р№ С‚РµСЃС‚"}</p>
              <p>{item.isPublic ? "Р›СѓС‡С€Р°СЏ РѕС†РµРЅРєР°" : "РћС†РµРЅРєР°"}: {item.grade}/10</p>
            </article>
          ))}
        </div>
      )}

      {user.role === "ADMIN" && (
        <>
          <h3 className="blockTitle">РњРѕРё СЃРѕР·РґР°РЅРЅС‹Рµ С‚РµСЃС‚С‹</h3>
          <div className="cardList">
            {adminTests.map((test) => (
              <article className="card" key={test.id}>
                <h3>{test.title}</h3>
                <p>{test.isPublic ? "РџСѓР±Р»РёС‡РЅС‹Р№" : "РќРµРїСѓР±Р»РёС‡РЅС‹Р№"}</p>
                <button className="secondaryBtn" onClick={() => navigate(`/admin/tests/${test.id}/edit`)}>
                  Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ
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
      setError("РџСЂРѕРІРµСЂСЊС‚Рµ РЅР°Р·РІР°РЅРёРµ С‚РµСЃС‚Р°, РІРѕРїСЂРѕСЃС‹ Рё РІР°СЂРёР°РЅС‚С‹ РѕС‚РІРµС‚РѕРІ");
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
          РќР°Р·РІР°РЅРёРµ С‚РµСЃС‚Р°
          <input
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
        </label>
        <label className="labelText">
          РћРїРёСЃР°РЅРёРµ
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
          РџСѓР±Р»РёС‡РЅС‹Р№ С‚РµСЃС‚
        </label>
        {!draft.isPublic && (
          <label className="checkRow">
            <input
              type="checkbox"
              checked={draft.allowMultipleAttempts}
              onChange={(e) => setDraft((prev) => ({ ...prev, allowMultipleAttempts: e.target.checked }))}
            />
            Р Р°Р·СЂРµС€РёС‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ РїРѕРїС‹С‚РѕРє
          </label>
        )}
      </article>

      {draft.questions.map((q, qIdx) => (
        <article className="card" key={`q-${qIdx}`}>
          <label className="labelText">
            Р’РѕРїСЂРѕСЃ {qIdx + 1}
            <input value={q.text} onChange={(e) => setQuestionText(qIdx, e.target.value)} required />
          </label>
          {q.options.map((option, oIdx) => (
            <div className="optionRow" key={`q-${qIdx}-o-${oIdx}`}>
              <input
                value={option.text}
                onChange={(e) => setOptionText(qIdx, oIdx, e.target.value)}
                placeholder={`Р’Р°СЂРёР°РЅС‚ ${oIdx + 1}`}
              />
              <label className="checkRow">
                <input
                  type="radio"
                  name={`correct-${qIdx}`}
                  checked={option.isCorrect}
                  onChange={() => setCorrect(qIdx, oIdx)}
                />
                Р’РµСЂРЅС‹Р№
              </label>
            </div>
          ))}
          <button className="secondaryBtn" type="button" onClick={() => addOption(qIdx)}>
            + Р’Р°СЂРёР°РЅС‚
          </button>
        </article>
      ))}

      <button className="secondaryBtn" type="button" onClick={addQuestion}>
        + Р’РѕРїСЂРѕСЃ
      </button>

      {error && <p className="errorText">{error}</p>}
      <button className="primaryBtn" type="submit" disabled={saving}>
        {saving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : submitText}
      </button>
    </form>
  );
}

function AddTestTab() {
  const [message, setMessage] = useState("");

  async function createTest(payload) {
    await api("/admin/tests", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setMessage("РўРµСЃС‚ СЃРѕР·РґР°РЅ");
  }

  return (
    <section>
      <h2>Р”РѕР±Р°РІРёС‚СЊ С‚РµСЃС‚</h2>
      {message && <p className="okText">{message}</p>}
      <TestForm submitText="РЎРѕР·РґР°С‚СЊ С‚РµСЃС‚" onSubmit={createTest} />
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
          <p className="topLabel">Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ С‚РµСЃС‚Р°</p>
          <h1>РђРґРјРёРЅ</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          РќР°Р·Р°Рґ
        </button>
      </header>

      <main className="contentArea">
        {error && <p className="errorText">{error}</p>}
        {!initial ? (
          <p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p>
        ) : (
          <>
            <div className="card">
              <button className="secondaryBtn" onClick={createCode}>
                РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ 5-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ
              </button>
              {code && <p className="codeBadge">РљРѕРґ: {code}</p>}
            </div>
            <TestForm initialValue={initial} submitText="РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ" onSubmit={saveTest} />
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

function QuestionCard({ q, selected, onSelect }) {
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

  async function submit() {
    const payload = test.questions
      .map((q) => ({ questionId: q.id, optionId: answers[q.id] }))
      .filter((a) => Boolean(a.optionId));

    const res = await api(`/tests/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload })
    });
    setResult(res);
  }

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">РџСѓР±Р»РёС‡РЅС‹Р№ С‚РµСЃС‚</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          РќР°Р·Р°Рґ
        </button>
      </header>

      <main className="contentArea">
        {result ? (
          <article className="card">
            <h2>Р РµР·СѓР»СЊС‚Р°С‚: {result.grade}/10</h2>
            <p>РџСЂР°РІРёР»СЊРЅРѕ: {result.correctCount} РёР· {result.totalQuestions}</p>
            <p>РџСЂРѕС†РµРЅС‚: {result.percent.toFixed(1)}%</p>
            <button className="primaryBtn" onClick={() => navigate("/")}>
              Рљ С‚РµСЃС‚Р°Рј
            </button>
          </article>
        ) : (
          <>
            {test.questions.map((q) => (
              <QuestionCard
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
            <button className="primaryBtn" onClick={submit}>
              РћС‚РїСЂР°РІРёС‚СЊ
            </button>
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

  async function submit() {
    const payload = test.questions
      .map((q) => ({ questionId: q.id, optionId: answers[q.id] }))
      .filter((a) => Boolean(a.optionId));

    const res = await api(`/tests/${test.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: payload, accessToken: token })
    });
    setResult(res);
  }

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!test) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">РўРµСЃС‚ РїРѕ РєРѕРґСѓ</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>
          РќР°Р·Р°Рґ
        </button>
      </header>

      <main className="contentArea">
        {result ? (
          <article className="card">
            <h2>Р РµР·СѓР»СЊС‚Р°С‚: {result.grade}/10</h2>
            <p>РџСЂРѕС†РµРЅС‚: {result.percent.toFixed(1)}%</p>
            <button className="primaryBtn" onClick={() => navigate("/")}>
              Рљ С‚РµСЃС‚Р°Рј
            </button>
          </article>
        ) : (
          <>
            {test.questions.map((q) => (
              <QuestionCard
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
            <button className="primaryBtn" onClick={submit}>
              РћС‚РїСЂР°РІРёС‚СЊ
            </button>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, error, setUser } = useSession();

  if (loading) return <div className="appShell"><p className="mutedText">РџСЂРѕРІРµСЂРєР° Р°РІС‚РѕСЂРёР·Р°С†РёРё...</p></div>;
  if (!user) {
    return (
      <div className="appShell">
        <header className="topBar">
          <div>
            <p className="topLabel">Spelling Tests</p>
            <h1>РћС€РёР±РєР° РІС…РѕРґР°</h1>
          </div>
        </header>
        <main className="contentArea">
          <p className="errorText">{error || "РќРµ СѓРґР°Р»РѕСЃСЊ Р°РІС‚РѕСЂРёР·РѕРІР°С‚СЊСЃСЏ"}</p>
        </main>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell
            user={user}
            onLogout={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              setUser(null);
            }}
          />
        }
      />
      <Route path="/test/:id" element={<SolveTestPage />} />
      <Route path="/access/:token" element={<PrivateTestPage />} />
      <Route path="/admin/tests/:id/edit" element={<AdminEditTestPage user={user} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
