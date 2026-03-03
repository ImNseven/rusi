import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, getTelegramInitData } from "./api";

function displayName(user) {
  return user.firstName || user.username || `id${user.telegramId}`;
}

function typeLabel(kind) {
  return kind === "CARDS" ? "РљР°СЂС‚РѕС‡РєРё" : "РўРµСЃС‚";
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

  return { user, loading, error };
}

function Shell({ user }) {
  const [activeTab, setActiveTab] = useState("tests");

  const tabs = [
    { key: "tests", label: "РўРµСЃС‚С‹" },
    { key: "find", label: "РќР°Р№С‚Рё С‚РµСЃС‚" },
    { key: "profile", label: "РњРѕР№ РїСЂРѕС„РёР»СЊ" }
  ];
  if (user.role === "ADMIN") tabs.push({ key: "add", label: "Р”РѕР±Р°РІРёС‚СЊ" });

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
      <h2>Р”РѕСЃС‚СѓРїРЅС‹Рµ РЅР°Р±РѕСЂС‹</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="cardList">
        {tests.map((test) => (
          <article className="card" key={test.id}>
            <div className="rowBetween">
              <h3>{test.title}</h3>
              <span className="kindBadge">{typeLabel(test.kind)}</span>
            </div>
            <p className="mutedText">{test.description || "Р‘РµР· РѕРїРёСЃР°РЅРёСЏ"}</p>
            <div className="metaList">
              <p>Р­Р»РµРјРµРЅС‚РѕРІ: {test.questionCount}</p>
              <p>Р›СѓС‡С€Р°СЏ РѕС†РµРЅРєР°: {test.bestAttempt ? `${test.bestAttempt.grade}/10` : "РїРѕРєР° РЅРµС‚"}</p>
            </div>
            <button className="primaryBtn" onClick={() => navigate(`/test/${test.id}`)}>
              РќР°С‡Р°С‚СЊ
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
      <h2>РќР°Р№С‚Рё РїРѕ РєРѕРґСѓ</h2>
      <form className="card" onSubmit={onSubmit}>
        <label className="labelText">
          РљРѕРґ
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="12345"
            inputMode="numeric"
          />
        </label>
        {error && <p className="errorText">{error}</p>}
        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "РџСЂРѕРІРµСЂСЏРµРј..." : "РћС‚РєСЂС‹С‚СЊ"}
        </button>
      </form>
    </section>
  );
}

function ProfileTab({ user }) {
  const [data, setData] = useState(null);
  const [adminTests, setAdminTests] = useState([]);
  const [error, setError] = useState("");
  const [links, setLinks] = useState({});

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
      const url = `${window.location.origin}/test/${test.id}`;
      setLinks((prev) => ({ ...prev, [test.id]: url }));
      return;
    }

    const data = await api("/tests/admin/create-link", {
      method: "POST",
      body: JSON.stringify({ testId: test.id })
    });
    const url = `${window.location.origin}/access/${data.token}`;
    setLinks((prev) => ({ ...prev, [test.id]: `${url} (РєРѕРґ ${data.shortCode})` }));
  }

  return (
    <section>
      <h2>РњРѕР№ РїСЂРѕС„РёР»СЊ</h2>
      {error && <p className="errorText">{error}</p>}
      <div className="card">
        <h3>{displayName(user)}</h3>
      </div>

      <h3 className="blockTitle">РџСЂРѕР№РґРµРЅРѕ</h3>
      {!data ? (
        <p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p>
      ) : data.profileTests.length === 0 ? (
        <p className="mutedText">РџРѕРєР° РЅРµС‚ РїСЂРѕС…РѕР¶РґРµРЅРёР№</p>
      ) : (
        <div className="cardList">
          {data.profileTests.map((item) => (
            <article className="card" key={item.testId}>
              <div className="rowBetween">
                <h3>{item.testTitle}</h3>
                <span className="kindBadge">{typeLabel(item.kind)}</span>
              </div>
              <p>{item.isPublic ? "Р›СѓС‡С€Р°СЏ РѕС†РµРЅРєР°" : "РћС†РµРЅРєР°"}: {item.grade}/10</p>
            </article>
          ))}
        </div>
      )}

      {user.role === "ADMIN" && (
        <>
          <h3 className="blockTitle">РњРѕРё РЅР°Р±РѕСЂС‹</h3>
          <div className="cardList">
            {adminTests.map((test) => (
              <article className="card" key={test.id}>
                <div className="rowBetween">
                  <h3>{test.title}</h3>
                  <span className="kindBadge">{typeLabel(test.kind)}</span>
                </div>
                <div className="buttonRow">
                  <button className="secondaryBtn" onClick={() => makeLink(test)}>
                    РЎСЃС‹Р»РєР°
                  </button>
                </div>
                {links[test.id] && <p className="mutedText">{links[test.id]}</p>}
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

function TestForm({ onSubmit, submitText }) {
  const [draft, setDraft] = useState(makeDraft());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      setError("Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ");
      return;
    }

    if (payload.kind === "CARDS") {
      const invalid = !payload.cardLeftLabel || !payload.cardRightLabel || payload.questions.some((q) => !q.text);
      if (invalid) {
        setError("Р”Р»СЏ РєР°СЂС‚РѕС‡РµРє Р·Р°РїРѕР»РЅРёС‚Рµ РїРѕРґРїРёСЃРё Р»РµРІРѕ/РїСЂР°РІРѕ Рё СЃР»РѕРІР°");
        return;
      }
    } else {
      const invalid = payload.questions.some(
        (q) => !q.text || q.options.length < 2 || !q.options.some((o) => o.isCorrect)
      );
      if (invalid) {
        setError("Р”Р»СЏ С‚РµСЃС‚Р° Р·Р°РїРѕР»РЅРёС‚Рµ РІРѕРїСЂРѕСЃС‹ Рё РІР°СЂРёР°РЅС‚С‹");
        return;
      }
    }

    setSaving(true);
    try {
      await onSubmit(payload);
      setDraft(makeDraft());
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
            Р”РѕР±Р°РІРёС‚СЊ С‚РµСЃС‚
          </button>
          <button
            className={draft.kind === "CARDS" ? "primaryBtn" : "secondaryBtn"}
            type="button"
            onClick={() => setDraft((p) => ({ ...p, kind: "CARDS", questions: [{ text: "", explanation: "", correctSide: "LEFT" }] }))}
          >
            Р”РѕР±Р°РІРёС‚СЊ РєР°СЂС‚РѕС‡РєРё
          </button>
        </div>

        <label className="labelText">
          РќР°Р·РІР°РЅРёРµ
          <input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
        </label>
        <label className="labelText">
          РћРїРёСЃР°РЅРёРµ
          <textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} rows={2} />
        </label>

        <label className="checkRow">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(e) => setDraft((p) => ({ ...p, isPublic: e.target.checked, allowMultipleAttempts: e.target.checked ? true : p.allowMultipleAttempts }))}
          />
          РџСѓР±Р»РёС‡РЅС‹Р№
        </label>
      </article>

      {draft.kind === "CARDS" && (
        <article className="card">
          <label className="labelText">
            Р›РµРІС‹Р№ РІР°СЂРёР°РЅС‚
            <input value={draft.cardLeftLabel} onChange={(e) => setDraft((p) => ({ ...p, cardLeftLabel: e.target.value }))} />
          </label>
          <label className="labelText">
            РџСЂР°РІС‹Р№ РІР°СЂРёР°РЅС‚
            <input value={draft.cardRightLabel} onChange={(e) => setDraft((p) => ({ ...p, cardRightLabel: e.target.value }))} />
          </label>
        </article>
      )}

      {draft.questions.map((q, qIdx) => (
        <article className="card" key={`q-${qIdx}`}>
          <label className="labelText">
            {draft.kind === "CARDS" ? `РљР°СЂС‚РѕС‡РєР° ${qIdx + 1}` : `Р’РѕРїСЂРѕСЃ ${qIdx + 1}`}
            <input value={q.text} onChange={(e) => setQuestion(qIdx, (item) => { item.text = e.target.value; })} />
          </label>

          <label className="labelText">
            РћР±СЉСЏСЃРЅРµРЅРёРµ
            <textarea value={q.explanation || ""} onChange={(e) => setQuestion(qIdx, (item) => { item.explanation = e.target.value; })} rows={2} />
          </label>

          {draft.kind === "CARDS" ? (
            <div className="buttonRow">
              <button
                type="button"
                className={q.correctSide === "LEFT" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setQuestion(qIdx, (item) => { item.correctSide = "LEFT"; })}
              >
                Р’РµСЂРЅРѕ СЃР»РµРІР°
              </button>
              <button
                type="button"
                className={q.correctSide === "RIGHT" ? "primaryBtn" : "secondaryBtn"}
                onClick={() => setQuestion(qIdx, (item) => { item.correctSide = "RIGHT"; })}
              >
                Р’РµСЂРЅРѕ СЃРїСЂР°РІР°
              </button>
            </div>
          ) : (
            <>
              {q.options.map((opt, oIdx) => (
                <div className="optionRow" key={`o-${oIdx}`}>
                  <input
                    value={opt.text}
                    onChange={(e) => setQuestion(qIdx, (item) => { item.options[oIdx].text = e.target.value; })}
                    placeholder={`Р’Р°СЂРёР°РЅС‚ ${oIdx + 1}`}
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
                    Р’РµСЂРЅС‹Р№
                  </label>
                </div>
              ))}
              <button
                className="secondaryBtn"
                type="button"
                onClick={() => setQuestion(qIdx, (item) => { if (item.options.length < 5) item.options.push({ text: "", isCorrect: false }); })}
              >
                + Р’Р°СЂРёР°РЅС‚
              </button>
            </>
          )}
        </article>
      ))}

      <button className="secondaryBtn" type="button" onClick={addQuestion}>
        + {draft.kind === "CARDS" ? "РљР°СЂС‚РѕС‡РєР°" : "Р’РѕРїСЂРѕСЃ"}
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
  const [link, setLink] = useState("");

  async function create(payload) {
    const created = await api("/admin/tests", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    let text = "РќР°Р±РѕСЂ СЃРѕР·РґР°РЅ";
    let generatedLink = `${window.location.origin}/test/${created.id}`;

    if (!payload.isPublic) {
      const access = await api("/tests/admin/create-link", {
        method: "POST",
        body: JSON.stringify({ testId: created.id })
      });
      generatedLink = `${window.location.origin}/access/${access.token}`;
      text = `РџСЂРёРІР°С‚РЅС‹Р№ РЅР°Р±РѕСЂ СЃРѕР·РґР°РЅ, РєРѕРґ ${access.shortCode}`;
    }

    setMessage(text);
    setLink(generatedLink);
  }

  return (
    <section>
      <h2>Р”РѕР±Р°РІРёС‚СЊ</h2>
      {message && <p className="okText">{message}</p>}
      {link && <p className="mutedText">РЎСЃС‹Р»РєР°: {link}</p>}
      <TestForm onSubmit={create} submitText="РЎРѕС…СЂР°РЅРёС‚СЊ" />
    </section>
  );
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

  async function checkAnswer() {
    if (!selected) {
      setError("Р’С‹Р±РµСЂРёС‚Рµ РѕС‚РІРµС‚");
      return;
    }
    setError("");

    const response = await api(`/tests/${test.id}/check-answer`, {
      method: "POST",
      body: JSON.stringify({
        questionId: currentQuestion.id,
        answer: selected,
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
        <h2>Р РµР·СѓР»СЊС‚Р°С‚: {result.grade}/10</h2>
        <p>Р РµС€РµРЅРѕ: {result.correctCount} РёР· {result.totalQuestions}</p>
        <button className="primaryBtn" onClick={() => navigate("/")}>Рљ СЃРїРёСЃРєСѓ</button>
      </article>
    );
  }

  return (
    <>
      <article className="card"><p>Р РµС€РµРЅРѕ: {solved} РёР· {questions.length}</p></article>

      {test.kind === "CARDS" ? (
        <CardsCard
          q={currentQuestion}
          test={test}
          selected={selected}
          checked={checked}
          feedback={feedback}
          onSelect={(answer) => {
            setFeedback(null);
            setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));
          }}
        />
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

      {!checked && <button className="primaryBtn" onClick={checkAnswer}>РџСЂРѕРІРµСЂРёС‚СЊ</button>}
      {checked && !isLast && (
        <button
          className="primaryBtn"
          onClick={() => {
            setCurrentIndex((prev) => prev + 1);
            setFeedback(null);
            setError("");
          }}
        >
          РЎР»РµРґСѓСЋС‰РёР№ РІРѕРїСЂРѕСЃ
        </button>
      )}
      {checked && isLast && <button className="primaryBtn" onClick={finish}>РџРѕСЃРјРѕС‚СЂРµС‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚С‹</button>}
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
  if (!test) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">{typeLabel(test.kind)}</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>РќР°Р·Р°Рґ</button>
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
  if (!test) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">{typeLabel(test.kind)} РїРѕ СЃСЃС‹Р»РєРµ</p>
          <h1>{test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>РќР°Р·Р°Рґ</button>
      </header>
      <main className="contentArea">
        <SolveFlow test={test} accessToken={token} />
      </main>
    </div>
  );
}

function AdminEditTestPage({ user }) {
  if (user.role !== "ADMIN") return <Navigate to="/" />;
  return <Navigate to="/" />;
}

export default function App() {
  const { user, loading, error } = useSession();

  if (loading) return <div className="appShell"><p className="mutedText">РџСЂРѕРІРµСЂРєР° Р°РІС‚РѕСЂРёР·Р°С†РёРё...</p></div>;
  if (!user) return <div className="appShell"><p className="errorText">{error || "РќРµ СѓРґР°Р»РѕСЃСЊ Р°РІС‚РѕСЂРёР·РѕРІР°С‚СЊСЃСЏ"}</p></div>;

  return (
    <Routes>
      <Route path="/" element={<Shell user={user} />} />
      <Route path="/test/:id" element={<SolveTestPage />} />
      <Route path="/access/:token" element={<PrivateTestPage />} />
      <Route path="/admin/tests/:id/edit" element={<AdminEditTestPage user={user} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
