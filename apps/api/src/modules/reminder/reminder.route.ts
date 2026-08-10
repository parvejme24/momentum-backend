import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireHabitOwnership } from '../../middleware/ownership.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as reminderController from './reminder.controller.js';
import {
  createReminderSchema,
  reminderIdParamsSchema,
  updateReminderSchema,
} from './reminder.schema.js';

/** Nested under `/v1/habits/:id/reminders` */
export const habitReminderRouter = Router({ mergeParams: true });

habitReminderRouter.get('/', requireHabitOwnership, asyncHandler(reminderController.listForHabit));

habitReminderRouter.post(
  '/',
  requireHabitOwnership,
  validate(createReminderSchema),
  asyncHandler(reminderController.create),
);

/** Mounted at `/v1/reminders` */
export const reminderRouter = Router();

reminderRouter.use(requireAuth);

reminderRouter.get('/', asyncHandler(reminderController.listGrouped));

reminderRouter.patch(
  '/:reminderId',
  validate(reminderIdParamsSchema, 'params'),
  validate(updateReminderSchema),
  asyncHandler(reminderController.update),
);

reminderRouter.delete(
  '/:reminderId',
  validate(reminderIdParamsSchema, 'params'),
  asyncHandler(reminderController.remove),
);
