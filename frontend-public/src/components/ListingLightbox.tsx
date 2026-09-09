import { useEffect } from 'react'
import { catalogImageUrl, type CatalogImage } from '../api'

export default function ListingLightbox({
  images,
  index,
  title,
  onClose,
  onIndex,
}: {
  images: CatalogImage[]
  index: number
  title: string
  onClose: () => void
  onIndex: (next: number) => void
}) {
  const image = images[index]
  const src = catalogImageUrl(image, 'full')
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1)
      if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasNext, hasPrev, index, onClose, onIndex])

  if (!image || !src) return null

  return (
    <dialog
      className="listing-lightbox"
      open
      onClick={onClose}
      aria-label="Full photo"
    >
      <div className="listing-lightbox__bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {title} · {index + 1} / {images.length}
        </span>
        <button type="button" className="listing-lightbox__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <button
        type="button"
        className="listing-lightbox__nav listing-lightbox__nav--prev"
        disabled={!hasPrev}
        aria-label="Previous photo"
        onClick={(e) => {
          e.stopPropagation()
          if (hasPrev) onIndex(index - 1)
        }}
      >
        ‹
      </button>
      <img
        src={src}
        alt={image.alt || title}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="listing-lightbox__nav listing-lightbox__nav--next"
        disabled={!hasNext}
        aria-label="Next photo"
        onClick={(e) => {
          e.stopPropagation()
          if (hasNext) onIndex(index + 1)
        }}
      >
        ›
      </button>
    </dialog>
  )
}
