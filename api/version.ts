export default function handler(_req: any, res: any) {
  const gitSha =
    String(process.env.VERCEL_GIT_COMMIT_SHA || '') ||
    String(process.env.GIT_COMMIT_SHA || '') ||
    String(process.env.COMMIT_SHA || '') ||
    '';

  res.status(200).json({
    ok: true,
    sha: gitSha || null,
    deployedAt: new Date().toISOString(),
  });
}

