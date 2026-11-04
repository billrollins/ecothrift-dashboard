/**
 * The two ways in to the shared signing screens (src/esign/SignerFlow, D22):
 * - `/sign?t=...`: the single-use link (a contractor, anyone outside), no login, fills the window;
 * - `/hr/sign/:partyId`: a signed-in signer inside Dash, from HR > Requests (or the owner countersigning).
 */
import { useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { linkSource, signedInSource } from '@/esign/api';
import { SignerFlow } from '@/esign/SignerFlow';
import { MY_ESIGN_KEY } from './MyEsignDocuments';

export function LinkSignPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const source = useMemo(() => linkSource(token), [token]);
  return <SignerFlow source={source} finishHint="The signed copy is emailed to you once everyone has signed. Questions: retail@ecothrift.us." />;
}

export function InAppSignPage() {
  const { partyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const source = useMemo(() => signedInSource(Number(partyId)), [partyId]);
  const back = () => {
    void queryClient.invalidateQueries({ queryKey: MY_ESIGN_KEY });
    navigate('/hr');
  };
  return (
    <Box sx={{ maxWidth: 520, mx: 'auto' }}>
      <Button onClick={back} sx={{ mb: 1 }}>Back to HR</Button>
      <SignerFlow source={source} contained finishHint="Your signed copy will be in HR > Requests once everyone has signed." />
    </Box>
  );
}
