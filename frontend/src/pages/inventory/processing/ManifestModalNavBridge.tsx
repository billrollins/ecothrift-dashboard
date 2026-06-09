import { useContext, useEffect } from 'react';
import { ManifestFieldNavContext } from './manifestFieldNav';

export function ManifestModalNavBridge({
  onOpenIdentifiers,
  onOpenTags,
  onOpenNotes,
}: {
  onOpenIdentifiers: () => void;
  onOpenTags: () => void;
  onOpenNotes: () => void;
}) {
  const nav = useContext(ManifestFieldNavContext);

  useEffect(() => {
    if (!nav) return;
    const unregisterIdentifiers = nav.registerOpener('identifiers', onOpenIdentifiers);
    const unregisterTags = nav.registerOpener('tags', onOpenTags);
    const unregisterNotes = nav.registerOpener('notes', onOpenNotes);
    return () => {
      unregisterIdentifiers();
      unregisterTags();
      unregisterNotes();
    };
  }, [nav, onOpenIdentifiers, onOpenTags, onOpenNotes]);

  return null;
}
