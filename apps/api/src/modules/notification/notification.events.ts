import { notifyAdmins, notifyLater, dispatch } from './notification.service.js';

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 60, 100, 365]);

export function notifyWelcome(userId: string, name: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'welcome',
      title: 'Welcome to Momentum',
      body: `Hi ${name} — log your first habit and start a chain.`,
    }),
  );
}

export function notifyEmailVerified(userId: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'email_verified',
      title: 'Email verified',
      body: 'Your email is confirmed. You are all set.',
    }),
  );
}

export function notifyHabitCreated(userId: string, habitId: string, title: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'habit_created',
      title: 'Habit added',
      body: `“${title}” is on your list. Log it today.`,
      data: { habitId, title },
    }),
  );
}

export function notifyHabitCompleted(
  userId: string,
  input: { habitId: string; title: string; localDate: string; streak: number },
): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'habit_completed',
      title: 'Habit completed',
      body: `You logged “${input.title}” for ${input.localDate}. Streak: ${input.streak}.`,
      data: input,
    }),
  );

  if (STREAK_MILESTONES.has(input.streak)) {
    notifyLater(
      dispatch({
        userId,
        audience: 'user',
        type: 'habit_streak',
        title: `${input.streak}-day streak`,
        body: `“${input.title}” just hit ${input.streak} days. Keep the chain going.`,
        data: input,
      }),
    );
  }
}

export function notifyPaymentSucceeded(
  userId: string,
  input: { amountCents: number; currency: string; planName: string },
): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'payment_succeeded',
      title: 'Payment successful',
      body: `We received ${money(input.amountCents, input.currency)} for ${input.planName}.`,
      data: input,
    }),
  );
}

export function notifyPaymentFailed(userId: string, input: { planName: string }): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'payment_failed',
      title: 'Payment failed',
      body: `We could not charge ${input.planName}. Update your card to keep access.`,
      data: input,
    }),
  );
}

export function notifyPaymentRefunded(
  userId: string,
  input: { amountCents: number; currency: string },
): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'payment_refunded',
      title: 'Refund issued',
      body: `${money(input.amountCents, input.currency)} was refunded to you.`,
      data: input,
    }),
  );
}

export function notifySubscriptionStarted(userId: string, planName: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'subscription_started',
      title: 'Subscription active',
      body: `You are now on ${planName}.`,
      data: { planName },
    }),
  );
}

export function notifySubscriptionRenewed(userId: string, planName: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'subscription_renewed',
      title: 'Subscription renewed',
      body: `${planName} renewed successfully.`,
      data: { planName },
    }),
  );
}

export function notifySubscriptionCanceled(
  userId: string,
  planName: string,
  atPeriodEnd: boolean,
): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'subscription_canceled',
      title: atPeriodEnd ? 'Cancellation scheduled' : 'Subscription canceled',
      body: atPeriodEnd
        ? `${planName} stays active until the period ends.`
        : `${planName} is no longer active.`,
      data: { planName, atPeriodEnd },
    }),
  );
}

export function notifySubscriptionPastDue(userId: string, planName: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'subscription_past_due',
      title: 'Payment past due',
      body: `${planName} is past due. Update billing to avoid losing access.`,
      data: { planName },
    }),
  );
}

export function notifyUserBanned(userId: string, reason: string | null): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'user_banned',
      title: 'Account banned',
      body: reason ?? 'Your account has been banned by an admin.',
      ...(reason ? { data: { reason } } : {}),
    }),
  );
}

export function notifyUserUnbanned(userId: string): void {
  notifyLater(
    dispatch({
      userId,
      audience: 'user',
      type: 'user_unbanned',
      title: 'Account restored',
      body: 'Your account is active again.',
    }),
  );
}

export function notifyAdminsNewUser(input: { userId: string; name: string; email: string }): void {
  notifyLater(
    notifyAdmins({
      type: 'admin_new_user',
      title: 'New customer',
      body: `${input.name} (${input.email}) just registered.`,
      data: input,
    }),
  );
}

export function notifyAdminsNewPayment(input: {
  userId: string;
  amountCents: number;
  currency: string;
  planName: string;
}): void {
  notifyLater(
    notifyAdmins({
      type: 'admin_new_payment',
      title: 'Payment received',
      body: `${money(input.amountCents, input.currency)} for ${input.planName}.`,
      data: input,
    }),
  );
}

export function notifyAdminsSubscriptionCanceled(input: {
  userId: string;
  planName: string;
}): void {
  notifyLater(
    notifyAdmins({
      type: 'admin_subscription_canceled',
      title: 'Subscription canceled',
      body: `A customer canceled ${input.planName}.`,
      data: input,
    }),
  );
}

export function notifyAdminsUserBanned(input: { userId: string; email: string }): void {
  notifyLater(
    notifyAdmins({
      type: 'admin_user_banned',
      title: 'User banned',
      body: `${input.email} was banned.`,
      data: input,
    }),
  );
}

export function notifyAdminsPlanPublished(planName: string, planId: string): void {
  notifyLater(
    notifyAdmins({
      type: 'plan_published',
      title: 'Plan published',
      body: `${planName} is now live on the pricing page.`,
      data: { planId, planName },
    }),
  );
}
