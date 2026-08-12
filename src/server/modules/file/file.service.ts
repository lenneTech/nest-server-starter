import {
  ConfigService,
  CoreFileInfo,
  CoreFileService,
  CoreS3Service,
  FileInputCheckType,
  FileServiceOptions,
  RoleEnum,
} from '@lenne.tech/nest-server';
import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * File service
 */
@Injectable()
export class FileService extends CoreFileService {
  constructor(
    @InjectConnection() protected override readonly connection: Connection,
    protected readonly configService: ConfigService,
    // Optional: `CoreS3Service` is always provided by CoreModule but stays inert
    // without an `s3` config block. Forwarding it costs nothing today and is what
    // makes `file: { storage: 's3' }` (or merely configuring `s3.bucket`) work
    // later — a FileService that does NOT forward it fails the boot the moment
    // S3 becomes the resolved driver, rather than silently writing to GridFS.
    @Optional() protected readonly s3Service?: CoreS3Service,
  ) {
    super(connection, 'fs', { configService, s3Service });
  }

  /**
   * Duplicate file by name.
   *
   * Delegates instead of reaching into `this.files` directly. Until nest-server
   * 11.34.0 this was a raw GridFS pipe, and because this starter is what every
   * project is generated from, that shape was designed to be copied. It was wrong
   * in four separate ways:
   *
   * - it only ever worked on the GridFS driver — under `file.storage: 's3'` or
   *   `'filesystem'` the source is simply not in the bucket;
   * - it bypassed `checkRights()` entirely, so the ownership rule below did not
   *   apply to a duplicate at all (the copy was made with NO authorization);
   * - it returned the write stream without awaiting it, so the caller was told the
   *   copy existed while it was still being written;
   * - neither stream carried an error handler, and an unhandled stream `'error'`
   *   takes the whole process down.
   *
   * `duplicateByName()` answers all four. Forward the caller's context so the
   * duplicate is COVERED by the ownership rule rather than exempt from it — and
   * give the COPY its own metadata, because it deliberately does not inherit the
   * source's owner:
   *
   * ```typescript
   * await this.fileService.duplicate(name, newName, { currentUser, metadata: { ownerId: currentUser.id } });
   * ```
   *
   * @param fileName - Source file name
   * @param newName - Name for the duplicated file
   * @param serviceOptions - Caller context; `{ force: true }` where a role decorator already decided
   * @returns The file info of the COPY (since 11.34.0 — previously a `GridFSBucketWriteStream`)
   */
  async duplicate(fileName: string, newName: string, serviceOptions?: FileServiceOptions): Promise<CoreFileInfo> {
    return this.duplicateByName(fileName, newName, serviceOptions);
  }

  /**
   * Per-file authorization for the two inherited download routes.
   *
   * `file.downloadRoles` (config.env.ts) is the COARSE gate: this project widens
   * it to `S_USER`, so any signed-in caller may REACH `GET /files/id/:id` and
   * `GET /files/:filename`. A role can never express "…but only their OWN file",
   * which is what this hook is for.
   *
   * The rule: ADMIN sees everything; everyone else sees only files whose
   * `metadata.ownerId` is their own id. A file with no owner recorded — the
   * admin uploads via `/files/upload` and the GraphQL mutations, and TUS uploads,
   * which carry `tusUploadId` but no owner — is therefore ADMIN-ONLY. If your
   * project wants TUS uploaders to read their own uploads back, write an owner
   * into the TUS metadata as well and it will be picked up here unchanged.
   *
   * Two properties worth knowing:
   *
   * - **A refusal answers 404, not 403.** That is deliberate in the framework:
   *   a "forbidden" would confirm that the id exists, turning the endpoint into
   *   an existence oracle.
   * - **A missing `currentUser` DENIES.** It must, and this is the one place a
   *   copy of this rule is easy to get wrong. "No user in context" cannot be read
   *   as "internal call, allow": it is also what an ANONYMOUS request looks like.
   *   Today the coarse gate (`S_USER`) rejects those before this hook runs — but
   *   the moment a project widens `downloadRoles` to `S_EVERYONE`, which the
   *   config docblock openly invites, an allow-on-missing-user would hand every
   *   file to everyone and this rule would evaporate exactly when it matters.
   *   The genuinely internal callers therefore say so explicitly: the ADMIN
   *   endpoints in `FileController`/`FileResolver` pass `{ force: true }`, and
   *   `AvatarController` passes the real `{ currentUser }` so its cleanup delete
   *   is covered by the ownership rule rather than exempt from it.
   *
   * Both the `id` and the `filename` branch are covered. Covering only `id`
   * (as the minimal example in the migration guide does) is enough while files
   * are streamed, because the filename route resolves the id and checks it
   * again — but NOT once `s3.presignedDownloads` is enabled, where the filename
   * route authorizes on the by-name lookup alone and then redirects.
   */
  protected override async checkRights(
    input: any,
    options?: FileServiceOptions & { checkInputType: FileInputCheckType },
  ): Promise<boolean> {
    // Writes, list queries and forced (system) calls keep the coarse role gate
    if (options?.force || (options?.checkInputType !== 'filename' && options?.checkInputType !== 'id')) {
      return true;
    }

    if (options.currentUser?.hasRole?.([RoleEnum.ADMIN])) {
      return true;
    }

    // Read the RAW document: the public getFileInfo() runs prepareOutput() and
    // strips `metadata` — the very field this decision rests on.
    const raw =
      options.checkInputType === 'id' ? await this.getRawFileInfo(input) : await this.getRawFileInfoByName(input);

    // Optional chaining is load-bearing: without a user this must DENY, not throw.
    // `String(undefined)` cannot equal a real owner id, so the comparison fails closed.
    return !!raw?.metadata?.ownerId && String(raw.metadata.ownerId) === String(options.currentUser?.id);
  }
}
