import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const nameSchema = z.string().trim().min(1).max(60);

export const timezoneSchema = z.string().trim().min(1);

export const weekStartsOnSchema = z.number().int().min(0).max(6);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  timezone: timezoneSchema.default('Asia/Dhaka'),
  weekStartsOn: weekStartsOnSchema.default(6),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateMeSchema = z
  .object({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
    weekStartsOn: weekStartsOnSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.timezone !== undefined || value.weekStartsOn !== undefined,
    { message: 'At least one field is required' },
  );

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  weekStartsOn: number;
  role: 'admin' | 'customer';
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: PublicUser;
};
