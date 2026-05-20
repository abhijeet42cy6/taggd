"""Serve stored blobs via FileResponse (local) or StreamingResponse (GCS/S3)."""

from __future__ import annotations

import io
from typing import Optional

from fastapi.responses import FileResponse, StreamingResponse

from backend.core import blob_storage


def stored_file_response(
    namespace: str,
    filename: str,
    *,
    download_name: str,
    media_type: str,
    storage_key: Optional[str] = None,
):
    if storage_key:
        data = blob_storage.get_bytes_at_key(namespace, storage_key)
    else:
        data = blob_storage.get_bytes(namespace, filename)

    if data is None:
        local = (
            blob_storage.resolve_local_path_at_key(namespace, storage_key)
            if storage_key
            else blob_storage.resolve_local_path(namespace, filename)
        )
        if local:
            return FileResponse(local, media_type=media_type, filename=download_name)
        return None

    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{download_name}"'},
    )
