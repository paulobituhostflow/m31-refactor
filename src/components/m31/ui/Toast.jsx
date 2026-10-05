/**
 * Toast — feedback pós-ação canônico via sonner.
 * Uso: import { feedback } from '@/components/m31/ui/Toast';
 *      feedback.success('Inscrição confirmada');
 * Montar <FeedbackToaster /> uma vez no App (já adicionado).
 */
import { toast, Toaster } from 'sonner';
import { TOKENS } from '@/lib/m31DesignTokens';

export const feedback = {
  success: (msg, opts) => toast.success(msg, opts),
  error:   (msg, opts) => toast.error(msg, opts),
  warning: (msg, opts) => toast.warning(msg, opts),
  info:    (msg, opts) => toast.info(msg, opts),
  loading: (msg, opts) => toast.loading(msg, opts),
  promise: (p, m, o)  => toast.promise(p, m, o),
};

export function FeedbackToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: { fontFamily: TOKENS.font.body, borderRadius: TOKENS.radius.md },
      }}
    />
  );
}

export default feedback;