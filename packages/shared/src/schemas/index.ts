import { z } from 'zod';

// ─── Enums (mirror Prisma string columns) ──────────────────────────────
export const UserRoleEnum = z.enum([
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'ANALYST',
  'PARTICIPANT',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const EntityStatusEnum = z.enum(['ACTIVE', 'ARCHIVED']);
export type EntityStatus = z.infer<typeof EntityStatusEnum>;

// ─── Auth ──────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRoleEnum,
  companyId: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Company ───────────────────────────────────────────────────────────
export const CompanyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(120).optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal('')),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  allowNamedReporting: z.boolean().optional(),
});
export type CompanyCreateRequest = z.infer<typeof CompanyCreateSchema>;

export const CompanyUpdateSchema = CompanyCreateSchema.partial().extend({
  status: EntityStatusEnum.optional(),
});
export type CompanyUpdateRequest = z.infer<typeof CompanyUpdateSchema>;

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  contactEmail: z.string().nullable(),
  status: EntityStatusEnum,
  allowNamedReporting: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Company = z.infer<typeof CompanySchema>;

// ─── User management ───────────────────────────────────────────────────
export const UserCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: UserRoleEnum,
  companyId: z.string().nullable().optional(),
  password: z.string().min(8).max(200),
});
export type UserCreateRequest = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: UserRoleEnum.optional(),
  companyId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
export type UserUpdateRequest = z.infer<typeof UserUpdateSchema>;

export const PasswordResetSchema = z.object({
  password: z.string().min(8).max(200),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRoleEnum,
  companyId: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// ─── Team ──────────────────────────────────────────────────────────────
export const TeamCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  managerName: z.string().max(200).optional().nullable(),
});
export type TeamCreateRequest = z.infer<typeof TeamCreateSchema>;

export const TeamUpdateSchema = TeamCreateSchema.partial().extend({
  status: EntityStatusEnum.optional(),
});
export type TeamUpdateRequest = z.infer<typeof TeamUpdateSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  managerName: z.string().nullable(),
  status: EntityStatusEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;
