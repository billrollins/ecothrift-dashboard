/**
 * An object window opened for real: a modal over the page, full screen on a phone, exactly like the live object
 * windows (components/objects/ObjectModal.tsx). A related row swaps the window's content in place, with Back.
 * Made-up data (windowDemos.ts). Used by the Design Lab's Windows and Registry tabs and by the page-type demos.
 */
import { Dialog, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ObjectWindow } from '../../components/objectWindow/ObjectWindow';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { objectInfo, type ObjectId } from '../../navigation/objectCatalog';
import { WINDOW_DEMOS } from './windowDemos';

const Ctx = createContext<((object: ObjectId) => void) | null>(null);

/** Open an object's demo window from anywhere under a DemoWindowProvider. */
export function useOpenDemoWindow(): (object: ObjectId) => void {
  return useContext(Ctx) ?? (() => undefined);
}

function WindowContent({ object, canGoBack, onBack, onClose, onOpen }: {
  object: ObjectId;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpen: (o: ObjectId) => void;
}) {
  const info = objectInfo(object);
  const demo = WINDOW_DEMOS[object];
  const related = demo.related ?? [];
  return (
    <ObjectWindow
      {...demo}
      objectLabel={info.label}
      Icon={ECO_ICONS[info.icon]}
      number={demo.id}
      canGoBack={canGoBack}
      onBack={onBack}
      onClose={onClose}
      onFullPage={() => undefined}
      related={related.map((r) => {
        const target = objectInfo(r.object);
        return { title: r.title ?? target.plural, Icon: ECO_ICONS[target.icon], total: r.total, rows: r.rows };
      })}
      onOpenRelated={(group) => {
        const hit = related.find((r) => (r.title ?? objectInfo(r.object).plural) === group.title);
        if (hit) onOpen(hit.object);
      }}
    />
  );
}

export function DemoWindowProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [stack, setStack] = useState<ObjectId[]>([]);
  const open = useCallback((o: ObjectId) => setStack((s) => (s[s.length - 1] === o ? s : [...s, o])), []);
  const openFresh = useCallback((o: ObjectId) => setStack([o]), []);
  const close = useCallback(() => setStack([]), []);
  const value = useMemo(() => openFresh, [openFresh]);
  const current = stack[stack.length - 1];
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={Boolean(current)} onClose={close} maxWidth="lg" fullWidth fullScreen={phone} scroll="paper"
        slotProps={{ paper: { sx: { bgcolor: 'background.default', overflow: 'hidden' } } }}>
        {current ? (
          <div style={{ overflowY: 'auto', height: phone ? '100%' : undefined, maxHeight: phone ? undefined : 'calc(100vh - 64px)' }}>
            <WindowContent key={`${stack.length}-${current}`} object={current} canGoBack={stack.length > 1}
              onBack={() => setStack((s) => s.slice(0, -1))} onClose={close} onOpen={open} />
          </div>
        ) : null}
      </Dialog>
    </Ctx.Provider>
  );
}
