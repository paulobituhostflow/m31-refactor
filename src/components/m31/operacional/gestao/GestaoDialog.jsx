import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function GestaoDialog({ open = true, onClose, title, description, children }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="m31-gestao-dialog" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description || 'Gestão da inscrição M31 Filhas.'}</DialogDescription>
        </DialogHeader>
        <div className="m31-gestao-dialog-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
