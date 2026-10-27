import { NextResponse } from 'next/server';
import { LumoAuthApprovalNotDeliveredError } from '@lumoauth/client';
import { lumo } from '@/lib/lumo';

/**
 * Push-approval-for-agent-actions demo.
 *
 * The agent wants to do something irreversible (wire transfer). It calls
 * `agent.requireApproval()` which:
 *   1. sends a push to the user's phone with the action description
 *   2. polls until the user taps approve/deny (or the request times out)
 *   3. resolves with the approval status + a short-lived approval token
 *
 * When the user has no enrolled push device, no prompt is sent and it
 * throws LumoAuthApprovalNotDeliveredError instead (never "approved").
 *
 * This is the demo nobody else has.
 */
export async function POST(req: Request) {
  const { action, amount, vendor, onBehalfOf } = await req.json();

  const description = `Wire $${Number(amount).toLocaleString()} to vendor ${vendor}`;

  let approval;
  try {
    approval = await lumo.agent.requireApproval({
      taskId: `wire-${action}-${vendor}`,
      reason: description,
      impact: 'high',
      // The user (subject) who must approve. In a real app this is the signed-in
      // user the agent is acting for.
      onBehalfOf: onBehalfOf ?? 'user@example.com',
      meta: { action, amount, vendor },
    });
  } catch (err) {
    if (err instanceof LumoAuthApprovalNotDeliveredError) {
      // email_fallback_sent: the user was emailed and should enrol a device.
      // no_enrolled_device: no device, and the email could not be sent.
      return NextResponse.json(
        { error: 'approval_not_delivered', reason: err.reason },
        { status: 409 },
      );
    }
    throw err;
  }

  if (approval.status !== 'approved') {
    return NextResponse.json(
      { error: 'denied', status: approval.status, reason: approval.reason },
      { status: 403 },
    );
  }

  // The approval token is short-lived and bound to this specific task.
  // Use it as the auth header for the actual side-effecting call.
  return NextResponse.json({
    ok: true,
    description,
    approvalToken: approval.token,
    approvedBy: approval.approvedBy,
    respondedAt: approval.respondedAt,
  });
}
