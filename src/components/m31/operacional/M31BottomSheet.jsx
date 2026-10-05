import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

export default function M31BottomSheet({ open, onOpenChange, title, children }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[90dvh] rounded-t-2xl border-m31-border bg-m31-surface">
        <DrawerHeader className="sticky top-0 z-10 border-b border-m31-border bg-m31-surface pr-20 text-left">
          <DrawerTitle className="text-xl text-m31-ink">{title}</DrawerTitle>
          <DrawerClose className="absolute right-3 top-3 min-h-12 rounded-xl px-4 text-sm font-bold text-m31-primary">Fechar</DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

