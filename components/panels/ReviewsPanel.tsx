'use client';

import type { AgentTown } from '../../src/index';
import type { AgentSimulation } from '../../lib/simulation';

interface Props {
  town: AgentTown;
  sim: AgentSimulation;
  onUpdate: () => void;
}

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  approval: { bg: '#3498DB33', fg: '#3498DB' },
  decision: { bg: '#F39C1233', fg: '#F39C12' },
  feedback: { bg: '#9B59B633', fg: '#9B59B6' },
};

export function ReviewsPanel({ town, sim, onUpdate }: Props) {
  const reviews = town.getReviews();
  const pending = reviews.filter((r) => r.status === 'pending');
  const resolved = reviews.filter((r) => r.status !== 'pending');

  const handleApprove = (reviewId: string) => {
    sim.onReviewResolved(reviewId, 'approved');
    onUpdate();
  };

  const handleReject = (reviewId: string) => {
    sim.onReviewResolved(reviewId, 'rejected');
    onUpdate();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (reviews.length === 0) {
    return <div className="empty">No reviews submitted yet.</div>;
  }

  return (
    <div>
      {/* Pending reviews */}
      <div className="section-h">
        <span>Pending Reviews</span>
        {pending.length > 0 && <span className="badge-count">{pending.length}</span>}
      </div>

      {pending.length === 0 && (
        <div style={{ fontSize: 11, color: '#555', padding: '8px 0' }}>
          All caught up! No pending reviews.
        </div>
      )}

      {pending.map((review) => {
        const typeBadge = TYPE_BADGE[review.type] ?? TYPE_BADGE.approval;
        return (
          <div key={review.id} className="review-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <h4 style={{ flex: 1, margin: 0 }}>{review.title}</h4>
              <span
                className="badge"
                style={{ background: typeBadge.bg, color: typeBadge.fg }}
              >
                {review.type}
              </span>
            </div>
            <p style={{ margin: '0 0 4px' }}>{review.description}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                {review.agentName} &middot; {formatTime(review.createdAt)}
              </span>
              <div className="review-actions">
                <button className="btn-g" onClick={() => handleApprove(review.id)}>
                  Approve
                </button>
                <button className="btn-w" onClick={() => handleReject(review.id)}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Resolved reviews */}
      {resolved.length > 0 && (
        <>
          <div className="section-h" style={{ marginTop: 16 }}>
            <span>Resolved</span>
            <span className="cnt">{resolved.length}</span>
          </div>

          {resolved.map((review) => {
            const isApproved = review.status === 'approved';
            return (
              <div
                key={review.id}
                className="review-card"
                style={{ opacity: 0.5 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <h4 style={{ flex: 1, margin: 0 }}>{review.title}</h4>
                  <span
                    className="badge"
                    style={{
                      background: isApproved ? '#27AE6033' : '#E74C3C33',
                      color: isApproved ? '#27AE60' : '#E74C3C',
                    }}
                  >
                    {review.status}
                  </span>
                </div>
                <p style={{ margin: 0 }}>{review.description}</p>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  {review.agentName} &middot; {formatTime(review.createdAt)}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
