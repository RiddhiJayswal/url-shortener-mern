import { useState } from "react";
import "./App.css";

export default function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // small helper to truncate long urls for display
  const pretty = (s = "", max = 50) => (s.length > max ? s.slice(0, max) + "..." : s);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setCopied(false);

    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to shorten");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.short_url) {
      navigator.clipboard.writeText(result.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="container">
      <h2>🔗 URL Shortener</h2>

      <form onSubmit={submit} className="form">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/very/long/url"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Shortening..." : "Shorten"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <div className="short-link">
            <a href={result.short_url} target="_blank" rel="noopener noreferrer">
              {result.short_url}
            </a>
            <button onClick={copyToClipboard}>
              {copied ? "✅ Copied" : "📋 Copy"}
            </button>
          </div>

          <p className="original-link">
            Original:{" "}
            <a
              href={result.original_url}
              target="_blank"
              rel="noopener noreferrer"
              title={result.original_url}
            >
              {pretty(result.original_url, 80)}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
