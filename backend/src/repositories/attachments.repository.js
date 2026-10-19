export function createAttachmentRepository(db) {
  const insert = db.prepare(`
    INSERT INTO attachments (
      pqrs_id,
      storage_id,
      original_name,
      safe_name,
      mime_type,
      extension,
      size_bytes,
      visibility,
      uploaded_by,
      uploaded_at
    )
    VALUES (
      @pqrsId,
      @storageId,
      @originalName,
      @safeName,
      @mimeType,
      @extension,
      @sizeBytes,
      @visibility,
      @uploadedBy,
      @uploadedAt
    )
  `);

  const listByPqrsId = db.prepare(`
    SELECT
      a.id,
      a.pqrs_id AS pqrsId,
      a.storage_id AS storageId,
      a.original_name AS originalName,
      a.safe_name AS safeName,
      a.mime_type AS mimeType,
      a.extension,
      a.size_bytes AS sizeBytes,
      a.visibility,
      a.uploaded_by AS uploadedBy,
      a.uploaded_at AS uploadedAt
    FROM attachments a
    WHERE a.pqrs_id = ?
    ORDER BY a.uploaded_at DESC, a.id DESC
  `);

  const getById = db.prepare(`
    SELECT
      a.id,
      a.pqrs_id AS pqrsId,
      a.storage_id AS storageId,
      a.original_name AS originalName,
      a.safe_name AS safeName,
      a.mime_type AS mimeType,
      a.extension,
      a.size_bytes AS sizeBytes,
      a.visibility,
      a.uploaded_by AS uploadedBy,
      a.uploaded_at AS uploadedAt,
      p.case_number AS caseNumber
    FROM attachments a
    JOIN pqrs p ON p.id = a.pqrs_id
    WHERE a.id = ?
  `);

  const countByPqrsId = db.prepare(`SELECT COUNT(*) AS total FROM attachments WHERE pqrs_id = ?`);

  const deleteById = db.prepare(`
    DELETE FROM attachments
    WHERE id = ?
    RETURNING
      id,
      pqrs_id AS pqrsId,
      storage_id AS storageId,
      safe_name AS safeName,
      extension,
      visibility,
      uploaded_by AS uploadedBy,
      uploaded_at AS uploadedAt
  `);

  return {
    insert(data) {
      const info = insert.run(data);
      return { id: Number(info.lastInsertRowid), ...data };
    },

    listByPqrsId(pqrsId) {
      return listByPqrsId.all(pqrsId);
    },

    getById(attachmentId) {
      return getById.get(attachmentId) ?? null;
    },

    countByPqrsId(pqrsId) {
      return Number(countByPqrsId.get(pqrsId)?.total ?? 0);
    },

    deleteById(attachmentId) {
      return deleteById.get(attachmentId) ?? null;
    },
  };
}
