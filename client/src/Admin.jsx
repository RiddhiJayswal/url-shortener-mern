import { useEffect, useState } from "react";

export default function Admin() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total_links: 0, total_visits: 0 });
  const [page, setPage] = useState(1);
  const limit = 20;

  const api = import.meta.env.VITE_API_BASE;
  const key = import.meta.env.VITE_ADMIN_KEY;

  async function load() {
    try {
      const [listRes, sumRes] = await Promise.all([
        fetch(`${api}/api/admin/links?page=${page}&limit=${limit}`, {
          headers: { "x-admin-key": key }
        }),
        fetch(`${api}/api/admin/summary`, {
          headers: { "x-admin-key": key }
        })
      ]);

      if (!listRes.ok) {
        const t = await listRes.text();
        console.error("links error:", listRes.status, t);
        setRows([]);
      } else {
        const list = await listRes.json();
        const rowsArray = Array.isArray(list) ? list : (list.rows || []);
        setRows(rowsArray);
      }

      if (!sumRes.ok) {
        const t = await sumRes.text();
        console.error("summary error:", sumRes.status, t);
        setSummary({ total_links: 0, total_visits: 0 });
      } else {
        const sum = await sumRes.json();
        setSummary(sum);
      }
    } catch (e) {
      console.error("admin load failed:", e);
      setRows([]);
      setSummary({ total_links: 0, total_visits: 0 });
    }
  }

  useEffect(() => {
    load().then(() => {
      if (rows.length) {
        console.log("sample row:", rows[0]);
      }
    });
  }, [page]);

  return (
    <div className="admin-container">
      <h2>Admin • URL Shortener</h2>

      <div className="admin-bar">
        <div>Links: <strong>{summary.total_links}</strong></div>
        <div>Total Visits: <strong>{summary.total_visits}</strong></div>
        <button onClick={load}>Refresh</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Short</th>
            <th>Original</th>
            <th>Visits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const base = import.meta.env.VITE_API_BASE?.replace(/\/+$/, "") || "";
            const shortHref = r.short_url || (r.short_code ? `${base}/${r.short_code}` : "");

            return (
              <tr key={r.id || r._id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  {shortHref ? (
                    <a href={shortHref} target="_blank" rel="noreferrer">{shortHref}</a>
                  ) : (
                    <span className="muted-dash">—</span>
                  )}
                </td>
                <td className="truncate" title={r.original_url}>
                  {r.original_url}
                </td>
                <td>{r.visits}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td colSpan="4">No data yet</td></tr>
          )}
        </tbody>
      </table>

      <div className="pager">
        <button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Prev</button>
        <button onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>
    </div>
  );
}
