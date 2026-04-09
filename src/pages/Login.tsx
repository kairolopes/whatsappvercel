import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

function classNames(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { session, memberships, activeCondominioId, error, signIn, signOut, selectCondominio, activeRole } = useAuthStore();

  const from = (loc.state as any)?.from as string | undefined;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const mustChoose = Boolean(session) && memberships.length > 1;

  const canProceed = useMemo(() => {
    if (!session) return false;
    if (!activeCondominioId) return false;
    return true;
  }, [session, activeCondominioId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setLocalError('Falha ao autenticar.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[980px] grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="hidden xl:block">
          <div className="rounded-3xl bg-gradient-to-br from-zinc-900/80 to-zinc-900/30 border border-zinc-800 p-8 h-full">
            <div className="text-sm text-zinc-400">Portal Multi-Condomínio</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Acesse com segurança</h1>
            <p className="mt-3 text-zinc-300 leading-relaxed">
              Cada login opera em um condomínio isolado. Seus dados, conversas e configurações Z-API ficam separadas por contexto.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4">
              <div className="rounded-2xl bg-zinc-950/40 border border-zinc-800 p-4">
                <div className="text-sm font-medium">Sessão por usuário</div>
                <div className="mt-1 text-sm text-zinc-400">Tokens individuais e expiração controlada pelo Supabase.</div>
              </div>
              <div className="rounded-2xl bg-zinc-950/40 border border-zinc-800 p-4">
                <div className="text-sm font-medium">Isolamento por condomínio</div>
                <div className="mt-1 text-sm text-zinc-400">RLS impede qualquer acesso cruzado no banco.</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-zinc-400">Entrar</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">Login do sistema</h2>
              </div>
              {session ? (
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-sm text-zinc-300 hover:text-white transition"
                >
                  Sair
                </button>
              ) : null}
            </div>

            {!session ? (
              <form onSubmit={onSubmit} className="mt-6">
                <label className="block text-sm text-zinc-300">E-mail</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-2 w-full h-10 px-3 rounded-xl bg-zinc-950/40 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="voce@exemplo.com"
                />

                <label className="block text-sm text-zinc-300 mt-4">Senha</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-2 w-full h-10 px-3 rounded-xl bg-zinc-950/40 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••"
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className={classNames(
                    'mt-6 h-10 px-4 rounded-xl font-medium transition w-full',
                    isLoading
                      ? 'bg-emerald-600/60 text-white/80 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white',
                  )}
                >
                  {isLoading ? 'Entrando…' : 'Entrar'}
                </button>

                {(error || localError) ? (
                  <div className="mt-4 text-sm text-red-400">{error || localError}</div>
                ) : null}
              </form>
            ) : (
              <div className="mt-6">
                <div className="text-sm text-zinc-300">Selecione o condomínio</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {memberships.map((m) => {
                    const selected = m.condominio_id === activeCondominioId;
                    const isAdmin = m.role === 'admin' || m.role === 'master';
                    return (
                      <button
                        key={m.condominio_id}
                        type="button"
                        onClick={async () => {
                          await selectCondominio(m.condominio_id);
                          nav(from || '/app');
                        }}
                        className={classNames(
                          'text-left rounded-2xl border p-4 transition',
                          selected
                            ? 'bg-emerald-600/15 border-emerald-600/60'
                            : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700',
                        )}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-medium">{m.condominio?.nome || 'Condomínio'}</div>
                            <div className="mt-1 text-xs text-zinc-400">{m.condominio?.slug || m.condominio_id}</div>
                          </div>
                          <div
                            className={classNames(
                              'text-xs px-2 py-1 rounded-full border',
                              isAdmin ? 'border-emerald-500/50 text-emerald-300' : 'border-zinc-700 text-zinc-300',
                            )}
                          >
                            {isAdmin ? 'Admin' : 'Usuário'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {(error || localError) ? (
                  <div className="mt-4 text-sm text-red-400">{error || localError}</div>
                ) : null}

                {!memberships.length ? (
                  <div className="mt-4 text-sm text-zinc-300">
                    Você está autenticado, mas sem vínculo ativo. Contate o administrador.
                  </div>
                ) : null}

                {memberships.length === 1 && activeCondominioId ? (
                  <button
                    type="button"
                    onClick={() => nav(from || '/app')}
                    className="mt-6 h-10 px-4 rounded-xl font-medium transition w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Acessar
                  </button>
                ) : null}

                {activeRole === 'admin' || activeRole === 'master' ? (
                  <button
                    type="button"
                    onClick={() => nav('/admin')}
                    className="mt-3 h-10 px-4 rounded-xl font-medium transition w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                  >
                    Administração
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
