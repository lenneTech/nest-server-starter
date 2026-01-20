import { IErrorRegistry, mergeErrorCodes } from '@lenne.tech/nest-server';

/**
 * Project-specific error codes
 *
 * Error code ranges:
 * - PROJ_0001-0099: Project errors
 * - PROJ_0100-0199: Business logic errors
 */
export const ProjectErrors = {
  OPERATION_NOT_PERMITTED: {
    code: 'PROJ_0100',
    message: 'Operation not permitted',
    translations: {
      de: 'Diese Operation ist nicht erlaubt.',
      en: 'This operation is not permitted.',
    },
  },
  PROJECT_ALREADY_EXISTS: {
    code: 'PROJ_0002',
    message: 'Project already exists',
    translations: {
      de: 'Ein Projekt mit diesem Namen existiert bereits.',
      en: 'A project with this name already exists.',
    },
  },
  PROJECT_INVALID_STATUS: {
    code: 'PROJ_0003',
    message: 'Invalid project status transition',
    translations: {
      de: 'Der Projektstatus kann nicht in diesen Zustand geändert werden.',
      en: 'The project status cannot be changed to this state.',
    },
  },
  PROJECT_NOT_FOUND: {
    code: 'PROJ_0001',
    message: 'Project not found',
    translations: {
      de: 'Projekt wurde nicht gefunden.',
      en: 'Project was not found.',
    },
  },
  QUOTA_EXCEEDED: {
    code: 'PROJ_0101',
    message: 'Quota exceeded',
    translations: {
      de: 'Das Kontingent wurde überschritten.',
      en: 'The quota has been exceeded.',
    },
  },
} as const satisfies IErrorRegistry;

/**
 * Merged error codes for type-safe usage
 * Combines nest-server LTNS_* errors with project-specific PROJ_* errors
 */
export const ErrorCode = mergeErrorCodes(ProjectErrors);
