import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { Box, Button, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import MemberCard from '../../components/thriftplus/MemberCard';
import MemberFind from '../../components/thriftplus/MemberFind';

/**
 * Thrift+ member lookup (owner 2026-10-20): Find (a member QR scanned, a name, phone, email or member #), then the
 * member's card: photo, status, ThriftBucks earned, used and left, Thrift+ credit, recent trips and the people on the
 * membership. ``/pos/members?person=<person_id>`` opens that member's card straight away (the Returns page links here).
 */
export default function MembersLookupPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('person') ?? '';
  const personId = /^\d+$/.test(raw) ? Number(raw) : null;

  return (
    <Box>
      <PageHeader title="Thrift+ members" subtitle="Scan a member QR, or search by name, phone, email or member #." />
      <Stack spacing={2} sx={{ maxWidth: 680 }}>
        {personId === null ? (
          <MemberFind autoFocus onPick={(p) => setParams({ person: String(p.person_id) })} />
        ) : (
          <>
            <Box>
              <Button startIcon={<ArrowBackRounded />} onClick={() => setParams({})} sx={{ minHeight: 48 }} data-testid="members-find-another">
                Find someone else
              </Button>
            </Box>
            <MemberCard personId={personId} />
          </>
        )}
      </Stack>
    </Box>
  );
}
