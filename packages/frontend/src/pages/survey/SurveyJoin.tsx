import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';

/**
 * Resolves a shared campaign link (/survey/c/:campaignId) by minting a fresh
 * anonymous SurveyInvite on the server, then redirects to /survey/:token where
 * the regular SurveyLanding page picks it up.
 */
export default function SurveyJoin() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!campaignId) return;
    (async () => {
      try {
        const { token } = await api<{ token: string }>(
          `/api/public/campaigns/${campaignId}/join`,
          { method: 'POST', body: {}, auth: false },
        );
        if (!cancelled) navigate(`/survey/${token}`, { replace: true });
      } catch (e) {
        if (!cancelled) setError((e as ApiError).message);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId, navigate]);

  return (
    <div className="survey-theme">
      <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        {error ? (
          <>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: '1.5rem', marginBottom: '.5rem' }}>
              Survey submitted!!
            </h1>
            <p style={{ color: 'var(--muted)' }}>{error}</p>
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Opening survey…</p>
        )}
      </main>
    </div>
  );
}
