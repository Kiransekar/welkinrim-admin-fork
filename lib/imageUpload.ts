import { supabase } from './supabaseClient';

interface ImageValidationOptions {
  minWidth: number;
  minHeight: number;
  minAspectRatio: number;
  maxAspectRatio: number;
  maxSizeBytes: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  sizeBytes?: number;
}

/**
 * Validate an image file against constraints
 */
export async function validateImage(
  file: File,
  options: ImageValidationOptions
): Promise<ValidationResult> {
  // Check file size
  if (file.size > options.maxSizeBytes) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(options.maxSizeBytes / 1024 / 1024).toFixed(2)}MB`,
      sizeBytes: file.size,
    };
  }

  // Load image to check dimensions
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { naturalWidth: width, naturalHeight: height } = img;
      const aspectRatio = width / height;

      // Check minimum resolution
      if (width < options.minWidth || height < options.minHeight) {
        resolve({
          valid: false,
          error: `Image resolution ${width}×${height} is below minimum ${options.minWidth}×${options.minHeight}`,
          width,
          height,
          aspectRatio,
          sizeBytes: file.size,
        });
        return;
      }

      // Check aspect ratio
      if (aspectRatio < options.minAspectRatio || aspectRatio > options.maxAspectRatio) {
        resolve({
          valid: false,
          error: `Aspect ratio ${aspectRatio.toFixed(2)} is outside acceptable range (${options.minAspectRatio.toFixed(2)} - ${options.maxAspectRatio.toFixed(2)})`,
          width,
          height,
          aspectRatio,
          sizeBytes: file.size,
        });
        return;
      }

      // All validations passed
      resolve({
        valid: true,
        width,
        height,
        aspectRatio,
        sizeBytes: file.size,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        valid: false,
        error: 'Failed to load image file',
      });
    };

    img.src = url;
  });
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadToStorage(
  file: File,
  bucket: string,
  path: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  try {
    // Upload file
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        success: false,
        error: uploadError.message,
      };
    }

    // Get public URL
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    return {
      success: true,
      publicUrl: data.publicUrl,
    };
  } catch (err) {
    console.error('Unexpected upload error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate and upload a product thumbnail
 */
export async function uploadProductThumbnail(
  file: File,
  productId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Validate thumbnail (800x600 min, aspect 1.3-1.9, 1MB max)
  const validation = await validateImage(file, {
    minWidth: 800,
    minHeight: 600,
    minAspectRatio: 1.3,
    maxAspectRatio: 1.9,
    maxSizeBytes: 1024 * 1024, // 1MB
  });

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Upload to storage
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${productId}.${ext}`;
  const result = await uploadToStorage(file, 'product-images', path);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    url: result.publicUrl,
  };
}

/**
 * Validate and upload a product icon
 */
export async function uploadProductIcon(
  file: File,
  productId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Validate icon (256x256 min, near-square 0.9-1.1, 256KB max)
  const validation = await validateImage(file, {
    minWidth: 256,
    minHeight: 256,
    minAspectRatio: 0.9,
    maxAspectRatio: 1.1,
    maxSizeBytes: 256 * 1024, // 256KB
  });

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Upload to storage
  const ext = file.name.split('.').pop() || 'png';
  const path = `icons/${productId}.${ext}`;
  const result = await uploadToStorage(file, 'product-icons', path);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    url: result.publicUrl,
  };
}

/**
 * Validate and upload a product wireframe (technical drawing)
 * Wireframes have relaxed validation since they can be various aspect ratios
 */
export async function uploadProductWireframe(
  file: File,
  productId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  // Validate wireframe - minimum 400x300, any aspect ratio, 2MB max
  // Wireframes are technical drawings that can be wide (ESC), tall (IPS), or square
  const validation = await validateImage(file, {
    minWidth: 400,
    minHeight: 300,
    minAspectRatio: 0.3,  // Allow tall images (like IPS combos)
    maxAspectRatio: 5.0,  // Allow wide images (like ESCs)
    maxSizeBytes: 2 * 1024 * 1024, // 2MB for detailed technical drawings
  });

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Upload to storage in wireframes folder
  const ext = file.name.split('.').pop() || 'png';
  const path = `wireframes/${productId}.${ext}`;
  const result = await uploadToStorage(file, 'product-images', path);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    url: result.publicUrl,
  };
}

/**
 * Upload a series icon (png/jpg/webp/svg, max 1MB) and return its public URL.
 * Stored in the existing 'product-icons' bucket under series/.
 */
export async function uploadSeriesIcon(
  file: File,
  seriesId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Icon must be an image file' };
  }
  if (file.size > 1024 * 1024) {
    return { success: false, error: 'Icon must be 1MB or smaller' };
  }
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safeId = seriesId.replace(/[^a-z0-9-]/gi, '-');
  const result = await uploadToStorage(file, 'product-icons', `series/${safeId}-${Date.now()}.${ext}`);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, url: result.publicUrl };
}
