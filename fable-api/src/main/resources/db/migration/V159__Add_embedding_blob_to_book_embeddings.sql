-- Binary float32 packing of embedding_vector for faster AI Search retrieval.
-- Existing JSON in embedding_vector remains the source of truth for backfill;
-- no re-embedding is required. The AI Search service dual-writes both columns
-- on new embeds and lazily backfills embedding_blob from JSON when NULL.

ALTER TABLE book_embeddings
    ADD COLUMN embedding_blob BLOB NULL AFTER embedding_vector;
