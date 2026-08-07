import { retailMapsEmbedSrc, STORE } from '../data/content'

export default function StoreMap() {
  return (
    <div className="map">
      <iframe
        title={`Map - ${STORE.retail.name}`}
        src={retailMapsEmbedSrc()}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  )
}
