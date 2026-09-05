import type { PublicAnnouncement } from '../api'
import AnnouncementGallery from './AnnouncementGallery'

export default function AnnouncementCard({
  announcement,
}: {
  announcement: PublicAnnouncement
}) {
  const style = announcement.style || 'info'
  return (
    <article className={`ann ann--card ann--${style}`}>
      {announcement.title ? <h3 className="ann__title">{announcement.title}</h3> : null}
      {announcement.body_html ? (
        <div className="ann__body" dangerouslySetInnerHTML={{ __html: announcement.body_html }} />
      ) : null}
      <AnnouncementGallery images={announcement.images || []} />
      {announcement.cta_label && announcement.cta_url ? (
        <a className="ann__cta" href={announcement.cta_url}>
          {announcement.cta_label}
        </a>
      ) : null}
    </article>
  )
}
