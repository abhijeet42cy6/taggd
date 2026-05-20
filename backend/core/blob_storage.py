"""
Portable object storage for uploads (local disk, GCS, or S3).

Environment:
  STORAGE_BACKEND=local|gcs|s3          (default: local)
  STORAGE_BUCKET=...                    (required for gcs/s3)
  STORAGE_LOCAL_ROOT=...                (default: repo root locally, /tmp/tgddata-storage on Cloud Run)
  STORAGE_PREFIX=tgddata                (optional key prefix in bucket)
  AWS_REGION / AWS_DEFAULT_REGION       (s3)
  GOOGLE_CLOUD_PROJECT                  (gcs, optional if ADC set)
"""

from __future__ import annotations

import os
import re
from typing import Optional

_BACKEND = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
_BUCKET = (os.getenv("STORAGE_BUCKET") or "").strip()
_PREFIX = (os.getenv("STORAGE_PREFIX") or "tgddata").strip().strip("/")


def storage_backend() -> str:
    return _BACKEND


def _object_key(namespace: str, filename: str) -> str:
    base = os.path.basename(filename.replace("\\", "/"))
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        raise ValueError("Invalid filename")
    ns = namespace.strip("/").replace("..", "")
    if _PREFIX:
        return f"{_PREFIX}/{ns}/{base}"
    return f"{ns}/{base}"


def _local_root() -> str:
    explicit = (os.getenv("STORAGE_LOCAL_ROOT") or "").strip()
    if explicit:
        return os.path.abspath(explicit)
    if os.getenv("K_SERVICE") or os.getenv("AWS_EXECUTION_ENV"):
        return "/tmp/tgddata-storage"
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _local_path(namespace: str, filename: str) -> str:
    base = os.path.basename(filename.replace("\\", "/"))
    return os.path.join(_local_root(), namespace, base)


def put_bytes(namespace: str, filename: str, data: bytes, content_type: Optional[str] = None) -> str:
    """Persist bytes; returns stored basename (same as filename argument)."""
    if _BACKEND == "local":
        path = _local_path(namespace, filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return os.path.basename(filename)

    key = _object_key(namespace, filename)
    if _BACKEND == "gcs":
        client = _gcs_client()
        blob = client.bucket(_BUCKET).blob(key)
        blob.upload_from_string(data, content_type=content_type or "application/octet-stream")
        return os.path.basename(filename)

    if _BACKEND == "s3":
        client = _s3_client()
        extra = {"ContentType": content_type} if content_type else {}
        client.put_object(Bucket=_BUCKET, Key=key, Body=data, **extra)
        return os.path.basename(filename)

    raise ValueError(f"Unsupported STORAGE_BACKEND: {_BACKEND}")


def put_bytes_at_key(namespace: str, storage_key: str, data: bytes, content_type: Optional[str] = None) -> str:
    """Store under a relative key (e.g. candidate CV `123/uuid.pdf`)."""
    key = storage_key.replace("\\", "/").strip("/")
    if ".." in key.split("/"):
        raise ValueError("Invalid storage key")
    if _BACKEND == "local":
        root = os.path.join(_local_root(), namespace)
        full = os.path.realpath(os.path.join(root, *key.split("/")))
        if not full.startswith(os.path.realpath(root) + os.sep):
            raise ValueError("Invalid storage key path")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
        return key

    obj_key = f"{_PREFIX}/{namespace}/{key}" if _PREFIX else f"{namespace}/{key}"
    if _BACKEND == "gcs":
        client = _gcs_client()
        client.bucket(_BUCKET).blob(obj_key).upload_from_string(
            data, content_type=content_type or "application/octet-stream"
        )
        return key
    if _BACKEND == "s3":
        extra = {"ContentType": content_type} if content_type else {}
        _s3_client().put_object(Bucket=_BUCKET, Key=obj_key, Body=data, **extra)
        return key
    raise ValueError(f"Unsupported STORAGE_BACKEND: {_BACKEND}")


def get_bytes(namespace: str, filename: str) -> Optional[bytes]:
    if _BACKEND == "local":
        path = _local_path(namespace, filename)
        if not os.path.isfile(path):
            return None
        with open(path, "rb") as f:
            return f.read()

    key = _object_key(namespace, filename)
    if _BACKEND == "gcs":
        client = _gcs_client()
        blob = client.bucket(_BUCKET).blob(key)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    if _BACKEND == "s3":
        client = _s3_client()
        try:
            resp = client.get_object(Bucket=_BUCKET, Key=key)
            return resp["Body"].read()
        except Exception as e:
            from botocore.exceptions import ClientError

            if isinstance(e, ClientError) and e.response.get("Error", {}).get("Code") in (
                "NoSuchKey",
                "404",
            ):
                return None
            raise

    raise ValueError(f"Unsupported STORAGE_BACKEND: {_BACKEND}")


def get_bytes_at_key(namespace: str, storage_key: str) -> Optional[bytes]:
    key = storage_key.replace("\\", "/").strip("/")
    if _BACKEND == "local":
        root = os.path.join(_local_root(), namespace)
        full = os.path.realpath(os.path.join(root, *key.split("/")))
        if not full.startswith(os.path.realpath(root) + os.sep):
            return None
        if not os.path.isfile(full):
            return None
        with open(full, "rb") as f:
            return f.read()

    obj_key = f"{_PREFIX}/{namespace}/{key}" if _PREFIX else f"{namespace}/{key}"
    if _BACKEND == "gcs":
        blob = _gcs_client().bucket(_BUCKET).blob(obj_key)
        if not blob.exists():
            return None
        return blob.download_as_bytes()
    if _BACKEND == "s3":
        try:
            resp = _s3_client().get_object(Bucket=_BUCKET, Key=obj_key)
            return resp["Body"].read()
        except Exception as e:
            from botocore.exceptions import ClientError

            if isinstance(e, ClientError) and e.response.get("Error", {}).get("Code") in (
                "NoSuchKey",
                "404",
            ):
                return None
            raise
    return None


def delete_file(namespace: str, filename: str) -> None:
    if _BACKEND == "local":
        path = _local_path(namespace, filename)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
        return

    key = _object_key(namespace, filename)
    if _BACKEND == "gcs":
        blob = _gcs_client().bucket(_BUCKET).blob(key)
        if blob.exists():
            blob.delete()
        return
    if _BACKEND == "s3":
        _s3_client().delete_object(Bucket=_BUCKET, Key=key)


def delete_at_key(namespace: str, storage_key: str) -> None:
    key = storage_key.replace("\\", "/").strip("/")
    if _BACKEND == "local":
        root = os.path.join(_local_root(), namespace)
        full = os.path.realpath(os.path.join(root, *key.split("/")))
        if full.startswith(os.path.realpath(root) + os.sep) and os.path.isfile(full):
            try:
                os.remove(full)
            except OSError:
                pass
        return
    obj_key = f"{_PREFIX}/{namespace}/{key}" if _PREFIX else f"{namespace}/{key}"
    if _BACKEND == "gcs":
        blob = _gcs_client().bucket(_BUCKET).blob(obj_key)
        if blob.exists():
            blob.delete()
    elif _BACKEND == "s3":
        _s3_client().delete_object(Bucket=_BUCKET, Key=obj_key)


def resolve_local_path(namespace: str, filename: str) -> Optional[str]:
    """Only for local backend — used when code still expects a filesystem path."""
    if _BACKEND != "local":
        return None
    path = _local_path(namespace, filename)
    return path if os.path.isfile(path) else None


def resolve_local_path_at_key(namespace: str, storage_key: str) -> Optional[str]:
    if _BACKEND != "local":
        return None
    key = storage_key.replace("\\", "/").strip("/")
    root = os.path.join(_local_root(), namespace)
    full = os.path.realpath(os.path.join(root, *key.split("/")))
    if not full.startswith(os.path.realpath(root) + os.sep):
        return None
    return full if os.path.isfile(full) else None


def delete_avatar_glob(user_id: int, namespace: str = "user_avatars") -> None:
    """Remove all avatar files for user_id (local) or known extension keys (cloud)."""
    if _BACKEND == "local":
        d = os.path.join(_local_root(), namespace)
        if not os.path.isdir(d):
            return
        for name in os.listdir(d):
            if re.match(rf"^{user_id}\.(jpg|jpeg|png|webp)$", name, re.IGNORECASE):
                try:
                    os.remove(os.path.join(d, name))
                except OSError:
                    pass
        return
    for ext in (".jpg", ".png", ".webp"):
        delete_file(namespace, f"{user_id}{ext}")


_gcs = None
_s3 = None


def _gcs_client():
    global _gcs
    if _gcs is None:
        if not _BUCKET:
            raise RuntimeError("STORAGE_BUCKET is required when STORAGE_BACKEND=gcs")
        from google.cloud import storage

        _gcs = storage.Client()
    return _gcs


def _s3_client():
    global _s3
    if _s3 is None:
        if not _BUCKET:
            raise RuntimeError("STORAGE_BUCKET is required when STORAGE_BACKEND=s3")
        import boto3

        _s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION"))
    return _s3
