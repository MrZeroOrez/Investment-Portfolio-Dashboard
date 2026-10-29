import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n || 0,
  );
const short = (s) => s?.slice(0, 8) || "—";
function App() {
  const [session, setSession] = useState(null),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const request = async (
    path,
    { method = "GET", body, key, raw = false } = {},
  ) => {
    const r = await fetch("/api/v1" + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Authorization: "Bearer " + session.accessToken } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      let msg = "Request failed (" + r.status + ")";
      try {
        msg = (await r.json()).error || msg;
      } catch {}
      if (r.status === 401 && session) setSession(null);
      throw new Error(msg);
    }
    return raw ? r.text() : r.status === 204 ? null : r.json();
  };
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  async function authenticate(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const s = await request("/auth/" + mode, {
        method: "POST",
        body: { email: f.get("email"), password: f.get("password") },
      });
      setSession(s);
    });
  }
  async function logout() {
    await run(async () => {
      await request("/auth/logout", { method: "POST" });
      setSession(null);
    });
  }
  async function download(path, name) {
    const text = await request(path, { raw: true });
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <header>
        <div className="brand">
          <span className="logo">◈</span>
          <div>
            Wealthfolio<small>JAVA · SPRING BOOT · REACT</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="badge">SIMULATION ONLY</span>
          {session && (
            <button disabled={busy} onClick={logout}>
              Log out
            </button>
          )}
        </div>
      </header>
      <main>
        {!session ? (
          <section className="welcome">
            <div>
              <p className="eyebrow">FULL STACK LEARNING LAB</p>
              <h1>Explore investing. Understand every trade.</h1>
              <p className="muted">
                Manage portfolios, execute simulated trades, and see how market
                scenarios change your returns.
              </p>
              <div className="feature-list">
                <span>✓ Holdings and profit & loss</span>
                <span>✓ Atomic trades and CSV import</span>
                <span>✓ Allocation and market scenarios</span>
              </div>
              <p className="muted">
                No real money. No external API keys. Your data stays in the
                local SQL database.
              </p>
            </div>
            <form className="card auth" onSubmit={authenticate}>
              <h2>
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  maxLength="254"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength="12"
                  maxLength="72"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                />
              </label>
              <small>Use 12–72 characters (maximum 72 UTF-8 bytes).</small>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in"
                    : "Register"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login"
                  ? "New here? Create an account"
                  : "Already registered? Sign in"}
              </button>
            </form>
          </section>
        ) : (
          <Workspace
            session={session}
            request={request}
            run={run}
            busy={busy}
            notice={setNotice}
            download={download}
          />
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
      </main>
      <footer>
        Local development demo · Money values stored with SQL DECIMAL and Java
        BigDecimal · Access tokens expire after 15 minutes
      </footer>
    </>
  );
}
function Workspace({ session, request, run, busy, notice, download }) {
  const [portfolios, setPortfolios] = useState([]),
    [selected, setSelected] = useState(""),
    [data, setData] = useState(null),
    [trades, setTrades] = useState([]),
    [filter, setFilter] = useState(""),
    [csv, setCsv] = useState("side,symbol,quantity\nBUY,INFY,2\nBUY,ITC,5");
  const pending = useRef(null);
  async function refresh(id = selected) {
    const ps = await request("/portfolios");
    setPortfolios(ps);
    const chosen = id || ps[0]?.id || "";
    setSelected(chosen);
    if (chosen) {
      const [d, t] = await Promise.all([
        request("/portfolios/" + chosen),
        request("/portfolios/" + chosen + "/trades"),
      ]);
      setData(d);
      setTrades(t);
    } else {
      setData(null);
      setTrades([]);
    }
  }
  useEffect(() => {
    run(() => refresh());
  }, []);
  async function create(e) {
    e.preventDefault();
    const f = e.currentTarget,
      name = new FormData(f).get("name");
    await run(async () => {
      const p = await request("/portfolios", {
        method: "POST",
        body: { name },
      });
      await refresh(p.id);
      f.reset();
      notice("Portfolio created with ₹1,00,000 simulated opening cash.");
    });
  }
  async function trade(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      symbol: f.get("symbol"),
      side: f.get("side"),
      quantity: Number(f.get("quantity")),
    };
    const fingerprint = selected + JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    await run(async () => {
      await request("/portfolios/" + selected + "/trades", {
        method: "POST",
        body,
        key: pending.current.key,
      });
      pending.current = null;
      await refresh();
      notice("Trade executed at the displayed simulation price.");
    });
  }
  async function scenario(e) {
    const scenario = e.target.value;
    await run(async () => {
      await request("/portfolios/" + selected + "/scenario", {
        method: "POST",
        body: { scenario },
      });
      await refresh();
      notice(
        "Simulation market scenario changed. No live market feed is connected.",
      );
    });
  }
  async function importCsv() {
    const fp = selected + csv;
    if (pending.current?.fingerprint !== fp)
      pending.current = { fingerprint: fp, key: crypto.randomUUID() };
    await run(async () => {
      await request("/portfolios/" + selected + "/import", {
        method: "POST",
        body: { csv },
        key: pending.current.key,
      });
      pending.current = null;
      await refresh();
      notice("CSV imported. All rows committed together.");
    });
  }
  const visible = trades.filter((t) =>
    (t.symbol + " " + t.side).toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <div>
          <p className="eyebrow">YOUR INVESTMENTS</p>
          <h1>Portfolio overview</h1>
          <small>
            Simulated INR instruments · No brokerage or tax calculation
          </small>
        </div>
        <div className="inline">
          <label>
            Active portfolio
            <select
              aria-label="Active portfolio"
              value={selected}
              disabled={busy || !portfolios.length}
              onChange={(e) => run(() => refresh(e.target.value))}
            >
              {!portfolios.length && <option>Create a portfolio first</option>}
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => run(() => refresh())}>
            Refresh
          </button>
        </div>
      </div>
      <form className="inline" onSubmit={create}>
        <label>
          New portfolio
          <input
            name="name"
            placeholder="Long-term investments"
            maxLength="80"
            required
          />
        </label>
        <button disabled={busy} className="primary">
          Create portfolio
        </button>
      </form>
      {data ? (
        <>
          <div className="stats">
            <Stat label="TOTAL EQUITY" value={money(data.equity)} />
            <Stat label="AVAILABLE CASH" value={money(data.portfolio.cash)} />
            <Stat
              label="UNREALIZED P&L"
              value={money(data.unrealized)}
              positive={data.unrealized >= 0}
            />
            <Stat
              label="REALIZED P&L"
              value={money(data.portfolio.realized)}
              positive={data.portfolio.realized >= 0}
            />
          </div>
          <div className="grid">
            <section className="card">
              <div className="row">
                <h2>Holdings</h2>
                <span className="pill">{data.holdings.length} positions</span>
              </div>
              <Table
                heads={[
                  "Instrument",
                  "Qty",
                  "Average cost",
                  "Current price",
                  "Market value",
                  "P&L",
                ]}
                rows={data.holdings.map((h) => [
                  <strong>{h.symbol}</strong>,
                  h.quantity,
                  money(h.averageCost),
                  money(h.price),
                  money(h.marketValue),
                  <span className={h.unrealized >= 0 ? "positive" : "negative"}>
                    {money(h.unrealized)}
                  </span>,
                ])}
              />
              <h3 className="section-gap">
                Allocation · {money(data.marketValue)} invested
              </h3>
              {data.holdings.map((h) => (
                <div className="bar-row" key={h.symbol}>
                  <div className="row">
                    <span>{h.symbol}</span>
                    <span>
                      {(
                        (h.marketValue / (data.marketValue || 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width:
                          (h.marketValue / (data.marketValue || 1)) * 100 + "%",
                      }}
                    />
                  </div>
                </div>
              ))}
              {!data.holdings.length && (
                <p className="hint">
                  Buy an instrument to see your allocation.
                </p>
              )}
            </section>
            <section className="card">
              <h2>Place a simulated trade</h2>
              <form className="stack" onSubmit={trade}>
                <label>
                  Instrument
                  <select name="symbol" aria-label="Instrument">
                    {data.quotes.map((q) => (
                      <option value={q.symbol} key={q.symbol}>
                        {q.symbol} · {money(q.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inline">
                  <label>
                    Side
                    <select name="side" aria-label="Side">
                      <option>BUY</option>
                      <option>SELL</option>
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      defaultValue="1"
                      required
                    />
                  </label>
                </div>
                <button disabled={busy} className="primary">
                  Execute trade
                </button>
              </form>
              <label className="section-gap">
                Market scenario
                <select
                  aria-label="Market scenario"
                  disabled={busy}
                  value={
                    Number(data.portfolio.multiplier) === 1.1
                      ? "UP10"
                      : Number(data.portfolio.multiplier) === 0.9
                        ? "DOWN10"
                        : "BASE"
                  }
                  onChange={scenario}
                >
                  <option value="BASE">Base prices</option>
                  <option value="UP10">Base +10%</option>
                  <option value="DOWN10">Base −10%</option>
                </select>
              </label>
              <p className="hint">
                Scenario prices affect this portfolio only. Trades use the
                selected scenario's prices. Switch scenarios to explore profit
                and loss.
              </p>
            </section>
          </div>
          <div className="grid">
            <section className="card">
              <div className="row">
                <h2>Trade history</h2>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      download(
                        "/portfolios/" + selected + "/export",
                        "trades.csv",
                      ),
                    )
                  }
                >
                  Export CSV
                </button>
              </div>
              <label>
                Filter by instrument or side
                <input
                  className="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="INFY / BUY"
                />
              </label>
              <Table
                heads={["Time", "Symbol", "Side", "Qty", "Price", "Value"]}
                rows={visible.map((t) => [
                  new Date(t.createdAt).toLocaleString(),
                  t.symbol,
                  <span className="pill">{t.side}</span>,
                  t.quantity,
                  money(t.price),
                  money(t.total),
                ])}
              />
            </section>
            <section className="card">
              <h2>Import orders</h2>
              <label>
                CSV content
                <textarea
                  aria-label="CSV content"
                  rows="7"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                />
              </label>
              <label className="section-gap">
                Or select a .csv file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 50000) {
                        notice("File too large: maximum 50KB.");
                        return;
                      }
                      file.text().then(setCsv);
                    }
                  }}
                />
              </label>
              <p className="hint">
                Exact header: side,symbol,quantity. Up to 100 rows. Current
                simulation prices apply. One invalid row rolls back the entire
                import.
              </p>
              <button disabled={busy} onClick={importCsv}>
                Import orders
              </button>
            </section>
          </div>
        </>
      ) : (
        <div className="card section-gap empty">
          Create your first portfolio to begin.
        </div>
      )}
    </>
  );
}
function Stat({ label, value, positive }) {
  return (
    <div className="card stat">
      <small>{label}</small>
      <strong
        className={
          positive === undefined ? "" : positive ? "positive" : "negative"
        }
      >
        {value}
      </strong>
    </div>
  );
}
function Table({ heads, rows, empty = "No records yet." }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const pages = Math.ceil(rows.length / 8);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {heads.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 8, page * 8 + 8).map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">{empty}</div>}
      </div>
      {pages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          {page + 1} / {pages}
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
