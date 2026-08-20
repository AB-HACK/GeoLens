/**
 * File validation utility with magic byte detection
 * Prevents file type spoofing by checking actual file signatures
 */

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  detectedType?: string;
}

// Magic byte signatures for common image formats
const FILE_SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/bmp': [0x42, 0x4D],
};

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validate image file using magic bytes
 * @param buffer File buffer to validate
 * @param declaredMimeType MIME type declared by the client
 * @returns Validation result
 */
export function validateImageFile(
  buffer: Buffer,
  declaredMimeType?: string,
): FileValidationResult {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Check minimum file size (prevent empty files)
  if (buffer.length < 100) {
    return {
      isValid: false,
      error: 'File is too small to be a valid image',
    };
  }

  // Detect actual file type from magic bytes
  const detectedType = detectFileType(buffer);

  if (!detectedType) {
    return {
      isValid: false,
      error: 'Unable to detect valid image file type from file signature',
    };
  }

  // If declared MIME type is provided, verify it matches detected type
  if (declaredMimeType && declaredMimeType !== detectedType) {
    return {
      isValid: false,
      error: `Declared file type (${declaredMimeType}) does not match detected file type (${detectedType})`,
    };
  }

  return {
    isValid: true,
    detectedType,
  };
}

/**
 * Detect file type from magic bytes
 * @param buffer File buffer
 * @returns Detected MIME type or null if unknown
 */
function detectFileType(buffer: Buffer): string | null {
  for (const [mimeType, signature] of Object.entries(FILE_SIGNATURES)) {
    if (buffer.length < signature.length) continue;

    let match = true;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return mimeType;
    }
  }

  return null;
}

/**
 * Get allowed MIME types for upload
 */
export function getAllowedMimeTypes(): string[] {
  return Object.keys(FILE_SIGNATURES);
}
