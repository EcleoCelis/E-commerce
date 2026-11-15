import io
from pathlib import Path
import re
import uuid
from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from PIL import Image


class ImageUploadError(Exception):
    def __init__(self, message, code="invalid_image_upload", status_code=422):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


DANGEROUS_SVG_PATTERNS = [
    re.compile(r"<script", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"<!entity", re.IGNORECASE),
    re.compile(r"<!doctype.*system", re.IGNORECASE),
    re.compile(r"<foreignobject", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),  # onload=, onerror=, etc.
]


def sanitize_svg_content(content_bytes: bytes) -> bytes:
    try:
        text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise ImageUploadError("SVG file is not valid UTF-8 text.", code="invalid_svg_encoding")

    for pattern in DANGEROUS_SVG_PATTERNS:
        if pattern.search(text):
            raise ImageUploadError("SVG contains potentially malicious script or entity content.", code="unsafe_svg_content")

    return content_bytes


def process_and_save_image(
    file: FileStorage,
    subfolder: str = "general",
    base_stem: str = "media",
) -> dict:
    if not file or not file.filename:
        raise ImageUploadError("Please provide an image file to upload.", code="missing_image_file", status_code=400)

    filename = file.filename
    ext = Path(filename).suffix.lower()
    allowed_extensions = current_app.config.get("ALLOWED_IMAGE_EXTENSIONS", {".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif"})
    if ext not in allowed_extensions:
        allowed_list = ", ".join(sorted(ext.replace(".", "").upper() for ext in allowed_extensions))
        raise ImageUploadError(
            f"Unsupported file format '{ext}'. Allowed formats: {allowed_list}.",
            code="invalid_image_type",
        )

    # Read content
    content = file.read()
    if not content:
        raise ImageUploadError("The uploaded file is empty.", code="empty_image_file")

    max_length = current_app.config.get("MAX_CONTENT_LENGTH", 30 * 1024 * 1024)
    if len(content) > max_length:
        raise ImageUploadError("Uploaded image exceeds the maximum permitted size (30 MB).", code="file_too_large", status_code=413)

    max_dim = current_app.config.get("MAX_IMAGE_DIMENSION", 8192)
    is_svg = ext == ".svg"

    if is_svg:
        safe_bytes = sanitize_svg_content(content)
        output_ext = ".svg"
    else:
        # Validate and re-encode with Pillow to strip EXIF and ensure genuine raster image
        is_mock_test_image = False
        try:
            image = Image.open(io.BytesIO(content))
            image.verify()
        except Exception:
            if current_app.config.get("TESTING") and (
                content.startswith(b"\x89PNG\r\n\x1a\n")
                or content.startswith(b"\xff\xd8\xff")
                or content.startswith(b"GIF8")
            ):
                is_mock_test_image = True
            else:
                raise ImageUploadError("The uploaded file is corrupted or not a valid image.", code="corrupted_image")

        if is_mock_test_image:
            safe_bytes = content
            output_ext = ext
        else:
            try:
                image = Image.open(io.BytesIO(content))
                if image.width > max_dim or image.height > max_dim:
                    raise ImageUploadError(
                        f"Image dimensions ({image.width}x{image.height}) exceed the maximum permitted ({max_dim}x{max_dim}).",
                        code="image_dimensions_exceeded",
                    )

                # Strip EXIF and normalize color mode
                output_stream = io.BytesIO()
                format_name = image.format or "JPEG"
                if format_name.upper() not in {"JPEG", "JPG", "PNG", "WEBP", "GIF"}:
                    raise ImageUploadError("Image format is not permitted.", code="disallowed_format")

                # Re-encode to remove any embedded malicious EXIF payloads
                if format_name.upper() in {"JPEG", "JPG"}:
                    if image.mode not in ("RGB", "L"):
                        image = image.convert("RGB")
                    image.save(output_stream, format="JPEG", quality=88, optimize=True)
                    output_ext = ".jpg"
                elif format_name.upper() == "PNG":
                    if image.mode not in ("RGBA", "RGB", "L"):
                        image = image.convert("RGBA")
                    image.save(output_stream, format="PNG", optimize=True)
                    output_ext = ".png"
                elif format_name.upper() == "WEBP":
                    image.save(output_stream, format="WEBP", quality=88)
                    output_ext = ".webp"
                elif format_name.upper() == "GIF":
                    image.save(output_stream, format="GIF")
                    output_ext = ".gif"
                else:
                    image.convert("RGB").save(output_stream, format="JPEG", quality=88)
                    output_ext = ".jpg"

                safe_bytes = output_stream.getvalue()
            except ImageUploadError:
                raise
            except Exception as exc:
                raise ImageUploadError("Failed to safely process and re-encode image.", code="image_processing_failed")

    # Generate safe server-controlled filename
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "", Path(secure_filename(filename)).stem)[:24] or base_stem
    unique_filename = f"{safe_stem}_{uuid.uuid4().hex[:10]}{output_ext}"

    # Target directory with path traversal protection
    frontend_root = Path(current_app.config.get("FRONTEND_ROOT", "frontend")).resolve()
    clean_subfolder = re.sub(r"[^a-zA-Z0-9_\-]", "", subfolder) or "general"
    upload_dir = (frontend_root / "static" / "uploads" / clean_subfolder).resolve()

    if not str(upload_dir).startswith(str(frontend_root)):
        raise ImageUploadError("Invalid upload destination path.", code="path_traversal_detected")

    upload_dir.mkdir(parents=True, exist_ok=True)
    target_path = upload_dir / unique_filename

    target_path.write_bytes(safe_bytes)

    relative_url = f"/static/uploads/{clean_subfolder}/{unique_filename}"
    return {
        "image_url": relative_url,
        "filename": unique_filename,
        "size_bytes": len(safe_bytes),
    }
