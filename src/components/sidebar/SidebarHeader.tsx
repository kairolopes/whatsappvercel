import { Users, MessageSquare, MoreVertical, CircleDashed, Download, Building2, LogOut } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { CondominioSwitcherModal } from '@/components/auth/CondominioSwitcherModal';

export function SidebarHeader({ onImportContacts }: { onImportContacts?: () => void }) {
  const { memberships, activeCondominioId, session, signOut } = useAuthStore();
  const active = useMemo(
    () => memberships.find((m) => m.condominio_id === activeCondominioId),
    [memberships, activeCondominioId],
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const email = String(session?.user?.email || '').trim();
  const initial = (email[0] || 'U').toUpperCase();

  return (
    <>
      <div className="h-[59px] bg-wa-header flex items-center justify-between px-4 border-b border-wa-border shrink-0">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="flex items-center gap-3 min-w-0"
          title="Trocar condomínio"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-[#54656f] font-semibold">
            {initial}
          </div>
          <div className="min-w-0 hidden md:block">
            <div className="text-xs text-[#54656f] truncate">{active?.condominio?.nome || 'Condomínio'}</div>
            <div className="text-[11px] text-[#667781] truncate">{email || 'Trocar'}</div>
          </div>
        </button>
      <div className="flex items-center gap-3 text-[#54656f]">
        <button
          type="button"
          onClick={onImportContacts}
          title="Importar contatos (Z-API)"
          className="p-2 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Download size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <Users size={20} />
        </button>
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          title="Trocar condomínio"
          className="p-2 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Building2 size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <CircleDashed size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <MessageSquare size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <MoreVertical size={20} />
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          title="Sair"
          className="p-2 rounded-full hover:bg-gray-200 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </div>
      </div>

      <CondominioSwitcherModal open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
