import { useEffect, useMemo, useState } from "react";

export default function Admin() {
  const api = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
  const key = import.meta.env.VITE_ADMIN_KEY;
  const shortBase = (import.meta.env.VITE_SHORT_BASE || "").replace(/\/+$/, "");

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total_links: 0, total_visits: 0 });

  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const headers = useMemo(() => ({ "x-admin-key": key }), [key]);

  const makeShortHref = (r) => {
    if (r.short_url) return r.short_url; // prefer API-provided
    if (shortBase && r.short_code) return `${shortBase}/${r.short_code}`;
    if (api && r.short_code) return `${api}/${r.short_code}`;
    return "";
  };

  async function load() {
    if (!api || !key) {
      setErr("Missing VITE_API_BASE or VITE_ADMIN_KEY.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const [listRes, sumRes] = await Promise.all([
        fetch(`${api}/api/admin/links?page=${page}&limit=${limit}`, { headers }),
        fetch(`${api}/api/admin/summary`, { headers }),
      ]);

      // links
      if (!listRes.ok) {
        const t = await listRes.text();
        throw new Error(`links ${listRes.status}: ${t.slice(0, 200)}`);
      }
      const list = await listRes.json();
      const dataRows = Array.isArray(list) ? list : (list.rows || []);
      setRows(dataRows);
      setPage(list.page || 1);
      setPages(list.pages || Math.max(1, Math.ceil((list.total || 0) / limit)));
      setTotal(list.total || dataRows.length);

      // summary
      if (!sumRes.ok) {
        const t = await sumRes.text();
        // don’t throw; just show zeroes
        console.warn("summary error:", sumRes.status, t);
        setSummary({ total_links: 0, total_visits: 0 });
      } else {
        const sum = await sumRes.json();
        setSummary({
          total_links: sum.total_links || 0,
          total_visits: sum.total_visits || 0,
        });
      }
    } catch (e) {
      console.error("admin load failed:", e);
      setErr(e.message || "Failed to load admin data");
      setRows([]);
      setPages(1);
      setTotal(0);
      setSummary({ total_links: 0, total_visits: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, api, key]);

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const deleteOne = async (id) => {
    if (!confirm("Delete this link?")) return;
    try {
      const res = await fetch(`${api}/api/admin/links/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Delete failed");
      }
      setRows((r) => r.filter((x) => (x.id || x._id) !== id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      // optionally refresh counters & pagination after deletion
      load();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} link(s)?`)) return;
    try {
      const res = await fetch(`${api}/api/admin/links`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Bulk delete failed");
      }
      setSelected(new Set());
      // reload page (handles last-page deletions nicely)
      load();
    } catch (e) {
      alert(e.message || "Bulk delete failed");
    }
  };

  const allSelectedOnPage = rows.length && rows.every(r => selected.has(r.id || r._id));
  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      // unselect current page rows
      setSelected((prev) => {
        const n = new Set(prev);
        rows.forEach(r => n.delete(r.id || r._id));
        return n;
      });
    } else {
      // select current page rows
      setSelected((prev) => {
        const n = new Set(prev);
        rows.forEach(r => n.add(r.id || r._id));
        return n;
      });
    }
  };

  return (
    <div className="admin-container">
      <h2>Admin • URL Shortener</h2>

      <div className="admin-bar" style={{display:"flex", gap:12, alignItems:"center", margin:"12px 0"}}>
        <div>Links: <strong>{summary.total_links}</strong></div>
        <div>Total Visits: <strong>{summary.total_visits}</strong></div>
        <button onClick={load} disabled={loading}>Refresh</button>
        <button onClick={deleteSelected} disabled={!selected.size}>Delete Selected ({selected.size})</button>
        {loading && <span className="muted">Loading…</span>}
      </div>

      {err && <p className="error">{err}</p>}

      <div className="table-wrap">
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th style={{width:36}}>
                <input
                  type="checkbox"
                  aria-label="select all"
                  checked={!!rows.length && allSelectedOnPage}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Created</th>
              <th>Short</th>
              <th>Original</th>
              <th>Visits</th>
              <th style={{width:90}}></th>
            </tr>
          </thead>
          <tbody>
          {rows.map((r) => {
            const id = r.id || r._id;

            // Build a reliable full short URL
            const base =
              (import.meta.env.VITE_SHORT_BASE ||
                import.meta.env.VITE_API_BASE ||
                "").replace(/\/+$/, ""); // trim trailing slash

            const href =
              r.short_url ||
              (r.short_code && base ? `${base}/${r.short_code}` : "");

            return (
              <tr key={id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggle(id)}
                    aria-label="select row"
                  />
                </td>

                <td>{new Date(r.createdAt).toLocaleString()}</td>

                <td>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={href} // full link on hover
                    >
                      {href}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>

                <td
                  title={r.original_url}
                  style={{
                    maxWidth: 520,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.original_url}
                </td>

                <td>{r.visits}</td>

                <td>
                  <button onClick={() => deleteOne(id)}>Delete</button>
                </td>
              </tr>
            );
          })}

          {!rows.length && !loading && (
            <tr>
              <td colSpan={6} className="center">
                No data
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>

      <div className="pager" style={{display:"flex", gap:8, alignItems:"center", marginTop:12}}>
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <span className="muted">Page {page} / {pages} • Total {total}</span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
