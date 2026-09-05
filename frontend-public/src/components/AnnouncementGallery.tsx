import { useState } from 'react'
import type { PublicAnnouncementImage } from '../api'

export default function AnnouncementGallery({ images }: { images: PublicAnnouncementImage[] }) {
  const [open, setOpen] = useState<PublicAnnouncementImage | null>(null)
  if (!images.length) return null
  return (
    <>
      <div className="ann__gallery">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            className="ann__thumb"
            onClick={() => setOpen(img)}
          >
            <img src={img.url} alt={img.alt || ''} />
          </button>
        ))}
      </div>
      {open ? (
        <dialog className="ann__lightbox" open onClick={() => setOpen(null)}>
          <img src={open.url} alt={open.alt || ''} />
        </dialog>
      ) : null}
    </>
  )
}
