import { useMutation, useQuery } from '@tanstack/react-query';
import { getAIModels, sendAIChat, type AIChatPayload } from '../api/ai.api';

export function useAIModels() {
  return useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => getAIModels().then((r) => r.data),
    staleTime: 1000 * 60 * 30,
  });
}

export function useAIChat() {
  return useMutation({
    mutationFn: (payload: AIChatPayload) => sendAIChat(payload).then((r) => r.data),
  });
}
