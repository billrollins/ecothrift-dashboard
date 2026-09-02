import { Box, Button, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { GroupHeader } from '../../components/duty/GroupHeader';
import { StatusTag } from '../../components/duty/StatusTag';
import { TaskCard } from '../../components/duty/TaskCard';
import { dutyColors } from '../../components/duty/tokens';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useAuth } from '../../hooks/useAuth';
import { useMyDocumentRecipients, useStaffDocuments } from '../../hooks/useDocuments';
import type { DocumentMode } from '../../api/documents.api';

function modeTag(mode: DocumentMode) {
  if (mode === 'sign') return <StatusTag label="Sign" tone="violet" />;
  if (mode === 'acknowledge') return <StatusTag label="Acknowledge" tone="blue" />;
  return <StatusTag label="Read" tone="plain" />;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mine = useMyDocumentRecipients();
  const catalog = useStaffDocuments();
  const open = (mine.data ?? []).filter((row) => row.status !== 'completed');
  const done = (mine.data ?? []).filter((row) => row.status === 'completed');

  if (mine.isLoading && !mine.data) return <LoadingScreen message="Loading documents..." />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: `1px solid ${dutyColors.ink15}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: dutyColors.ink }}>Documents</Typography>
          {user?.is_superuser ? (
            <Button size="small" onClick={() => navigate('/documents/new')}>Upload</Button>
          ) : null}
        </Box>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mt: 0.5, minHeight: 20 }}>
          Sign, acknowledge, or read what was assigned to you.
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <GroupHeader title="Needs you" count={open.length} />
        {open.length ? open.map((row) => (
          <TaskCard
            key={row.id}
            title={row.title}
            meta={row.due_at ? `Due ${format(parseISO(row.due_at), 'EEE MMM d')}` : (row.message || 'Assigned to you')}
            tags={modeTag(row.mode)}
            onClick={() => navigate(`/documents/${row.id}/sign`)}
          />
        )) : (
          <Typography sx={{ px: 2, pb: 1, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>None</Typography>
        )}
        <GroupHeader title="Done" count={done.length} />
        {done.length ? done.map((row) => (
          <TaskCard
            key={row.id}
            title={row.title}
            meta={row.completed_at ? `Finished ${format(parseISO(row.completed_at), 'EEE h:mma')}` : 'Finished'}
            tags={<StatusTag label="Done" tone="green" />}
          />
        )) : (
          <Typography sx={{ px: 2, pb: 1, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>None</Typography>
        )}
        {user?.is_superuser ? (
          <>
            <GroupHeader title="All documents" count={catalog.data?.length ?? 0} />
            {(catalog.data ?? []).map((doc) => (
              <TaskCard
                key={doc.id}
                title={doc.title}
                meta={`${doc.completed_count}/${doc.assigned_count} complete`}
                tags={modeTag(doc.mode)}
                onClick={() => navigate(`/documents/${doc.id}/edit`)}
              />
            ))}
          </>
        ) : null}
      </Box>
    </Box>
  );
}
