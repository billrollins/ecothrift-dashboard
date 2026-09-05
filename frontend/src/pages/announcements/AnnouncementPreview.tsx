import type { Announcement, AnnouncementPlacement } from '../../api/webstore.api';
import './announcement.css';

function Card({
  announcement,
  placement,
}: {
  announcement: Partial<Announcement>;
  placement: AnnouncementPlacement;
}) {
  const style = announcement.style || 'info';
  const isBanner = placement === 'banner';
  const cls = [
    'ann',
    isBanner ? 'ann--banner' : 'ann--card',
    `ann--${style}`,
  ].join(' ');
  return (
    <div className={cls}>
      <div>
        {announcement.title ? <h3 className="ann__title">{announcement.title}</h3> : null}
        {announcement.body_html ? (
          <div className="ann__body" dangerouslySetInnerHTML={{ __html: announcement.body_html }} />
        ) : (
          <p>Body preview…</p>
        )}
        {announcement.images && announcement.images.length > 0 ? (
          <div className="ann__gallery">
            {announcement.images.map((img) => (
              <img key={img.id} src={img.url} alt={img.alt || ''} />
            ))}
          </div>
        ) : null}
        {announcement.cta_label ? (
          <span className="ann__cta">{announcement.cta_label}</span>
        ) : null}
      </div>
    </div>
  );
}

export function AnnouncementPreview({ announcement }: { announcement: Partial<Announcement> }) {
  const placements = announcement.placements?.length
    ? announcement.placements
    : (['banner'] as AnnouncementPlacement[]);
  return (
    <div>
      {placements.map((placement) => (
        <div key={placement}>
          <div className="ann-preview-label">{placement.replace('_', ' ')}</div>
          <Card announcement={announcement} placement={placement} />
        </div>
      ))}
    </div>
  );
}
