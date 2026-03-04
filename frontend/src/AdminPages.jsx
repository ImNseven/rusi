import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";

function typeLabel(kind) {
  return kind === "CARDS" ? "РљР°СЂС‚РѕС‡РєРё" : "РўРµСЃС‚";
}

export function AdminStatsPage({ user }) {
  if (user.role !== "ADMIN") return <Navigate to="/" />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/admin/tests/${id}/stats`)
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!stats) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">РЎС‚Р°С‚РёСЃС‚РёРєР°</p>
          <h1>{stats.test.title}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate("/")}>РќР°Р·Р°Рґ</button>
      </header>
      <main className="contentArea">
        <article className="card">
          <p>РўРёРї: {typeLabel(stats.test.kind)}</p>
          <p>РџСЂРѕС…РѕР¶РґРµРЅРёР№: {stats.attemptsCount}</p>
          <p>РЈРЅРёРєР°Р»СЊРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: {stats.uniqueUsers}</p>
          <p>РЎСЂРµРґРЅСЏСЏ Р»СѓС‡С€Р°СЏ РѕС†РµРЅРєР°: {stats.avgGrade.toFixed(2)}</p>
        </article>

        <h3 className="blockTitle">РџРѕР»СЊР·РѕРІР°С‚РµР»Рё</h3>
        <div className="cardList">
          {stats.users.map((row) => (
            <article className="card" key={row.user.id}>
              <div className="rowBetween">
                <h3>{row.user.firstName || row.user.username || row.user.telegramId}</h3>
                <span className="kindBadge">{row.attemptsCount} РїРѕРїС‹С‚РѕРє</span>
              </div>
              <p>Р›СѓС‡С€Р°СЏ РѕС†РµРЅРєР°: {row.bestAttempt.grade}/10 ({row.bestAttempt.percent.toFixed(1)}%)</p>
              <button
                className="secondaryBtn"
                onClick={() => navigate(`/admin/tests/${id}/stats/users/${row.user.id}`)}
              >
                РџРѕСЃРјРѕС‚СЂРµС‚СЊ РѕС‚РІРµС‚С‹
              </button>
            </article>
          ))}
          {stats.users.length === 0 && <p className="mutedText">РќРёРєС‚Рѕ РµС‰Рµ РЅРµ РїСЂРѕС…РѕРґРёР»</p>}
        </div>
      </main>
    </div>
  );
}

export function AdminUserStatsPage({ user }) {
  if (user.role !== "ADMIN") return <Navigate to="/" />;
  const { id, userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/admin/tests/${id}/stats/users/${userId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id, userId]);

  if (error) return <div className="appShell"><p className="errorText">{error}</p></div>;
  if (!data) return <div className="appShell"><p className="mutedText">Р—Р°РіСЂСѓР·РєР°...</p></div>;

  return (
    <div className="appShell">
      <header className="topBar">
        <div>
          <p className="topLabel">РћС‚РІРµС‚С‹ ({typeLabel(data.test.kind)})</p>
          <h1>{data.user.firstName || data.user.username || data.user.telegramId}</h1>
        </div>
        <button className="ghostBtn" onClick={() => navigate(`/admin/tests/${id}/stats`)}>РќР°Р·Р°Рґ</button>
      </header>
      <main className="contentArea">
        <h3 className="blockTitle">РСЃС‚РѕСЂРёСЏ РїРѕРїС‹С‚РѕРє</h3>
        <div className="cardList">
          {data.attempts.map((attempt, index) => (
            <article className="card" key={attempt.attemptId}>
              <div className="rowBetween">
                <h3>РџРѕРїС‹С‚РєР° {data.attempts.length - index}</h3>
                <span className="kindBadge">{attempt.grade}/10</span>
              </div>
              <p className="mutedText">{attempt.percent.toFixed(1)}% РІРµСЂРЅРѕ</p>
              
              <div className="answersList">
                {attempt.answers.map((a) => (
                  <div key={a.questionId} className="answerAuditRow">
                    <p className="questionText">{a.questionText}</p>
                    <div className="rowBetween">
                      <p>РћС‚РІРµС‚: <span className={a.isCorrect ? "okText" : "errorText"}>{a.selected || "РїСЂРѕРїСѓС‰РµРЅ"}</span></p>
                      <p>Р’РµСЂРЅРѕ: <span>{a.correct || "-"}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
