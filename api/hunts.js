import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, initCsrf } from '../ApiClient';

export default function HuntPage() {
  const { id } = useParams();
  const [hunt, setHunt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setErr('');
      try {
        await initCsrf();
        // baseURL already includes /api
        const res = await api.get(`/hunts/${id}`, { signal: controller.signal });
        if (!alive) return;
        setHunt(res.data);
      } catch (e) {
        if (!alive) return;
        // If request was aborted, do nothing
        if (e.name === 'CanceledError' || e.name === 'AbortError') return;

        const msg =
          e?.response?.data?.error ||
          (e?.response?.status ? `Error ${e.response.status}` : 'Failed to load hunt');
        setErr(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [id]);

  if (loading) return <div className="page">Loading hunt…</div>;

  if (err) {
    return (
      <div className="page" style={{ textAlign: 'center', marginTop: 32 }}>
        <p>{err}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  if (!hunt) return <div className="page">Not found</div>;

  const checkpoints = (hunt.checkpoints || [])
    .slice()
    .sort((a, b) => (a.order ?? a.sortOrder ?? 0) - (b.order ?? b.sortOrder ?? 0));

  return (
    <div className="page">
      <h1>{hunt.title}</h1>
      {hunt.description && <p>{hunt.description}</p>}

      <h3>Checkpoints ({checkpoints.length})</h3>
      <ol>
        {checkpoints.map((cp) => (
          <li key={cp.id}>
            <strong>{cp.title}</strong>
            {cp.riddle && <div>{cp.riddle}</div>}
            <small>
              lat {cp.lat}, lng {cp.lng}, tol {cp.tolerance}m
            </small>
          </li>
        ))}
      </ol>

      <Link to="…/play">Start hunt</Link>{' '}
      <span style={{ opacity: 0.5 }}>·</span>{' '}
      <Link to="/">← Back</Link>
    </div>
  );
}
