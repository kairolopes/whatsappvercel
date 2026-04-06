import { X, Download } from 'lucide-react';

interface ImportContactsModalProps {
  open: boolean;
  loading: boolean;
  importedCount: number | null;
  error: string | null;
  onClose: () => void;
  onImport: () => void | Promise<void>;
}

export function ImportContactsModal({ open, loading, importedCount, error, onClose, onImport }: ImportContactsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-w-[92vw] bg-white rounded-lg overflow-hidden shadow-xl">
        <div className="h-[56px] px-4 flex items-center justify-between bg-wa-header">
          <div className="text-[14px] text-wa-text">Importar contatos</div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="text-[13px] text-wa-muted">
            Busca os contatos disponíveis na instância da Z-API e adiciona na sua lista para iniciar conversas.
          </div>

          {importedCount !== null ? (
            <div className="mt-3 rounded-lg border border-wa-border bg-[#f0f2f5] px-3 py-2 text-[13px] text-wa-text">
              {importedCount === 0 ? 'Nenhum contato encontrado para importar.' : `${importedCount} contato(s) importado(s).`}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onImport}
            disabled={loading}
            className="mt-4 w-full h-[40px] rounded-full bg-[#00a884] text-white text-[14px] hover:brightness-95 disabled:opacity-60 disabled:hover:brightness-100 flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {loading ? 'Importando…' : 'Importar agora'}
          </button>
        </div>
      </div>
    </div>
  );
}

