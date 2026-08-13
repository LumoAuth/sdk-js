import { NextResponse } from 'next/server';
import { lumo } from '@/lib/lumo';

/**
 * Sample agent endpoint. The agent's access token carries its identity; the
 * LumoAuth PDP enforces what the agent is allowed to do via the Zanzibar/ABAC
 * policies you author in the dashboard.
 *
 * `permissions.check` returns a boolean — allow/deny for this agent + permission.
 */
export async function POST(req: Request) {
  const { task } = await req.json();

  const allowed = await lumo.permissions.check('reports.send', { task });
  if (!allowed) {
    return NextResponse.json({ error: 'denied', permission: 'reports.send' }, { status: 403 });
  }

  // Pretend the agent did some work.
  return NextResponse.json({
    ok: true,
    task,
    message: 'Agent completed task without human-in-the-loop.',
  });
}
